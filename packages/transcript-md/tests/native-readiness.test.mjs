import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync,writeFileSync,mkdtempSync,realpathSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {guard,spawnSync,spawn} from './helpers/native.mjs';

const events=()=>readFileSync(process.env.TRANSCRIPT_MD_EVENTS,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
const owned=()=>realpathSync(process.env.TRANSCRIPT_MD_OWNED);
for(const async of [false,true])test(`${async?'async':'sync'} omitted cwd executes in the same owned directory its receipt attests`,async()=>{
 const marker=async?'async-cwd':'sync-cwd',code=`console.log(JSON.stringify({cwd:process.cwd(),marker:${JSON.stringify(marker)}}))`;
 let stdout;
 if(async){const child=spawn(process.execPath,['-e',code],{stdio:['ignore','pipe','pipe']});const [status,signal]=await once(child,'close');assert.equal(status,0);assert.equal(signal,null);stdout=events().findLast(e=>e.event==='close'&&e.pid===child.pid).stdout;}
 else{const r=spawnSync(process.execPath,['-e',code],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);stdout=r.stdout;}
 const ready=events().findLast(e=>e.event==='ready'&&e.command.includes(code));
 assert.equal(JSON.parse(stdout).cwd,owned());assert.equal(ready.cwd,JSON.parse(stdout).cwd);
});

for(const readiness of ['missing','stale'])test(`caller-root package boundary refuses ${readiness} inspection on its actual reader path`,()=>{
 guard();const dir=mkdtempSync(join(owned(),'boundary-refusal-')),original=process.env.TRANSCRIPT_MD_INSPECTION,pin=join(dir,'pin'),inspection=join(dir,'inspection.json');
 if(readiness==='stale'){writeFileSync(pin,'original');const i=JSON.parse(readFileSync(original));i.physical[pin]=createHash('sha256').update('original').digest('hex');writeFileSync(inspection,JSON.stringify(i));writeFileSync(pin,'changed');}
 const testPath=fileURLToPath(new URL('./package-boundary.test.mjs',import.meta.url));
 // A separate native runner must not inherit node:test's recursive-child selector.
 const {NODE_TEST_CONTEXT,...environment}=process.env;
 const result=spawnSync(process.execPath,['--test','--test-name-pattern=caller roots have no HOME',testPath],{cwd:dir,encoding:'utf8',env:{...environment,TRANSCRIPT_MD_INSPECTION:inspection}});
 assert.notEqual(result.status,0,'The actual reader path must refuse before returning a result');assert.match(result.stdout+result.stderr,new RegExp(readiness==='missing'?'INSPECTION_MISSING':'INSPECTION_STALE'));
});

test('sync and async native calls refuse missing or stale inspection before child writes',()=>{
 guard();const dir=mkdtempSync(join(owned(),'native-refusal-')),original=process.env.TRANSCRIPT_MD_INSPECTION,pin=join(dir,'pin'),inspection=join(dir,'inspection.json'),effect=join(dir,'escaped-write');
 const code=`require('node:fs').writeFileSync(${JSON.stringify(effect)},'unexpected')`;
 try{
  process.env.TRANSCRIPT_MD_INSPECTION=inspection;
  for(const run of [spawnSync,spawn])assert.throws(()=>run(process.execPath,['-e',code]),/INSPECTION_MISSING/);
  writeFileSync(pin,'original');const i=JSON.parse(readFileSync(original));i.physical[pin]=createHash('sha256').update('original').digest('hex');writeFileSync(inspection,JSON.stringify(i));writeFileSync(pin,'changed');
  for(const run of [spawnSync,spawn])assert.throws(()=>run(process.execPath,['-e',code]),/INSPECTION_STALE/);
  assert.equal(existsSync(effect),false);
 }finally{process.env.TRANSCRIPT_MD_INSPECTION=original;}
});
