"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../../main/morphbench-plugin/web/core.js");
if (!process.argv[2]) throw new Error("Pass the external build's catalog.json path.");
const catalog = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), "utf8"));
// Historical coefficient assertions use the explicit neutral actor weight; new weight behavior is tested separately.
const evaluateAtNeutralWeight = (id, human) => core.evaluate(catalog, id, human, .5);
const male = "CLAW.HIMBO.5.8.Geometry1", female = "CLAW.3BA.2.48.Geometry1";
const belly = "CLAWTorsoBellyRound", girth = "CLAWTorsoGirth", chest = "CLAWTorsoChestSize";
const clone = value => JSON.parse(JSON.stringify(value));
const approximate = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${actual} differs from ${expected}`);

test("recorded male heavy sources reproduce Belly ~0.7963179 and retain contribution detail", () => {
  const result = evaluateAtNeutralWeight( male, { BellyPot: .5, BellyRounder: .2, TorsoBelly: .6, TorsoBellyChub: .35 });
  approximate(result.values[belly], .7963179);
  const row = result.rows.find(item => item.target === belly);
  assert.equal(row.contributions.filter(item => item.input !== 0).length, 4);
  approximate(row.contributions.reduce((sum, item) => sum + item.contribution, 0), row.rawSum, 1e-15);
});

test("female 3BA combined Belly and BigBelly saturate at 1", () => {
  const result = evaluateAtNeutralWeight( female, { Belly: .7, BigBelly: .7 });
  assert.equal(result.values[belly], 1);
  assert.ok(result.rows.find(row => row.target === belly).rawSum > 1);
});

test("male PecsMass and PecsSize combine to Chest .3", () => {
  approximate(evaluateAtNeutralWeight( male, { PecsMass: .25, PecsSize: .5 }).values[chest], .3);
});

test("cap multiplies the clamped sum, with both below-cap and saturated cases", () => {
  const small = evaluateAtNeutralWeight( male, { BodyMass: .1 });
  const row = small.rows.find(item => item.target === girth);
  assert.ok(row.rawSum > .1 && row.rawSum < 1);
  approximate(row.value, row.rawSum * .25);
  assert.notEqual(row.value, Math.min(row.rawSum, .25));
  const saturated = evaluateAtNeutralWeight( male, { BodyMass: 100 });
  assert.equal(saturated.values[girth], .25);
});

test("neutral, explicit zero and negative-source clipping retain zero targets", () => {
  const neutral = evaluateAtNeutralWeight( male, {}).values;
  assert.ok(Object.keys(neutral).length > 5);
  assert.ok(Object.values(neutral).every(value => value === 0));
  assert.deepEqual(evaluateAtNeutralWeight( male, { BellyPot: 0 }).values, neutral);
  assert.equal(evaluateAtNeutralWeight( male, { BellyPot: -1 }).values[belly], 0);
  assert.equal(evaluateAtNeutralWeight( male, { Lean: 1 }).values[belly], 0);
});

test("sparse evaluation omits targets without configured rules", () => {
  const result = evaluateAtNeutralWeight( male, {});
  const neck = result.rows.find(row => row.target === "CLAWTorsoNeckGirth");
  assert.equal(neck, undefined);
  assert.equal(Object.hasOwn(result.values, "CLAWTorsoNeckGirth"), false);
  assert.equal(Object.hasOwn(result.values, "CLAWTorsoBreastSize"), false);
});

test("input permits finite extrapolation/negative values and reports unmapped aggregate names", () => {
  const result = evaluateAtNeutralWeight( male, { BellyPot: 2, Lean: -.25, HumanOther: .5 });
  assert.equal(result.values[belly], 1);
  assert.deepEqual(result.unmapped, ["HumanOther"]);
});

test("input rejects NaN, infinity, float overflow, nonnumeric, unsafe and malformed maps", () => {
  for (const input of [null, [], 1, "{}", { BellyPot: NaN }, { BellyPot: Infinity },
    { BellyPot: -Infinity }, { BellyPot: 1e39 }, { BellyPot: "1" }, { BellyPot: true },
    { "bad\nname": .2 }, { " BellyPot": .2 }, { ["é".repeat(81)]: 0 },
    JSON.parse('{"__proto__":0}'), { constructor: 0 }, { prototype: 0 }]) {
    assert.throws(() => core.validateHuman(input));
  }
  for (const text of ["{", '{"BellyPot":NaN}', '{"BellyPot":1e999}']) assert.throws(() => core.parseHuman(text));
});

test("unknown or unsafe profile and malformed mappings reject instead of falling back", () => {
  for (const id of ["HIMBO", "__proto__", "constructor", male + " ", ""]) {
    assert.throws(() => evaluateAtNeutralWeight( id, {}));
  }
  const invalid = clone(catalog);
  invalid.profiles.find(profile => profile.id === male).rules[0].target = " unsafe";
  assert.throws(() => core.evaluate(invalid, male, {}));
  const duplicate = clone(catalog);
  duplicate.profiles[0].rules.push(duplicate.profiles[0].rules[0]);
  assert.throws(() => core.evaluate(duplicate, female, {}));
});

test("model validation accepts the declared target domain and rejects any missing target", () => {
  const scene = { open: true, names: { nif: "body.nif" } };
  const targets = Object.keys(evaluateAtNeutralWeight(male, {}).values);
  assert.equal(core.validateModel(scene, { names: targets }, targets), "body.nif");
  assert.throws(() => core.validateModel(scene, { names: targets.filter(name => name !== belly) }, targets), /missing linked targets/);
});

test("closed model and malformed host morph lists are rejected", () => {
  assert.throws(() => core.validateModel({ open: false }, { names: [] }, []), /Open a CLAW body/);
  const scene = { open: true, names: { nif: "body.nif" } };
  for (const morphs of [{ names: [42] }, { names: [belly, belly] }, { names: ["Target", "target"] }, {}]) {
    assert.throws(() => core.validateModel(scene, morphs, []));
  }
});
