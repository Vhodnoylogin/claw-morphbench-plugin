"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const core = require("../../main/morphbench-plugin/web/core.js");
const { PreviewController } = require("../../main/morphbench-plugin/web/preview-controller.js");
const catalog = { schemaVersion: 1, profiles: [
  { id: "female.3BA", family: "3BA", sex: "female", rules: [{ source: "Belly", target: "CLAWTorsoBellyRound", gain: .75, cap: .8 }] },
  { id: "female.CBBE", family: "CBBE", sex: "female", rules: [{ source: "Belly", target: "CLAWTorsoBellyRound", gain: .5, cap: 1 }] },
  { id: "male.HIMBO", family: "HIMBO", sex: "male", rules: [{ source: "Belly", target: "CLAWTorsoBellyRound", gain: 1, cap: 1 }] }
] };
const wolfNames = Object.keys(core.evaluate(catalog, "female.3BA", {}).values).concat(["CLAWHeadEarSize", "CLAWTailLength"]);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(setImmediate);

function host(options = {}) {
  const calls = [], events = new Map(), previews = new Map(), order = ["third-party"]; let serial = 0;
  previews.set("third-party", { preview: "third-party", name: "unrelated", names: ["Other"], values: { Other: .6 } });
  const sdk = {
    async connect() { return { apiVersion: 1, capabilities: options.capabilities || [...PreviewController.requiredCapabilities, ...(options.geometry ? ["previews.geometry"] : []), ...(options.zoom ? ["previews.view.get", "previews.view.set"] : []), ...(options.beforePlacement ? ["previews.create.before"] : [])], previewLimits: { maxPreviews: options.maxPreviews || 4, loadTimeoutMs: 8000 } }; },
    on(name, handler) { events.set(name, handler); return () => events.delete(name); },
    async request(method, params) {
      calls.push({ method, params: JSON.parse(JSON.stringify(params)) });
      if (options.before) await options.before(method, params, { previews, calls });
      if (method === "models.list") { assert.deepEqual(params, {}); return { root: "catalogue", entries: ["human.nif", "wolf.nif", "another.nif"].map(name => ({ name, nif: name, tri: name + ".tri" })) }; }
      if (method === "previews.create") {
        assert.deepEqual(Object.keys(params).sort(), params.before ? ["before", "name"] : ["name"]);
        if (params.before) { assert.equal(options.beforePlacement, true); assert.ok(previews.has(params.before)); }
        const preview = "opaque:" + (++serial), isHuman = params.name === "human.nif" || (options.humanModels || []).includes(params.name);
        const names = options.namesByModel?.[params.name] || (isHuman ? ["Belly", "HumanOther", "UnmappedHuman"] : [...(options.wolfNames || wolfNames)]);
        previews.set(preview, { preview, name: params.name, names, zoom: isHuman ? 1 : 1.25, revision: 0, values: isHuman ? {} : { CLAWHeadEarSize: .6, CLAWTailLength: .8 } });
        if (params.before) order.splice(order.indexOf(params.before), 0, preview); else order.push(preview);
        return { preview, name: params.name };
      }
      if (method === "previews.link") {
        assert.deepEqual(Object.keys(params).sort(), ["previews", "properties"]);
        assert.deepEqual(params.properties, ["orientation"]);
        assert.equal(params.previews.length, 2); assert.ok(params.previews.every(id => previews.has(id)));
        return JSON.parse(JSON.stringify(params));
      }
      assert.equal(typeof params.preview, "string");
      const item = previews.get(params.preview);
      if (!item) throw Object.assign(new Error("Expired handle"), { code: "unknownPreview" });
      if (method === "previews.close") { assert.deepEqual(Object.keys(params), ["preview"]); previews.delete(params.preview);
        order.splice(order.indexOf(params.preview), 1);
        if (options.emitClose) events.get("previews.changed")?.({ preview: params.preview, method });
        return { closed: true }; }
      if (method === "previews.scene.get") { assert.deepEqual(Object.keys(params), ["preview"]); return { open: true, names: { nif: item.name, tri: item.name + ".tri" }, shapes: [{ name: "Body", vertices: 3, triangles: 1 }] }; }
      if (method === "previews.geometry") {
        assert.equal(options.geometry, true); assert.equal(params.shape, "Body");
        return options.geometryResult || { name: "Body", space: "model", vertices: [1, 2, 3, 0, 0, 0, -1, -2, -3], baseVertices: [0, 0, 0, 0, 0, 0, -1, -1, -1] };
      }
      if (method === "previews.view.get") { assert.equal(options.zoom,true); return { state: { zoom: item.zoom }, presets: {} }; }
      if (method === "previews.view.set") {
        assert.equal(options.zoom,true); assert.deepEqual(Object.keys(params).sort(),["preview","zoom"]);
        item.zoom=params.zoom; ++item.revision;
        if(events.has("previews.view.changed")) events.get("previews.view.changed")({preview:params.preview,source:params.preview,revision:item.revision,state:{zoom:item.zoom},method});
        return {state:{zoom:item.zoom},presets:{}};
      }
      if (method === "previews.morphs.set") {
        assert.deepEqual(Object.keys(params).sort(), ["preview", "values"]);
        assert.ok(Object.keys(params.values).every(name => item.names.includes(name)));
        Object.assign(item.values, params.values);
      } else assert.equal(method, "previews.morphs.get", "No legacy/global or camera-echo method is allowed");
      return { names: [...item.names], values: { ...item.values } };
    }
  };
  return { sdk, calls, previews, events, order };
}
async function opened(options = {}) {
  const fake = host(options), observations = [];
  const controller = new PreviewController(fake.sdk, catalog, { onState: event => observations.push(event) });
  await controller.open("female.3BA", "human.nif", "wolf.nif");
  return { ...fake, controller, observations };
}

test("confirmed close retires the applied morph ledger across repeated pair lifecycles", async () => {
  const f=host(),c=new PreviewController(f.sdk,catalog);
  for(let round=0;round<10;round++) {
    await c.open("female.3BA","human.nif","wolf.nif");
    await c.apply({Belly:.7},null,.5,{});
    const bindings=c._state.snapshot().bindings;
    assert.ok(c._state.ledger("human",bindings.human).size>0);
    assert.ok(c._state.ledger("wolf",bindings.wolf).size>0);
    await c.close();
    assert.equal(c._state.ledger("human",bindings.human).size,0);
    assert.equal(c._state.ledger("wolf",bindings.wolf).size,0);
    assert.equal(c._state.owned.size,0);
    assert.equal(c._owned.size,0);
  }
  assert.deepEqual([...f.previews.keys()],["third-party"]);
});

test("failed close retains only its role's ledger until a successful retry", async () => {
  let failClose=false,human;
  const f=await opened({before(method,params) {
    if(failClose&&method==="previews.close"&&params.preview===human) throw new Error("Retriable close failure");
  }});
  await f.controller.apply({Belly:.7},null,.5,{});
  const bindings=f.controller._state.snapshot().bindings;human=bindings.human.id;failClose=true;
  await assert.rejects(f.controller.close(),{code:"cleanupFailed"});
  assert.ok(f.controller._state.ledger("human",bindings.human).size>0);
  assert.equal(f.controller._state.ledger("wolf",bindings.wolf).size,0);
  assert.equal(f.controller.failedCleanup.length,1);
  failClose=false;await f.controller.close();
  assert.equal(f.controller._state.owned.size,0);
  assert.equal(f.controller.failedCleanup.length,0);
});

test("authoritative unknownPreview absence retires that handle and its acknowledged ledger", async () => {
  let unknownClose=false,human;
  const f=await opened({before(method,params,{previews}) {
    if(unknownClose&&method==="previews.close"&&params.preview===human) {
      previews.delete(human);throw Object.assign(new Error("Expired handle"),{code:"unknownPreview"}); }
  }});
  await f.controller.apply({Belly:.7},null,.5,{});
  const bindings=f.controller._state.snapshot().bindings;human=bindings.human.id;unknownClose=true;
  await f.controller.close();
  assert.equal(f.controller._owned.size,0);
  assert.equal(f.controller.failedCleanup.length,0);
  assert.equal(f.controller._state.ledger("human",bindings.human).size,0);
  assert.equal(f.controller._state.ledger("wolf",bindings.wolf).size,0);
  assert.equal(f.controller._state.owned.size,0);assert.deepEqual([...f.previews.keys()],["third-party"]);
});

test("capability discovery keeps stable v1 hosts unavailable without creating anything", async () => {
  const f = host({ capabilities: ["models.list", "morphs.get", "morphs.set"] });
  const c = new PreviewController(f.sdk, catalog);
  assert.equal(c.supports(await f.sdk.connect()), false);
  await assert.rejects(c.open("female.3BA", "human.nif", "wolf.nif"), { code: "unsupportedPreviews" });
  assert.equal(f.calls.length, 0); assert.equal(c.pair, null);
  assert.equal(PreviewController.supports({ apiVersion: 1, capabilities: [...PreviewController.requiredCapabilities], previewLimits: { maxPreviews: 1 } }), false);
});

test("real scoped contract opens two immutable IDs, links orientation natively and preserves a third preview", async () => {
  const f = await opened(), pair = f.controller.pair;
  assert.equal(pair.profileId, "female.3BA"); assert.equal(pair.human.name, "human.nif");
  assert.ok(Object.isFrozen(pair.human.scene));
  assert.equal(f.calls.filter(call => call.method === "previews.link").length, 1);
  const models = await f.controller.listModels(); assert.equal(models.entries.length, 3);
  await f.controller.close(); assert.equal(f.controller.pair, null);
  assert.deepEqual([...f.previews.keys()], ["third-party"]);
  assert.ok(f.calls.filter(call => call.method === "previews.close").every(call => call.params.preview !== "third-party"));
});

test("failure creating the second preview closes only the successfully created first", async () => {
  const f = host({ before(method, params) { if (method === "previews.create" && params.name === "wolf.nif") throw new Error("load failed"); } });
  const c = new PreviewController(f.sdk, catalog);
  await assert.rejects(c.open("female.3BA", "human.nif", "wolf.nif"), /load failed/);
  assert.deepEqual([...f.previews.keys()], ["third-party"]); assert.equal(c.pair, null);
});

test("close while create is pending invalidates the open and disposes its late handle", async () => {
  const gate = deferred(); let started = false;
  const f = host({ async before(method) { if (method === "previews.create" && !started) { started = true; await gate.promise; } } });
  const c = new PreviewController(f.sdk, catalog);
  const opening = c.open("female.3BA", "human.nif", "wolf.nif");
  const refused = assert.rejects(opening, { code: "stalePair" }); await tick();
  const closing = c.close(); gate.resolve(); await refused; await closing;
  assert.equal(c.pair, null); assert.deepEqual([...f.previews.keys()], ["third-party"]);
  assert.equal(f.calls.filter(call => call.method === "previews.create").length, 1);
});

test("all names are validated before either write and full unmapped human fields survive", async () => {
  const f = await opened(), pair = f.controller.pair;
  await assert.rejects(f.controller.apply({ MissingHuman: 1 }), /missing input/);
  assert.equal(f.calls.filter(call => call.method === "previews.morphs.set").length, 0);
  const input = { Belly: .7, UnmappedHuman: -.25, HumanOther: .4 }, result = await f.controller.apply(input);
  const expected = core.evaluate(catalog, "female.3BA", input);
  assert.deepEqual(result.wolfValues, JSON.parse(JSON.stringify(expected.values)));
  assert.equal(result.humanValues.UnmappedHuman, -.25); assert.equal(result.humanValues.HumanOther, Math.fround(.4));
  assert.deepEqual(result.unmapped, ["HumanOther", "UnmappedHuman"]);
  assert.equal(f.previews.get(pair.human.preview).values.UnmappedHuman, -.25);
  assert.equal(f.previews.get(pair.wolf.preview).values.CLAWHeadEarSize, .6);
  assert.equal(f.previews.get(pair.wolf.preview).values.CLAWTailLength, .8);
  assert.equal(f.calls.filter(call => /^(previews\.view\.|view\.|rotation|previews\.unlink)/.test(call.method)).length, 0);
});

test("a missing wolf target refuses opening before any morph write", async () => {
  const f = host({ wolfNames: wolfNames.filter(name => name !== "CLAWTorsoBellyRound") }), c = new PreviewController(f.sdk, catalog);
  await assert.rejects(c.open("female.3BA", "human.nif", "wolf.nif"), /missing linked targets/);
  assert.deepEqual([...f.previews.keys()], ["third-party"]);
  assert.equal(f.calls.filter(call => call.method === "previews.morphs.set").length, 0);
});

test("partial second-model failure closes the pair and never reports paired success", async () => {
  let writes = 0;
  const f = await opened({ before(method) { if (method === "previews.morphs.set" && ++writes === 2) throw Object.assign(new Error("unknown commit"), { code: "timeout" }); } });
  await assert.rejects(f.controller.apply({ Belly: 1 }), { code: "timeout" });
  assert.equal(f.controller.pair, null); assert.deepEqual([...f.previews.keys()], ["third-party"]);
  assert.equal(f.observations.filter(item => item.method === "apply").length, 0);
});

test("an unknown first-model failure also closes both handles instead of assuming no write", async () => {
  const f = await opened({ before(method) { if (method === "previews.morphs.set") throw Object.assign(new Error("reply lost"), { code: "timeout" }); } });
  await assert.rejects(f.controller.apply({ Belly: .5 }), { code: "timeout" });
  assert.equal(f.controller.pair, null); assert.deepEqual([...f.previews.keys()], ["third-party"]);
});

test("failed cleanup retains exact owned handles and exposes a retryable report", async () => {
  let fail = true;
  const f = await opened({ before(method) { if (method === "previews.close" && fail) throw new Error("close blocked"); } });
  await assert.rejects(f.controller.close(), { code: "cleanupFailed" });
  assert.equal(f.controller.failedCleanup.length, 2); assert.equal(f.controller.pair, null);
  assert.ok(f.controller.failedCleanup.every(item => item.error.message === "close blocked"));
  fail = false; await f.controller.close(); assert.equal(f.controller.failedCleanup.length, 0);
  assert.deepEqual([...f.previews.keys()], ["third-party"]);
});

test("family changes clear acknowledged wolf outputs only; sex changes demand reopening", async () => {
  const f = await opened(), pair = f.controller.pair;
  await f.controller.apply({ Belly: .6, HumanOther: .7 });
  const human = { ...f.previews.get(pair.human.preview).values }, before = f.calls.length;
  await f.controller.changeProfile("female.CBBE");
  const writes = f.calls.slice(before).filter(call => call.method === "previews.morphs.set");
  assert.equal(writes.length, 1); assert.equal(writes[0].params.preview, pair.wolf.preview);
  assert.ok(Object.values(writes[0].params.values).every(value => value === 0));
  assert.equal(Object.hasOwn(writes[0].params.values, "CLAWTailLength"), false);
  assert.deepEqual(f.previews.get(pair.human.preview).values, human);
  assert.equal(f.controller.pair.profileId, "female.CBBE");
  await assert.rejects(f.controller.changeProfile("male.HIMBO"), { code: "reopenRequired" });
  const zeroStart = f.calls.length; await f.controller.zeroWolf();
  assert.equal(f.calls.slice(zeroStart).filter(call => call.method === "previews.morphs.set").length, 0);
  assert.deepEqual(f.previews.get(pair.human.preview).values, human);
});

test("a refused family change preserves current authority and outputs for generic disjoint domains", async () => {
  for (const rule of [{ source: "Belly", target: "Custom.Missing", gain: 1, cap: 1 },
    { source: "MissingHumanSource", target: "CLAWTorsoBellyRound", gain: 1, cap: 1 }]) {
    const local = { ...catalog, profiles: catalog.profiles.map(profile => profile.id === "female.CBBE" ? { ...profile, rules: [rule] } : profile) };
    const fake = host(), controller = new PreviewController(fake.sdk, local);
    await controller.open("female.3BA", "human.nif", "wolf.nif");
    await controller.apply({ Belly: .5 });
    const pair = controller.pair, before = fake.calls.length;
    const wolfBefore = { ...fake.previews.get(pair.wolf.preview).values };
    await assert.rejects(controller.changeProfile("female.CBBE"), /missing linked targets|no configured source/);
    assert.deepEqual(controller.pair, pair);
    assert.equal(fake.calls.slice(before).filter(call => call.method === "previews.morphs.set" || call.method === "previews.close").length, 0);
    assert.deepEqual(fake.previews.get(pair.wolf.preview).values, wolfBefore);
    const result = await controller.apply({ Belly: .75 });
    assert.equal(result.profile.id, "female.3BA");
    await controller.close();
  }
});

test("writes serialize and unsent vectors coalesce with explicit superseded results", async () => {
  const gate = deferred(); let first = true;
  const f = await opened({ async before(method) { if (method === "previews.morphs.set" && first) { first = false; await gate.promise; } } });
  const firstApply = f.controller.apply({ Belly: .1 }); await tick();
  const second = f.controller.apply({ Belly: .2 }); const superseded = assert.rejects(second, { code: "superseded" });
  const third = f.controller.apply({ Belly: .3 }); gate.resolve();
  assert.equal((await firstApply).humanValues.Belly, Math.fround(.1)); await superseded;
  assert.equal((await third).humanValues.Belly, Math.fround(.3));
  const humanWrites = f.calls.filter(call => call.method === "previews.morphs.set" && call.params.preview === f.controller.pair.human.preview);
  assert.deepEqual(humanWrites.map(call => call.params.values.Belly), [Math.fround(.1), Math.fround(.3)]);
});

test("close during a pending write invalidates its result and prevents the other model write", async () => {
  const gate = deferred(); let first = true;
  const f = await opened({ async before(method) { if (method === "previews.morphs.set" && first) { first = false; await gate.promise; } } });
  const applying = f.controller.apply({ Belly: 1 }); const refused = assert.rejects(applying, { code: "stalePair" }); await tick();
  const closing = f.controller.close(); gate.resolve(); await refused; await closing;
  assert.equal(f.calls.filter(call => call.method === "previews.morphs.set").length, 1);
  assert.deepEqual([...f.previews.keys()], ["third-party"]);
});

test("scoped change notifications never reapply coefficients or echo rotations", async () => {
  const f = await opened(), count = f.calls.length;
  f.events.get("previews.changed")({ preview: f.controller.pair.human.preview, method: "previews.morphs.set" });
  f.events.get("previews.changed")({ preview: "third-party", method: "previews.close" });
  await tick(); assert.equal(f.calls.length, count); assert.ok(f.controller.pair);
});

test("external closure disposes the surviving owned preview and publishes final closed state", async () => {
  const f = await opened(); await f.controller.apply({ Belly: .4 });
  const pair = f.controller.pair, count = f.calls.length;
  f.previews.delete(pair.human.preview);
  f.events.get("previews.changed")({ preview: pair.human.preview, method: "previews.close" });
  assert.equal(f.controller.pair, null);
  await tick();
  assert.deepEqual(f.calls.slice(count), [{ method: "previews.close", params: { preview: pair.wolf.preview } }]);
  assert.deepEqual([...f.previews.keys()], ["third-party"]);
  assert.deepEqual(f.controller.failedCleanup, []);
  assert.equal(f.controller._state.owned.size, 0);
  assert.equal(f.observations.at(-1).method, "close");
  assert.equal(f.observations.at(-1).pair, null);
});
test("matrix writes use functions/constants, preserve ownership and reject wrong family before writes", async () => {
  const f = await opened(), profile = core.getProfile(catalog, "female.3BA"), pair = f.controller.pair;
  const matrix = { ...profile, rules: [
    { source: "UnmappedHuman", target: "CLAWTorsoBellyRound", gain: .5, cap: .8, function: "negative" },
    { source: "", target: "CLAWTorsoBellyRound", gain: .25, cap: .8, function: "constant", value: .5 }
  ] };
  const result = await f.controller.apply({ UnmappedHuman: -.5 }, matrix);
  assert.deepEqual(result.wolfValues, JSON.parse(JSON.stringify(core.evaluateMatrix(matrix, { UnmappedHuman: -.5 }).values)));
  assert.equal(Object.hasOwn(result.humanValues, ""), false); assert.equal(result.humanValues.UnmappedHuman, -.5);
  const count = f.calls.filter(call => call.method === "previews.morphs.set").length;
  await assert.rejects(f.controller.apply({}, { ...matrix, id: "female.CBBE" }), /different bound human family/);
  assert.equal(f.calls.filter(call => call.method === "previews.morphs.set").length, count);
  await f.controller.zeroWolf(); assert.equal(f.previews.get(pair.wolf.preview).values.CLAWHeadEarSize, .6);
});
test("geometry capability gap never substitutes a main-model read", async () => {
  const f = await opened(); await assert.rejects(f.controller.readGeometry(), { code: "unsupportedGeometry" });
  assert.equal(f.calls.filter(call => /geometry$/.test(call.method)).length, 0);
});
test("geometry reads preserve all current/base/delta positions and never mutate a model", async () => {
  const f = await opened({ geometry: true }), before = f.calls.length;
  const data = await f.controller.readGeometry();
  for (const role of ["human", "wolf"]) {
    assert.deepEqual(data.models[role].shapes[0].deltas, [1, 2, 3, 0, 0, 0, 0, -1, -2]);
    assert.ok(Math.abs(data.models[role].shapes[0].maximumDisplacement - Math.sqrt(14)) < 1e-12);
  }
  assert.ok(f.calls.slice(before).every(call => ["previews.scene.get", "previews.geometry", "previews.morphs.get"].includes(call.method)));
  assert.ok(f.calls.slice(before).every(call => call.params.preview !== "third-party"));
});
test("malformed or stale geometry responses fail without applying or retaining a partial snapshot", async () => {
  const bad = await opened({ geometry: true, geometryResult: { name: "Body", space: "model", vertices: [NaN, 0, 0], baseVertices: [0, 0, 0] } });
  await assert.rejects(bad.controller.readGeometry(), { code: "invalidResponse" });
  assert.ok(bad.controller.pair, "invalid read data does not mutate or dispose an otherwise valid pair");
  const overflow = await opened({ geometry: true, geometryResult: { name: "Body", space: "model", vertices: [1e308, 0, 0], baseVertices: [-1e308, 0, 0] } });
  await assert.rejects(overflow.controller.readGeometry(), { code: "invalidResponse" });
  const gate = deferred(); let started = false;
  const f = await opened({ geometry: true, async before(method) { if (method === "previews.geometry" && !started) { started = true; await gate.promise; } } });
  const read = f.controller.readGeometry(), refused = assert.rejects(read, { code: "stalePair" }); await tick();
  const closing = f.controller.close(); gate.resolve(); await refused; await closing;
  assert.equal(f.calls.filter(call => call.method === "previews.geometry").length, 1); assert.equal(f.controller.pair, null);
});


function zoomGesture(f, preview, zoom, options={}) {
  const item=f.previews.get(preview);item.zoom=zoom;item.revision=options.revision??(item.revision+1);
  f.events.get("previews.view.changed")({preview,source:options.source??preview,revision:item.revision,state:{zoom},method:"pointer"});
}

test("optional public zoom aligns initial views and follows gestures from either side without echo",async()=>{
  const f=await opened({zoom:true}),pair=f.controller.pair;
  assert.equal(f.controller.zoomStatus.active,true);
  assert.equal(f.previews.get(pair.wolf.preview).zoom,1);
  f.calls.length=0;
  zoomGesture(f,pair.human.preview,2);await tick();
  assert.equal(f.previews.get(pair.wolf.preview).zoom,2);
  zoomGesture(f,pair.wolf.preview,1.5);await tick();
  assert.equal(f.previews.get(pair.human.preview).zoom,1.5);
  assert.equal(f.calls.filter(c=>c.method==="previews.view.set").length,2,"Own setter acknowledgements must not echo");
  assert.ok(f.calls.every(c=>[pair.human.preview,pair.wolf.preview].includes(c.params.preview)));
});

test("zoom ignores orientation followers, stale revisions, malformed values and foreign previews",async()=>{
  const f=await opened({zoom:true}),pair=f.controller.pair;f.calls.length=0;
  zoomGesture(f,pair.human.preview,2);await tick();const count=f.calls.length;
  const revision=f.previews.get(pair.human.preview).revision;
  f.events.get("previews.view.changed")({preview:pair.human.preview,source:pair.human.preview,revision,state:{zoom:3}});
  f.events.get("previews.view.changed")({preview:pair.wolf.preview,source:pair.human.preview,revision:100,state:{zoom:2}});
  f.events.get("previews.view.changed")({preview:pair.human.preview,source:pair.human.preview,revision:101,state:{zoom:NaN}});
  f.events.get("previews.view.changed")({preview:"third-party",source:"third-party",revision:102,state:{zoom:8}});
  await tick();assert.equal(f.calls.length,count);assert.equal(f.controller.zoomStatus.active,true);
});

test("latest opposite-panel zoom wins over an older in-flight write and queued gestures coalesce",async()=>{
  const gate=deferred();let armed=false,held=false;
  const f=await opened({zoom:true,async before(method){if(armed&&method==="previews.view.set"&&!held){held=true;await gate.promise;}}});
  const pair=f.controller.pair;f.calls.length=0;armed=true;
  zoomGesture(f,pair.human.preview,2);await tick();assert.equal(held,true);
  zoomGesture(f,pair.wolf.preview,3);zoomGesture(f,pair.wolf.preview,4);
  gate.resolve();await tick();await tick();
  assert.equal(f.previews.get(pair.human.preview).zoom,4);assert.equal(f.previews.get(pair.wolf.preview).zoom,4);
  assert.ok(f.calls.filter(c=>c.method==="previews.view.set").length<=3);
});

test("close invalidates a pending zoom and never targets a replacement or unrelated preview",async()=>{
  const gate=deferred();let armed=false,held=false;
  const f=await opened({zoom:true,async before(method){if(armed&&method==="previews.view.set"&&!held){held=true;await gate.promise;}}});
  const pair=f.controller.pair;armed=true;zoomGesture(f,pair.human.preview,2);await tick();
  const closing=f.controller.close();gate.resolve();await closing;await tick();
  assert.equal(f.controller.pair,null);assert.equal(f.controller.zoomStatus.active,false);
  assert.deepEqual([...f.previews.keys()],["third-party"]);
  assert.ok(f.calls.filter(c=>c.method==="previews.view.set").every(c=>c.params.preview!=="third-party"));
});

test("failed zoom pauses its link visibly while morph ownership remains usable",async()=>{
  let fail=false;const f=await opened({zoom:true,before(method){if(fail&&method==="previews.view.set")throw new Error("camera unavailable");}});
  const pair=f.controller.pair;fail=true;zoomGesture(f,pair.human.preview,2);await tick();
  assert.equal(f.controller.zoomStatus.active,false);assert.match(f.controller.zoomStatus.error.message,/camera unavailable/);
  assert.ok(f.controller.pair);assert.equal(f.previews.size,3);
  const before=f.calls.length;zoomGesture(f,pair.wolf.preview,3);await tick();assert.equal(f.calls.length,before);
  await f.controller.apply({Belly:.5});assert.equal(f.previews.get(pair.human.preview).values.Belly,.5);
});

test("missing optional scoped camera capability does not fall back to global view writes",async()=>{
  const f=await opened();assert.equal(f.controller.zoomStatus.available,false);assert.equal(f.controller.zoomStatus.active,false);
  assert.ok(!f.calls.some(c=>c.method.includes("view.")));
});

for (const role of ["human", "wolf"]) test("single " + role + " replacement preserves the other opaque preview, coefficients, camera and ownership", async () => {
  const f = await opened({ zoom: true, emitClose: true, humanModels: role === "human" ? ["another.nif"] : [] });
  await f.controller.apply({ Belly: .6, HumanOther: .7 });
  const before = f.controller.pair, other = role === "human" ? "wolf" : "human";
  zoomGesture(f, before[other].preview, 2); await tick();
  const kept = JSON.parse(JSON.stringify(f.previews.get(before[other].preview))), count = f.calls.length;
  const next = await f.controller.replace(role, "another.nif");
  assert.equal(next[other].preview, before[other].preview); assert.equal(next[role].name, "another.nif");
  assert.notEqual(next[role].preview, before[role].preview);
  assert.deepEqual(f.previews.get(next[other].preview), kept);
  assert.equal(f.previews.get(next[role].preview).zoom, kept.zoom);
  assert.equal(f.previews.has(before[role].preview), false); assert.equal(f.previews.size, 3);
  const operations = f.calls.slice(count);
  assert.ok(operations.filter(call => call.method === "previews.close").every(call => call.params.preview === before[role].preview));
  assert.equal(operations.filter(call => call.method === "previews.morphs.set").length, 0);
  assert.equal(f.controller._state.ledger(role, { id: before[role].preview, revision: before[role].preview, view: before[role].preview, sex: "female" }).size, 0);
  const sparse = { ...core.getProfile(catalog, "female.3BA"), rules: [] };
  await f.controller.apply({}, sparse);
  if (other === "wolf") assert.equal(f.previews.get(next.wolf.preview).values.CLAWTorsoBellyRound, 0, "Kept wolf's previously owned output must still be cleared");
  else assert.equal(f.previews.get(next.human.preview).values.HumanOther, 0, "Kept human's previous unmapped input must remain owned");
  await f.controller.close(); assert.deepEqual([...f.previews.keys()], ["third-party"]); assert.equal(f.controller._state.owned.size, 0);
});

test("invalid and failed replacement candidates leave the old pair usable without morph writes", async () => {
  let rejectCreate = false;
  const f = await opened({ zoom: true, humanModels: ["another.nif"], namesByModel: { "another.nif": ["NotALinkedSource"] },
    before(method) { if (rejectCreate && method === "previews.create") throw new Error("Replacement load failed"); } });
  await f.controller.apply({ Belly: .4 }); const pair = f.controller.pair;
  for (const attempt of [() => f.controller.replace("human", "absent.nif"), () => f.controller.replace("human", "another.nif")]) {
    const old = JSON.parse(JSON.stringify([...f.previews])), start = f.calls.length;
    await assert.rejects(attempt(), /exact name|configured source/);
    assert.deepEqual(f.controller.pair, pair); assert.deepEqual([...f.previews], old);
    assert.equal(f.calls.slice(start).filter(call => ["previews.morphs.set", "previews.view.set"].includes(call.method)).length, 0);
  }
  rejectCreate = true; await assert.rejects(f.controller.replace("wolf", "another.nif"), /Replacement load failed/);
  assert.deepEqual(f.controller.pair, pair); rejectCreate = false;
  await f.controller.apply({ Belly: .8 }); assert.equal(f.previews.get(pair.human.preview).values.Belly, Math.fround(.8));
  await f.controller.close();
});

test("host capacity two refuses staged replacement without closing either model", async () => {
  const f = await opened({ maxPreviews: 2 }), pair = f.controller.pair, start = f.calls.length;
  await assert.rejects(f.controller.replace("wolf", "another.nif"), { code: "replacementUnavailable" });
  assert.deepEqual(f.controller.pair, pair);
  assert.equal(f.calls.slice(start).filter(call => ["previews.create", "previews.close", "previews.morphs.set"].includes(call.method)).length, 0);
  await f.controller.apply({ Belly: .2 }); await f.controller.close();
});

test("replacement finishes the sent pair operation, revokes queued vectors and blocks new writes", async () => {
  const gate = deferred(); let hold = false, sent = false;
  const f = await opened({ humanModels: ["another.nif"], async before(method) {
    if (hold && method === "previews.morphs.set" && !sent) { sent = true; await gate.promise; }
  } });
  hold = true; const pair = f.controller.pair;
  const first = f.controller.apply({ Belly: .1 }); await tick(); assert.equal(sent, true);
  const queued = f.controller.apply({ Belly: .2 }), queuedFailure = assert.rejects(queued, { code: "superseded" });
  const replacing = f.controller.replace("human", "another.nif");
  await assert.rejects(f.controller.apply({ Belly: .3 }), { code: "replacementPending" });
  await assert.rejects(f.controller.zeroWolf(), { code: "replacementPending" });
  await assert.rejects(f.controller.changeProfile("female.CBBE"), { code: "replacementPending" });
  gate.resolve(); await first; await queuedFailure; const next = await replacing;
  const writes = f.calls.filter(call => call.method === "previews.morphs.set");
  assert.equal(writes.length, 2); assert.deepEqual(writes.map(call => call.params.preview), [pair.human.preview, pair.wolf.preview]);
  assert.equal(next.wolf.preview, pair.wolf.preview);
  assert.deepEqual(f.previews.get(next.human.preview).values, {}, "A replacement must not auto-apply old human input");
  assert.equal(f.previews.get(next.wolf.preview).values.CLAWTorsoBellyRound, core.evaluate(catalog, "female.3BA", { Belly: .1 }).values.CLAWTorsoBellyRound);
  await f.controller.close();
});

test("close cancels a pending replacement and closes its late created handle plus the old pair", async () => {
  const gate = deferred(); let hold = false, sent = false;
  const f = await opened({ async before(method) { if (hold && method === "previews.create") { sent = true; await gate.promise; } } });
  hold = true; const replacing = f.controller.replace("wolf", "another.nif"), refused = assert.rejects(replacing, { code: "stalePair" });
  await tick(); assert.equal(sent, true); const closing = f.controller.close(); gate.resolve(); await refused; await closing;
  assert.equal(f.controller.pair, null); assert.deepEqual([...f.previews.keys()], ["third-party"]); assert.deepEqual(f.controller.failedCleanup, []);
});

test("failed retirement resolves the valid replacement with a retryable old handle and retires its ledger later", async () => {
  let failedOld, fail = false;
  const f = await opened({ before(method, params) { if (fail && method === "previews.close" && params.preview === failedOld) throw new Error("Old preview close blocked"); } });
  await f.controller.apply({ Belly: .3 }); const old = f.controller.pair; failedOld = old.wolf.preview; fail = true;
  const next = await f.controller.replace("wolf", "another.nif");
  assert.equal(next.human.preview, old.human.preview); assert.notEqual(next.wolf.preview, failedOld);
  assert.equal(f.controller.failedCleanup.length, 1); assert.equal(f.controller.failedCleanup[0].preview, failedOld);
  assert.equal(f.observations.at(-1).method, "replace"); assert.equal(f.observations.at(-1).error.code, "cleanupFailed");
  const oldBinding = { id: failedOld, revision: failedOld, view: failedOld, sex: "female" };
  assert.ok(f.controller._state.ledger("wolf", oldBinding).size > 0);
  fail = false; await f.controller.close(); assert.equal(f.controller._state.ledger("wolf", oldBinding).size, 0);
  assert.equal(f.controller._state.owned.size, 0); assert.deepEqual([...f.previews.keys()], ["third-party"]);
});

test("same model selection is a no-op and wrong matrix metadata never revokes the current pair", async () => {
  const f = await opened(), pair = f.controller.pair, start = f.calls.length;
  assert.deepEqual(await f.controller.replace("human", "human.nif"), pair);
  await assert.rejects(f.controller.replace("wolf", "another.nif", core.getProfile(catalog, "female.CBBE")), { code: "invalidMatrix" });
  assert.equal(f.calls.length, start); assert.deepEqual(f.controller.pair, pair); await f.controller.close();
});

test("a refused candidate link restores the original pair without closing either old handle", async () => {
  let rejectLink = false;
  const f = await opened({ before(method, params) {
    if (rejectLink && method === "previews.link" && params.previews.includes("opaque:3")) throw new Error("Replacement link refused");
  } });
  await f.controller.apply({ Belly: .4 }); const pair = f.controller.pair, before = JSON.parse(JSON.stringify([...f.previews]));
  rejectLink = true; const start = f.calls.length;
  await assert.rejects(f.controller.replace("wolf", "another.nif"), /Replacement link refused/);
  assert.deepEqual(f.controller.pair, pair); assert.deepEqual([...f.previews], before);
  const links = f.calls.slice(start).filter(call => call.method === "previews.link");
  assert.deepEqual(links.at(-1).params.previews, [pair.human.preview, pair.wolf.preview]);
  assert.deepEqual(f.calls.slice(start).filter(call => call.method === "previews.close").map(call => call.params.preview), ["opaque:3"]);
  await f.controller.apply({ Belly: .7 }); await f.controller.close();
});

test("close before the serial replacement boundary starts prevents candidate creation", async () => {
  const gate = deferred(); let hold = false, sent = false;
  const f = await opened({ async before(method) { if (hold && method === "previews.morphs.set" && !sent) { sent = true; await gate.promise; } } });
  hold = true; const applying = f.controller.apply({ Belly: .5 }), applyFailure = assert.rejects(applying, { code: "stalePair" });
  await tick(); const replacing = f.controller.replace("wolf", "another.nif"), replaceFailure = assert.rejects(replacing, { code: "stalePair" });
  const closing = f.controller.close(); gate.resolve(); await applyFailure; await replaceFailure; await closing;
  assert.equal(f.calls.filter(call => call.method === "previews.create").length, 2);
  assert.deepEqual([...f.previews.keys()], ["third-party"]); assert.equal(f.controller._replacement, null);
});

for (const role of ["human", "wolf"]) test("advertised before-placement preserves " + role + " panel position during replacement", async () => {
  const f = await opened({ beforePlacement: true, humanModels: role === "human" ? ["another.nif"] : [] });
  const pair = f.controller.pair;
  assert.deepEqual(f.order, ["third-party", pair.human.preview, pair.wolf.preview]);
  const next = await f.controller.replace(role, "another.nif");
  assert.deepEqual(f.calls.filter(call => call.method === "previews.create").at(-1).params,
    { name: "another.nif", before: pair[role].preview });
  assert.deepEqual(f.order, ["third-party", next.human.preview, next.wolf.preview]);
  await f.controller.close();
});

test("older hosts receive the unchanged plain-create schema during replacement", async () => {
  const f = await opened(); await f.controller.replace("wolf", "another.nif");
  assert.deepEqual(f.calls.filter(call => call.method === "previews.create").at(-1).params, { name: "another.nif" });
  await f.controller.close();
});

test("repeated authoritative absence during old-model retirement cannot accumulate historical ownership", async () => {
  let retiring = null;
  const f = await opened({ before(method, params, { previews }) {
    if (method === "previews.close" && params.preview === retiring) {
      previews.delete(retiring); throw Object.assign(new Error("Already absent"), { code: "unknownPreview" });
    }
  } });
  for (let round = 0; round < 8; round++) {
    await f.controller.apply({ Belly: .3 }); const old = f.controller.pair;
    retiring = old.wolf.preview;
    const next = await f.controller.replace("wolf", old.wolf.name === "wolf.nif" ? "another.nif" : "wolf.nif");
    const oldBinding = { id: retiring, revision: retiring, view: retiring, sex: "female" };
    assert.equal(f.controller._state.ledger("wolf", oldBinding).size, 0);
    assert.equal(f.controller._state.owned.size, 1, "Only the preserved human's ledger remains before the next Apply");
    assert.equal(f.controller.failedCleanup.length, 0); assert.equal(f.previews.has(retiring), false);
    assert.notEqual(next.wolf.preview, retiring);
  }
  retiring = null; await f.controller.close();
  assert.equal(f.controller._state.owned.size, 0); assert.equal(f.controller._owned.size, 0);
  assert.deepEqual([...f.previews.keys()], ["third-party"]);
});
