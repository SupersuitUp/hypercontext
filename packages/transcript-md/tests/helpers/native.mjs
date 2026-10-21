// Test-only readiness and native receipts. No production callbacks or global replacements.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,lstatSync,realpathSync,readlinkSync,existsSync,appendFileSync,openSync,closeSync,readSync,fstatSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync as nativeSpawn,spawn as nativeAsync} from 'node:child_process';
const authored=new Map();
export function rememberFixture(p){if(authored.has(p))closeSync(authored.get(p));authored.set(p,openSync(p,'r'));}
export function releaseFixture(root){for(const [p,fd]of authored)if(p===root||p.startsWith(root+'/')){closeSync(fd);authored.delete(p);}}
const hash=p=>{let bytes;try{bytes=readFileSync(p);}catch(e){if(e.code!=='EACCES'||!authored.has(p))throw e;const fd=authored.get(p),actual=lstatSync(p),held=fstatSync(fd);assert.equal(actual.ino,held.ino);assert.equal(actual.dev,held.dev);bytes=Buffer.alloc(held.size);assert.equal(readSync(fd,bytes,0,bytes.length,0),bytes.length);}return createHash('sha256').update(bytes).digest('hex');};
let seq=0;
export function guard(){
 let i;try{i=JSON.parse(readFileSync(process.env.TRANSCRIPT_MD_INSPECTION,'utf8'));}catch{throw Error('INSPECTION_MISSING');}
 assert.equal(i.ready,true,'INSPECTION_MISSING');
 for(const [p,h]of Object.entries(i.physical))assert.equal(hash(p),h,'INSPECTION_STALE: '+p);
 for(const [p,t]of Object.entries(i.symlinks))assert.equal(readlinkSync(p),t,'INSPECTION_STALE_SYMLINK: '+p);
 for(const [p,d]of Object.entries(i.directories??{}))assert.deepEqual(readdirSync(p).filter(n=>!d.skip.includes(n)).sort(),d.entries,'INSPECTION_STALE_DIRECTORY: '+p);
 for(const p of i.absent??[])assert.equal(existsSync(p),false,'INSPECTION_STALE_ABSENCE: '+p);
 return i;
}
export function snapshot(){
 const owned=realpathSync(process.env.TRANSCRIPT_MD_OWNED),physical={},symlinks={};
 const walk=p=>{for(const n of readdirSync(p)){const f=join(p,n),s=lstatSync(f);if(s.isSymbolicLink())symlinks[f]=readlinkSync(f);else if(s.isDirectory())walk(f);else if(s.isFile())physical[f]=hash(f);else throw Error('SPECIAL_FIXTURE_FILE');}};walk(owned);return {physical,symlinks};
}
const record=e=>appendFileSync(process.env.TRANSCRIPT_MD_EVENTS,JSON.stringify(e)+'\n');
export function before(command,cwd){const id=`${process.pid}:${++seq}`;try{guard();const owned=realpathSync(process.env.TRANSCRIPT_MD_OWNED),rel=relative(owned,realpathSync(cwd));assert.ok(rel===''||!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../'),'FIXTURE_NOT_OWNED');record({event:'ready',id,command,cwd,...snapshot()});return id;}catch(e){record({event:'close',id,status:null,signal:null,error:e.code??e.message,stdout:'',stderr:'',readiness:'refused'});throw e;}}
export function spawnSync(cmd,args,options={}){const effective={...options,cwd:realpathSync(options.cwd??process.env.TRANSCRIPT_MD_OWNED)};const id=before([cmd,...args],effective.cwd);const r=nativeSpawn(cmd,args,effective);record({event:'close',id,status:r.status,signal:r.signal,error:r.error?.code??null,stdout:r.stdout,stderr:r.stderr});return r;}
export function execFileSync(cmd,args,options={}){const r=spawnSync(cmd,args,options);if(r.status!==0)throw Object.assign(Error(String(r.stderr)),r);return r.stdout;}
export function spawn(cmd,args,options={}){const effective={...options,cwd:realpathSync(options.cwd??process.env.TRANSCRIPT_MD_OWNED)};const id=before([cmd,...args],effective.cwd),child=nativeAsync(cmd,args,effective),out=[],err=[];record({event:'spawned',id,pid:child.pid,stdio:effective.stdio??null});child.stdout?.on('data',b=>out.push(b));child.stderr?.on('data',b=>err.push(b));child.on('close',(status,signal)=>record({event:'close',id,pid:child.pid,status,signal,stdout:Buffer.concat(out).toString(),stderr:Buffer.concat(err).toString()}));return child;}
export function endInput(child,bytes,cwd){const id=before(['stdin-end',String(child.pid),String(bytes)],cwd);child.stdin.end(bytes);record({event:'close',id,status:'input-ended',signal:null,stdout:'',stderr:''});}
export function probe(fn,args){const id=`${process.pid}:${++seq}`;try{guard();record({event:'ready-direct',id,function:fn.name,...snapshot()});const result=fn(...args);record({event:'direct-close',id,status:'returned'});return result;}catch(e){record({event:'direct-close',id,status:'threw',code:e.code??null,message:e.message});throw e;}}
