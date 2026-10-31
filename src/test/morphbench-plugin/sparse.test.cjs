"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{spawnSync}=require("node:child_process");
const {test}=require("node:test");
const core=require("../../main/morphbench-plugin/web/core.js"),input=require("../../main/morphbench-plugin/web/input.js");
const {PreviewController}=require("../../main/morphbench-plugin/web/preview-controller.js");
const catalog=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const base=rules=>({id:"CLAW.Sparse.Test",family:"HIMBO",sex:"male",version:"1",calibration:"test",rules});
const edge=(gain=1,extra={})=>({source:"CLAWCustomHuman",target:"Author.Custom",gain,cap:1,...extra});
const adjacent=value=>{const data=new DataView(new ArrayBuffer(4));data.setFloat32(0,value,true);data.setUint32(0,data.getUint32(0,true)+1,true);return data.getFloat32(0,true);};

test("shared float32 gain boundary is the authority and zero-edge matrices are neutral",()=>{
  const kernel=globalThis.CLAWMatrixKernel,epsilon=kernel.gainEpsilon,above=adjacent(epsilon);
  assert.equal(epsilon,Math.fround(1e-6));assert.equal(catalog.gainEpsilon,epsilon);
  for(const gain of [0,-0,epsilon,-epsilon,1e-6+1e-15]){
    assert.equal(kernel.gainActive(gain),false);
    assert.deepEqual(core.validateMatrix(base([edge(gain)])).rules,[]);
  }
  for(const gain of [above,-above])assert.equal(kernel.gainActive(gain),true);
  assert.equal(core.validateMatrix(base([edge(above)])).rules.length,1);
  assert.deepEqual(Object.keys(core.evaluateMatrix(base([]),{}).values),[]);
  assert.deepEqual(kernel.evaluate([],0),{values:[],rawSums:[],clamped:[],details:[]});
  assert.deepEqual(kernel.evaluate([],1).values,[0]);
});

test("generic morph names preserve spelling with provider-folded source lookup and alias rejection",()=>{
  const profile=base([edge()]);
  const result=core.evaluateMatrix(profile,{CLAWCustomHuman:.5,Unmapped:1});
  assert.deepEqual({...result.values},{"Author.Custom":.5});
  assert.deepEqual(result.unmapped,["Unmapped"]);
  assert.equal(core.validateHuman({CLAWCustomHuman:.3}).CLAWCustomHuman,Math.fround(.3));
  assert.equal(core.validateMatrix(base([edge(1,{source:"a",target:"B"})])).rules.length,1);
  assert.equal(core.validateMatrix(base([edge(1,{target:"CLAWTorsoBreastSize"})])).rules.length,1);
  assert.throws(()=>core.validateMatrix(base([edge(1,{source:"Author.Custom"})])),/overlap/);
  assert.throws(()=>core.validateMatrix(base([edge(),edge(1,{source:"Author.Custom",target:"Another"})])),/overlap/);
  assert.throws(()=>core.validateMatrix(base([edge(1,{source:"a",target:"A"})])),/overlap/);
  assert.throws(()=>core.validateMatrix(base([edge(),edge(1,{source:"clawcustomhuman",target:"Other"})])),/case aliases/);
  assert.throws(()=>core.validateMatrix(base([edge(),edge(1,{source:"Other",target:"author.custom"})])),/case aliases/);
  const folded=core.evaluateMatrix(profile,{clawcustomhuman:.5});
  assert.equal(folded.values["Author.Custom"],.5);assert.deepEqual(folded.unmapped,[]);
  assert.throws(()=>core.validateHuman({Human:1,human:1}),/case aliases/);
  assert.throws(()=>core.validateHuman({"é":1}),/ASCII/);
});

test("pruning follows structural validation and precedes duplicate, cap and collision checks",()=>{
  const inactive=edge(1e-6,{cap:.4});
  const profile=base([edge(),inactive,edge(0,{source:"Author.Custom",target:"Another"})]);
  assert.equal(core.validateMatrix(profile).rules.length,1);
  for(const rule of [edge(0,{cap:0}),edge(0,{function:"power",exponent:9}),edge(0,{function:"unknown"}),
    edge(0,{source:" bad"}),edge(0,{target:"bad\nname"}),edge(NaN),
    edge(0,{source:"",function:"constant",value:Infinity})]){
    assert.throws(()=>core.validateMatrix(base([rule])));
  }
  assert.throws(()=>core.validateMatrix(base([edge(),edge()])),/Duplicate/);
  assert.throws(()=>core.validateMatrix(base([edge(),edge(1,{source:"Other",cap:.5})])),/cap/);
});

test("JSON and XML interchange omit inactive edges and the default linear function",()=>{
  const matrix=base([edge(),edge(0,{source:"Other"}),edge(.5,{source:"",function:"constant",value:.2}),
    edge(.25,{source:"Nonlinear",function:"power",exponent:3})]);
  const encoded=input.matrixJSON(matrix),saved=JSON.parse(encoded).profile;
  assert.equal(saved.rules.length,3);assert.equal(Object.hasOwn(saved.rules[0],"function"),false);
  assert.equal(saved.rules[1].function,"constant");assert.equal(saved.rules[2].function,"power");
  const imported=input.parseMatrixJSON(encoded,matrix);
  assert.equal(imported.rules[0].function,"linear");assert.equal(input.matrixJSON(imported),encoded);
  assert.throws(()=>input.parseMatrixJSON(JSON.stringify({...JSON.parse(encoded),ignored:true}),matrix));
  assert.throws(()=>input.parseMatrixJSON(JSON.stringify({...JSON.parse(encoded),profile:{...saved,ignored:true}}),matrix));
  const xml=core.exportMatrix(matrix);
  assert.equal((xml.match(/<Rule /g)||[]).length,3);assert.doesNotMatch(xml,/function="linear"/);
  assert.match(xml,/function="constant"/);assert.match(xml,/function="power"/);
  const empty=input.parseMatrixJSON(input.matrixJSON(base([edge(-1e-6)])));
  assert.deepEqual(empty.rules,[]);assert.doesNotMatch(core.exportMatrix(empty),/<Rule /);
  assert.throws(()=>core.exportMatrix(base([edge(1,{target:'name" attribute="injected'})])),/plain ASCII/);
  assert.throws(()=>core.exportMatrix(base([edge(1,{target:"Targeté"})])),/Invalid CLAW mapping/);
});

test("native XML import selects an exact profile and shares sparse/default-function validation",()=>{
  const node=(tagName,attributes,children=[])=>({tagName,children,textContent:"",attributes:Object.keys(attributes).map(name=>({name})),getAttribute:name=>attributes[name]??null});
  const metadata={id:"CLAW.Sparse.Test",family:"HIMBO",sex:"male",version:"1",calibration:"test"};
  const rawRule={source:"CLAWCustomHuman",target:"Author.Custom",gain:"1",cap:"1"};
  let documentNode=node("MorphLinkProfiles",{schemaVersion:"1"},[
    node("Defaults",{male:metadata.id}),node("Profile",metadata,[node("Rule",rawRule),
      node("Rule",{...rawRule,gain:"1e-6",cap:"0.5"})])]);
  class Parser{parseFromString(text,type){assert.equal(type,"application/xml");return{documentElement:documentNode,getElementsByTagName:()=>[]};}}
  const parsed=input.parseMatrixXML("<MorphLinkProfiles/>",metadata,Parser);
  assert.equal(parsed.rules.length,1);assert.equal(parsed.rules[0].function,"linear");
  assert.equal(JSON.parse(input.matrixJSON(parsed)).profile.rules[0].function,undefined);
  assert.deepEqual(input.parseMatrix("<MorphLinkProfiles/>",metadata,Parser),parsed);
  assert.throws(()=>input.parseMatrixXML("<MorphLinkProfiles/>",{...metadata,id:"other"},Parser),/matching human family/);
  documentNode=node("MorphLinkProfiles",{schemaVersion:"1"},[node("Profile",metadata,[node("Rule",{...rawRule,gain:"0",function:""})])]);
  assert.throws(()=>input.parseMatrixXML("<MorphLinkProfiles/>",metadata,Parser),/Invalid CLAW mapping/);
  documentNode=node("MorphLinkProfiles",{schemaVersion:"1"},[node("Profile",metadata,[node("Rule",{...rawRule,target:"é"})])]);
  assert.throws(()=>input.parseMatrixXML("<MorphLinkProfiles/>",metadata,Parser),/plain ASCII/);
  for(const unsafe of ['<!DOCTYPE MorphLinkProfiles><MorphLinkProfiles/>','<MorphLinkProfiles value="&quot;"/>']){
    assert.throws(()=>input.parseMatrixXML(unsafe,metadata,Parser),/declarations\/entities/);
  }
});

test("raw rule and active target limits are enforced independently",()=>{
  const rows=Array.from({length:64},(_,i)=>edge(1,{source:"H"+i,target:"Custom"+i}));
  assert.equal(Object.keys(core.evaluateMatrix(base(rows),{}).values).length,64);
  assert.throws(()=>core.validateMatrix(base([...rows,edge(1,{source:"H64",target:"Custom64"})])),/64 active targets/);
  assert.equal(core.validateMatrix(base(Array.from({length:128},()=>edge(0)))).rules.length,0);
  assert.throws(()=>core.validateMatrix(base(Array.from({length:129},()=>edge(0)))));
});

test("game XML exports exactly the selected male/female pair without losing edited female data",()=>{
  const male=catalog.profiles.find(profile=>profile.family==="HIMBO");
  for(const family of ["CBBE","3BA"]){
    const xml=core.exportCatalog(catalog,male,family),female=catalog.profiles.find(profile=>profile.family===family);
    assert.equal((xml.match(/<Profile /g)||[]).length,2);
    assert.match(xml,new RegExp('male="'+male.id+'" female="'+female.id+'"'));
    const omitted=catalog.profiles.find(profile=>profile.family!=="HIMBO"&&profile.family!==family);
    assert.equal(xml.includes('id="'+omitted.id+'"'),false);
  }
  const cbbe=catalog.profiles.find(profile=>profile.family==="CBBE");
  assert.throws(()=>core.exportCatalog(catalog,cbbe,"3BA"),/edited female family/);
});

function scopedHost(wolfNames){
  const previews=new Map(),calls=[];let next=0;
  const sdk={async connect(){return{apiVersion:1,capabilities:PreviewController.requiredCapabilities,previewLimits:{maxPreviews:2}};},
    on(){return()=>{};},async request(method,params){
      calls.push({method,params:JSON.parse(JSON.stringify(params))});
      if(method==="models.list")return{entries:[{name:"human"},{name:"wolf"}]};
      if(method==="previews.create"){
        const preview="custom:"+(++next),human=params.name==="human";
        previews.set(preview,{name:params.name,names:human?["Input","Unmapped","CLAWSource"]:wolfNames,
          values:human?{}:{Unrelated:.75}});return{preview,name:params.name};
      }
      if(method==="previews.link")return JSON.parse(JSON.stringify(params));
      const item=previews.get(params.preview);assert.ok(item);
      if(method==="previews.scene.get")return{open:true,names:{nif:item.name,tri:item.name+".tri"}};
      if(method==="previews.close"){previews.delete(params.preview);return{closed:true};}
      if(method==="previews.morphs.get")return{names:[...item.names],values:{...item.values}};
      if(method==="previews.morphs.set"){
        assert.ok(Object.keys(params.values).every(name=>item.names.includes(name)));
        Object.assign(item.values,params.values);return{names:[...item.names],values:{...item.values}};
      }
      throw Error("Unexpected method "+method);
    }};
  return{controller:new PreviewController(sdk,catalog),calls,previews};
}

test("custom loaded models validate selected targets before writes and retain the complete human vector",async()=>{
  const canonical=catalog.profiles.find(profile=>profile.family==="HIMBO");
  const selected={...canonical,rules:[edge(1,{source:"INPUT",target:"Author.Custom"})]};
  const fixture=scopedHost(["Author.Custom","Unrelated"]);
  const pair=await fixture.controller.open(canonical.id,"human","wolf",selected);
  const result=await fixture.controller.apply({Input:.5,Unmapped:-.25,CLAWSource:.75},selected);
  assert.deepEqual(result.humanValues,{Input:.5,Unmapped:-.25,CLAWSource:.75});
  assert.deepEqual(result.wolfValues,{"Author.Custom":.5});
  assert.equal(fixture.previews.get(pair.wolf.preview).values.Unrelated,.75);
  await fixture.controller.apply({Input:.5,Unmapped:-.25,CLAWSource:.75},{...selected,rules:[]});
  assert.equal(fixture.previews.get(pair.wolf.preview).values["Author.Custom"],0);
  assert.equal(fixture.previews.get(pair.wolf.preview).values.Unrelated,.75);
  const writes=fixture.calls.filter(call=>call.method==="previews.morphs.set").length;
  await assert.rejects(fixture.controller.apply({Input:1},{...selected,rules:[edge(1,{source:"Input",target:"Missing"})]}),/missing planned morphs/);
  assert.equal(fixture.calls.filter(call=>call.method==="previews.morphs.set").length,writes);
  const missing=scopedHost(["Unrelated"]);
  await assert.rejects(missing.controller.open(canonical.id,"human","wolf",selected),/missing linked targets/);
  assert.equal(missing.calls.filter(call=>call.method==="previews.morphs.set").length,0);
  const ambiguous=scopedHost(["Author.Custom","author.custom","Unrelated"]);
  await assert.rejects(ambiguous.controller.open(canonical.id,"human","wolf",selected),/case aliases/);
  assert.equal(ambiguous.calls.filter(call=>call.method==="previews.morphs.set").length,0);
});

test("coefficient snapshots and comparisons do not invent distinct case-alias outputs",()=>{
  const matrix=base([edge()]),envelope={schemaVersion:1,kind:"claw-wolf-coefficient-snapshot",profileId:matrix.id,
    wolfValues:{"author.custom":.25}};
  assert.deepEqual({...input.parseWolfSnapshot(JSON.stringify(envelope),matrix)},{"Author.Custom":.25});
  const comparison=input.compareWolf({"Author.Custom":.5},{"author.custom":.25});
  assert.equal(comparison.rows.length,1);assert.equal(comparison.rows[0].difference,.25);
  envelope.wolfValues["Author.Custom"]=.5;
  assert.throws(()=>input.parseWolfSnapshot(JSON.stringify(envelope),matrix),/case aliases/);
});

if(process.argv[3]&&process.argv[4])test("native parser and WASM agree for generic, epsilon, empty and64-target profiles",()=>{
  const native=process.argv[3],directory=path.resolve(process.argv[4]);fs.mkdirSync(directory,{recursive:true});
  const cases=[],epsilon=globalThis.CLAWMatrixKernel.gainEpsilon,above=adjacent(epsilon);
  function compare(matrix,human,rawXml=null){
    const filename=path.join(directory,"sparse-parity.xml");fs.writeFileSync(filename,rawXml||core.exportMatrix(matrix));
    const text=Object.entries(human).map(([name,value])=>name+"\t"+Math.fround(value)).join("\n")+"\n";
    const result=spawnSync(native,["matrix",filename,matrix.id],{input:text,encoding:"utf8"});assert.equal(result.status,0,result.stderr);
    const observed=JSON.parse(result.stdout),expected=core.evaluateMatrix(matrix,human).values;
    for(const [name,value]of Object.entries(expected))assert.equal(Math.fround(observed[name]),value,name);
    for(const [name,value]of Object.entries(observed))if(!Object.hasOwn(expected,name))assert.equal(value,0,"Unexpected nonzero native output "+name);
    cases.push({rules:matrix.rules.length,activeRules:core.validateMatrix(matrix).rules.length,targets:Object.keys(expected).length,match:true});
  }
  for(const gain of [0,-0,epsilon,-epsilon,above,-above]){
    const matrix=base([edge(gain)]);
    const raw='<MorphLinkProfiles schemaVersion="1"><Profile id="'+matrix.id+'" family="HIMBO" version="1" sex="male" calibration="test"><Rule source="CLAWCustomHuman" target="Author.Custom" gain="'+gain+'" cap="1" /></Profile></MorphLinkProfiles>';
    compare(matrix,{CLAWCustomHuman:1},raw);
  }
  compare(base([]),{});
  compare(base([edge()]),{clawcustomhuman:.5});
  compare(base([edge(.8,{source:"Input"}),edge(.25,{source:"",function:"constant",value:.4})]),{Input:.6});
  compare(base(Array.from({length:64},(_,i)=>edge(1,{source:"H"+i,target:"T"+i}))),Object.fromEntries(Array.from({length:64},(_,i)=>["H"+i,.25])));
  fs.writeFileSync(path.join(directory,"sparse-native-conformance.json"),JSON.stringify({cases:cases.length,allMatched:true,details:cases},null,2)+"\n");
});

if(process.argv[3]&&process.argv[4])test("native parser rejects active aliases, invalid inactive structure and exceeded sparse limits",()=>{
  const native=process.argv[3],directory=path.resolve(process.argv[4]);fs.mkdirSync(directory,{recursive:true});
  const rule=(source,target,gain=1,cap=1)=>`<Rule source="${source}" target="${target}" gain="${gain}" cap="${cap}" />`;
  const invalid=[rule("Input","Target",0,0),rule("Input","T1")+rule("input","T2"),
    rule("I1","Target")+rule("I2","target"),rule("Human","human"),
    Array.from({length:65},(_,i)=>rule("H"+i,"T"+i)).join(""),
    Array.from({length:129},()=>rule("Input","Target",0)).join("")];
  const filename=path.join(directory,"sparse-invalid.xml");
  for(const rows of invalid){
    fs.writeFileSync(filename,'<MorphLinkProfiles schemaVersion="1"><Profile id="CLAW.Sparse.Test" family="HIMBO" version="1" sex="male" calibration="test">'+rows+'</Profile></MorphLinkProfiles>');
    const result=spawnSync(native,["matrix",filename,"CLAW.Sparse.Test"],{input:"",encoding:"utf8"});
    assert.notEqual(result.status,0,"Invalid native profile must fail before evaluation: "+rows.slice(0,120));
  }
  const matrix=base([edge(1,{source:"Input"})]);fs.writeFileSync(filename,core.exportMatrix(matrix));
  const ambiguous=spawnSync(native,["matrix",filename,matrix.id],{input:"Input\t0.5\ninput\t0.5\n",encoding:"utf8"});
  assert.notEqual(ambiguous.status,0,"Provider-alias input vectors must not overwrite each other.");
});
