"""Build the independent browser plugin against the pinned CLAW matrix kernel.

Only the Python standard library is used. Generated output belongs in ignored
target/ or an external build directory. ZIP contents and timestamps are deterministic.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import os
import shutil
import subprocess
import xml.etree.ElementTree as ET
import zipfile
import urllib.request

HERE = Path(__file__).resolve().parent
REPOSITORY = HERE.parents[2]
TARGET = REPOSITORY / "target"
PIN = json.loads((REPOSITORY / "dependencies.json").read_text(encoding="utf-8"))["claw"]
SOURCE_RELATIVE = "src/main/resources/profiles/MorphLinks.xml"
SHARED_RELATIVE = "src/main/cpp/shared"
DEPENDENCY_ROOT = TARGET / "dependencies/claw" / PIN["commit"]
SOURCE = DEPENDENCY_ROOT / SOURCE_RELATIVE
ASSETS = ("addon.json", "index.html", "core.js", "pair.js", "input.js", "preview-controller.js", "main.js", "style.css")


def dependency_root(source_dir: Path | None = None) -> Path:
    """Use exact pinned local files or fetch their public immutable raw versions."""
    source_dir = source_dir or os.environ.get("CLAW_SOURCE_DIR")
    local = source_dir is not None
    root = Path(source_dir).resolve() if local else DEPENDENCY_ROOT
    if PIN["repository"] != "https://github.com/Vhodnoylogin/claw" or not re.fullmatch(r"[0-9a-f]{40}", PIN["commit"]):
        raise ValueError("Unsupported CLAW dependency pin")
    for relative, expected in PIN["files"].items():
        path = root / relative
        if not path.resolve().is_relative_to(root) or not re.fullmatch(r"[0-9a-f]{64}", expected):
            raise ValueError("Invalid dependency path or hash")
        if not path.is_file():
            if local:
                raise ValueError("Missing pinned CLAW dependency: " + relative)
            url = "https://raw.githubusercontent.com/Vhodnoylogin/claw/" + PIN["commit"] + "/" + relative
            with urllib.request.urlopen(url, timeout=30) as response:
                content = response.read(1024 * 1024 + 1)
            if len(content) > 1024 * 1024 or hashlib.sha256(content).hexdigest() != expected:
                raise ValueError("Downloaded CLAW dependency hash mismatch: " + relative)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError("Pinned CLAW dependency hash mismatch: " + relative)
    return root


def identifier(value: str) -> bool:
    return (0 < len(value.encode("utf-8")) <= 160
            and ord(value[0]) > 32 and ord(value[-1]) > 32
            and not any(ord(char) < 32 or ord(char) == 127 for char in value)
            and value not in {"__proto__", "prototype", "constructor"})


def morph_identifier(value: str) -> bool:
    return identifier(value) and all(32 <= ord(character) <= 126 for character in value)


def provider_identity(value: str) -> str:
    return value.translate(str.maketrans("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"))


def float32(value: str) -> float:
    if not isinstance(value, str) or not re.fullmatch(r"-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?", value):
        raise ValueError("Expected native decimal coefficient syntax")
    number = float(value)
    if not math.isfinite(number):
        raise ValueError("Mapping numbers must be finite")
    try:
        result = struct.unpack("<f", struct.pack("<f", number))[0]
    except OverflowError as error:
        raise ValueError("Mapping numbers must fit float32") from error
    if not math.isfinite(result):
        raise ValueError("Mapping numbers must fit float32")
    return result


GAIN_EPSILON = float32("1e-6")


def catalog_from_bytes(data: bytes, *, retain_inactive: bool = False, max_rules: int = 256, max_targets: int = 64) -> dict:
    if (len(data) > 1024 * 1024 or any(byte >= 127 or (byte < 32 and byte not in (9, 10, 13)) for byte in data)
            or b"<!" in data or b"<?" in data or b"&" in data):
        raise ValueError("Oversize XML or unsupported declarations/entities")
    root = ET.fromstring(data.decode("utf-8-sig"))
    for element in root.iter():
        if (element.text and element.text.strip()) or (element.tail and element.tail.strip()):
            raise ValueError("Substantive XML text is unsupported")
    if root.tag != "MorphLinkProfiles" or root.attrib != {"schemaVersion": "1"}:
        raise ValueError("Unsupported morph catalog schema")
    profiles, ids, families, defaults = [], set(), set(), None
    for child in root:
        if child.tag == "Defaults":
            if defaults is not None or not child.attrib or not set(child.attrib).issubset({"male", "female"}) or len(child):
                raise ValueError("Invalid/duplicate profile defaults")
            defaults = {sex: value for sex, value in child.attrib.items() if value}
            if not defaults:
                raise ValueError("Empty profile defaults")
            if not all(identifier(value) for value in defaults.values()):
                raise ValueError("Invalid profile default identifier")
            continue
        if child.tag != "Profile" or set(child.attrib) != {"id", "family", "version", "sex", "calibration"}:
            raise ValueError("Unexpected profile element or metadata")
        metadata = dict(child.attrib)
        profile_id, family = metadata["id"], metadata["family"]
        if (not all(identifier(value) for value in metadata.values()) or profile_id in ids
                or (family, metadata["sex"]) in families or family not in {"CBBE", "3BA", "HIMBO", "Vanilla"}
                or metadata["sex"] not in {"male", "female"}
                or (family != "Vanilla" and metadata["sex"] != ("male" if family == "HIMBO" else "female"))):
            raise ValueError("Invalid, duplicate or wrong-sex resource family")
        ids.add(profile_id)
        families.add((family, metadata["sex"]))
        rules, raw_rules, pairs, caps, source_names, target_names = [], [], set(), {}, {}, {}
        if len(child) > max_rules:
            raise ValueError("Invalid raw rule count")
        for rule in child:
            function = rule.attrib.get("function", "linear")
            expected = {"source", "target", "gain", "cap"}
            if "function" in rule.attrib:
                expected.add("function")
            if function == "power":
                expected.add("exponent")
            if function == "constant":
                expected.add("value")
            if (rule.tag != "Rule" or set(rule.attrib) != expected
                    or len(rule)):
                raise ValueError("Unexpected rule element or metadata")
            source, target = rule.attrib["source"], rule.attrib["target"]
            gain, cap = float32(rule.attrib["gain"]), float32(rule.attrib["cap"])
            if ((source != "" if function == "constant" else not morph_identifier(source))
                    or function not in {"linear", "positive", "negative", "smoothstep", "power", "constant"}
                    or not morph_identifier(target) or not 0 < cap <= 1):
                raise ValueError("Invalid morph rule")
            edge = {"source": source, "target": target, "gain": gain, "cap": cap}
            if function != "linear":
                edge["function"] = function
            if function == "power":
                if not re.fullmatch(r"[0-9]+", rule.attrib["exponent"]):
                    raise ValueError("Invalid power exponent")
                edge["exponent"] = int(rule.attrib["exponent"])
                if not 1 <= edge["exponent"] <= 8:
                    raise ValueError("Power exponent must be in 1..8")
            if function == "constant":
                edge["value"] = float32(rule.attrib["value"])
            raw_rules.append(edge)
            if abs(gain) <= GAIN_EPSILON:
                continue
            for names, name in ((source_names, source), (target_names, target)):
                if not name:
                    continue
                identity = provider_identity(name)
                if identity in names and names[identity] != name:
                    raise ValueError("Ambiguous active provider case aliases")
                names[identity] = name
            if (source, target) in pairs or (target in caps and caps[target] != cap):
                raise ValueError("Duplicate active morph rule or inconsistent cap")
            pairs.add((source, target))
            caps[target] = cap
            rules.append(edge)
        if len(caps) > max_targets:
            raise ValueError(f"A sparse matrix supports at most {max_targets} active targets")
        if source_names.keys() & target_names.keys():
            raise ValueError("Active source and target names must not overlap")
        metadata["rules"] = raw_rules if retain_inactive else rules
        profiles.append(metadata)
    if not profiles:
        raise ValueError("Expected at least one profile")
    for sex, profile_id in (defaults or {}).items():
        if not any(profile["id"] == profile_id and profile["sex"] == sex for profile in profiles):
            raise ValueError("Default must select an existing profile of the matching sex")
    return {"schemaVersion": 1,
            "source": {"repository": PIN["repository"], "commit": PIN["commit"], "path": SOURCE_RELATIVE,
                       "sha256": hashlib.sha256(data).hexdigest()},
            "numericContract": "float32 inputs/gains/caps/constants; omit abs(gain)<=1e-6F; default linear; binary64 function evaluation and sum(gain*F(input)) in XML order; float32(clamp(sum,0,1)*cap)",
            "gainEpsilon": GAIN_EPSILON, "defaults": defaults or {},
            "profiles": profiles}


def compile_kernel(output_dir: Path, compiler: str | None = None,
                   claw_source_dir: Path | None = None) -> tuple[bytes, dict]:
    compiler = compiler or os.environ.get("CLAW_WASM_COMPILER") or shutil.which("clang")
    if not compiler:
        raise ValueError("Provide --wasm-compiler or CLAW_WASM_COMPILER pointing to clang with wasm-ld support")
    shared = dependency_root(claw_source_dir) / SHARED_RELATIVE
    sources = {name: (shared / name).read_bytes() for name in ("MatrixKernel.h", "MatrixKernel.cpp")}
    digest = hashlib.sha256(b"".join(name.encode()+b"\0"+data for name, data in sources.items())).hexdigest()
    wasm = output_dir / "matrix-kernel.wasm"
    command = [str(compiler), "--target=wasm32", "-x", "c++", "-std=c++17", "-O2", "-nostdlib",
               "-fno-exceptions", "-fno-rtti", "-fno-builtin", "-ffp-contract=off", "-fno-fast-math",
               "-Wl,--no-entry", "-Wl,--export-memory", "-Wl,--export=__heap_base",
               *["-Wl,--export="+name for name in ("claw_matrix_transform", "claw_matrix_contribution", "claw_matrix_clamp", "claw_matrix_evaluate",
                                                    "claw_matrix_gain_active", "claw_matrix_gain_epsilon",
                                                    "claw_matrix_source_kind", "claw_matrix_source_value_valid", "claw_matrix_source_neutral",
                                                    "claw_matrix_max_rules", "claw_matrix_max_targets")],
               str(shared / "MatrixKernel.cpp"), "-o", str(wasm)]
    subprocess.run(command, check=True, capture_output=True, text=True)
    for name, data in sources.items():
        if (shared / name).read_bytes() != data:
            raise ValueError("Shared kernel changed during compilation")
    data = wasm.read_bytes()
    if not data.startswith(b"\x00asm\x01\x00\x00\x00"):
        raise ValueError("Invalid WASM kernel")
    wasm_sha = hashlib.sha256(data).hexdigest()
    template = (HERE / "web/matrix-kernel.template.js").read_text(encoding="utf-8")
    bridge = template.replace("__CLAW_WASM_BASE64__", base64.b64encode(data).decode()).replace("__CLAW_SOURCE_SHA256__", digest).replace("__CLAW_WASM_SHA256__", wasm_sha).encode()
    (output_dir / "matrix-kernel.js").write_bytes(bridge)
    return bridge, {"abi": 1, "sourceSha256": digest, "wasmSha256": wasm_sha,
                    "sourceFiles": {name: hashlib.sha256(value).hexdigest() for name,value in sources.items()},
                    "compilerVersion": subprocess.check_output([str(compiler), "--version"],text=True).splitlines()[0],
                    "command": command, "bytes": len(data)}


def validate_shared_catalog(catalog: dict, bridge: Path) -> None:
    """The packaged C++ kernel owns reserved-source semantics, including build gates."""
    node = shutil.which("node")
    if not node:
        raise ValueError("Node.js is required to validate the catalog against its shared WASM kernel")
    code = ("const fs=require('node:fs'),core=require(process.argv[1]);"
            "const catalog=JSON.parse(fs.readFileSync(0,'utf8'));"
            "for(const profile of catalog.profiles)core.validateMatrix(profile);")
    checked = subprocess.run([node, "--require", str(bridge), "-e", code, str(HERE / "web/core.js")],
                             input=json.dumps(catalog, ensure_ascii=True).encode("utf-8"), capture_output=True)
    if checked.returncode:
        raise ValueError("Shared-kernel catalog validation failed: " + checked.stderr.decode("utf-8", errors="replace"))


def catalog_with_shared_validation(data: bytes, bridge: Path) -> dict:
    # Preserve every structurally checked edge until the shared semantic gate.
    # Inactive edges cannot hide unsupported reserved names from that gate.
    node = shutil.which("node")
    if not node:
        raise ValueError("Node.js is required to read the shared matrix capacities")
    limits = json.loads(subprocess.check_output([node, "--require", str(bridge), "-e",
        "console.log(JSON.stringify({max_rules:CLAWMatrixKernel.maxRules,max_targets:CLAWMatrixKernel.maxTargets}))"], text=True))
    validate_shared_catalog(catalog_from_bytes(data, retain_inactive=True, **limits), bridge)
    return catalog_from_bytes(data, **limits)


def build(output_dir: Path, compiler: str | None = None,
          claw_source_dir: Path | None = None) -> dict:
    output_dir = output_dir.resolve()
    if (output_dir == REPOSITORY or REPOSITORY in output_dir.parents) and not (output_dir == TARGET or TARGET in output_dir.parents):
        raise ValueError("Generated output must be outside the checkout or inside ignored target/")
    dependency = dependency_root(claw_source_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    bridge, kernel = compile_kernel(output_dir, compiler, dependency)
    catalog = catalog_with_shared_validation((dependency / SOURCE_RELATIVE).read_bytes(), output_dir / "matrix-kernel.js")
    dependency_root(dependency)
    catalog["generator"] = {"path": "src/main/morphbench-plugin/build.py",
                            "sha256": hashlib.sha256(Path(__file__).read_bytes().replace(b"\r\n", b"\n")).hexdigest()}
    assets = {name: (HERE / "web" / name).read_bytes().replace(b"\r\n", b"\n") for name in ASSETS}
    assets["matrix-kernel.js"] = bridge
    catalog["sharedKernel"] = {key:value for key,value in kernel.items() if key not in ("command", "compilerVersion")}
    catalog["evaluator"] = {"path": "src/main/morphbench-plugin/web/core.js",
                            "sha256": hashlib.sha256(assets["core.js"]).hexdigest()}
    manifest = json.loads(assets["addon.json"])
    if not re.fullmatch(r"[a-z][a-z0-9-]{0,63}", manifest["id"]):
        raise ValueError("Invalid addon ID")
    encoded = json.dumps(catalog, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("utf-8")
    assets["catalog.js"] = b'"use strict";\nwindow.CLAWMorphCatalog = ' + encoded + b";\n"
    output_dir.mkdir(parents=True, exist_ok=True)
    archive = output_dir / (manifest["id"] + ".zip")
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_STORED) as package:
        for name, content in sorted(assets.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            package.writestr(info, content)
    # This loose snapshot is for offline inspection/tests, never an installed addon.
    (output_dir / "catalog.json").write_bytes(encoded + b"\n")
    report = {"archive": str(archive), "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
              "bytes": archive.stat().st_size, "files": sorted(assets),
              "mappingSha256": catalog["source"]["sha256"],
              "generatorSha256": catalog["generator"]["sha256"],
              "evaluatorSha256": catalog["evaluator"]["sha256"],
              "profiles": {profile["id"]: len(profile["rules"]) for profile in catalog["profiles"]},
              "sharedKernel": kernel}
    (output_dir / "build-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=TARGET / "plugin")
    parser.add_argument("--wasm-compiler", help="External clang executable with wasm32/wasm-ld support")
    parser.add_argument("--claw-source-dir", type=Path, help="Local CLAW checkout containing all three exact hash-pinned dependency files; otherwise fetch them into ignored target/")
    args = parser.parse_args()
    print(json.dumps(build(args.output_dir, args.wasm_compiler, args.claw_source_dir), indent=2))


if __name__ == "__main__":
    main()
