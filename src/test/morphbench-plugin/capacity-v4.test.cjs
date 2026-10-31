"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{spawnSync}=require("node:child_process"),{test}=require("node:test");
const core=require("../../main/morphbench-plugin/web/core.js"),input=require("../../main/morphbench-plugin/web/input.js");
const catalog=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const base=rules=>({id:"Capacity.256",family:"HIMBO",version:"5.8",sex:"male",calibration:"functional-test",rules});
const rules=Array.from({length:256},(_,i)=>({source:"Human"+i,target:"Custom.Output",gain:1/256,cap:1}));
const human=Object.fromEntries(rules.map(r=>[r.source,.5]));
const bits=value=>{const b=Buffer.alloc(4);b.writeFloatLE(value);return b.readUInt32LE();};

test("actual shared exports size the 256-edge WASM buffers and retain the 64-target boundary",()=>{
  assert.equal(globalThis.CLAWMatrixKernel.maxRules,256);assert.equal(globalThis.CLAWMatrixKernel.maxTargets,64);
  const p=base(rules);assert.equal(core.validateMatrix(p).rules.length,256);
  assert.equal(core.evaluateMatrix(p,human).values["Custom.Output"],.5);
  assert.deepEqual(input.parseMatrixJSON(input.matrixJSON(p)),core.validateMatrix(p));
  assert.throws(()=>core.validateMatrix(base([...rules,{source:"Excess",target:"Custom.Output",gain:0,cap:1}])));
  for(const profile of catalog.profiles)assert.ok(profile.rules.length<=256);
  assert.ok(catalog.profiles.find(p=>p.family==="HIMBO").rules.length>128);
});

if(process.argv[3]&&process.argv[4])test("256 ordered edges cross the native/XML/WASM boundary bit-for-bit",()=>{
  const dir=path.resolve(process.argv[4]);fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,"capacity-256.xml");fs.writeFileSync(file,core.exportMatrix(base(rules)));
  const result=spawnSync(process.argv[3],["matrix",file,"Capacity.256"],{input:Object.entries(human).map(([n,v])=>n+"\t"+v).join("\n")+"\n",encoding:"utf8"});assert.equal(result.status,0,result.stderr);
  const actual=JSON.parse(result.stdout);assert.equal(bits(actual["Custom.Output"]),bits(core.evaluateMatrix(base(rules),human).values["Custom.Output"]));
  const invalid=core.exportMatrix(base(rules)).replace("  </Profile>",'    <Rule source="Extra" target="Custom.Output" gain="0" cap="1" />\n  </Profile>');
  fs.writeFileSync(file,invalid);assert.notEqual(spawnSync(process.argv[3],["families",file],{encoding:"utf8"}).status,0);
});

if(process.argv[3]&&process.argv[4]&&process.argv[5])test("actual retained six-input vectors match v4 native/WASM routing without soft/muscle conflation",()=>{
  const rows=JSON.parse(fs.readFileSync(process.argv[5],"utf8")).fixtures,records=[];
  for(const row of rows){
    const p=core.getProfile(catalog,row.profile),weight=Math.fround(row.weightRaw/100);
    const result=core.evaluateMatrix(p,row.bodySources,weight,row.humanTraits);
    for(const [name,value]of Object.entries(result.values))assert.equal(bits(value),bits(row.values[name]),row.fixture+":"+name);
    for(const [name,value]of Object.entries(row.values))if(!Object.hasOwn(result.values,name))assert.equal(value,0);
    records.push({fixture:row.fixture,matched:true,targets:Object.keys(result.values).length});
    if(["MHeavy","FHeavy"].includes(row.fixture)){
      assert.equal(result.values.CLAWArmBiceps,0);assert.equal(result.values.CLAWArmTriceps,0);assert.ok(result.values.CLAWArmGirth>0);
    }
    if(["MMuscular","FMuscular"].includes(row.fixture))for(const name of ["CLAWArmBiceps","CLAWArmTriceps"])assert.ok(result.values[name]>0&&result.values[name]<1);
  }
  fs.writeFileSync(path.join(path.resolve(process.argv[4]),"v4-actual-vector-conformance.json"),JSON.stringify({cases:records.length,allMatched:true,details:records},null,2)+"\n");
});
