"use strict";
// Executes the actual public SDK and shipped consumer scripts. This detached
// protocol/DOM harness is not a browser renderer or installed-host acceptance.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { test } = require("node:test"), core = require("../../main/morphbench-plugin/web/core.js");
if (!process.argv[2] || !process.argv[3]) throw new Error("Pass catalog.json, actual addon-sdk.js and optionally real-pair-inputs root.");
const catalog = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), "utf8"));
const sdkSource = fs.readFileSync(path.resolve(process.argv[3]), "utf8");
const realRoot = process.argv[4] ? path.resolve(process.argv[4]) : null;
const consumerRoot = process.argv[5] ? path.resolve(process.argv[5]) : path.join(__dirname, "../../main/morphbench-plugin/web");
const source = name => fs.readFileSync(path.join(consumerRoot, name), "utf8");
class Element {
  constructor(tag = "div") { this.tagName = tag; this.value = ""; this.textContent = ""; this.disabled = false; this.checked = false; this.children = []; this.events = {}; this.files = []; }
  appendChild(child) { this.children.push(child); if (this.tagName === "select" && this.children.length === 1) this.value = child.value; return child; }
  replaceChildren() { this.children = []; if (this.tagName === "select") this.value = ""; }
  setAttribute(name, value) { this[name] = value; }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  remove() {}
  addEventListener(name, handler) { this.events[name] = handler; }
  async fire(name) { assert.equal(typeof this.events[name], "function"); return this.events[name](); }
}
function harness({ stable = false, missing = null, failWolfSet = false, geometry = false,
  geometryVertexCount = 3, geometryShapeName = "Body", hostExports = false, zoom = false, wolfNamesOverride = null, humanNamesOverride = null,
  modelNames = ["human.nif", "wolf.nif"], modelRoot = { value: "isolated" }, beforeRequest = null,
  sidebarSelection = false, humanModelNames = ["human.nif", "human-next.nif"], namesByModel = {} } = {}) {
  const nodes = new Map(), events = new Map(), calls = [], previews = new Map(); let serial = 0;
  const selectIds = new Set(["profile", "human-model", "wolf-model", "preset", "geometry-shape", "game-female-family", "game-male-family", "sidebar-role"]);
  const element = id => { if (!nodes.has(id)) nodes.set(id, new Element(selectIds.has(id) ? "select" : "div")); return nodes.get(id); };
  let exportText = "", maximumExportPageBytes = 0;
  Object.defineProperty(element("export-text"), "value", {
    get() { return exportText; },
    set(value) { exportText = value; maximumExportPageBytes = Math.max(maximumExportPageBytes, Buffer.byteLength(value, "utf8")); }
  });
  element("human").value = "{}"; element("weight").value = "1"; element("actor-weight").value = "0.5";
  element("sidebar-selection").hidden = true;
  const profile = catalog.profiles.find(item => item.family === "3BA");
  const humanNames = humanNamesOverride || (realRoot ? JSON.parse(fs.readFileSync(path.join(realRoot,"resource-name-audit.json"),"utf8"))[0].morphNames :
    [...new Set([...profile.rules.filter(rule => rule.source && core.sourceKind(rule.source) === 0).map(rule => rule.source), "Butt", "BigButt", "MuscleAbs", "HumanOther"])]);
  const wolfNames = [...new Set(wolfNamesOverride || core.matrixTargets(profile).filter(name => name !== missing).concat(["Unowned.WolfControl"]))];
  const legacyValues = { LegacyMain: .33 };
  const geometryVertices = geometryVertexCount === 3 ? [1, 2, 3, -1, -2, -3, .5, .5, .5] :
    Array.from({ length: geometryVertexCount * 3 }, (_, index) => (index % 997) / 997 - .5);
  const geometryBase = geometryVertexCount === 3 ? [0, 0, 0, -1, -1, -1, .5, .5, .5] :
    Array.from({ length: geometryVertexCount * 3 }, (_, index) => (index % 911) / 911 - .5);
  const parent = { postMessage(message, origin) {
    assert.equal(origin, "*"); calls.push(message);
    queueMicrotask(async () => {
      let result, error;
      try {
        const { method, params } = message;
        if (beforeRequest) await beforeRequest(method, params);
        if (method === "host.info") result = { apiVersion: 1, capabilities: stable ? ["scene.get", "morphs.get", "morphs.set"] :
          ["models.list", "previews.create", "previews.close", "previews.scene.get", "previews.morphs.get", "previews.morphs.set", "previews.link", ...(geometry ? ["previews.geometry"] : []), ...(hostExports ? ["exports.prepare"] : []), ...(zoom ? ["previews.view.get","previews.view.set"] : []), ...(sidebarSelection ? ["models.selection.subscribe","previews.create.before"] : [])],
          previewLimits: { maxPreviews: 4, loadTimeoutMs: 8000 }, language: "en", scope: "browser-session" };
        else if (method === "exports.prepare") { assert.equal(hostExports, true); result = { prepared: true, filename: params.filename }; }
        else if (method === "models.selection.subscribe") { assert.equal(sidebarSelection, true); result = { enabled: params.enabled }; }
        else if (method === "models.list") result = { root: modelRoot.value, entries: modelNames.map(name => ({ name, nif: name, tri: name + ".tri" })) };
        else if (method === "previews.create") { const preview = "opaque:" + (++serial), human = humanModelNames.includes(params.name);
          previews.set(preview, { name: params.name, zoom: human ? 1 : 1.25, revision: 0, names: namesByModel[params.name] || (human ? humanNames : wolfNames), values: human ? {} : Object.fromEntries(Object.entries({ CLAWHeadEarSize: .6, CLAWTailLength: .8, "Unowned.WolfControl": .4 }).filter(([name])=>wolfNames.includes(name))) }); result = { preview, name: params.name }; }
        else if (method === "previews.link") { assert.equal(params.previews.length, 2); assert.equal(new Set(params.previews).size, 2);
          assert.ok(params.previews.every(id => previews.has(id))); assert.deepEqual(JSON.parse(JSON.stringify(params.properties)), ["orientation"]); result = params; }
        else {
          const preview = previews.get(params.preview); assert.ok(preview, "Only a live explicit scoped preview may be targeted.");
          if (method === "previews.close") { previews.delete(params.preview); result = { closed: true }; }
          else if (method === "previews.scene.get") result = { open: true, names: { nif: preview.name, tri: preview.name + ".tri" }, shapes: geometry ? [{ name: geometryShapeName, vertices: geometryVertexCount, triangles: 1 }] : [] };
          else if (method === "previews.geometry") { assert.equal(geometry, true); assert.equal(params.shape, geometryShapeName);
            result = { name: geometryShapeName, space: "model", vertices: geometryVertices, baseVertices: geometryBase, triangles: [0, 1, 2] }; }
          else if (method === "previews.view.get") { assert.equal(zoom,true); result={state:{zoom:preview.zoom},presets:{}}; }
          else if (method === "previews.view.set") {
            assert.equal(zoom,true);assert.deepEqual(Object.keys(params).sort(),["preview","zoom"]);
            preview.zoom=params.zoom;emitView(params.preview,params.zoom,"addon_set_view");result={state:{zoom:preview.zoom},presets:{}};
          }
          else if (method === "previews.morphs.get" || method === "previews.morphs.set") {
            if (method.endsWith(".set")) {
              if (failWolfSet && preview.name === "wolf.nif") throw new Error("Wolf scoped write failed after human write");
              assert.ok(Object.keys(params.values).every(name => preview.names.includes(name))); Object.assign(preview.values, params.values);
            }
            result = { names: preview.names, values: { ...preview.values } };
          } else throw new Error("Unexpected SDK method: " + method);
        }
      } catch (failure) { error = { code: failure.code || "operationFailed", message: failure.message }; }
      events.get("message")({ source: parent, data: { type: "morphbench-addon:response", apiVersion: 1, id: message.id, ...(error ? { error } : { result }) } });
    });
  } };
  element("game-female-family").value = "3BA"; // Native HTML select's first option.
  element("game-male-family").value = "HIMBO";
  const context = vm.createContext({ parent, TextEncoder, console, setTimeout, clearTimeout, WebAssembly, Buffer,
    document: { getElementById: element, createElement: tag => new Element(tag), body: new Element("body") },
    addEventListener(name, handler) { events.set(name, handler); } }); context.window = context; context.CLAWMorphCatalog = catalog;
  vm.runInContext(sdkSource, context, { filename: "actual-host-addon-sdk.js" });
  vm.runInContext(fs.readFileSync(path.join(path.dirname(path.resolve(process.argv[2])), "matrix-kernel.js"), "utf8"), context, {filename: "actual-shared-kernel.js"});
  for (const name of ["core.js", "pair.js", "input.js", "preview-controller.js", "main.js"]) vm.runInContext(source(name), context, { filename: name });
  function emitView(id,value,method="zoom_at") {
    const preview=previews.get(id);preview.zoom=value;++preview.revision;
    events.get("message")({source:parent,data:{type:"morphbench-addon:event",apiVersion:1,event:"previews.view.changed",
      data:{preview:id,source:id,revision:preview.revision,state:{zoom:value},method}}});
  }
  const selection = data => events.get("message")({source:parent,data:{type:"morphbench-addon:event",apiVersion:1,event:"models.selected",data}});
  return { element, calls, previews, legacyValues, gesture:emitView, selection, maximumExportPageBytes: () => maximumExportPageBytes };
}
const settle = () => new Promise(setImmediate);
async function open(bench) { await settle(); bench.element("human-model").value = "human.nif"; bench.element("wolf-model").value = "wolf.nif";
  await bench.element("human-model").fire("change"); await bench.element("open-pair").fire("click"); }

test("optional sidebar selection chooses an explicit role without main-scene writes or inferred family", async () => {
  const bench = harness({sidebarSelection:true}); await settle();
  assert.equal(bench.element("sidebar-selection").hidden, false);
  assert.equal(bench.element("sidebar-role").value, "human");
  assert.equal(bench.calls.filter(call=>call.method==="models.selection.subscribe").length, 1);
  const profile = bench.element("profile").value;
  bench.selection({root:"isolated",name:"human.nif"}); await settle();
  assert.equal(bench.element("human-model").value,"human.nif"); assert.equal(bench.previews.size,0);
  bench.element("sidebar-role").value="wolf";
  bench.selection({root:"isolated",name:"wolf.nif"}); await settle();
  assert.equal(bench.element("wolf-model").value,"wolf.nif"); assert.equal(bench.element("profile").value,profile);
  await bench.element("open-pair").fire("click"); assert.equal(bench.previews.size,2);
  assert.ok(!bench.calls.some(call=>["models.open","morphs.set","morphs.reset"].includes(call.method)));
});

test("sidebar human replacement keeps the exact wolf preview, inputs and edited matrix and automatically updates the replacement", async () => {
  const bench=harness({sidebarSelection:true,zoom:true,modelNames:["human.nif","human-next.nif","wolf.nif"],humanNamesOverride:["Belly","HumanOther"]}); await open(bench);
  const profile={...catalog.profiles[0],rules:[{source:"Belly",target:"CLAWTorsoBellyRound",gain:.25,cap:1}]};
  bench.element("matrix-paste").value=JSON.stringify({schemaVersion:1,kind:"claw-wolf-matrix",profile});
  await bench.element("matrix-paste-load").fire("click");
  bench.element("human").value=JSON.stringify({Belly:.8,HumanOther:.3}); await bench.element("human").fire("input");
  await bench.element("matrix-export").fire("click"); const matrix=bench.element("export-text").value;
  const wolf=bench.previews.get("opaque:2"),wolfState=JSON.stringify(wolf),human=bench.element("human").value;
  const writes=bench.calls.filter(call=>call.method==="previews.morphs.set").length;
  bench.selection({root:"isolated",name:"human-next.nif"}); await settle();
  assert.equal(bench.previews.size,2);assert.ok(!bench.previews.has("opaque:1"));
  assert.equal(bench.calls.filter(call=>call.method==="previews.create").at(-1).params.before,"opaque:1");
  assert.equal(bench.previews.get("opaque:2"),wolf);assert.equal(JSON.stringify(wolf),wolfState);
  assert.equal(bench.element("human-model").value,"human-next.nif");assert.equal(bench.element("wolf-model").value,"wolf.nif");
  assert.equal(bench.element("human").value,human);
  assert.match(bench.element("pair-status").textContent,/human-next.nif/);assert.equal(bench.previews.size,2);
  assert.equal(bench.calls.filter(call=>call.method==="previews.morphs.set").length,writes+2);
  assert.equal(bench.previews.get("opaque:3").values.Belly,Math.fround(.8));
  await bench.element("matrix-export").fire("click");assert.equal(bench.element("export-text").value,matrix);
  await bench.element("human").fire("input");assert.equal(bench.previews.get("opaque:3").values.Belly,Math.fround(.8));
  assert.equal(bench.previews.get("opaque:2").values.CLAWTorsoBellyRound,Math.fround(.2));
});

test("sidebar wolf replacement preserves the human preview and ignores wrong-root, unknown and repeated picks", async () => {
  const bench=harness({sidebarSelection:true,modelNames:["human.nif","wolf.nif","wolf-next.nif"]}); await open(bench);
  bench.element("human").value=JSON.stringify({Belly:.6});await bench.element("human").fire("input");
  const human=bench.previews.get("opaque:1"),values=JSON.stringify(human.values),before=bench.calls.length;
  for(const data of [{root:"other",name:"wolf-next.nif"},{root:"isolated",name:"missing.nif"},{root:"isolated",name:"human.nif"}]) {
    bench.selection(data);await settle();
  }
  assert.equal(bench.calls.length,before);assert.equal(bench.previews.size,2);
  bench.element("sidebar-role").value="wolf";bench.selection({root:"isolated",name:"wolf-next.nif"});await settle();
  assert.equal(bench.previews.size,2);assert.ok(!bench.previews.has("opaque:2"));
  assert.equal(bench.previews.get("opaque:1"),human);assert.equal(JSON.stringify(human.values),values);
  assert.equal(bench.element("human-model").value,"human.nif");assert.equal(bench.element("wolf-model").value,"wolf-next.nif");
  assert.equal(bench.previews.size,2);
});

test("sidebar replacement failure keeps the validated old pair and does not discard edits",async()=>{
  const bench=harness({sidebarSelection:true,modelNames:["human.nif","human-next.nif","wolf.nif"],
    beforeRequest(method,params){if(method==="previews.create"&&params.name==="human-next.nif")throw Error("Unreadable replacement model");}});
  await open(bench);bench.element("human").value='{"Belly":0.7}';
  const old=[...bench.previews.keys()];await bench.element("matrix-export").fire("click");const matrix=bench.element("export-text").value;
  bench.selection({root:"isolated",name:"human-next.nif"});await settle();
  assert.deepEqual([...bench.previews.keys()],old);assert.equal(bench.element("human-model").value,"human.nif");
  assert.equal(bench.element("human").value,'{"Belly":0.7}');assert.equal(bench.previews.size,2);
  assert.match(bench.element("status").textContent,/Unreadable replacement model/);
  await bench.element("matrix-export").fire("click");assert.equal(bench.element("export-text").value,matrix);
});

test("older hosts keep explicit resource selectors and never receive sidebar subscription calls",async()=>{
  const bench=harness();await open(bench);
  assert.equal(bench.element("sidebar-selection").hidden,true);
  assert.ok(!bench.calls.some(call=>call.method==="models.selection.subscribe"));assert.equal(bench.previews.size,2);
});

test("actual SDK selects the BHUNP matrix, applies raw body coefficients and exports its independently selected family",async()=>{
  const profile=catalog.profiles.find(p=>p.family==="BHUNP");assert.ok(profile);
  const names=[...new Set(profile.rules.filter(r=>r.source&&core.sourceKind(r.source)===0).map(r=>r.source))];
  const bench=harness({humanNamesOverride:names,wolfNamesOverride:core.matrixTargets(profile)});await settle();
  assert.match(bench.element("profile").children.find(option=>option.value===profile.id).textContent,/BHUNP 3\.34 Advanced Ver4/);
  bench.element("profile").value=profile.id;await bench.element("profile").fire("change");await open(bench);
  assert.equal(bench.previews.size,2);assert.equal(bench.element("shared-sliders").children.length,47);
  const human={Arms:1,Biceps:.75,Triceps:.5,ChubbyArms:.2,"UNP Low":-.25,Breasts:.3};
  bench.element("human").value=JSON.stringify(human);await bench.element("human").fire("input");
  const expected=core.evaluateMatrix(profile,human,.5).values;
  const actualHuman=bench.previews.get("opaque:1").values;assert.equal(Object.keys(actualHuman).length,47);
  for(const name of names)assert.equal(actualHuman[name],Math.fround(human[name]??0),name);
  for(const [key,value]of Object.entries(expected))assert.equal(bench.previews.get("opaque:2").values[key],value,key);
  assert.equal(bench.element("game-female-family").value,"BHUNP");
  await bench.element("matrix-xml").fire("click");const xml=bench.element("export-text").value;
  assert.ok(xml.includes('female="'+profile.id+'"'));assert.ok(xml.includes('family="BHUNP"'));
  assert.ok(!xml.includes('family="CBBE"'));assert.ok(!xml.includes('family="3BA"'));
  await bench.element("close-pair").fire("click");assert.equal(bench.previews.size,0);
});

for (const sex of ["male", "female"]) for(const humanNames of [[],["$actor.weight"]]) test("actual SDK opens weight-only vanilla " + sex + " with " + humanNames.length + " reserved model names without treating actor weight as a TRI slider", async () => {
  const profile=catalog.profiles.find(p=>p.family==="Vanilla"&&p.sex===sex);assert.ok(profile);
  const bench=harness({humanNamesOverride:humanNames,wolfNamesOverride:core.matrixTargets(profile).concat(["CLAWHeadEarSize","CLAWTailLength"])});await settle();
  bench.element("profile").value=profile.id;await bench.element("profile").fire("change");await open(bench);
  assert.equal(bench.previews.size,2);assert.equal(bench.element("shared-sliders").children.length,0);
  assert.match(bench.element("pair-status").textContent,/Fixed selected NIFs/);
  const expected=core.evaluateMatrix(profile,{},.75).values;
  bench.element("actor-weight").value="0.75";await bench.element("actor-weight").fire("change");
  assert.match(bench.element("actor-weight-provenance").textContent,/Manually edited/);

  assert.match(bench.element("status").textContent,/Updated both models.*0 human controls/);
  const writes=bench.calls.filter(c=>c.method==="previews.morphs.set").slice(1);assert.equal(writes.length,1);
  assert.equal(writes[0].params.preview,"opaque:2");
  for(const [name,value]of Object.entries(expected))assert.equal(writes[0].params.values[name],value);
  assert.ok(!Object.hasOwn(writes[0].params.values,"$actor.weight"));
  await bench.element("snapshot-export").fire("click");
  assert.equal(JSON.parse(bench.element("export-text").value).actorWeight,.75);
  const count=bench.calls.length;bench.element("actor-weight").value="";await bench.element("human").fire("input");
  assert.match(bench.element("status").textContent,/explicit normalized actor weight/);assert.equal(bench.calls.length,count);
  await bench.element("close-pair").fire("click");
});

test("actual SDK opens classic UNP without TRI, applies weight and exports an independent female family",async()=>{
  const profile=catalog.profiles.find(p=>p.family==="UNP");assert.ok(profile);assert.equal(profile.sex,"female");
  const bench=harness({humanNamesOverride:[],wolfNamesOverride:core.matrixTargets(profile)});await settle();
  bench.element("profile").value=profile.id;await bench.element("profile").fire("change");await open(bench);
  assert.equal(bench.element("shared-sliders").children.length,0);
  assert.match(bench.element("human-control-status").textContent,/no body TRI controls.*actor weight/);
  assert.equal(bench.element("game-female-family").value,"UNP");
  bench.element("actor-weight").value="0.75";await bench.element("actor-weight").fire("change");
  const writes=bench.calls.filter(c=>c.method==="previews.morphs.set").slice(1);assert.equal(writes.length,1);
  assert.equal(writes[0].params.preview,"opaque:2");
  assert.deepEqual(JSON.parse(JSON.stringify(writes[0].params.values)),JSON.parse(JSON.stringify(core.evaluateMatrix(profile,{},.75).values)));
  assert.ok(!Object.hasOwn(writes[0].params.values,"$actor.weight"));
  await bench.element("matrix-xml").fire("click");const xml=bench.element("export-text").value;
  assert.ok(xml.includes('family="UNP"'));assert.ok(xml.includes('female="'+profile.id+'"'));
  assert.ok(!xml.includes('family="BHUNP"'));assert.ok(!xml.includes('family="3BA"'));
  await bench.element("close-pair").fire("click");assert.equal(bench.previews.size,0);
});

test("actual SDK keeps mixed actor weight separate and clears former generic outputs through the UI",async()=>{
  const bench=harness({humanNamesOverride:["Belly","HumanOther"],wolfNamesOverride:["Custom.Human","Custom.Weight","CLAWHeadEarSize","CLAWTailLength"]});
  await settle();
  const profile={...catalog.profiles[0],rules:[{source:"Belly",target:"Custom.Human",gain:1,cap:1},{source:"$actor.weight",target:"Custom.Weight",gain:1,cap:1}]};
  const load=async p=>{bench.element("matrix-paste").value=JSON.stringify({schemaVersion:1,kind:"claw-wolf-matrix",profile:p});await bench.element("matrix-paste-load").fire("click");};
  await load(profile);await open(bench);
  bench.element("human").value='{"Belly":0.5,"HumanOther":-0.25}';
  for(const weight of [.75,.25]){
    bench.element("actor-weight").value=String(weight);await bench.element("actor-weight").fire("change");await bench.element("human").fire("input");
    const human=[...bench.previews.values()].find(p=>p.name==="human.nif"),wolf=[...bench.previews.values()].find(p=>p.name==="wolf.nif");
    assert.equal(human.values.Belly,.5);assert.equal(human.values.HumanOther,-.25);
    assert.equal(wolf.values["Custom.Human"],.5);assert.equal(wolf.values["Custom.Weight"],weight);
    assert.ok(!Object.hasOwn(human.values,"$actor.weight"));
  }
  await load({...profile,rules:[profile.rules[0]]});await bench.element("human").fire("input");
  const wolf=[...bench.previews.values()].find(p=>p.name==="wolf.nif");assert.equal(wolf.values["Custom.Weight"],0);assert.equal(wolf.values.CLAWHeadEarSize,.6);
});

test("pasted standalone matrix loads without a file picker and stays independent of human values", async () => {
  const bench=harness(); await open(bench);
  const profile={...catalog.profiles[0],rules:[{source:"",target:"CLAWTorsoBellyRound",gain:1,cap:1,function:"constant",value:.35}]};
  bench.element("matrix-paste").value=JSON.stringify({schemaVersion:1,kind:"claw-wolf-matrix",profile});
  await bench.element("matrix-paste-load").fire("click");
  assert.match(bench.element("status").textContent,/Updated both models/);
  for(const value of [-.5,.9]) {
    bench.element("human").value=JSON.stringify({Belly:value});
    await bench.element("human").fire("input");
    const wolf=[...bench.previews.values()].find(p=>p.name==="wolf.nif");
    assert.equal(wolf.values.CLAWTorsoBellyRound,Math.fround(.35));
  }
});

test("stable v1 capability gap is explicit and sends no preview or legacy mutation", async () => {
  const bench = harness({ stable: true }); await settle();
  assert.equal(bench.element("open-pair").disabled, true); assert.equal(bench.previews.size, 0);
  assert.match(bench.element("paired-support").textContent, /lacks independent previews/);
  bench.element("human").value = '{"Belly":0.7}'; await bench.element("human").fire("input");
  assert.deepEqual(bench.calls.map(call => call.method), ["host.info"]);
});
test("actual SDK connects paired UI, preserves human-only values and derives wolf outputs without global writes", async () => {
  const bench = harness(); await open(bench); assert.equal(bench.previews.size, 2);
  bench.element("human").value = '{"Belly":0.7,"BigBelly":0.7,"Butt":-0.5,"BigButt":-0.25}';
  await bench.element("human").fire("input");
  assert.equal(bench.previews.get("opaque:1").values.Butt, -.5); assert.equal(bench.previews.get("opaque:1").values.BigButt, -.25);
  assert.equal(bench.previews.get("opaque:2").values.CLAWTorsoBellyRound, 1);
  assert.equal(bench.previews.get("opaque:2").values.CLAWHeadEarSize, 0);
  assert.equal(bench.previews.get("opaque:2").values["Unowned.WolfControl"], .4);
  assert.match(bench.element("unmapped").textContent, /Butt=-0.5/);
  assert.deepEqual(bench.legacyValues, { LegacyMain: .33 });
  assert.ok(!bench.calls.some(call => ["models.open", "morphs.set", "morphs.reset", "view.set", "previews.view.set"].includes(call.method)));
  await bench.element("close-pair").fire("click"); assert.equal(bench.previews.size, 0);
});

test("slider provenance refreshes explicit signed and zero JSON values without reopening the pair", async () => {
  const bench = harness(); await open(bench);
  const row = name => bench.element("shared-sliders").children.find(node => node.children[0].textContent === name);
  const origin = name => row(name).children[2].title;
  const provided = "Provided preview coefficient; runtime value unmeasured";
  const omitted = "Unspecified preview zero; runtime value unmeasured";
  const originalBellyRow = row("Belly");
  assert.equal(origin("Belly"), omitted);
  bench.element("human").value = '{"Belly":0.5,"Butt":-0.25,"BigButt":0}';
  await bench.element("human").fire("input");
  for (const name of ["Belly", "Butt", "BigButt"]) assert.equal(origin(name), provided);
  assert.equal(row("Belly").children[2].value, "0.5"); assert.equal(row("Butt").children[2].value, "-0.25");
  assert.equal(row("BigButt").children[2].value, "0"); assert.equal(origin("MuscleAbs"), omitted);
  bench.element("human").value = '{"Butt":0,"MuscleAbs":-0.5}'; await bench.element("human").fire("input");
  assert.equal(row("Belly"), originalBellyRow);
  assert.equal(origin("Belly"), omitted); assert.equal(row("Belly").children[2].value, "0");
  assert.equal(origin("Butt"), provided); assert.equal(origin("MuscleAbs"), provided); assert.equal(origin("BigButt"), omitted);
  bench.element("import").files = [{ name: "fixture.json", text: async () => JSON.stringify({
    humanValues: { Belly: .5, BigButt: 0 }, humanValueProvenance: { Belly: "Retained fixture observation", BigButt: "Retained explicit fixture zero" }
  }) }];
  await bench.element("import").fire("change");
  row("Butt").children[2].value = "-0.75"; await row("Butt").children[2].fire("change");
  assert.equal(origin("Butt"), "Manually edited preview coefficient; not a game observation");
  assert.equal(origin("Belly"), "Retained fixture observation"); assert.equal(origin("BigButt"), "Retained explicit fixture zero");
  assert.equal(bench.calls.filter(call => call.method === "previews.create").length, 2);
});
test("missing wolf target refuses opening and disposes both created previews without morph writes", async () => {
  const bench = harness({ missing: "CLAWTorsoBellyRound" }); await open(bench);
  assert.match(bench.element("status").textContent, /missing linked targets/);
  assert.equal(bench.previews.size, 0); assert.equal(bench.calls.filter(call => call.method.endsWith(".set")).length, 0);
});
test("partial pair write failure closes both previews and displays readable failure", async () => {
  const bench = harness({ failWolfSet: true }); await open(bench);
  bench.element("human").value = '{"Belly":0.7}'; await bench.element("human").fire("input");
  assert.equal(bench.previews.size, 0); assert.equal(bench.previews.size, 0);
  assert.match(bench.element("status").textContent, /Wolf scoped write failed/);
});
test("changing declared resource sex closes the old pair before any new-family apply", async () => {
  const bench = harness(); await open(bench); const before=bench.calls.length;
  bench.element("human").value = '{"Belly":0.7}';
  bench.element("profile").value = catalog.profiles.find(item => item.family === "HIMBO").id;
  await bench.element("profile").fire("change");
  assert.equal(bench.previews.size, 0); assert.equal(bench.previews.size, 0);
  assert.match(bench.element("status").textContent, /sex changed/);
  assert.match(bench.element("profile-info").textContent, /HIMBO/);
  assert.equal(bench.calls.slice(before).filter(call => call.method.endsWith(".set")).length, 0);
});
test("real full-preset fixture import retains provenance and all nonzero human-only fields", { skip: !realRoot }, async () => {
  const bench = harness(); await open(bench);
  const fixture = fs.readFileSync(path.join(realRoot,"full-preset-fixtures/FThin.json"),"utf8");
  bench.element("import").files = [{ name: "FThin.json", text: async () => fixture }]; await bench.element("import").fire("change");
  assert.match(bench.element("input-provenance").textContent, /full-preset-reconstruction-with-observed-subset/);
  await bench.element("human").fire("input");
  const actual = bench.previews.get("opaque:1").values;
  assert.equal(actual.BigButt, -.25); assert.equal(actual.Butt, -.5);
  assert.equal(Object.keys(JSON.parse(bench.element("human").value)).length, 154);
  assert.match(bench.element("unmapped").textContent, /BigButt=-0.25/);
  assert.ok(bench.element("shared-sliders").children.length >= 154);
});
test("wolf preset import/export preserves matrix metadata/functions and automatic preview uses the edited matrix", async () => {
  const bench = harness(); await open(bench);
  const original = core.getProfile(catalog, bench.element("profile").value);
  const matrix = { ...original, rules: [
    { source: "Belly", target: "CLAWTorsoBellyRound", gain: .5, cap: .8, function: "power", exponent: 2 },
    { source: "", target: "CLAWTorsoBellyRound", gain: 1, cap: .8, function: "constant", value: .1 }
  ] };
  bench.element("matrix-import").files = [{ text: async () => JSON.stringify({ schemaVersion: 1, kind: "claw-wolf-matrix", profile: matrix }) }];
  await bench.element("matrix-import").fire("change");
  assert.equal(bench.element("matrix-rows").children.length, 2);
  bench.element("human").value = '{"Belly":0.5}'; await bench.element("human").fire("input");
  assert.equal(bench.previews.get("opaque:2").values.CLAWTorsoBellyRound, core.evaluateMatrix(matrix, { Belly: .5 }).values.CLAWTorsoBellyRound);
  await bench.element("matrix-export").fire("click");
  const exported = JSON.parse(bench.element("export-text").value);
  assert.equal(exported.kind, "claw-wolf-matrix"); assert.deepEqual(exported.profile, core.validateMatrix(matrix));
  assert.equal(exported.profile.version, original.version); assert.equal(exported.profile.calibration, original.calibration);
  await bench.element("matrix-xml").fire("click"); assert.match(bench.element("export-text").value, /function="power" exponent="2"/);
  assert.match(bench.element("export-text").value, /function="constant" value=/);
  assert.match(bench.element("comparison-status").textContent, /canonical matrix/);
  await bench.element("export-select").fire("click"); assert.equal(bench.element("export-text").selected, true);
});
test("structured edge editor changes gain/function/parameter, target caps and order with validation", async () => {
  const bench = harness(); await settle();
  const control = (edge, column) => bench.element("matrix-rows").children[edge].children[column].children[0];
  control(0, 3).value = "power"; await control(0, 3).fire("change");
  control(0, 6).value = "3"; await control(0, 6).fire("change");
  control(0, 4).value = "0.123"; await control(0, 4).fire("change");
  control(0, 5).value = "0.4"; await control(0, 5).fire("change");
  await bench.element("matrix-export").fire("click");
  let matrix = JSON.parse(bench.element("export-text").value).profile, first = matrix.rules[0];
  assert.equal(first.function, "power"); assert.equal(first.exponent, 3); assert.equal(first.gain, Math.fround(.123));
  assert.ok(matrix.rules.filter(rule => rule.target === first.target).every(rule => rule.cap === Math.fround(.4)));
  control(0, 6).value = "9"; await control(0, 6).fire("change"); assert.match(bench.element("status").textContent, /exponent/);
  assert.equal(control(0, 6)["aria-invalid"], "true");
  await bench.element("matrix-export").fire("click");assert.equal(JSON.parse(bench.element("export-text").value).profile.rules[0].exponent,3);
  await control(0, 7).children[1].fire("click");
  await bench.element("matrix-export").fire("click"); matrix = JSON.parse(bench.element("export-text").value).profile;
  assert.deepEqual(matrix.rules[1], first);
  await bench.element("matrix-constant").fire("click");
  await bench.element("matrix-export").fire("click"); matrix = JSON.parse(bench.element("export-text").value).profile;
  assert.equal(matrix.rules.at(-1).function, "constant"); assert.equal(matrix.rules.at(-1).source, "");
  await bench.element("matrix-reset").fire("click"); await bench.element("matrix-export").fire("click");
  assert.deepEqual(JSON.parse(bench.element("export-text").value).profile, core.serializableMatrix(core.getProfile(catalog, bench.element("profile").value)));
});
test("diagnostic coefficient reference compares numerically without applying or replacing matrix preset", async () => {
  const bench = harness(); await settle(); bench.element("human").value = '{"Belly":0.5}';
  await bench.element("snapshot-export").fire("click"); const text = bench.element("export-text").value;
  assert.equal(JSON.parse(text).kind, "claw-wolf-coefficient-snapshot");
  bench.element("snapshot-import").files = [{ text: async () => text }]; await bench.element("snapshot-import").fire("change");
  assert.match(bench.element("comparison-status").textContent, /maximum absolute difference 0; RMS 0/);
  assert.equal(bench.calls.filter(call => call.method.endsWith(".set")).length, 0);
});
test("scoped geometry reads all vertices from both owned models and exports every initial/current/delta value", async () => {
  const bench = harness({ geometry: true }); await open(bench);
  assert.equal(bench.element("geometry-read").disabled, false); await bench.element("geometry-read").fire("click");
  assert.equal(bench.calls.filter(call => call.method === "previews.geometry").length, 2);
  assert.equal(bench.element("geometry-rows").children.length, 3); assert.equal(bench.element("geometry-export").disabled, false);
  await bench.element("geometry-export").fire("click"); const snapshot = JSON.parse(bench.element("export-text").value);
  for (const role of ["human", "wolf"]) {
    assert.deepEqual(snapshot.models[role].shapes[0].deltas, [1, 2, 3, 0, -1, -2, 0, 0, 0]);
    assert.equal(snapshot.models[role].shapes[0].vertexCount, 3);
  }
  assert.match(snapshot.precision, /not atomically/);
  bench.element("human").value = '{"Belly":1}'; await bench.element("human").fire("input");
  assert.equal(bench.element("geometry-export").disabled, true); assert.match(bench.element("geometry-status").textContent, /invalidated/);
});

test("small matrix exports remain complete on one page and host downloads retain their exact format", async () => {
  const bench = harness({ hostExports: true }); await settle();
  await bench.element("matrix-export").fire("click");
  const json = bench.element("export-text").value;
  assert.deepEqual(JSON.parse(json).profile, core.serializableMatrix(core.getProfile(catalog, bench.element("profile").value)));
  assert.equal(bench.element("export-page").value, "1"); assert.equal(bench.element("export-page").max, "1");
  assert.equal(bench.element("export-previous").disabled, true); assert.equal(bench.element("export-next").disabled, true);
  assert.match(bench.element("export-page-status").textContent, /Page 1 of 1/);
  await bench.element("export-download").fire("click");
  let prepared = bench.calls.filter(call => call.method === "exports.prepare").at(-1).params;
  assert.equal(prepared.text, json); assert.equal(prepared.format, "json");
  assert.equal(prepared.filename, bench.element("profile").value + ".wolf-matrix.json");
  await bench.element("matrix-xml").fire("click");
  const xml = bench.element("export-text").value;
  assert.equal(xml, core.exportCatalog(catalog, core.getProfile(catalog, bench.element("profile").value), "3BA"));
  await bench.element("export-download").fire("click");
  prepared = bench.calls.filter(call => call.method === "exports.prepare").at(-1).params;
  assert.equal(prepared.text, xml); assert.equal(prepared.format, "xml"); assert.equal(prepared.filename, "MorphLinks.xml");
});

test("loaded model validation accepts available generic targets and preserves the last matrix on missing targets", async () => {
  const bench = harness(); await open(bench);
  const profile = core.getProfile(catalog, bench.element("profile").value);
  const imported = { ...profile, rules: [{ source: "", target: "CLAWHeadEarSize", gain: 1, cap: 1, function: "constant", value: .4 }] };
  bench.element("matrix-paste").value = JSON.stringify({ schemaVersion: 1, kind: "claw-wolf-matrix", profile: imported });
  await bench.element("matrix-paste-load").fire("click");
  await bench.element("matrix-export").fire("click");
  const accepted = bench.element("export-text").value;
  assert.equal(JSON.parse(accepted).profile.rules[0].target, "CLAWHeadEarSize");
  const writes = bench.calls.filter(call => call.method === "previews.morphs.set").length;
  imported.rules[0].target = "Missing.Custom.Target";
  bench.element("matrix-paste").value = JSON.stringify({ schemaVersion: 1, kind: "claw-wolf-matrix", profile: imported });
  await bench.element("matrix-paste-load").fire("click");
  assert.match(bench.element("status").textContent, /missing linked targets/);
  await bench.element("matrix-export").fire("click");
  assert.equal(bench.element("export-text").value, accepted);
  assert.equal(bench.calls.filter(call => call.method === "previews.morphs.set").length, writes);
});

test("canonical restore cannot replace a usable custom matrix with unavailable loaded targets", async () => {
  const bench = harness({ wolfNamesOverride: ["CLAWHeadEarSize", "CLAWTailLength"] }); await settle();
  const profile = core.getProfile(catalog, bench.element("profile").value);
  const imported = { ...profile, rules: [{ source: "", target: "CLAWHeadEarSize", gain: 1, cap: 1, function: "constant", value: .4 }] };
  bench.element("matrix-paste").value = JSON.stringify({ schemaVersion: 1, kind: "claw-wolf-matrix", profile: imported });
  await bench.element("matrix-paste-load").fire("click"); await open(bench);
  await bench.element("matrix-export").fire("click"); const accepted = bench.element("export-text").value;
  const writes = bench.calls.filter(call => call.method === "previews.morphs.set").length;
  await bench.element("matrix-reset").fire("click"); assert.match(bench.element("status").textContent, /missing linked targets/);
  await bench.element("matrix-export").fire("click"); assert.equal(bench.element("export-text").value, accepted);
  assert.equal(bench.calls.filter(call => call.method === "previews.morphs.set").length, writes);
  await bench.element("human").fire("input"); assert.match(bench.element("status").textContent, /Updated both models/);
});

for (const hostExports of [true, false]) test("large geometry export pages retain every byte " +
  (hostExports ? "and host downloads use the complete immutable snapshot" : "without host download support"), async () => {
  const count = 12000, shapeName = "Body Ж🌕";
  const bench = harness({ geometry: true, geometryVertexCount: count, geometryShapeName: shapeName, hostExports });
  await open(bench); await bench.element("geometry-read").fire("click"); await bench.element("geometry-export").fire("click");
  const pageCount = Number(bench.element("export-page").max), pages = [];
  assert.ok(pageCount > 32);
  for (let page = 1; page <= pageCount; page++) {
    const text = bench.element("export-text").value;
    assert.equal(bench.element("export-page").value, String(page));
    assert.equal(bench.element("export-previous").disabled, page === 1);
    assert.equal(bench.element("export-next").disabled, page === pageCount);
    assert.ok(Buffer.byteLength(text, "utf8") <= 32 * 1024);
    assert.equal(Buffer.from(text, "utf8").toString("utf8"), text, "Pages must not split a Unicode character.");
    pages.push(text);
    if (page < pageCount) await bench.element("export-next").fire("click");
  }
  const complete = pages.join(""), snapshot = JSON.parse(complete);
  assert.ok(Buffer.byteLength(complete, "utf8") > 1024 * 1024);
  assert.equal(snapshot.kind, "claw-paired-geometry-snapshot");
  for (const role of ["human", "wolf"]) {
    const shape = snapshot.models[role].shapes[0];
    assert.equal(shape.name, shapeName); assert.equal(shape.vertexCount, count);
    assert.equal(shape.vertices.length, count * 3); assert.equal(shape.baseVertices.length, count * 3); assert.equal(shape.deltas.length, count * 3);
    assert.equal(shape.vertices.at(-1), ((count * 3 - 1) % 997) / 997 - .5);
  }
  assert.ok(bench.maximumExportPageBytes() <= 32 * 1024, "The full export must never enter the textarea, even temporarily.");
  await bench.element("export-previous").fire("click"); assert.equal(bench.element("export-page").value, String(pageCount - 1));
  bench.element("export-page").value = "2"; await bench.element("export-go").fire("click");
  assert.equal(bench.element("export-text").value, pages[1]);
  await bench.element("export-select").fire("click"); assert.equal(bench.element("export-text").selected, true);
  assert.equal(bench.element("export-download").disabled, !hostExports);
  if (hostExports) {
    await bench.element("export-download").fire("click");
    const prepared = bench.calls.filter(call => call.method === "exports.prepare").at(-1).params;
    assert.deepEqual(Buffer.from(prepared.text, "utf8"), Buffer.from(complete, "utf8"));
    assert.equal(prepared.format, "json"); assert.match(prepared.filename, /\.paired-vertices\.json$/);
    // The readonly viewer is not the download's source of truth.
    bench.element("export-text").value = "altered visible page"; await bench.element("export-download").fire("click");
    assert.equal(bench.calls.filter(call => call.method === "exports.prepare").at(-1).params.text, complete);
  } else assert.equal(bench.calls.filter(call => call.method === "exports.prepare").length, 0);
  bench.element("export-page").value = "1"; await bench.element("export-go").fire("click");
  assert.equal(bench.element("export-text").value, pages[0]);
});

test("actual released SDK keeps explicit human traits outside body controls and exports their availability",async()=>{
  const profile=catalog.profiles.find(p=>p.family==="Vanilla"&&p.sex==="female");
  const traits={"$human.height":1.125,"$human.face.noseLength":Math.fround(.4),"$human.face.jawWidth":0};
  const bench=harness({humanNamesOverride:["$actor.weight",...Object.keys(traits)],wolfNamesOverride:core.matrixTargets(profile)});
  await settle();bench.element("profile").value=profile.id;await bench.element("profile").fire("change");await open(bench);
  assert.equal(bench.element("shared-sliders").children.length,0);
  assert.equal(bench.element("human-trait-controls").children.length,6);
  assert.ok(bench.element("human-trait-controls").children.every(row=>row.children[1].checked===false));
  assert.match(bench.element("human-traits-status").textContent,/Unavailable inputs/);
  bench.element("import").files=[{name:"human-observation.json",text:async()=>JSON.stringify({humanValues:{},actorWeight:.5,humanTraits:traits})}];
  await bench.element("import").fire("change");
  assert.deepEqual(JSON.parse(bench.element("human-traits").value),traits);
  assert.match(bench.element("comparison-status").textContent,/maximum absolute difference 0; RMS 0/);
  const rows=bench.element("human-trait-controls").children;
  const width=rows.find(row=>row.children[0].textContent==="$human.face.jawWidth");
  assert.equal(width.children[1].checked,true);assert.equal(width.children[2].value,"0");
  const height=rows.find(row=>row.children[0].textContent==="$human.height");
  height.children[2].value="1.2";await height.children[2].fire("change");
  assert.equal(Math.fround(JSON.parse(bench.element("human-traits").value)["$human.height"]),Math.fround(1.2));
  const writes=bench.calls.filter(call=>call.method==="previews.morphs.set");
  assert.equal(writes.length,3, "Opening, import and height edit each update only the wolf; reserved inputs never reach human TRI");
  assert.ok(writes.every(write=>write.params.preview==="opaque:2"));
  assert.equal(Object.keys(bench.previews.get("opaque:1").values).length,0);
  assert.ok(Object.keys(writes[0].params.values).every(name=>core.sourceKind(name)===0));
  await bench.element("snapshot-export").fire("click");
  const exported=JSON.parse(bench.element("export-text").value);assert.equal(exported.humanTraits["$human.face.jawWidth"],0);
  assert.equal(exported.unavailableTraits.length,3);assert.equal(exported.humanTraits["$human.height"],Math.fround(1.2));
  height.children[1].checked=false;await height.children[1].fire("change");
  assert.equal(Object.hasOwn(JSON.parse(bench.element("human-traits").value),"$human.height"),false);
  assert.equal(height.children[2].disabled,true);assert.match(bench.element("human-traits-status").textContent,/\$human.height/);
});


test("human range and numeric input immediately update both previews without a separate apply step",async()=>{
  const bench=harness();await open(bench);
  assert.match(bench.element("catalog-root").textContent,/isolated.*2 available model/);
  assert.equal(bench.calls.filter(call=>call.method==="previews.morphs.set").length,2,"Opening applies the current vector and matrix to both models");
  const row=bench.element("shared-sliders").children.find(row=>row.children[0].textContent==="Belly");
  for(const [control,value]of[[row.children[1],"0.8"],[row.children[2],"-0.25"]]) {
    const before=bench.calls.length;control.value=value;await control.fire("input");
    assert.equal(bench.previews.get("opaque:1").values.Belly,Math.fround(Number(value)));
    const writes=bench.calls.slice(before).filter(call=>call.method==="previews.morphs.set");
    assert.equal(writes.length,2);assert.deepEqual(writes.map(call=>call.params.preview),["opaque:1","opaque:2"]);
  }
});

test("changed resource selection blocks old-pair writes and reopening restores automatic updates",async()=>{
  const bench=harness();await open(bench);
  const writes=bench.calls.filter(call=>call.method==="previews.morphs.set").length;
  bench.element("human-model").value="";await bench.element("human-model").fire("change");
  assert.match(bench.element("pair-status").textContent,/No comparison pair/);assert.equal(bench.previews.size,0);
  bench.element("human").value='{"Belly":0.7}';await bench.element("human").fire("input");
  assert.equal(bench.calls.filter(call=>call.method==="previews.morphs.set").length,writes);
  await open(bench);assert.equal(bench.previews.get("opaque:3").values.Belly,Math.fround(.7));
  assert.match(bench.element("pair-status").textContent,/Pair ready/);
  bench.element("human").value='{"Belly":0.5}';await bench.element("human").fire("input");
  assert.ok(!bench.previews.has("opaque:1")&&!bench.previews.has("opaque:2"));assert.equal(bench.previews.get("opaque:3").values.Belly,.5);
});

test("resource selection revokes a sent human write before its unsent wolf write and queued vectors",async()=>{
  let release,started,armed=false;
  const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
  const bench=harness({beforeRequest:async method=>{if(armed&&method==="previews.morphs.set"){started();await gate;}}});await open(bench);armed=true;
  const before=bench.calls.length;
  bench.element("human").value='{"Belly":0.2}';const first=bench.element("human").fire("input");await entered;
  bench.element("human").value='{"Belly":0.4}';const queued=bench.element("human").fire("input");
  bench.element("human-model").value="";const changing=bench.element("human-model").fire("change");
  assert.match(bench.element("pair-status").textContent,/No comparison pair/);
  assert.equal(bench.calls.filter(call=>call.method==="previews.close").length,0,"Sent write must settle before disposal");
  release();await Promise.all([first,queued,changing]);
  const writes=bench.calls.slice(before).filter(call=>call.method==="previews.morphs.set");
  assert.equal(writes.length,1);assert.equal(writes[0].params.preview,"opaque:1");assert.equal(bench.previews.size,0);
  assert.equal(bench.calls.filter(call=>call.method==="previews.close").length,2);
});

test("catalog refresh closes a pair whose selected resource disappeared and clears all binding UI",async()=>{
  const modelNames=["human.nif","wolf.nif"],bench=harness({modelNames});await open(bench);
  await bench.element("human").fire("input");modelNames.splice(0,1);
  await bench.element("refresh-models").fire("click");
  assert.equal(bench.element("human-model").value,"");assert.equal(bench.previews.size,0);
  assert.equal(bench.previews.size,0);
  assert.equal(bench.element("shared-sliders").children.length,0);
  assert.match(bench.element("pair-status").textContent,/No comparison pair/);
});

test("busy geometry reads disable human controls and reject writes until the operation finishes",async()=>{
  let release,started;
  const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
  const bench=harness({geometry:true,beforeRequest:async method=>{if(method==="previews.geometry"){started();await gate;}}});await open(bench);
  const before=bench.calls.length; const reading=bench.element("geometry-read").fire("click");await entered;
  assert.equal(bench.element("human").disabled,true);assert.equal(bench.element("preset").disabled,true);assert.equal(bench.element("weight").disabled,true);
  for(const row of bench.element("shared-sliders").children){assert.equal(row.children[1].disabled,true);assert.equal(row.children[2].disabled,true);}
  bench.element("human").value='{"Belly":0.7}';await bench.element("human").fire("input");
  assert.equal(bench.calls.slice(before).filter(call=>call.method==="previews.morphs.set").length,0);
  release();await reading;
  assert.equal(bench.element("human").disabled,false);
  await bench.element("human").fire("input");assert.equal(bench.previews.get("opaque:1").values.Belly,Math.fround(.7));
});

test("catalog root replacement revokes old previews even when both filenames remain in the catalog",async()=>{
  const modelRoot={value:"first-root"},bench=harness({modelRoot});await open(bench);
  modelRoot.value="replacement-root";await bench.element("refresh-models").fire("click");
  assert.match(bench.element("catalog-root").textContent,/replacement-root/);
  assert.equal(bench.element("human-model").value,"human.nif");assert.equal(bench.element("wolf-model").value,"wolf.nif");
  assert.equal(bench.previews.size,0);assert.equal(bench.previews.size,0);
  assert.match(bench.element("pair-status").textContent,/No comparison pair/);
});

test("a refused imported family transition preserves the current human inputs and matrix",async()=>{
  const vanilla=catalog.profiles.find(profile=>profile.family==="Vanilla"&&profile.sex==="female"),bhunp=catalog.profiles.find(profile=>profile.family==="BHUNP");
  const bench=harness({humanNamesOverride:[],wolfNamesOverride:[...new Set([...core.matrixTargets(vanilla),...core.matrixTargets(bhunp)])]});await settle();
  bench.element("profile").value=vanilla.id;await bench.element("profile").fire("change");await open(bench);
  bench.element("actor-weight").value="0.25";await bench.element("actor-weight").fire("change");
  const before=bench.calls.filter(call=>call.method==="previews.morphs.set").length;
  bench.element("import").value="fixture.json";bench.element("import").files=[{name:"fixture.json",text:async()=>JSON.stringify({profileId:bhunp.id,humanValues:{},actorWeight:.9,humanTraits:{"$human.height":1.1}})}];
  await bench.element("import").fire("change");
  assert.match(bench.element("status").textContent,/no configured source/);
  assert.equal(bench.element("profile").value,vanilla.id);assert.equal(bench.element("actor-weight").value,"0.25");
  assert.equal(bench.element("human").value,"{}");assert.equal(bench.element("human-traits").value,"");
  assert.equal(bench.element("import").value,"");assert.equal(bench.previews.size,2);
  assert.equal(bench.calls.filter(call=>call.method==="previews.morphs.set").length,before);
  await bench.element("matrix-export").fire("click");assert.equal(JSON.parse(bench.element("export-text").value).profile.id,vanilla.id);
});

test("valid matrix imports and edits immediately update the working pair",async()=>{
  const bench=harness();await open(bench);
  bench.element("human").value='{"Belly":0.6}';await bench.element("human").fire("input");
  const profile={...catalog.profiles[0],rules:[{source:"Belly",target:"CLAWTorsoBellyRound",gain:.5,cap:1}]};
  bench.element("matrix-paste").value=JSON.stringify({schemaVersion:1,kind:"claw-wolf-matrix",profile});
  await bench.element("matrix-paste-load").fire("click");
  assert.equal(bench.previews.get("opaque:2").values.CLAWTorsoBellyRound,Math.fround(.3));
  const gain=bench.element("matrix-rows").children[0].children[4].children[0];gain.value="0.25";await gain.fire("input");
  assert.equal(bench.previews.get("opaque:2").values.CLAWTorsoBellyRound,Math.fround(.15));
  assert.equal(bench.previews.size,2);
});

test("rapid automatic human and matrix intents settle to the latest vector and policy",async()=>{
  let release,started,armed=false,held=false;
  const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
  const bench=harness({beforeRequest:async(method)=>{if(armed&&!held&&method==="previews.morphs.set"){held=true;started();await gate;}}});await open(bench);armed=true;
  bench.element("human").value='{"Belly":0.2}';const first=bench.element("human").fire("input");await entered;
  bench.element("human").value='{"Belly":0.4}';const older=bench.element("human").fire("input");
  const profile={...catalog.profiles[0],rules:[{source:"Belly",target:"CLAWTorsoBellyRound",gain:.5,cap:1}]};
  bench.element("matrix-paste").value=JSON.stringify({schemaVersion:1,kind:"claw-wolf-matrix",profile});const matrix=bench.element("matrix-paste-load").fire("click");
  bench.element("human").value='{"Belly":0.8}';const newest=bench.element("human").fire("input");
  release();await Promise.all([first,older,matrix,newest]);await settle();
  assert.equal(bench.previews.get("opaque:1").values.Belly,Math.fround(.8));
  assert.equal(bench.previews.get("opaque:2").values.CLAWTorsoBellyRound,Math.fround(.4));assert.equal(bench.previews.size,2);
});

test("invalid human input never writes and a partial update closes only its owned pair",async()=>{
  let fail=false;
  const bench=harness({beforeRequest(method,params){if(fail&&method==="previews.morphs.set"&&params.preview==="opaque:2")throw Error("Wolf scoped write failed");}});await open(bench);
  const writes=bench.calls.filter(call=>call.method==="previews.morphs.set").length;
  bench.element("human").value='{"UnknownHuman":1}';await bench.element("human").fire("input");
  assert.equal(bench.calls.filter(call=>call.method==="previews.morphs.set").length,writes);assert.equal(bench.previews.size,2);
  fail=true;bench.element("human").value='{"Belly":0.7}';await bench.element("human").fire("input");
  assert.equal(bench.previews.size,0);assert.match(bench.element("status").textContent,/Wolf scoped write failed/);
});

test("actual released SDK carries scoped zoom events and exact zoom-only writes without echo or main-model access",async()=>{
  const bench=harness({zoom:true});await open(bench);
  assert.match(bench.element("zoom-status").textContent,/Rotation and zoom follow/);
  assert.equal(bench.previews.get("opaque:2").zoom,1);
  const before=bench.calls.filter(c=>c.method==="previews.view.set").length;
  bench.gesture("opaque:1",2.5);await settle();await settle();
  assert.equal(bench.previews.get("opaque:2").zoom,2.5);
  bench.gesture("opaque:2",1.5);await settle();await settle();
  assert.equal(bench.previews.get("opaque:1").zoom,1.5);
  const writes=bench.calls.filter(c=>c.method==="previews.view.set");assert.equal(writes.length,before+2);
  assert.ok(writes.every(c=>Object.keys(c.params).sort().join(",")==="preview,zoom"));
  assert.ok(!bench.calls.some(c=>c.method==="view.set"||c.method==="models.open"));
});


test("runtime UI separators, equations and matrix actions contain intended Unicode instead of double-decoded text",async()=>{
  const bench=harness();await open(bench);
  const collect=node=>[node.textContent,...node.children.flatMap(collect)];
  const text=["profile-info","pair-status","matrix-status","results","matrix-rows"].flatMap(id=>collect(bench.element(id))).join("\n");
  assert.ok(bench.element("profile-info").textContent.includes("\u00b7"));
  assert.ok(bench.element("pair-status").textContent.includes("\u00b7"));
  for(const symbol of ["\u2192","\u00d7","\u2191","\u2193"])assert.ok(text.includes(symbol),"Missing UI symbol "+symbol);
  for(const bad of ["\u0412\u00b7","\u0432\u0402\u00a6","\u0413\u2014"])assert.ok(!text.includes(bad),"Mojibake reached runtime UI");
});


test("matrix edges retain labeled accessible controls for the responsive card presentation",async()=>{
  const bench=harness();await open(bench);
  const row=bench.element("matrix-rows").children[0];
  assert.deepEqual(row.children.map(td=>td["data-label"]),["Edge","Human source","Wolf target","Function","Gain","Target cap","Exponent / constant","Order / remove"]);
  assert.equal(row.children[1].children[0]["aria-label"],"Human source edge 1");
  assert.equal(row.children[4].children[0]["aria-label"],"gain edge 1");
  const gain=row.children[4].children[0];gain.value="0.1";await gain.fire("change");
  assert.match(bench.element("matrix-apply-status").textContent,/Both previews are up to date/);

});


test("matrix numeric input retains its control while zero-gain rows can be edited back into use",async()=>{
  const bench=harness();await open(bench);
  bench.element("human").value='{"Belly":0.8}';await bench.element("human").fire("input");
  const profile={...catalog.profiles[0],rules:[{source:"Belly",target:"CLAWTorsoBellyRound",gain:1,cap:1}]};
  bench.element("matrix-paste").value=JSON.stringify({schemaVersion:1,kind:"claw-wolf-matrix",profile});await bench.element("matrix-paste-load").fire("click");
  const row=bench.element("matrix-rows").children[0],gain=row.children[4].children[0];gain.focus();
  gain.value="0";await gain.fire("input");
  assert.equal(bench.element("matrix-rows").children[0],row);assert.equal(gain.focused,true);
  assert.equal(bench.previews.get("opaque:2").values.CLAWTorsoBellyRound,0);
  await bench.element("matrix-export").fire("click");assert.equal(JSON.parse(bench.element("export-text").value).profile.rules.length,0);
  gain.value="0.5";await gain.fire("input");
  assert.equal(bench.element("matrix-rows").children[0],row);assert.equal(row.children[4].children[0],gain);assert.equal(gain.value,"0.5");
  assert.equal(bench.previews.get("opaque:2").values.CLAWTorsoBellyRound,Math.fround(.4));
  await bench.element("matrix-export").fire("click");assert.equal(JSON.parse(bench.element("export-text").value).profile.rules[0].gain,.5);
});

test("blank nonfinite and incompatible matrix edits retain the last usable policy and both models",async()=>{
  const bench=harness();await open(bench);
  bench.element("human").value='{"Belly":0.6}';await bench.element("human").fire("input");
  const profile={...catalog.profiles[0],rules:[{source:"Belly",target:"CLAWTorsoBellyRound",gain:.5,cap:1}]};
  bench.element("matrix-paste").value=JSON.stringify({schemaVersion:1,kind:"claw-wolf-matrix",profile});await bench.element("matrix-paste-load").fire("click");
  await bench.element("matrix-export").fire("click");const accepted=bench.element("export-text").value;
  const handles=[...bench.previews.keys()],models=JSON.stringify([...bench.previews]);
  const edit=async(column,value,event="input")=>{
    const before=bench.calls.length,control=bench.element("matrix-rows").children[0].children[column].children[0];
    control.value=value;await control.fire(event);
    assert.equal(bench.calls.slice(before).filter(call=>call.method==="previews.morphs.set").length,0);
    assert.deepEqual([...bench.previews.keys()],handles);assert.equal(JSON.stringify([...bench.previews]),models);
    assert.notEqual(bench.element("status").className.indexOf("error"),-1);
    await bench.element("matrix-export").fire("click");assert.equal(bench.element("export-text").value,accepted);
  };
  await edit(4,"");await edit(4,"NaN");await edit(4,"Infinity");await edit(5,"2");
  await edit(1,"Unknown.Custom.Source","change");await edit(2,"Unknown.Custom.Target","change");
  const gain=bench.element("matrix-rows").children[0].children[4].children[0];gain.value="0.25";await gain.fire("input");
  assert.equal(bench.previews.get("opaque:2").values.CLAWTorsoBellyRound,Math.fround(.15));assert.equal(bench.previews.size,2);
});

test("incompatible file and pasted matrix imports preserve current policy and inputs",async()=>{
  const bench=harness();await open(bench);bench.element("human").value='{"Belly":0.6}';await bench.element("human").fire("input");
  await bench.element("matrix-export").fire("click");const accepted=bench.element("export-text").value,human=bench.element("human").value;
  const profile={...catalog.profiles[0],rules:[{source:"Belly",target:"Missing.Target",gain:1,cap:1}]};
  for(const file of [false,true]){
    const text=JSON.stringify({schemaVersion:1,kind:"claw-wolf-matrix",profile}),before=bench.calls.length;
    if(file){bench.element("matrix-import").files=[{text:async()=>text}];await bench.element("matrix-import").fire("change");}
    else{bench.element("matrix-paste").value=text;await bench.element("matrix-paste-load").fire("click");}
    assert.match(bench.element("status").textContent,/missing linked targets/);assert.equal(bench.previews.size,2);
    assert.equal(bench.calls.slice(before).filter(call=>call.method==="previews.morphs.set").length,0);
    assert.equal(bench.element("human").value,human);await bench.element("matrix-export").fire("click");assert.equal(bench.element("export-text").value,accepted);
  }
});

test("pending model replacement locks matrix rows and pasted imports until its validated commit",async()=>{
  let release,started;
  const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
  const bench=harness({sidebarSelection:true,modelNames:["human.nif","human-next.nif","wolf.nif"],beforeRequest:async(method,params)=>{
    if(method==="previews.create"&&params.name==="human-next.nif"){started();await gate;}
  }});await open(bench);
  await bench.element("matrix-export").fire("click");const accepted=bench.element("export-text").value;
  bench.selection({root:"isolated",name:"human-next.nif"});await entered;
  const row=bench.element("matrix-rows").children[0],gain=row.children[4].children[0];
  assert.equal(gain.disabled,true);assert.equal(row.children[1].children[0].disabled,true);
  for(const id of ["matrix-paste","matrix-paste-load","matrix-import","matrix-reset","matrix-add","matrix-constant","human-reset"])assert.equal(bench.element(id).disabled,true,id);
  gain.value="0.123";await gain.fire("input");bench.element("matrix-paste").value="{}";await bench.element("matrix-paste-load").fire("click");
  await bench.element("matrix-export").fire("click");assert.equal(bench.element("export-text").value,accepted);
  release();await settle();await settle();
  assert.equal(bench.previews.size,2);assert.equal(bench.element("human-model").value,"human-next.nif");
  assert.equal(bench.element("matrix-paste-load").disabled,false);assert.equal(bench.element("matrix-rows").children[0].children[4].children[0].disabled,false);
  await bench.element("matrix-export").fire("click");assert.equal(bench.element("export-text").value,accepted);
});


test("numeric input followed by unchanged change retains the matching pending acknowledgement",async()=>{
  let release,started,armed=false,held=false;
  const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
  const bench=harness({beforeRequest:async method=>{if(armed&&!held&&method==="previews.morphs.set"){held=true;started();await gate;}}});await open(bench);
  const gain=bench.element("matrix-rows").children[0].children[4].children[0];armed=true;gain.value="0.123";
  const typing=gain.fire("input");await entered;await gain.fire("change");release();await typing;await settle();
  assert.match(bench.element("matrix-apply-status").textContent,/Both previews are up to date/);
  assert.equal(bench.previews.size,2);
});

test("matrix sources preserve the kernel's ASCII-folded provider identity",async()=>{
  const bench=harness();await open(bench);bench.element("human").value='{"Belly":0.6}';await bench.element("human").fire("input");
  const profile={...catalog.profiles[0],rules:[{source:"Belly",target:"CLAWTorsoBellyRound",gain:.5,cap:1}]};
  bench.element("matrix-paste").value=JSON.stringify({schemaVersion:1,kind:"claw-wolf-matrix",profile});await bench.element("matrix-paste-load").fire("click");
  const source=bench.element("matrix-rows").children[0].children[1].children[0];source.value="belly";await source.fire("change");
  await bench.element("matrix-export").fire("click");assert.equal(JSON.parse(bench.element("export-text").value).profile.rules[0].source,"belly");
  assert.equal(bench.previews.get("opaque:2").values.CLAWTorsoBellyRound,Math.fround(.3));assert.equal(bench.previews.size,2);
});


test("restoring the accepted numeric value after an invalid pending edit acknowledges the final intent",async()=>{
  let release,started,armed=false,held=false;
  const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
  const bench=harness({beforeRequest:async method=>{if(armed&&!held&&method==="previews.morphs.set"){held=true;started();await gate;}}});await open(bench);
  bench.element("human").value='{"Belly":0.8}';await bench.element("human").fire("input");
  const profile={...catalog.profiles[0],rules:[{source:"Belly",target:"CLAWTorsoBellyRound",gain:.25,cap:1}]};
  bench.element("matrix-paste").value=JSON.stringify({schemaVersion:1,kind:"claw-wolf-matrix",profile});await bench.element("matrix-paste-load").fire("click");
  const gain=bench.element("matrix-rows").children[0].children[4].children[0];armed=true;gain.value="0.5";
  const first=gain.fire("input");await entered;gain.value="";await gain.fire("input");
  assert.equal(gain["aria-invalid"],"true");assert.match(bench.element("status").textContent,/finite gain/);
  gain.value="0.5";const recovered=gain.fire("input");release();await Promise.all([first,recovered]);await settle();
  assert.equal(gain["aria-invalid"],"false");assert.match(bench.element("matrix-apply-status").textContent,/Both previews are up to date/);
  assert.notEqual(bench.element("status").className,"error");assert.equal(bench.previews.get("opaque:2").values.CLAWTorsoBellyRound,Math.fround(.4));
});

test("a compatible imported family transition consumes the incoming vector and traits before automatic application",async()=>{
  const from=catalog.profiles.find(p=>p.family==="3BA"),to=catalog.profiles.find(p=>p.family==="CBBE");
  const names=[...new Set([from,to].flatMap(p=>p.rules.filter(r=>r.source&&core.sourceKind(r.source)===0).map(r=>r.source)))];
  const wolf=[...new Set([from,to].flatMap(core.matrixTargets))];
  const bench=harness({humanNamesOverride:names,wolfNamesOverride:wolf});await open(bench);
  const traits={"$human.height":1.1},human={Belly:.7},before=bench.calls.length;
  bench.element("import").files=[{name:"compatible-family.json",text:async()=>JSON.stringify({profileId:to.id,humanValues:human,actorWeight:.9,humanTraits:traits})}];
  await bench.element("import").fire("change");
  assert.equal(bench.element("profile").value,to.id);assert.deepEqual(JSON.parse(bench.element("human").value),{...core.validateHuman(human)});
  assert.equal(Number(bench.element("actor-weight").value),core.validateActorWeight(.9));assert.deepEqual(JSON.parse(bench.element("human-traits").value),{...core.validateTraits(traits)});
  assert.equal(bench.previews.size,2);assert.equal(bench.previews.get("opaque:1").values.Belly,Math.fround(.7));
  const writes=bench.calls.slice(before).filter(call=>call.method==="previews.morphs.set"&&call.params.preview==="opaque:1");
  assert.equal(writes.length,1,"A family transition must not apply a neutral old input vector before consuming the imported vector");
  const expected=core.evaluateMatrix(to,human,.9,traits).values;
  for(const[name,value]of Object.entries(expected))assert.equal(bench.previews.get("opaque:2").values[name],value,name);
});


test("a replacement missing retained human inputs is refused before the old pair is retired",async()=>{
  const bench=harness({sidebarSelection:true,modelNames:["human.nif","human-next.nif","wolf.nif"],humanNamesOverride:["Belly","HumanOther"],namesByModel:{"human-next.nif":["Belly"]}});await open(bench);
  const profile={...catalog.profiles[0],rules:[{source:"Belly",target:"CLAWTorsoBellyRound",gain:.5,cap:1}]};
  bench.element("matrix-paste").value=JSON.stringify({schemaVersion:1,kind:"claw-wolf-matrix",profile});await bench.element("matrix-paste-load").fire("click");
  bench.element("human").value='{"Belly":0.8,"HumanOther":0.3}';await bench.element("human").fire("input");
  const pair=[...bench.previews.keys()],models=JSON.stringify([...bench.previews]),before=bench.calls.length;
  bench.selection({root:"isolated",name:"human-next.nif"});await settle();await settle();
  assert.deepEqual([...bench.previews.keys()],pair);assert.equal(JSON.stringify([...bench.previews]),models);
  assert.equal(bench.element("human-model").value,"human.nif");assert.match(bench.element("status").textContent,/missing.*HumanOther/i);
  assert.equal(bench.calls.slice(before).filter(call=>call.method==="previews.morphs.set").length,0);
  assert.ok(bench.calls.slice(before).filter(call=>call.method==="previews.close").every(call=>!pair.includes(call.params.preview)));
});


test("Export matrix directly requests one complete normalized host download without another button",async()=>{
  const bench=harness({hostExports:true});await open(bench);
  const profile={...catalog.profiles[0],rules:[{source:"Belly",target:"CLAWTorsoBellyRound",gain:.5,cap:1}]};
  bench.element("matrix-paste").value=JSON.stringify({schemaVersion:1,kind:"claw-wolf-matrix",profile});await bench.element("matrix-paste-load").fire("click");
  const gain=bench.element("matrix-rows").children[0].children[4].children[0];gain.value="0";await gain.fire("input");
  const before=bench.calls.length;await bench.element("matrix-export").fire("click");
  const requests=bench.calls.slice(before).filter(call=>call.method==="exports.prepare");assert.equal(requests.length,1);
  const download=requests[0].params;assert.equal(download.format,"json");assert.equal(download.filename,profile.id+".wolf-matrix.json");
  assert.equal(JSON.parse(download.text).kind,"claw-wolf-matrix");assert.equal(JSON.parse(download.text).profile.rules.length,0);
  assert.equal(download.text,bench.element("export-text").value);assert.equal(bench.element("export-panel").open,false);
});


test("Reset human morphs recovers missing imported keys and also clears them before opening a new pair",async()=>{
  const bench=harness();await open(bench);
  const handles=[...bench.previews.keys()],before=bench.calls.length;
  bench.element("human").value='{"TorsoBelly":1}';await bench.element("human").fire("input");
  assert.match(bench.element("status").textContent,/Human model is missing input morph: TorsoBelly/);
  assert.match(bench.element("status").textContent,/Reset human morphs/);assert.equal(bench.element("human-options").open,true);
  assert.deepEqual([...bench.previews.keys()],handles);assert.equal(bench.calls.slice(before).filter(call=>call.method==="previews.morphs.set").length,0);
  await bench.element("human-reset").fire("click");assert.equal(bench.element("human").value,"{}");
  assert.deepEqual([...bench.previews.keys()],handles);assert.match(bench.element("matrix-apply-status").textContent,/Both previews are up to date/);
  const belly=()=>bench.element("shared-sliders").children.find(row=>row.children[0].textContent==="Belly").children[1];
  belly().value="0.5";await belly().fire("input");assert.equal(bench.previews.get(handles[0]).values.Belly,.5);
  assert.ok(bench.previews.get(handles[1]).values.CLAWTorsoBellyRound>0);
  await bench.element("close-pair").fire("click");
  bench.element("import").files=[{name:"old-human.json",text:async()=>'{"TorsoBelly":1}'}];await bench.element("import").fire("change");
  assert.deepEqual(JSON.parse(bench.element("human").value),{TorsoBelly:1});const withoutPair=bench.calls.length;
  await bench.element("human-reset").fire("click");assert.equal(bench.element("human").value,"{}");assert.equal(bench.previews.size,0);
  assert.equal(bench.calls.length,withoutPair,"Reset without an open pair performs no host requests");
  await open(bench);assert.equal(bench.previews.size,2);assert.match(bench.element("matrix-apply-status").textContent,/Both previews are up to date/);
  belly().value="0.25";await belly().fire("input");assert.equal(bench.previews.get("opaque:3").values.Belly,.25);
  assert.ok(bench.previews.get("opaque:4").values.CLAWTorsoBellyRound>0);
});

test("Reset human morphs clears acknowledged human outputs while retaining matrix weight traits and owned handles",async()=>{
  const bench=harness({humanNamesOverride:["Belly","HumanOther"]});await open(bench);
  const traits={"$human.height":1.125},human={Belly:.8,HumanOther:-.25},weight=.75;
  bench.element("import").files=[{name:"human-observation.json",text:async()=>JSON.stringify({humanValues:human,actorWeight:weight,humanTraits:traits,humanValueProvenance:{Belly:"Retained test observation"}})}];await bench.element("import").fire("change");
  const profile={...catalog.profiles[0],rules:[
    {source:"Belly",target:"CLAWTorsoBellyRound",gain:.5,cap:1},
    {source:"$actor.weight",target:"CLAWTailLength",gain:1,cap:1},
    {source:"$human.height",target:"CLAWHeadEarSize",gain:.2,cap:1}
  ]};
  bench.element("matrix-paste").value=JSON.stringify({schemaVersion:1,kind:"claw-wolf-matrix",profile});await bench.element("matrix-paste-load").fire("click");
  await bench.element("matrix-export").fire("click");const matrix=bench.element("export-text").value,handles=[...bench.previews.keys()],before=bench.calls.length;
  assert.equal(bench.previews.get(handles[0]).values.HumanOther,-.25);assert.equal(bench.previews.get(handles[1]).values["Unowned.WolfControl"],.4);
  await bench.element("human-reset").fire("click");
  assert.equal(bench.element("human").value,"{}");assert.deepEqual([...bench.previews.keys()],handles);
  assert.equal(bench.element("actor-weight").value,String(weight));assert.deepEqual(JSON.parse(bench.element("human-traits").value),traits);
  assert.equal(bench.element("preset-controls").hidden,true);assert.match(bench.element("input-provenance").textContent,/Reset human preview coefficients.*0 per-name provenance/);
  assert.equal(bench.previews.get(handles[0]).values.Belly,0);assert.equal(bench.previews.get(handles[0]).values.HumanOther,0);
  const expected=core.evaluateMatrix(profile,{},weight,traits).values;
  for(const[name,value]of Object.entries(expected))assert.equal(bench.previews.get(handles[1]).values[name],value,name);
  assert.equal(bench.previews.get(handles[1]).values["Unowned.WolfControl"],.4);
  const writes=bench.calls.slice(before).filter(call=>call.method==="previews.morphs.set");assert.equal(writes.length,2);
  assert.deepEqual(writes.map(call=>call.params.preview),handles);assert.ok(!bench.calls.slice(before).some(call=>["previews.close","previews.create"].includes(call.method)));
  await bench.element("matrix-export").fire("click");assert.equal(bench.element("export-text").value,matrix);
});
