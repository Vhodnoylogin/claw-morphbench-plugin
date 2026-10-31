"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{spawnSync}=require("node:child_process");
const {test}=require("node:test");
const core=require("../../main/morphbench-plugin/web/core.js"),input=require("../../main/morphbench-plugin/web/input.js");
const {PreviewController}=require("../../main/morphbench-plugin/web/preview-controller.js");
const catalog=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const face=["$human.face.noseLength","$human.face.jawWidth","$human.face.jawForward","$human.face.chinWidth","$human.face.chinForward"];
const traits={"$human.height":1.125,...Object.fromEntries(face.map((name,index)=>[name,Math.fround((index-2)*.2)]))};
const profile=(sex="male")=>catalog.profiles.find(p=>p.family==="Vanilla"&&p.sex===sex);
const bits=value=>{const data=Buffer.alloc(4);data.writeFloatLE(value);return data.readUInt32LE();};

test("shared source classification and neutrals distinguish real FaceGen/stature inputs from body TRI controls",()=>{
  const k=globalThis.CLAWMatrixKernel;
  for(const name of face)assert.equal(k.sourceKind(name),2);
  assert.equal(k.sourceKind("$human.height"),3);
  assert.equal(k.sourceNeutral(2),0);assert.equal(k.sourceNeutral(3),1);
  for(const name of ["$HUMAN.height","$human.Height","$human.face.earSize","$human.face.noselength","$human."]){
    assert.equal(k.sourceKind(name),-1);
    assert.throws(()=>core.validateTraits({[name]:0}));
  }
  for(const name of [...face,"$human.height"]){
    assert.throws(()=>core.validateHuman({[name]:.5}),/separate actor controls/);
    assert.throws(()=>input.fromRows("Wrong","Body",[{name,size:"small",value:"50"}]),/separate actor controls/);
  }
  for(const values of [{"$human.height":0},{"$human.height":-1},{"$human.height":Infinity},
    {[face[0]]:Math.fround(3.4028234663852886e38)},{[face[0]]:NaN},{"$actor.weight":.5},{RealBodyMorph:.5}])assert.throws(()=>core.validateTraits(values));
  assert.equal(core.validateTraits({[face[0]]:-.5})[face[0]],-.5);
});

test("missing traits remain unavailable while explicit neutral zeros/height1 have availability",()=>{
  for(const p of catalog.profiles){
    const missing=core.evaluateMatrix(p,{},.5),neutral={"$human.height":1,...Object.fromEntries(face.map(name=>[name,0]))};
    const available=core.evaluateMatrix(p,{},.5,neutral);
    assert.equal(missing.unavailableTraits.length,6);assert.equal(Object.keys(missing.humanTraits).length,0);
    assert.deepEqual(available.unavailableTraits,[]);assert.deepEqual(available.values,missing.values);
    const head=core.evaluateMatrix(p,{},.5,traits);
    assert.deepEqual(head.unavailableTraits,[]);
    assert.equal(head.values.CLAWHeadSize,.1875);
    assert.equal(core.evaluateMatrix(p,{},.5,{"$human.height":1.125}).values.CLAWHeadEarSize,.1875);
    assert.ok(head.values.CLAWHeadEarSize>=.1875); // Explicit face-breadth edges may add to stature.
    assert.equal(head.values.CLAWTailLength,.25);assert.equal(head.values.CLAWArmClawLong,.15625);
  }
});

test("JSON fixture envelopes preserve typed human traits separately from human body morphs",()=>{
  const parsed=input.parseJSON(JSON.stringify({humanValues:{ActualBody:-.2},actorWeight:.5,humanTraits:traits}));
  assert.equal(parsed.values.ActualBody,Math.fround(-.2));assert.deepEqual({...parsed.humanTraits},traits);
  const absent=input.parseJSON('{"humanValues":{},"actorWeight":0.5}');assert.deepEqual(absent.humanTraits,{});
  assert.throws(()=>input.parseJSON('{"humanValues":{"$human.height":1},"humanTraits":{}}'));
});

test("reserved human source/target semantics are checked even for omitted edges",()=>{
  for(const source of ["$human.face.unknown","$human.Height"])
    for(const gain of [0,1])assert.throws(()=>core.validateMatrix({...profile(),rules:[{source,target:"Wolf",gain,cap:1}]}));
  for(const target of face.concat("$human.height"))
    for(const gain of [0,1])assert.throws(()=>core.validateMatrix({...profile(),rules:[{source:"RealBody",target,gain,cap:1}]}));
});

test("zero-TRI human models never receive face/stature special writes, even when the host lists those names",async()=>{
  for(const humanNames of [[],["$actor.weight",...face,"$human.height"]]){
    const p=profile(),calls=[],previews=new Map();let serial=0;
    const sdk={connect:async()=>({apiVersion:1,capabilities:PreviewController.requiredCapabilities}),request:async(method,params)=>{
      calls.push({method,params});
      if(method==="models.list")return{entries:[{name:"human.nif"},{name:"wolf.nif"}]};
      if(method==="previews.create"){const preview="human-trait:"+(++serial);previews.set(preview,{names:params.name==="human.nif"?humanNames:core.matrixTargets(p),values:{}});return{preview,name:params.name};}
      if(method==="previews.link")return params;
      const item=previews.get(params.preview);assert.ok(item);
      if(method==="previews.close"){previews.delete(params.preview);return{closed:true};}
      if(method==="previews.scene.get")return{open:true,names:{nif:"fixed.nif"}};
      if(method==="previews.morphs.set")Object.assign(item.values,params.values);
      return{names:item.names,values:{...item.values}};
    }};
    const c=new PreviewController(sdk,catalog);await c.open(p.id,"human.nif","wolf.nif");
    const result=await c.apply({},null,.5,traits);
    assert.deepEqual(result.humanValues,{});assert.deepEqual(result.humanTraits,traits);assert.deepEqual(result.unavailableTraits,[]);
    assert.equal(result.wolfValues.CLAWTailLength,.25);
    const writes=calls.filter(call=>call.method==="previews.morphs.set");assert.equal(writes.length,1);assert.equal(writes[0].params.preview,"human-trait:2");
    assert.ok(Object.keys(writes[0].params.values).every(name=>core.sourceKind(name)===0));
    const before=calls.length;await assert.rejects(c.apply({},null,.5,{"$human.height":0}));assert.equal(calls.length,before);
    const missing=await c.apply({},null,.5,{});assert.equal(missing.wolfValues.CLAWTailLength,0);assert.equal(missing.unavailableTraits.length,6);
    await c.close();
  }
});

if(process.argv[3]&&process.argv[4])test("native and WASM bit parity for each family, both sexes, missing channels and signed face functions",()=>{
  const native=process.argv[3],dir=path.resolve(process.argv[4]);fs.mkdirSync(dir,{recursive:true});const records=[];
  const check=(p,human,weight,values,label)=>{
    const file=path.join(dir,p.id+".xml");fs.writeFileSync(file,core.exportMatrix(p));
    const text=Object.entries({...human,"$actor.weight":weight,...values}).map(([name,value])=>name+"\t"+Math.fround(value)).join("\n")+"\n";
    const observed=spawnSync(native,["matrix",file,p.id],{input:text,encoding:"utf8"});assert.equal(observed.status,0,observed.stderr);
    const result=core.evaluateMatrix(p,human,weight,values),actual=JSON.parse(observed.stdout);
    for(const [target,value]of Object.entries(result.values))assert.equal(bits(actual[target]),bits(value),label+":"+target);
    for(const [target,value]of Object.entries(actual))if(!Object.hasOwn(result.values,target))assert.equal(value,0);
    records.push({profile:p.id,label,unavailableTraits:result.unavailableTraits,matched:true});
  };
  for(const p of catalog.profiles)for(const [label,values]of Object.entries({missing:{},real:traits,neutral:{"$human.height":1,...Object.fromEntries(face.map(name=>[name,0]))},short:{"$human.height":.9},tall:{"$human.height":1.2}}))check(p,{},.5,values,label);
  for(const fn of ["linear","positive","negative","smoothstep","power"]){
    const p={...profile(),id:"Face.Function."+fn,rules:[{source:face[0],target:"Custom.Head",gain:.7,cap:.8,function:fn,...(fn==="power"?{exponent:3}:{})}]};
    for(const value of [-1,-.3,0,.3,1])check(p,{},.5,{[face[0]]:value},fn+":"+value);
  }
  fs.writeFileSync(path.join(dir,"human-traits-conformance.json"),JSON.stringify({cases:records.length,allMatched:true,details:records},null,2)+"\n");
});
