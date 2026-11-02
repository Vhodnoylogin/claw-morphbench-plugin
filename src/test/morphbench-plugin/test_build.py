"""Canonical mapping and pinned dependency checks; no game or live host."""
import importlib.util
from pathlib import Path
import unittest
import tempfile
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("claw_addon_build", Path(__file__).resolve().parents[2] / "main/morphbench-plugin/build.py")
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.source = (builder.dependency_root() / builder.SOURCE_RELATIVE).read_bytes()

    def test_current_canonical_profiles_are_pinned_and_ordered(self):
        catalog = builder.catalog_from_bytes(self.source)
        self.assertEqual([profile["family"] for profile in catalog["profiles"][:3]], ["3BA", "HIMBO", "CBBE"])
        self.assertEqual({(profile["id"], profile["family"], profile["sex"], profile["version"])
                          for profile in catalog["profiles"][3:]}, {
            ("CLAW.VanillaMale.Weight1", "Vanilla", "male", "game-weight-v1"),
            ("CLAW.VanillaFemale.Weight1", "Vanilla", "female", "game-weight-v1"),
            ("CLAW.BHUNP.3.34.AdvancedV4", "BHUNP", "female", "3.34"),
            ("CLAW.UNP.4.6.Weight1", "UNP", "female", "4.6")})
        self.assertEqual(catalog["source"]["sha256"], builder.hashlib.sha256(self.source).hexdigest())
        self.assertEqual(catalog["profiles"][0]["rules"][4]["source"], "Arms")
        self.assertGreater(sum(len(profile["rules"]) for profile in catalog["profiles"]), 200)

    def test_invalid_target_sex_family_and_duplicate_profile_are_rejected(self):
        mutations = [
            self.source.replace(b'family="HIMBO"', b'family="Unknown"', 1),
            self.source.replace(b'sex="male"', b'sex="female"', 1),
            self.source.replace(b'target="CLAWArmGirth"', b'target=" unsafe"', 1),
            self.source.replace(b'id="CLAW.CBBE.2.0.3.Geometry1"', b'id="CLAW.3BA.2.48.Geometry1"', 1),
        ]
        for data in mutations:
            with self.subTest(data=data[:40]), self.assertRaises(ValueError):
                builder.catalog_from_bytes(data)

    def test_nonfinite_invalid_caps_and_duplicate_rules_are_rejected(self):
        rule = b'<Rule source="Arms" target="CLAWArmGirth" gain="-0.5886322" cap="1" />'
        for data in [self.source.replace(b'gain="-0.5886322"', b'gain="nan"', 1),
                     self.source.replace(b'gain="-0.5886322"', b'gain="inf"', 1),
                     self.source.replace(b'cap="1"', b'cap="0"', 1),
                     self.source.replace(b'cap="1"', b'cap="1.1"', 1),
                     self.source.replace(rule, rule + rule, 1)]:
            with self.subTest(data=data[:40]), self.assertRaises(ValueError):
                builder.catalog_from_bytes(data)

    def test_schema_unknown_attributes_substantive_text_and_declarations_are_rejected(self):
        for data in [self.source.replace(b'schemaVersion="1"', b'schemaVersion="2"', 1),
                     self.source.replace(b'<Rule source=', b'<Rule unexpected="1" source=', 1),
                     self.source.replace(b'<Profile ', b'ignored text<Profile ', 1),
                     b'<!DOCTYPE MorphLinkProfiles>' + self.source]:
            with self.subTest(data=data[:40]), self.assertRaises(ValueError):
                builder.catalog_from_bytes(data)

    def test_output_inside_the_checkout_is_rejected_before_writes(self):
        with self.assertRaisesRegex(ValueError, "outside"):
            builder.build(builder.REPOSITORY / "work/addon-output")

    def test_local_dependency_hash_mismatch_is_rejected_without_network(self):
        builder.TARGET.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=builder.TARGET) as directory:
            root = Path(directory)
            self.assertTrue(root.resolve().is_relative_to(builder.TARGET.resolve()))
            relative = next(iter(builder.PIN["files"]))
            path = root / relative
            path.parent.mkdir(parents=True)
            path.write_bytes(b"changed source")
            with patch.object(builder.urllib.request, "urlopen", side_effect=AssertionError("Local dependencies must not fetch")):
                with self.assertRaisesRegex(ValueError, "hash mismatch"):
                    builder.dependency_root(root)

    def test_missing_explicit_local_dependency_never_falls_back_to_network(self):
        builder.TARGET.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=builder.TARGET) as directory:
            self.assertTrue(Path(directory).resolve().is_relative_to(builder.TARGET.resolve()))
            with patch.object(builder.urllib.request, "urlopen", side_effect=AssertionError("Local dependencies must not fetch")):
                with self.assertRaisesRegex(ValueError, "Missing pinned"):
                    builder.dependency_root(Path(directory))

    def test_function_parameters_and_constant_bias_are_preserved(self):
        source = self.source.replace(b'<Rule source="Arms"', b'<Rule function="power" exponent="3" source="Arms"', 1)
        first = builder.catalog_from_bytes(source)["profiles"][0]["rules"][4]
        self.assertEqual((first["function"], first["exponent"]), ("power", 3))
        source = self.source.replace(b'<Rule source="Arms"', b'<Rule function="constant" value="0.4" source=""', 1)
        first = builder.catalog_from_bytes(source)["profiles"][0]["rules"][4]
        self.assertEqual((first["source"], first["function"], first["value"]), ("", "constant", builder.float32("0.4")))

    def test_invalid_or_irrelevant_function_parameters_are_rejected(self):
        for attributes in [b'function="eval"', b'function="power"', b'function="power" exponent="2.5"',
                           b'function="power" exponent="9"', b'function="linear" value="0.5"',
                           b'function="constant" value="0.5"']:
            data = self.source.replace(b'<Rule source="Arms"', b'<Rule ' + attributes + b' source="Arms"', 1)
            with self.subTest(attributes=attributes), self.assertRaises(ValueError):
                builder.catalog_from_bytes(data)

    def sparse(self, rules, defaults=""):
        return ('<MorphLinkProfiles schemaVersion="1">' + defaults +
                '<Profile id="custom.HIMBO" family="HIMBO" version="1" sex="male" calibration="test">' +
                rules + '</Profile></MorphLinkProfiles>').encode()

    def test_generic_targets_and_sources_preserve_case_and_default_linear(self):
        data = self.sparse('<Rule source="CLAWHumanCustom" target="CustomTarget" gain="1" cap="1" />')
        result = builder.catalog_from_bytes(data)
        self.assertEqual(result["profiles"][0]["rules"], [{"source": "CLAWHumanCustom", "target": "CustomTarget", "gain": 1, "cap": 1}])
        self.assertEqual(result["gainEpsilon"], builder.float32("1e-6"))
        case = self.sparse('<Rule source="a" target="B" gain="1" cap="1" />')
        self.assertEqual(builder.catalog_from_bytes(case)["profiles"][0]["rules"][0]["target"], "B")

    def test_inactive_edges_are_structurally_validated_then_omitted_before_conflicts(self):
        data = self.sparse('<Rule source="Human" target="Custom" gain="1" cap="1" />'
                           '<Rule source="Human" target="Custom" gain="1e-6" cap="0.5" />'
                           '<Rule source="Custom" target="Other" gain="-1e-6" cap="1" />')
        self.assertEqual(len(builder.catalog_from_bytes(data)["profiles"][0]["rules"]), 1)
        for invalid in ('source=" bad" target="X" gain="0" cap="1"',
                        'source="Human" target="X" gain="0" cap="0"',
                        'source="Human" target="X" gain="0" cap="1" function="power" exponent="9"'):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                builder.catalog_from_bytes(self.sparse('<Rule ' + invalid + ' />'))
        above = builder.struct.unpack('<f', builder.struct.pack('<I', builder.struct.unpack('<I', builder.struct.pack('<f', builder.GAIN_EPSILON))[0] + 1))[0]
        first = builder.catalog_from_bytes(self.sparse(f'<Rule source="Human" target="Custom" gain="{above}" cap="1" />'))
        self.assertEqual(len(first["profiles"][0]["rules"]), 1)
        empty = builder.catalog_from_bytes(self.sparse('<Rule source="Human" target="Custom" gain="-0" cap="1" />'))
        self.assertEqual(empty["profiles"][0]["rules"], [])

    def test_empty_subset_defaults_and_active_collision_limits(self):
        empty = builder.catalog_from_bytes(self.sparse('', '<Defaults male="custom.HIMBO" />'))
        self.assertEqual(empty["defaults"], {"male": "custom.HIMBO"})
        self.assertEqual(empty["profiles"][0]["rules"], [])
        for defaults in ('<Defaults female="custom.HIMBO" />', '<Defaults male="missing" />'):
            with self.subTest(defaults=defaults), self.assertRaises(ValueError):
                builder.catalog_from_bytes(self.sparse('', defaults))
        collision = '<Rule source="A" target="B" gain="1" cap="1" /><Rule source="B" target="C" gain="1" cap="1" />'
        with self.assertRaisesRegex(ValueError, 'overlap'):
            builder.catalog_from_bytes(self.sparse(collision))
        rows = [f'<Rule source="Human{i}" target="Target{i}" gain="1" cap="1" />' for i in range(65)]
        self.assertEqual(len(builder.catalog_from_bytes(self.sparse(''.join(rows[:64])))["profiles"][0]["rules"]), 64)
        with self.assertRaisesRegex(ValueError, '64 active'):
            builder.catalog_from_bytes(self.sparse(''.join(rows)))
        with self.assertRaisesRegex(ValueError, 'raw rule count'):
            builder.catalog_from_bytes(self.sparse('<Rule source="A" target="B" gain="0" cap="1" />' * 257))

    def test_provider_case_aliases_and_non_ascii_names_are_rejected_after_pruning(self):
        for rules in (
            '<Rule source="Human" target="human" gain="1" cap="1" />',
            '<Rule source="Human" target="Target" gain="1" cap="1" /><Rule source="human" target="Other" gain="1" cap="1" />',
            '<Rule source="Human" target="Ear.Size" gain="1" cap="1" /><Rule source="Other" target="ear.size" gain="1" cap="1" />',
            '<Rule source="Human" target="TargetГ©" gain="0" cap="1" />'):
            with self.subTest(rules=rules), self.assertRaises(ValueError):
                builder.catalog_from_bytes(self.sparse(rules))
        rules = '<Rule source="Human" target="Ear.Size" gain="1" cap="1" /><Rule source="human" target="ear.size" gain="0" cap="1" />'
        self.assertEqual(len(builder.catalog_from_bytes(self.sparse(rules))["profiles"][0]["rules"]), 1)

    def test_vanilla_family_supports_one_profile_per_sex_with_typed_weight_source(self):
        male = '<Profile id="Male" family="Vanilla" version="game-weight-v1" sex="male" calibration="test"><Rule source="$actor.weight" target="Custom" gain="1" cap="1" /></Profile>'
        female = male.replace('id="Male"', 'id="Female"').replace('sex="male"', 'sex="female"')
        wrap = lambda body: ('<MorphLinkProfiles schemaVersion="1">' + body + '</MorphLinkProfiles>').encode()
        result = builder.catalog_from_bytes(wrap(male + female))
        self.assertEqual([(p["family"], p["sex"]) for p in result["profiles"]], [("Vanilla", "male"), ("Vanilla", "female")])
        self.assertEqual(result["profiles"][0]["rules"][0]["source"], "$actor.weight")
        for body in (male + male.replace('id="Male"', 'id="Second"'), male.replace('sex="male"', 'sex="other"')):
            with self.assertRaisesRegex(ValueError, 'wrong-sex resource family'):
                builder.catalog_from_bytes(wrap(body))

    def test_classic_unp_is_female_and_preserves_vanilla_weight_trait_rules_without_body_aliases(self):
        profiles = builder.catalog_from_bytes(self.source)["profiles"]
        unp = next(profile for profile in profiles if profile["family"] == "UNP")
        vanilla = next(profile for profile in profiles if profile["family"] == "Vanilla" and profile["sex"] == "female")
        self.assertEqual(len(unp["rules"]), 41)
        self.assertEqual(unp["rules"], vanilla["rules"])
        self.assertTrue(all(not rule["source"] or rule["source"] == "$actor.weight"
                            or rule["source"].startswith("$human.") for rule in unp["rules"]))
        invalid = self.source.replace(b'id="CLAW.UNP.4.6.Weight1" family="UNP" version="4.6" sex="female"',
                                      b'id="CLAW.UNP.4.6.Weight1" family="UNP" version="4.6" sex="male"')
        self.assertNotEqual(invalid, self.source)
        with self.assertRaisesRegex(ValueError, "wrong-sex resource family"):
            builder.catalog_from_bytes(invalid)

    def test_custom_unp_matrix_keeps_generic_source_target_names(self):
        source = ('<MorphLinkProfiles schemaVersion="1"><Profile id="Custom.UNP" family="UNP" version="4.6" '
                  'sex="female" calibration="custom"><Rule source="Author.Human" target="Author.Wolf" '
                  'gain="0.5" cap="0.75" /></Profile></MorphLinkProfiles>').encode()
        profile = builder.catalog_from_bytes(source)["profiles"][0]
        self.assertEqual(profile["rules"], [{"source": "Author.Human", "target": "Author.Wolf", "gain": .5, "cap": .75}])


if __name__ == "__main__":
    unittest.main()
