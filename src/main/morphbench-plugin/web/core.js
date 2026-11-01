/* CLAW mapping evaluator. Independent of Morphbench and the browser DOM. */
;(function (global) {
  "use strict";

  const unsafeNames = new Set(["__proto__", "prototype", "constructor"]);
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  function fail(message) { throw new Error(message); }
  function object(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  function identifier(name) {
    return typeof name === "string" && name.length > 0 && new TextEncoder().encode(name).length <= 160 &&
      !/^[\x00-\x20]|[\x00-\x20]$|[\x00-\x1f\x7f]/.test(name) && !unsafeNames.has(name);
  }
  function finiteFloat(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(Math.fround(value))) {
      fail(label + " must be a finite float32 number.");
    }
    return Math.fround(value);
  }
  function providerIdentity(name) { return name.replace(/[A-Z]/g, character => character.toLowerCase()); }
  function morphIdentifier(name) { return identifier(name) && !/[^\x20-\x7e]/.test(name); }
  function validateMorphNames(names) {
    if (!Array.isArray(names)) fail("Morph names must be an array.");
    const seen = new Map();
    for (const name of names) {
      if (!morphIdentifier(name)) fail("Morph names must use printable ASCII identifiers.");
      const identity = providerIdentity(name);
      if (seen.has(identity)) fail("Duplicate morph name or ambiguous provider case aliases: " + seen.get(identity) + " / " + name);
      seen.set(identity, name);
    }
    return new Set(names);
  }
  function kernel() {
    const value = global.CLAWMatrixKernel || (typeof globalThis !== "undefined" && globalThis.CLAWMatrixKernel);
    if (!value || ["gainActive", "sourceKind", "sourceValueValid", "sourceNeutral"].some(name => typeof value[name] !== "function")) fail("Shared CLAW sparse WebAssembly kernel is unavailable. Load matrix-kernel.js before core.js.");
    if (!Number.isSafeInteger(value.maxRules) || value.maxRules <= 0 || !Number.isSafeInteger(value.maxTargets) || value.maxTargets <= 0) fail("Shared CLAW capacity exports are unavailable.");
    return value;
  }
  function validateHuman(values) {
    if (!object(values)) fail("Human values must be a JSON object mapping names to numbers.");
    validateMorphNames(Object.keys(values));
    const result = Object.create(null);
    for (const [name, value] of Object.entries(values)) {
      const kind = kernel().sourceKind(name);
      if (kind !== 0) fail("Actor scalar inputs belong in the separate actor controls, not human TRI morphs.");
      result[name] = finiteFloat(value, name);
      if (!kernel().sourceValueValid(kind, result[name])) fail("Shared CLAW source validator rejected human input: " + name);
    }
    return result;
  }
  function parseHuman(text) { return validateHuman(JSON.parse(text)); }

  const functions = new Set(["linear", "positive", "negative", "smoothstep", "power", "constant"]);
  function validateActorWeight(value) {
    const weight = finiteFloat(value, "Actor weight");
    if (!kernel().sourceValueValid(1, weight)) fail("Actor weight must be normalized in [0,1].");
    return weight;
  }
  function sourceKind(name) { return kernel().sourceKind(name); }
  function validateTraits(values = {}) {
    if (!object(values)) fail("Human traits must be a separate object of captured or manually declared actor traits.");
    validateMorphNames(Object.keys(values));
    const result = Object.create(null);
    for (const [name, value] of Object.entries(values)) {
      const kind = sourceKind(name);
      if (kind !== 2 && kind !== 3) fail("Unsupported human appearance trait: " + name);
      result[name] = finiteFloat(value, name);
      if (!kernel().sourceValueValid(kind, result[name])) fail("Invalid human appearance trait: " + name);
    }
    return result;
  }
  function matrixTargets(matrix) { return [...new Set(validateMatrix(matrix).rules.map(rule => rule.target))]; }
  function validateMatrix(profile) {
    if (!object(profile) || !identifier(profile.id) || !["CBBE", "3BA", "HIMBO", "Vanilla"].includes(profile.family) ||
        !["male", "female"].includes(profile.sex) ||
        (profile.family !== "Vanilla" && profile.sex !== (profile.family === "HIMBO" ? "male" : "female")) ||
        Object.keys(profile).some(key => !["id", "family", "sex", "version", "calibration", "rules"].includes(key)) ||
        !Array.isArray(profile.rules) || profile.rules.length > kernel().maxRules) {
      fail("Invalid CLAW profile metadata.");
    }
    for (const key of ["version", "calibration"]) {
      if (own(profile, key) && !identifier(profile[key])) fail("Invalid CLAW profile " + key);
    }
    const pairs = new Set(), caps = new Map(), sourceNames = new Map(), targetNames = new Map();
    const normalized = { ...profile, rules: [] };
    for (const rule of profile.rules) {
      if (!object(rule)) fail("Invalid CLAW mapping rule.");
      const fn = own(rule, "function") ? rule.function : "linear";
      const allowed = new Set(["source", "target", "gain", "cap", "function"]);
      if (fn === "power") allowed.add("exponent");
      if (fn === "constant") allowed.add("value");
      if (!functions.has(fn) || Object.keys(rule).some(key => !allowed.has(key)) ||
          (fn === "constant" ? rule.source !== "" : !morphIdentifier(rule.source)) || !morphIdentifier(rule.target)) {
        fail("Invalid CLAW mapping rule or function parameters.");
      }
      if ((fn !== "constant" && kernel().sourceKind(rule.source) < 0) || kernel().sourceKind(rule.target) !== 0) {
        fail("Unsupported reserved actor source or actor namespace target.");
      }
      const gain = finiteFloat(rule.gain, "Rule gain");
      const cap = finiteFloat(rule.cap, "Rule cap");
      if (cap <= 0 || cap > 1) fail("Rule cap must be in (0, 1].");
      const edge = { source: rule.source, target: rule.target, gain, cap, function: fn };
      if (fn === "power") {
        if (!Number.isInteger(rule.exponent) || rule.exponent < 1 || rule.exponent > 8) fail("Power exponent must be an integer in 1..8.");
        edge.exponent = rule.exponent;
      }
      if (fn === "constant") edge.value = finiteFloat(rule.value, "Constant value");
      if (!kernel().gainActive(gain)) continue;
      for (const [names, name] of [[sourceNames, rule.source], [targetNames, rule.target]]) {
        if (!name) continue;
        const identity = providerIdentity(name);
        if (names.has(identity) && names.get(identity) !== name) fail("Ambiguous active provider case aliases: " + names.get(identity) + " / " + name);
        names.set(identity, name);
      }
      const pair = JSON.stringify([rule.source, rule.target]);
      if (pairs.has(pair)) fail("Duplicate CLAW source/target rule.");
      pairs.add(pair);
      if (caps.has(rule.target) && caps.get(rule.target) !== cap) fail("Inconsistent target cap.");
      caps.set(rule.target, cap);
      normalized.rules.push(edge);
    }
    if (caps.size > kernel().maxTargets) fail("A sparse matrix supports at most " + kernel().maxTargets + " active targets.");
    if (Array.from(sourceNames.keys()).some(name => targetNames.has(name))) fail("Active source and target names must not overlap by provider identity.");
    return normalized;
  }

  function serializableMatrix(matrix) {
    const profile = validateMatrix(matrix);
    return { ...profile, rules: profile.rules.map(rule => {
      const edge = { ...rule }; if (edge.function === "linear") delete edge.function; return edge;
    }) };
  }

  function getProfile(catalog, id) {
    if (!object(catalog) || catalog.schemaVersion !== 1 || !Array.isArray(catalog.profiles)) fail("Invalid CLAW mapping catalog.");
    if (!identifier(id)) fail("Unknown CLAW profile.");
    const matches = catalog.profiles.filter(profile => object(profile) && profile.id === id);
    if (matches.length !== 1) fail("Unknown or ambiguous CLAW profile: " + id);
    return validateMatrix(matches[0]);
  }

  function exportMatrix(matrix) {
    const profile = validateMatrix(matrix);
    // Native generated family interchange intentionally excludes XML entities.
    const ascii = value => {
      if (typeof value !== "string" || /[^\x20-\x7e]|[&<>"']/.test(value)) fail("XML matrix fields must use plain ASCII without XML delimiters.");
      return value;
    };
    const version = profile.version || "1", calibration = profile.calibration || "authored-matrix";
    const lines = ['<MorphLinkProfiles schemaVersion="1">',
      '  <Profile id="' + ascii(profile.id) + '" family="' + profile.family + '" version="' + ascii(version) +
      '" sex="' + profile.sex + '" calibration="' + ascii(calibration) + '">'];
    for (const rule of profile.rules) {
      let line = '    <Rule source="' + ascii(rule.source) + '" target="' + ascii(rule.target) + '" gain="' + rule.gain + '" cap="' + rule.cap + '"';
      if (rule.function !== "linear") line += ' function="' + rule.function + '"';
      if (rule.function === "power") line += ' exponent="' + rule.exponent + '"';
      if (rule.function === "constant") line += ' value="' + rule.value + '"';
      lines.push(line + ' />');
    }
    lines.push('  </Profile>', '</MorphLinkProfiles>');
    return lines.join("\n") + "\n";
  }

  function evaluate(catalog, profileId, humanValues, actorWeight, humanTraits) {
    return evaluateMatrix(getProfile(catalog, profileId), humanValues, actorWeight, humanTraits);
  }

  function exportCatalog(catalog, matrix, femaleFamily, maleFamily = "HIMBO") {
    const edited = validateMatrix(matrix);
    if (!["CBBE", "3BA", "Vanilla"].includes(femaleFamily) || !["HIMBO", "Vanilla"].includes(maleFamily)) fail("Declare the installed male and female body families before exporting game configuration.");
    if (edited.sex === "female" && edited.family !== femaleFamily) fail("Select the edited female family before exporting game configuration.");
    if (edited.sex === "male" && edited.family !== maleFamily) fail("Select the edited male family before exporting game configuration.");
    const selected = [["male", maleFamily], ["female", femaleFamily]].map(([sex, family]) => {
      const matches = catalog.profiles.filter(profile => profile.family === family && profile.sex === sex);
      if (matches.length !== 1) fail("Ambiguous game configuration families or identifiers.");
      return edited.family === family && edited.sex === sex ? edited : validateMatrix(matches[0]);
    });
    const [male, female] = selected;
    if (male.id === female.id) fail("Ambiguous game configuration identifiers.");
    const body = selected.map(profile => exportMatrix(profile).split("\n").slice(1,-2).join("\n")).join("\n");
    // exportMatrix validates every identifier for the deliberately strict native XML format.
    return '<MorphLinkProfiles schemaVersion="1">\n  <Defaults male="' + male.id + '" female="' + female.id + '" />\n' + body + '\n</MorphLinkProfiles>\n';
  }

  function evaluateMatrix(matrix, humanValues, actorWeight, humanTraits) {
    const profile = validateMatrix(matrix), human = validateHuman(humanValues);
    const traits = validateTraits(humanTraits);
    const weight = actorWeight === undefined ? undefined : validateActorWeight(actorWeight);
    if (weight === undefined && profile.rules.some(rule => rule.function !== "constant" && kernel().sourceKind(rule.source) === 1)) fail("An explicit normalized actor weight is required by this matrix.");
    const humanByIdentity = new Map(Object.entries(human).map(([name, value]) => [providerIdentity(name), value]));
    const targets = new Map(), mappedSources = new Set();
    for (const rule of profile.rules) {
      if (!targets.has(rule.target)) targets.set(rule.target, { target: rule.target, contributions: [], rawSum: 0, cap: rule.cap });
    }
    const ordered = Array.from(targets.keys());
    const numericRules = profile.rules.map(rule => ({ ...rule,
      target: ordered.indexOf(rule.target),
      input: rule.function === "constant" ? 0 : kernel().sourceKind(rule.source) === 1 ? weight :
        kernel().sourceKind(rule.source) >= 2 ? (traits[rule.source] ?? kernel().sourceNeutral(kernel().sourceKind(rule.source))) :
          (humanByIdentity.get(providerIdentity(rule.source)) ?? 0) }));
    const numeric = kernel().evaluate(numericRules, ordered.length);
    profile.rules.forEach((rule, index) => {
      const row = targets.get(rule.target);
      row.cap = rule.cap;
      row.contributions.push({ ...rule, input: numericRules[index].input, ...numeric.details[index] });
      if (rule.function !== "constant") mappedSources.add(providerIdentity(rule.source));
    });
    const values = Object.create(null);
    ordered.forEach((target, index) => {
      const row = targets.get(target);
      row.rawSum = numeric.rawSums[index]; row.clamped = numeric.clamped[index];
      row.value = numeric.values[index]; values[target] = row.value;
    });
    const rows = Array.from(targets.values()).sort((a, b) => a.target < b.target ? -1 : a.target > b.target ? 1 : 0);
    return { profile: profile, rows: rows, values: values, actorWeight: weight, humanTraits: traits,
      unavailableTraits: [...new Set(profile.rules.filter(rule => rule.function !== "constant" && sourceKind(rule.source) >= 2 && !own(traits, rule.source)).map(rule => rule.source))],
      unmapped: Object.keys(human).filter(name => !mappedSources.has(providerIdentity(name))).sort() };
  }

  function validateModel(scene, morphs, targets) {
    if (!object(scene) || scene.open !== true || !object(scene.names) ||
        typeof scene.names.nif !== "string" || !scene.names.nif) fail("Open a CLAW body model first.");
    if (!object(morphs) || !Array.isArray(morphs.names) ||
        morphs.names.some(name => typeof name !== "string")) fail("Invalid host morph list.");
    const available = validateMorphNames(morphs.names);
    const missing = targets.filter(name => !available.has(name));
    if (missing.length) fail("Model is missing linked targets: " + missing.join(", "));
    return scene.names.nif;
  }

  const api = Object.freeze({ parseHuman, validateHuman, validateTraits, validateActorWeight, sourceKind, matrixTargets, providerIdentity, validateMorphNames, getProfile, validateMatrix, serializableMatrix, evaluateMatrix, exportMatrix, exportCatalog, evaluate, validateModel });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.CLAWLink = api;
})(typeof window !== "undefined" ? window : globalThis);
