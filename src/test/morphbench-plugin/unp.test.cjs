"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{spawnSync}=require("node:child_process"),{test}=require("node:test");
const core=require("../../main/morphbench-plugin/web/core.js"),input=require("../../main/morphbench-plugin/web/input.js");
const catalog=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const unp=catalog.profiles.find(profile=>profile.family==="UNP");
const vanilla=catalog.profiles.find(profile=>profile.family==="Vanilla"&&profile.sex==="female");
const traits={"$human.face.noseLength":.4,"$human.face.jawWidth":.2,"$human.face.jawForward":-.3,
  "$human.face.chinWidth":.1,"$human.face.chinForward":-.2,"$human.height":1.125};
const observations={missing:{},neutral:{...Object.fromEntries(Object.keys(traits).map(name=>[name,name==="$human.height"?1:0]))},
  captured:traits,short:{"$human.height":.9},tall:{"$human.height":1.2}};
const bits=value=>{const buffer=Buffer.alloc(4);buffer.writeFloatLE(value);return buffer.readUInt32LE();};

test("classic UNP Renewal 4.6 is a separate female weight/trait profile with no invented body sources",()=>{
  assert.ok(unp);assert.equal(unp.id,"CLAW.UNP.4.6.Weight1");assert.equal(unp.version,"4.6");assert.equal(unp.sex,"female");
  assert.equal(unp.calibration,"vanilla-female-weight-contract1");assert.equal(unp.rules.length,41);
  assert.deepEqual(unp.rules,vanilla.rules);
  assert.ok(unp.rules.every(rule=>!rule.source||core.sourceKind(rule.source)>0));
  assert.throws(()=>core.validateMatrix({...unp,sex:"male"}),/profile metadata/);
  assert.throws(()=>core.evaluateMatrix(unp,{}),/explicit normalized actor weight/);
  for(const weight of [0,.125,.5,.875,1])for(const values of Object.values(observations)){
    const actual=core.evaluateMatrix(unp,{},weight,values),reference=core.evaluateMatrix(vanilla,{},weight,values);
    assert.deepEqual(actual.values,reference.values);assert.deepEqual(actual.unavailableTraits,reference.unavailableTraits);
  }
});

test("UNP matrix JSON preserves custom generic edits and rejects another family or sex",()=>{
  const edited={...unp,rules:[{source:"Author.Human",target:"Author.Wolf",gain:.5,cap:.75,function:"power",exponent:3},
    {source:"",target:"Author.Wolf",gain:.25,cap:.75,function:"constant",value:.2}]};
  const encoded=input.matrixJSON(edited),parsed=input.parseMatrix(encoded,unp);
  assert.deepEqual(parsed,core.validateMatrix(edited));
  assert.throws(()=>input.parseMatrix(encoded,vanilla),/resource family\/version/);
  assert.throws(()=>input.parseMatrix(encoded,{...unp,sex:"male"}),/resource family\/version/);
  const xml=core.exportMatrix(parsed);assert.match(xml,/family="UNP" version="4.6" sex="female"/);
  assert.match(xml,/source="Author.Human" target="Author.Wolf"/);assert.match(xml,/function="power" exponent="3"/);
  for(const male of ["HIMBO","Vanilla"]){
    const game=core.exportCatalog(catalog,parsed,"UNP",male);
    assert.equal((game.match(/<Profile /g)||[]).length,2);assert.ok(game.includes('female="'+unp.id+'"'));
    assert.ok(game.includes('target="Author.Wolf"'));assert.ok(!game.includes('family="BHUNP"'));
  }
  assert.throws(()=>core.exportCatalog(catalog,parsed,"BHUNP"),/edited female family/);
});

if(process.argv[3]&&process.argv[4])test("UNP native XML roundtrip matches shared WASM across weights, traits and independent male selections",()=>{
  const native=process.argv[3],dir=path.resolve(process.argv[4]);fs.mkdirSync(dir,{recursive:true});
  const standalone=path.join(dir,"unp-standalone.xml");fs.writeFileSync(standalone,core.exportMatrix(unp));
  const records=[];
  for(const weight of [0,.125,.5,.875,1])for(const [label,values]of Object.entries(observations)){
    const text=Object.entries({"$actor.weight":weight,...values}).map(([name,value])=>name+"\t"+Math.fround(value)).join("\n")+"\n";
    const run=spawnSync(native,["matrix",standalone,unp.id],{input:text,encoding:"utf8"});assert.equal(run.status,0,run.stderr);
    const actual=JSON.parse(run.stdout),expected=core.evaluateMatrix(unp,{},weight,values).values;
    for(const [name,value]of Object.entries(expected))assert.equal(bits(actual[name]),bits(value),weight+":"+label+":"+name);
    for(const [name,value]of Object.entries(actual))if(!Object.hasOwn(expected,name))assert.equal(value,0);
    records.push({weight,traits:label,targets:Object.keys(expected).length,matched:true});
  }
  for(const male of ["HIMBO","Vanilla"]){
    const file=path.join(dir,"installed-"+male+"-UNP.xml");fs.writeFileSync(file,core.exportCatalog(catalog,unp,"UNP",male));
    const run=spawnSync(native,["families",file],{encoding:"utf8"});assert.equal(run.status,0,run.stderr);
    const parsed=JSON.parse(run.stdout);assert.equal(parsed.profiles.length,2);assert.equal(parsed.defaults.female,unp.id);
    assert.equal(parsed.defaults.male,catalog.profiles.find(profile=>profile.family===male&&profile.sex==="male").id);
  }
  fs.writeFileSync(path.join(dir,"unp-native-wasm-conformance.json"),JSON.stringify({cases:records.length,allMatched:true,details:records},null,2)+"\n");
});

if(process.argv[5])test("adding UNP leaves the six previous profiles and compiled shared kernel unchanged",()=>{
  const previous=JSON.parse(fs.readFileSync(process.argv[5],"utf8"));
  assert.equal(previous.profiles.length,6);assert.equal(catalog.profiles.length,7);
  for(const profile of previous.profiles)assert.deepEqual(catalog.profiles.find(candidate=>candidate.id===profile.id),profile,profile.id);
  assert.deepEqual(catalog.sharedKernel,previous.sharedKernel);
});
