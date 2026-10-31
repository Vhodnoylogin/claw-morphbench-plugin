"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{spawnSync}=require("node:child_process");
const {test}=require("node:test");
const core=require("../../main/morphbench-plugin/web/core.js"),input=require("../../main/morphbench-plugin/web/input.js");
const {PreviewController}=require("../../main/morphbench-plugin/web/preview-controller.js");
const {PairState}=require("../../main/morphbench-plugin/web/pair.js");
const catalog=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const profile=(sex="male",rules=[{source:"$actor.weight",target:"Custom.Weight",gain:1,cap:1}])=>
  ({id:"CLAW.Vanilla.Test."+sex,family:"Vanilla",version:"game-weight-v1",sex,calibration:"test",rules});
const edge=extra=>({source:"$actor.weight",target:"Custom.Weight",gain:1,cap:1,...extra});

test("shared kernel classifies the reserved namespace and validates normalized actor weight",()=>{
  const k=globalThis.CLAWMatrixKernel;
  for(const name of ["Human","BodyMass","$actor","Actor.weight"])assert.equal(k.sourceKind(name),0);
  assert.equal(k.sourceKind("$actor.weight"),1);
  for(const name of ["$Actor.weight","$actor.Weight","$actor.height","$ACTOR.WEIGHT"])assert.equal(k.sourceKind(name),-1);
  for(const value of [0,.5,1])assert.equal(k.sourceValueValid(1,value),true);
  for(const value of [-.01,1.01,NaN,Infinity])assert.equal(k.sourceValueValid(1,value),false);
  assert.equal(k.sourceValueValid(0,-2),true);
});

test("actor scalar is required only by surviving edges and is never a human TRI coefficient",()=>{
  for(const sex of ["male","female"]){
    const p=profile(sex);
    assert.throws(()=>core.evaluateMatrix(p,{}),/explicit normalized actor weight/);
    for(const weight of [0,.25,.5,1])assert.equal(core.evaluateMatrix(p,{},weight).values["Custom.Weight"],Math.fround(weight));
    for(const weight of [-.01,1.01,NaN,Infinity,"0.5"])assert.throws(()=>core.evaluateMatrix(p,{},weight));
    assert.deepEqual(core.evaluateMatrix(profile(sex,[edge({gain:1e-6})]),{}).rows,[]);
    assert.deepEqual(core.evaluateMatrix(profile(sex,[]),{}).rows,[]);
  }
  for(const name of ["$actor.weight","$Actor.weight","$actor.height"]){
    assert.throws(()=>core.validateHuman({[name]:.5}),/separate actor controls/);
    for(const gain of [0,1])assert.throws(()=>core.validateMatrix(profile("male",[edge({source:name,target:"$actor.weight",gain})])));
  }
  for(const source of ["$actor.Weight","$actor.height"])
    for(const gain of [0,1])assert.throws(()=>core.validateMatrix(profile("male",[edge({source,gain})])),/reserved actor/);
});

test("mixed matrices share the evaluator without multiplying observed human coefficients by weight",()=>{
  const p={...profile(),family:"HIMBO",rules:[edge(),{source:"Human",target:"Custom.Human",gain:.5,cap:1},
    {source:"",target:"Custom.Constant",gain:1,cap:1,function:"constant",value:.2}]};
  for(const weight of [0,.2,1]){
    const result=core.evaluateMatrix(p,{Human:.75,HumanUnmapped:-.3},weight);
    assert.equal(result.values["Custom.Human"],.375);
    assert.equal(result.values["Custom.Constant"],Math.fround(.2));
    assert.equal(result.values["Custom.Weight"],Math.fround(weight));
    assert.deepEqual(result.unmapped,["HumanUnmapped"]);
  }
  const fixed=profile("female",[{source:"",target:"Custom.Constant",gain:1,cap:1,function:"constant",value:.4}]);
  assert.equal(core.evaluateMatrix(fixed,{}).values["Custom.Constant"],Math.fround(.4));
  const parsed=input.parseJSON(JSON.stringify({humanValues:{Human:.5},actorWeight:.3}));
  assert.equal(parsed.actorWeight,Math.fround(.3));assert.deepEqual({...parsed.values},{Human:.5});
  assert.throws(()=>input.parseJSON('{"humanValues":{},"actorWeight":2}'));
});

test("a model's literal reserved control cannot become a scalar write or satisfy an ordinary source binding",()=>{
  const scalar=profile(),bindings={human:{id:"human",revision:"1",view:"human",sex:"male"},wolf:{id:"wolf",revision:"1",view:"wolf",sex:"male"}};
  const snapshots={human:{binding:bindings.human,names:["$actor.weight"]},wolf:{binding:bindings.wolf,names:["Custom.Weight","Custom.Human"]}};
  const make=p=>{const state=new PairState({schemaVersion:1,profiles:[p]});state.bind(p.id,bindings);return state;};
  const state=make(scalar);state.arm(snapshots);
  const operation=state.plan({},null,.5);assert.deepEqual({...operation.values.human},{});
  assert.equal(operation.values.wolf["Custom.Weight"],.5);
  const mixed=profile("male",[edge(),{source:"Human",target:"Custom.Human",gain:1,cap:1}]);
  assert.throws(()=>make(mixed).arm(snapshots),/no configured source morphs/);
});

test("the production XML builder validates inactive reserved identifiers through WASM before pruning",()=>{
  const builder=path.resolve(__dirname,"../../main/morphbench-plugin/build.py"),bridge=path.join(path.dirname(path.resolve(process.argv[2])),"matrix-kernel.js");
  const code="import importlib.util,sys;from pathlib import Path;s=importlib.util.spec_from_file_location('builder',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);c=m.catalog_with_shared_validation(sys.stdin.buffer.read(),Path(sys.argv[2]));assert c['profiles'][0]['rules']==[]";
  const xml=rule=>'<MorphLinkProfiles schemaVersion="1"><Profile id="Raw" family="Vanilla" version="game-weight-v1" sex="male" calibration="test"><Rule '+rule+' /></Profile></MorphLinkProfiles>';
  for(const rule of ['source="$actor.height" target="Wolf" gain="0" cap="1"','source="$Actor.weight" target="Wolf" gain="1e-6" cap="1"','source="Human" target="$actor.weight" gain="0" cap="1"','source="Human" target="$Actor.weight" gain="-1e-6" cap="1"']){
    const result=spawnSync("python",["-c",code,builder,bridge],{input:xml(rule),encoding:"utf8"});assert.notEqual(result.status,0,result.stdout);assert.match(result.stderr,/Shared-kernel catalog validation failed/);
  }
  const ordinary=spawnSync("python",["-c",code,builder,bridge],{input:xml('source="Human" target="Wolf" gain="1e-6" cap="1"'),encoding:"utf8"});assert.equal(ordinary.status,0,ordinary.stderr);
});

test("canonical vanilla matrices have distinct sex identities and every game export selects exactly two profiles",()=>{
  for(const p of catalog.profiles){
    assert.ok(p.rules.some(r=>r.source==="$actor.weight"));
    assert.throws(()=>core.evaluateMatrix(p,{}),/explicit normalized actor weight/);
  }
  for(const sex of ["male","female"]){
    const p=catalog.profiles.find(p=>p.family==="Vanilla"&&p.sex===sex);
    assert.ok(p);assert.equal(p.id,"CLAW.Vanilla"+(sex==="male"?"Male":"Female")+".Weight1");
    assert.equal(p.version,"game-weight-v1");assert.ok(p.rules.some(r=>r.source==="$actor.weight"));
  }
  for(const male of ["HIMBO","Vanilla"])for(const female of ["CBBE","3BA","Vanilla"]){
    for(const sex of ["male","female"]){
      const edited=catalog.profiles.find(p=>p.family===(sex==="male"?male:female)&&p.sex===sex);
      const xml=core.exportCatalog(catalog,edited,female,male);
      assert.equal((xml.match(/<Profile /g)||[]).length,2);
      for(const selected of [catalog.profiles.find(p=>p.family===male&&p.sex==="male"),catalog.profiles.find(p=>p.family===female&&p.sex==="female")])assert.ok(xml.includes('id="'+selected.id+'"'));
      assert.deepEqual(input.parseMatrixJSON(input.matrixJSON(edited),edited),core.validateMatrix(edited));
    }
  }
  const male=catalog.profiles.find(p=>p.family==="Vanilla"&&p.sex==="male");
  assert.throws(()=>core.exportCatalog(catalog,male,"3BA","HIMBO"),/edited male family/);
});

test("zero-TRI vanilla pairs apply only wolf outputs and clean prior custom outputs",async()=>{
  const p=profile(),local={schemaVersion:1,profiles:[p]},calls=[],previews=new Map();let serial=0;
  const sdk={connect:async()=>({apiVersion:1,capabilities:PreviewController.requiredCapabilities}),request:async(method,params)=>{
    calls.push({method,params});
    if(method==="models.list")return{entries:[{name:"human.nif"},{name:"wolf.nif"}]};
    if(method==="previews.create"){const preview="weight:"+(++serial),human=params.name==="human.nif";previews.set(preview,{names:human?[]:["Custom.Weight","Unowned"],values:human?{}:{Unowned:.4}});return{preview,name:params.name};}
    if(method==="previews.link")return params;
    const item=previews.get(params.preview);assert.ok(item);
    if(method==="previews.close"){previews.delete(params.preview);return{closed:true};}
    if(method==="previews.scene.get")return{open:true,names:{nif:"fixed.nif"}};
    if(method==="previews.morphs.set"){for(const name of Object.keys(params.values))assert.ok(item.names.includes(name));Object.assign(item.values,params.values);}
    return{names:item.names,values:{...item.values}};
  }};
  const c=new PreviewController(sdk,local);await c.open(p.id,"human.nif","wolf.nif");
  const result=await c.apply({},null,.75);assert.equal(result.actorWeight,.75);
  assert.deepEqual(result.humanValues,{});assert.equal(result.wolfValues["Custom.Weight"],.75);
  const writes=calls.filter(c=>c.method==="previews.morphs.set");assert.equal(writes.length,1);
  assert.equal(writes[0].params.preview,"weight:2");assert.ok(!Object.hasOwn(writes[0].params.values,"$actor.weight"));
  const count=calls.length;await assert.rejects(c.apply({}),/explicit normalized actor weight/);assert.equal(calls.length,count);
  await c.apply({},profile("male",[]));assert.equal(previews.get("weight:2").values["Custom.Weight"],0);
  assert.equal(previews.get("weight:2").values.Unowned,.4);await c.close();
});

if(process.argv[3]&&process.argv[4])test("native and WASM agree for vanilla/mixed functions, both sexes and missing/invalid scalar rejection",()=>{
  const native=process.argv[3],dir=path.resolve(process.argv[4]);fs.mkdirSync(dir,{recursive:true});const records=[];
  const check=(p,human,weight)=>{
    const file=path.join(dir,p.id+".xml");fs.writeFileSync(file,core.exportMatrix(p));
    const text=Object.entries({...human,...(weight===undefined?{}:{"$actor.weight":weight})}).map(([n,v])=>n+"\t"+v).join("\n")+"\n";
    const actual=spawnSync(native,["matrix",file,p.id],{input:text,encoding:"utf8"});assert.equal(actual.status,0,actual.stderr);
    const expected=core.evaluateMatrix(p,human,weight).values,observed=JSON.parse(actual.stdout);
    for(const [name,value]of Object.entries(expected))assert.equal(Math.fround(observed[name]),value,name);
    for(const [name,value]of Object.entries(observed))if(!Object.hasOwn(expected,name))assert.equal(value,0);
    records.push({profile:p.id,weight,matched:true});
  };
  for(const p of catalog.profiles)for(const weight of [0,.125,.5,.875,1])check(p,{},weight);
  for(const fn of ["linear","positive","negative","smoothstep","power","constant"]){
    const rule=fn==="constant"?edge({source:"",function:fn,value:.37}):edge({function:fn,...(fn==="power"?{exponent:3}:{})});
    for(const weight of [0,.3,1])check(profile("male",[rule,{source:"Human",target:"Custom.Human",gain:.4,cap:1}]),{Human:.5},weight);
  }
  const p=profile(),file=path.join(dir,"missing.xml");fs.writeFileSync(file,core.exportMatrix(p));
  for(const text of ["","$actor.weight\t-0.1\n","$actor.weight\t1.1\n","$Actor.weight\t0.5\n"])
    assert.notEqual(spawnSync(native,["matrix",file,p.id],{input:text,encoding:"utf8"}).status,0);
  fs.writeFileSync(path.join(dir,"weight-conformance.json"),JSON.stringify({cases:records.length,allMatched:true,details:records},null,2)+"\n");
});

if(process.argv[3]&&process.argv[4])test("native configuration parser accepts every independent male/female installation choice",()=>{
  const native=process.argv[3],dir=path.resolve(process.argv[4]);fs.mkdirSync(dir,{recursive:true});
  for(const male of ["HIMBO","Vanilla"])for(const female of ["CBBE","3BA","Vanilla"]){
    const selected=[catalog.profiles.find(p=>p.family===male&&p.sex==="male"),catalog.profiles.find(p=>p.family===female&&p.sex==="female")];
    const file=path.join(dir,"installed-"+male+"-"+female+".xml");fs.writeFileSync(file,core.exportCatalog(catalog,selected[0],female,male));
    const families=spawnSync(native,["families",file],{encoding:"utf8"});assert.equal(families.status,0,families.stderr);
    const parsed=JSON.parse(families.stdout);assert.equal(parsed.profiles.length,2);
    assert.equal(parsed.defaults.male,selected[0].id);assert.equal(parsed.defaults.female,selected[1].id);
    for(const p of selected){
      const result=spawnSync(native,["matrix",file,p.id],{input:"$actor.weight\t0.375\n",encoding:"utf8"});assert.equal(result.status,0,result.stderr);
      const observed=JSON.parse(result.stdout),expected=core.evaluateMatrix(p,{},.375).values;
      for(const [name,value]of Object.entries(expected))assert.equal(Math.fround(observed[name]),value,name);
    }
  }
});
