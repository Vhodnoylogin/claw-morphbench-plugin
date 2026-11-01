"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{spawnSync}=require("node:child_process"),{test}=require("node:test");
const core=require("../../main/morphbench-plugin/web/core.js"),input=require("../../main/morphbench-plugin/web/input.js");
const catalog=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const profile=catalog.profiles.find(p=>p.family==="BHUNP");
const bits=value=>{const b=Buffer.alloc(4);b.writeFloatLE(value);return b.readUInt32LE();};
const evaluate=human=>core.evaluateMatrix(profile,human,.5).values;

test("BHUNP is the independently identified Advanced Ver4 profile, with actual Low/High source names",()=>{
  assert.ok(profile);assert.equal(profile.id,"CLAW.BHUNP.3.34.AdvancedV4");
  assert.equal(profile.version,"3.34");assert.equal(profile.sex,"female");assert.equal(profile.calibration,"bhunp-v4-contract1");
  assert.equal(profile.rules.length,169);assert.equal(core.matrixTargets(profile).length,26);
  const ordinary=[...new Set(profile.rules.filter(r=>r.source&&core.sourceKind(r.source)===0).map(r=>r.source))];
  assert.equal(ordinary.length,47);assert.equal(ordinary.filter(n=>/ (Low|High)$/.test(n)).length,16);
  for(const name of ["UNP Low","UNP High","UNPB Oppai v3.2 Low","UNPB Oppai v3.2 High","Biceps","Triceps"])assert.ok(ordinary.includes(name));
  for(const alias of ["UNP","UNPB","BreastsNewSH","ArmsBiceps","TorsoChest"] )assert.ok(!ordinary.includes(alias));
  assert.deepEqual(input.parseMatrixJSON(input.matrixJSON(profile)),core.validateMatrix(profile));
});

test("raw BHUNP TRI directions preserve shrink controls and separate soft arms from biceps/triceps",()=>{
  // The measured raw OSD +1 vectors shrink these regions; BodySlide bInvert
  // applies to baking and must not invert effective RaceMenu/TRI values again.
  assert.ok(evaluate({Arms:1}).CLAWArmLean>0);assert.equal(evaluate({Arms:1}).CLAWArmGirth,0);
  assert.ok(evaluate({Arms:-1}).CLAWArmGirth>0);
  assert.ok(evaluate({Legs:1}).CLAWLegThighLean>0);assert.ok(evaluate({Legs:1}).CLAWLegCalfLean>0);
  assert.equal(evaluate({Breasts:1}).CLAWTorsoBreastSize,0);
  assert.equal(evaluate({Breasts:-1}).CLAWTorsoBreastSize,1);
  assert.equal(evaluate({}).CLAWTorsoBreastSize,Math.fround(.4));
  assert.ok(evaluate({Biceps:1}).CLAWArmBiceps>0);assert.equal(evaluate({Biceps:1}).CLAWArmTriceps,0);
  assert.ok(evaluate({Triceps:1}).CLAWArmTriceps>0);assert.equal(evaluate({Triceps:1}).CLAWArmBiceps,0);
  const fat=evaluate({ChubbyArms:1});assert.ok(fat.CLAWArmGirth>0);assert.equal(fat.CLAWArmBiceps,0);assert.equal(fat.CLAWArmTriceps,0);
  const absent=core.evaluateMatrix(profile,{},.5);assert.equal(absent.unavailableTraits.length,6);
  assert.equal(absent.values.CLAWHeadSize,0);
});

if(process.argv[3]&&process.argv[4]&&process.argv[5])test("98 measured BHUNP input cases reproduce retained and freshly evaluated native float32 outputs",()=>{
  const dir=path.resolve(process.argv[4]);fs.mkdirSync(dir,{recursive:true});
  const xml=path.join(dir,"bhunp-current-export.xml");fs.writeFileSync(xml,core.exportMatrix(profile));
  const fixtures=JSON.parse(fs.readFileSync(process.argv[5],"utf8")),records=[];
  assert.equal(Object.keys(fixtures).length,98);
  for(const [name,row]of Object.entries(fixtures)){
    const human={},traits={};for(const [key,value]of Object.entries(row.humanValues))(core.sourceKind(key)>=2?traits:human)[key]=value;
    const wasm=core.evaluateMatrix(profile,human,Math.fround(row.actorWeightRaw/100),traits).values;
    const evaluated=spawnSync(process.argv[3],["matrix",xml,profile.id,"--actor-weight-raw",String(row.actorWeightRaw)],
      {input:Object.entries(row.humanValues).map(([key,value])=>key+"\t"+value).join("\n")+"\n",encoding:"utf8"});
    assert.equal(evaluated.status,0,name+": "+evaluated.stderr);const native=JSON.parse(evaluated.stdout);
    assert.equal(Object.keys(native).length,31);
    for(const [key,value]of Object.entries(native)){
      assert.ok(Object.hasOwn(row.nativeOutputs,key));assert.equal(bits(value),bits(row.nativeOutputs[key]),name+" retained "+key);
      assert.equal(bits(value),bits(wasm[key]??0),name+" WASM "+key);
    }
    for(const key of Object.keys(wasm))assert.ok(Object.hasOwn(native,key));
    records.push({name,publicTargets:31,mappedTargets:Object.keys(wasm).length,matched:true});
  }
  fs.writeFileSync(path.join(dir,"bhunp-native-wasm-conformance.json"),JSON.stringify({cases:records.length,allMatched:true,details:records},null,2)+"\n");
});
