import {test} from 'node:test'; import assert from 'node:assert/strict';
import {fixture,header,emptyBody} from './helpers/conversation-fixture.mjs';
import {createConversation as nativeCreate} from './helpers/guarded-freedom-conversation-write.mjs';
test('creation is idempotent only for identical content',()=>{
 const f=fixture();test.after(()=>f.close()); const spec={header:header(),body:emptyBody,assets:[],annotations:null};
 const first=createConversation({root:f.root,spec,pid:process.pid,by:'test'});
 assert.equal(first.path,f.entry());
 assert.equal(createConversation({root:f.root,spec,pid:process.pid,by:'test'}).created,false);
 assert.throws(()=>createConversation({root:f.root,spec:{...spec,header:header({title:'different'})},pid:process.pid,by:'test'}),/collision/i);
});

import {readFileSync,existsSync,readdirSync,symlinkSync,mkdirSync,writeFileSync,realpathSync,chmodSync,unlinkSync,linkSync} from 'node:fs';
import {join,dirname,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from './helpers/native.mjs';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {capture,locator,evidence,participant,bytes} from './helpers/conversation-fixture.mjs';
import {annotateConversation as nativeAnnotate,assertConversationProjection,recoverConversationRevision as nativeRecover} from './helpers/guarded-freedom-conversation-write.mjs';
import {withConversationLock as nativeLock,conversationLockContext} from './helpers/guarded-freedom-conversation-lock.mjs';
import {readConversation,parseConversation,listConversations} from './helpers/guarded-freedom-conversations.mjs';
import {citeConversation} from './helpers/guarded-freedom-conversation-citations.mjs';
import {stateDir} from './helpers/guarded-freedom-workspace.mjs';
import {tmpdir} from 'node:os';
import {MIGRATE_LOCK} from './helpers/guarded-freedom-migrate-common.mjs';
// All native mutations, including preexisting cases in this affected suite,
// establish an owned external home and prove their actual Git/lock/state paths.
function ownedMutation(options, run) {
 const owned=realpathSync(tmpdir()),keys=['FREEDOM_HOME','FREEDOM_WORKSPACE','GIT_DIR','GIT_WORK_TREE','GIT_COMMON_DIR'];
 let root=options.root;
 if(!root){root=dirname(options.file);while(!existsSync(join(root,'.freedom.json'))&&dirname(root)!==root)root=dirname(root);}
 const prior=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 process.env.FREEDOM_HOME=join(root,'test-home');for(const key of keys.slice(1))delete process.env[key];
 try {
  const c=conversationLockContext(root);
  for(const path of [c.root,c.transcripts,c.gitCommonDir,c.lockPath,c.journalDir,options.file,
    options.file&&join(dirname(options.file),'annotations.md'),process.env.FREEDOM_HOME,
    stateDir(MIGRATE_LOCK,root),join(stateDir(MIGRATE_LOCK,root),'.lock'),join(root,'board-state')].filter(Boolean)) {
   const rel=relative(owned,path);assert.ok(rel!==''&&!rel.startsWith('..'+sep)&&rel!=='..'&&!rel.startsWith(sep),path);
  }
  return run();
 }finally{for(const key of keys)if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}
}
const createConversation=options=>ownedMutation(options,()=>nativeCreate(options));
const annotateConversation=options=>ownedMutation(options,()=>nativeAnnotate(options));
const recoverConversationRevision=options=>ownedMutation(options,()=>nativeRecover(options));
const withConversationLock=(root,options,fn)=>ownedMutation({root},()=>nativeLock(root,options,fn));
const hash=b=>createHash('sha256').update(b).digest('hex');
const source= new URL('../lib/freedom-conversations-cli.mjs',import.meta.url).pathname;
const own=f=>{test.after(()=>f.close());return f;};
const create=(f,patch={},options={})=>createConversation({root:f.root,spec:{header:header(),body:emptyBody,assets:[],annotations:null,...patch},pid:process.pid,by:'test',...options});
const cli=(f,args)=>ownedMutation({root:f.root},()=>execFileSync(process.execPath,[source,...args],{cwd:f.root,env:{...process.env,FREEDOM_HOME:join(f.root,'test-home'),FREEDOM_WORKSPACE:undefined,GIT_DIR:undefined,GIT_WORK_TREE:undefined,GIT_COMMON_DIR:undefined},encoding:'utf8'}));
const body='\n## Now\n\n## Transcript\n\n### t-000001\n<!-- turn {"speaker":null,"sources":[],"timing":null,"source_gap":"Unavailable."} -->\nExact λ words.\r\n\r\n## Log\n\n## Open questions\n';
const log={date:'2026-10-03',text:'Synthetic interpretation.',evidence:[evidence()]};
const annotation=(citations=[])=>({markdown:'Interpretation only.\n',citations,processing:'processed',log});

test('missing audience and unsafe assets refuse without creating record or journal',()=>{
 for(const bad of [null,undefined]){const f=own(fixture());const h=header({audience:bad});assert.throws(()=>create(f,{header:h}));assert.equal(existsSync(f.entry()),false);}
 for(const rel of ['../outside','/outside','sources/c-001/../bad','sources/c-001/','sources/c-001/.bad','unnamed']){
  const f=own(fixture());const from=f.put('input','original');assert.throws(()=>create(f,{assets:[{relativePath:rel,fromPath:from,sha256:hash('original')}]}));assert.equal(existsSync(f.entry()),false);
 }
});
test('verified asset copy retains original and never invents backup',()=>{
 const f=own(fixture());const from=f.put('input','source bytes');const sha256=hash('source bytes');
 const l=locator({kind:'bundled',path:'sources/c-001/audio.bin',service_id:null,sha256,bytes:12});
 const h=header({sources:[capture({locators:[l]})]});
 create(f,{header:h,assets:[{relativePath:l.path,fromPath:from,sha256}]});
 assert.equal(readFileSync(from,'utf8'),'source bytes');assert.equal(readFileSync(join(dirname(f.entry()),l.path),'utf8'),'source bytes');
 assert.equal(readConversation(f.entry()).header.sources[0].locators[0].backup.status,'unverified');
 const g=own(fixture());assert.throws(()=>create(g,{header:h,assets:[{relativePath:l.path,fromPath:from,sha256:'0'.repeat(64)}]}),/ASSET_HASH_MISMATCH/);assert.equal(existsSync(g.entry()),false);
});
test('bundled input/output symlinks and unproven backup fail closed',()=>{
 const f=own(fixture());const original=f.put('real','exact');const link=join(f.root,'link');symlinkSync(original,link);
 const l=locator({kind:'bundled',path:'sources/c-001/file.bin',service_id:null,sha256:hash('exact'),bytes:5});
 const h=header({sources:[capture({locators:[l]})]});
 assert.throws(()=>create(f,{header:h,assets:[{relativePath:l.path,fromPath:link,sha256:hash('exact')}]}),/SYMLINK/);
 const g=own(fixture());mkdirSync(join(g.root,g.rel,'example-call'));symlinkSync(f.root,join(g.root,g.rel,'example-call','sources'));
 assert.throws(()=>create(g,{header:h,assets:[{relativePath:l.path,fromPath:original,sha256:hash('exact')}]}));
 const backup={status:'verified-owned',locator:join(f.root,'missing-backup'),sha256:l.sha256,verified_at:'2026-10-03T00:00:00Z'};
 const b=own(fixture());assert.throws(()=>create(b,{header:header({sources:[capture({locators:[{...l,backup}]})]}),assets:[{relativePath:l.path,fromPath:original,sha256:l.sha256}]}),/BACKUP_UNPROVEN/);
});
test('same capture different id collides and different service same id is distinct',()=>{
 const f=own(fixture());create(f,{header:header({sources:[capture()]})});
 assert.throws(()=>create(f,{header:header({id:'second-call',sources:[capture()]})}),/CAPTURE_IDENTITY_COLLISION/);
 create(f,{header:header({id:'other-service',sources:[capture({service:'meet'})]})});assert.equal(listConversations(f.root).records.length,2);
});
test('annotation pins entry and preserves speech and review dimensions',()=>{
 const f=own(fixture());create(f,{body});const before=readConversation(f.entry());const c=citeConversation(before,{turnIds:['t-000001']});
 const result=annotateConversation({file:f.entry(),spec:annotation([c]),expectedSha:before.fileSha256,pid:process.pid,by:'test'});
 const after=readConversation(result.path);assert.deepEqual(after.turns.map(t=>t.text),before.turns.map(t=>t.text));
 assert.deepEqual([after.header.review.transcription,after.header.review.attribution],['unreviewed','unreviewed']);assert.equal(after.header.review.processing,'processed');
 assert.match(readFileSync(join(dirname(result.path),'annotations.md'),'utf8'),/Interpretation only/);
 assert.throws(()=>annotateConversation({file:f.entry(),spec:annotation(),expectedSha:before.fileSha256,pid:process.pid,by:'test'}),/STALE_PIN/);
});
test('bad citation makes annotation change no files',()=>{
 const f=own(fixture());create(f,{body});const before=readFileSync(f.entry());const record=readConversation(f.entry());const c=citeConversation(record,{turnIds:['t-000001']});c.selector.text_sha256='0'.repeat(64);
 assert.throws(()=>annotateConversation({file:f.entry(),spec:annotation([c]),expectedSha:record.fileSha256,pid:process.pid,by:'test'}),/CITATION/);
 assert.deepEqual(readFileSync(f.entry()),before);assert.equal(existsSync(join(dirname(f.entry()),'annotations.md')),false);
});
test('annotation journal resumes or reverses after each touched-file replacement',()=>{
 for(const action of ['resume','reverse'])for(const stop of [1,2]){
  const f=own(fixture());create(f,{body});const before=readFileSync(f.entry());let journal;
  assert.throws(()=>annotateConversation({file:f.entry(),spec:annotation(),expectedSha:hash(before),pid:process.pid,by:'test',afterOperation:(_operation,j)=>{journal=j;if(j.completed===stop)throw new Error('synthetic crash');}}),/REVISION_INCOMPLETE/);
  assert.ok(journal);const result=recoverConversationRevision({file:f.entry(),revisionId:journal.revision_id,action,pid:process.pid,by:'test'});
  if(action==='reverse'){assert.deepEqual(readFileSync(f.entry()),before);assert.equal(existsSync(join(dirname(f.entry()),'annotations.md')),false);}
  else{assert.equal(readConversation(f.entry()).header.review.processing,'processed');assert.match(readFileSync(join(dirname(f.entry()),'annotations.md'),'utf8'),/Interpretation only/);}
  assert.equal(result.recovered,action);
 }
});
test('projection guard rereads actual parent policy and refuses malformed/home',()=>{
 const f=own(fixture());create(f);assert.throws(()=>assertConversationProjection(f.entry(),{target:{kind:'public'}}),/PRIVACY_REFUSED/);
 const g=own(fixture());create(g,{header:header({keep:{scope:'share',group:null,decision:evidence()}})});assert.equal(assertConversationProjection(g.entry(),{target:{kind:'public'}}).allowed,true);
 const actual=readFileSync(g.entry());assert.throws(()=>assertConversationProjection(g.entry(),{target:{kind:'public'},read:()=>Buffer.from('bad')}),/PRIVACY_REFUSED/);assert.deepEqual(readFileSync(g.entry()),actual);
});
test('mapped external root requires explicit correct workspace for annotate/recovery',()=>{
 const f=own(fixture()),external=own(fixture());writeFileSync(join(f.root,'.freedom.json'),JSON.stringify({paths:{transcripts:join(external.root,'outside-records')}}));mkdirSync(join(external.root,'outside-records'));
 const result=create(f);const before=readFileSync(result.path);
 assert.throws(()=>annotateConversation({file:result.path,spec:annotation(),expectedSha:hash(before),pid:process.pid,by:'test'}),/WORKSPACE_REQUIRED|TARGET_MISMATCH/);
 const wrong=own(fixture());assert.throws(()=>annotateConversation({file:result.path,root:wrong.root,spec:annotation(),expectedSha:hash(before),pid:process.pid,by:'test'}),/TARGET_MISMATCH/);assert.deepEqual(readFileSync(result.path),before);
 annotateConversation({file:result.path,root:f.root,spec:annotation(),expectedSha:hash(before),pid:process.pid,by:'test'});assert.equal(readConversation(result.path).header.review.processing,'processed');
});
test('CLI create annotate and informational commands work outside source repository',()=>{
 const f=own(fixture());const spec=f.put('create.json',JSON.stringify({header:header(),body,assets:[],annotations:null}));
 const created=JSON.parse(cli(f,['create','--workspace',f.root,'--spec',spec,'--json']));assert.equal(created.created,true);
 const annotations=f.put('annotation.json',JSON.stringify(annotation()));const result=JSON.parse(cli(f,['annotate',f.entry(),'--spec',annotations,'--expected-sha',created.fileSha256,'--json']));assert.equal(result.path,f.entry());
 const caps=JSON.parse(cli(f,['--capabilities','--json']));for(const command of ['create','annotate','revise','recover'])assert.ok(caps.commands.includes(command));
 assert.match(cli(f,['--help']),/recover/);
});
async function holder(f,code){
 const child=ownedMutation({root:f.root},()=>spawn(process.execPath,['--input-type=module','-e',code],{cwd:f.root,env:{...process.env,FREEDOM_HOME:join(f.root,'test-home'),FREEDOM_WORKSPACE:undefined,GIT_DIR:undefined,GIT_WORK_TREE:undefined,GIT_COMMON_DIR:undefined},stdio:['ignore','pipe','pipe','ipc']}));
 const message=once(child,'message'),exit=once(child,'exit');await message;return {child,finish:async()=>{child.send('release');await exit;}};
}
const lockModule=new URL('../lib/freedom-conversation-lock.mjs',import.meta.url).href;
const captureModule=new URL('../lib/freedom-migrate-common.mjs',import.meta.url).href;
test('common Git lock contends across linked worktrees, and releases capture refusal',async()=>{
 const f=own(fixture());ownedMutation({root:f.root},()=>{assert.equal(conversationLockContext(f.root).gitCommonDir,null);return execFileSync('git',['init','-q'],{cwd:f.root});});ownedMutation({root:f.root},()=>{execFileSync('git',['add','.freedom.json'],{cwd:f.root});execFileSync('git',['commit','-qm','synthetic fixture'],{cwd:f.root});});
 const wt=join(f.root,'sibling');ownedMutation({root:f.root},()=>execFileSync('git',['worktree','add','-q','--detach',wt,'HEAD'],{cwd:f.root}));mkdirSync(join(wt,f.rel));
 assert.equal(conversationLockContext(f.root).gitCommonDir,conversationLockContext(wt).gitCommonDir);
 const held=await holder(f,`import {withConversationLock} from ${JSON.stringify(lockModule)};withConversationLock(${JSON.stringify(wt)},{pid:process.pid,by:'child'},()=>{process.send('ready');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,700);});`);
 assert.throws(()=>withConversationLock(f.root,{pid:process.pid,by:'test'},()=>{}),/LOCKED/);await held.finish();
 const captureHeld=await holder(f,`import {withRunLock} from ${JSON.stringify(captureModule)};withRunLock(${JSON.stringify(f.root)},{pid:process.pid,by:'child'},()=>{process.send('ready');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,700);});`);
 assert.throws(()=>withConversationLock(f.root,{pid:process.pid,by:'test'},()=>{}),/LOCKED/);await captureHeld.finish();
 assert.equal(withConversationLock(f.root,{pid:process.pid,by:'test'},()=>42),42);
});
test('concurrent children creating same id or capture leave exactly one record',async()=>{
 for(const sameId of [true,false]){
  const f=own(fixture());const specs=[0,1].map(i=>f.put(`spec-${i}.json`,JSON.stringify({header:header({id:sameId?'example-call':`record-${i}`,sources:[capture()]}),body:emptyBody,assets:[],annotations:null})));
  const children=specs.map(spec=>ownedMutation({root:f.root},()=>spawn(process.execPath,[source,'create','--workspace',f.root,'--spec',spec,'--json'],{cwd:f.root,env:{...process.env,FREEDOM_HOME:join(f.root,'test-home'),FREEDOM_WORKSPACE:undefined,GIT_DIR:undefined,GIT_WORK_TREE:undefined,GIT_COMMON_DIR:undefined},stdio:['ignore','pipe','pipe']})));
  const results=await Promise.all(children.map(async child=>{let output='';child.stdout.on('data',d=>output+=d);const [code]=await once(child,'exit');return {code,output};}));
  assert.ok(results.some(r=>r.code===0));assert.ok(results.every(r=>r.code===0||r.code===3));assert.equal(listConversations(f.root).records.length,1);
 }
});

test('backup ownership capability proves exact local bytes and rejects nonfacts',()=>{
 const f=own(fixture()),original=f.put('input.bin','proof'),backup=f.put('owned-copy.bin','proof'),sha256=hash('proof');
 const l=locator({kind:'bundled',path:'sources/c-001/proof.bin',service_id:null,sha256,bytes:5,backup:{status:'verified-owned',locator:backup,sha256,verified_at:'2026-10-03T00:00:00Z'}});
 const spec={header:header({sources:[capture({locators:[l]})]}),assets:[{relativePath:l.path,fromPath:original,sha256}]};
 for(const fact of [null,{owned:false,evidence:evidence()},{owned:true,evidence:{}},Promise.resolve({owned:true,evidence:evidence()})]){
  assert.throws(()=>create(f,spec,{verifyOwnedBackup:()=>fact}),/BACKUP_UNPROVEN/);assert.equal(existsSync(f.entry()),false);
 }
 assert.throws(()=>create(f,spec,{verifyOwnedBackup:()=>{throw new Error('Unavailable ownership facts');}}),/BACKUP_UNPROVEN/);assert.equal(existsSync(f.entry()),false);
 let request;create(f,spec,{verifyOwnedBackup:input=>{request=input;return {owned:true,evidence:evidence({kind:'machine-check'})};}});
 assert.deepEqual(request,{locator:backup,sha256,verified_at:l.backup.verified_at});assert.equal(readConversation(f.entry()).header.sources[0].locators[0].backup.status,'verified-owned');
});
test('annotation resolves historical SHA from owned journal and supplied synthetic Git loader',()=>{
 const f=own(fixture());ownedMutation({root:f.root},()=>{assert.equal(conversationLockContext(f.root).gitCommonDir,null);return execFileSync('git',['init','-q'],{cwd:f.root});});create(f,{body});const before=readConversation(f.entry()),oldBytes=readFileSync(f.entry()),citation=citeConversation(before,{turnIds:['t-000001']});
 execFileSync('git',['add',relative(f.root,f.entry())],{cwd:f.root});execFileSync('git',['commit','-qm','synthetic historical record','--',relative(f.root,f.entry())],{cwd:f.root});const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:f.root,encoding:'utf8'}).trim();
 const {reviseConversation}=writerModule;
 reviseConversation({file:f.entry(),spec:{schema_version:1,revision_id:'history-0000001',base_sha256:before.fileSha256,mode:'routine',authorization:null,operations:[{op:'retitle',title:'Changed title'}],log},expectedSha:before.fileSha256,pid:process.pid,by:'test'});
 let current=readConversation(f.entry());annotateConversation({file:f.entry(),spec:annotation([citation]),expectedSha:current.fileSha256,pid:process.pid,by:'test'});
 current=readConversation(f.entry());const gitCitation={...citation,repository:f.root,revision:{kind:'git',value:revision}};
 assert.throws(()=>annotateConversation({file:f.entry(),spec:annotation([gitCitation]),expectedSha:current.fileSha256,pid:process.pid,by:'test'}),/CITATION_VERSION_UNAVAILABLE/);
 let request;annotateConversation({file:f.entry(),spec:annotation([gitCitation]),expectedSha:current.fileSha256,pid:process.pid,by:'test',readVersion:(repository,path,revision)=>{request={repository,path,revision};return execFileSync('git',['show',revision.value+':'+relative(repository,path)],{cwd:repository});}});
 assert.deepEqual(request,{repository:gitCitation.repository,path:gitCitation.path,revision:gitCitation.revision});
});
import * as writerModule from './helpers/guarded-freedom-conversation-write.mjs';
test('preexisting symlink record entry refuses both mutation and recovery',()=>{
 const f=own(fixture()),other=own(fixture());create(other);mkdirSync(dirname(f.entry()),{recursive:true});symlinkSync(other.entry(),f.entry());
 for(const action of [()=>annotateConversation({file:f.entry(),spec:annotation(),expectedSha:hash(readFileSync(other.entry())),pid:process.pid,by:'test'}),()=>recoverConversationRevision({file:f.entry(),revisionId:'unknown-00001',action:'reverse',pid:process.pid,by:'test'})])assert.throws(action,/SYMLINK|TARGET_MISMATCH/);
});

test('creation renders deterministic missing facts in interpretation without altering speech or supplied prose',()=>{
 const f=own(fixture());const supplied=body.replace('## Now\n\n','## Now\n\nProducer completeness text.\n').replace('## Open questions\n','## Open questions\n\n- Producer unresolved question.\n');
 const original=readConversation(f.put(join(f.rel,'temporary','transcript.md'),bytes(header({id:'temporary'}),supplied)));f.close();
 const g=own(fixture());const first=create(g,{body:supplied}),after=readConversation(first.path);
 assert.deepEqual(after.turns[0].text,original.turns[0].text);assert.match(after.sections.find(s=>s.name==='Now').bytes.toString(),/Producer completeness text/);assert.match(after.sections.find(s=>s.name==='Now').bytes.toString(),/UNKNOWN_FACT/);assert.match(after.sections.find(s=>s.name==='Open questions').bytes.toString(),/Producer unresolved question/);
 assert.equal(create(g,{body:supplied}).created,false);assert.equal(readConversation(first.path).fileSha256,first.fileSha256);
});
test('creation leaves canonical legacy body byte-identical and never invents speech',()=>{
 const f=own(fixture());const legacyBody='\r\n## Summary\r\n\r\nGenerated notes, no original speech.\r\n';const result=create(f,{header:header({body_format:'legacy'}),body:legacyBody});
 assert.deepEqual(readConversation(result.path).body,Buffer.from(legacyBody));assert.equal(readConversation(result.path).turns.length,0);assert.equal(create(f,{header:header({body_format:'legacy'}),body:legacyBody}).created,false);
 const g=own(fixture());create(g);const empty=readConversation(g.entry());assert.equal(empty.turns.length,0);assert.ok(empty.gaps.some(d=>d.code==='TRANSCRIPT_EMPTY'));
});

test('create refuses alias collision and undeclared assets on identical retry',()=>{
 const f=own(fixture());create(f);assert.throws(()=>create(f,{header:header({id:'new-call',aliases:[{kind:'record-id',value:'example-call',namespace:null}]})}),/AMBIGUOUS_ALIAS|ID_COLLISION/);
 f.put(join(f.rel,'example-call','sources','c-001','undeclared.bin'),'Unexpected asset');assert.throws(()=>create(f),/CREATE_COLLISION|ASSET_SPEC_INVALID/);
});
test('common Git identity is shared when workspace is nested beneath command cwd',()=>{
 const f=own(fixture());ownedMutation({root:f.root},()=>{assert.equal(conversationLockContext(f.root).gitCommonDir,null);return execFileSync('git',['init','-q'],{cwd:f.root});});const nested=join(f.root,'nested-workspace');mkdirSync(nested);writeFileSync(join(nested,'.freedom.json'),'{}');mkdirSync(join(nested,'meeting-transcripts'));
 assert.equal(conversationLockContext(nested).gitCommonDir,realpathSync(join(f.root,'.git')));
 assert.equal(withConversationLock(nested,{pid:process.pid,by:'test'},()=>17),17);
});

test('CLI revise recover and stale exits use the shared journal from outside repo',()=>{
 const f=own(fixture());const created=create(f,{body}),before=readFileSync(f.entry());
 const revisionSpec={schema_version:1,revision_id:'cli-revision-001',base_sha256:created.fileSha256,mode:'routine',authorization:null,operations:[{op:'retitle',title:'CLI replacement title'}],log};const spec=f.put('revision.json',JSON.stringify(revisionSpec));
 const result=JSON.parse(cli(f,['revise',f.entry(),'--spec',spec,'--expected-sha',created.fileSha256,'--json']));assert.equal(result.changed,true);assert.equal(readConversation(f.entry()).header.title,'CLI replacement title');
 const recovered=JSON.parse(cli(f,['recover',f.entry(),'--revision-id',revisionSpec.revision_id,'--action','reverse','--json']));assert.equal(recovered.recovered,'reverse');assert.deepEqual(readFileSync(f.entry()),before);
 const stale=f.put('stale.json',JSON.stringify({...revisionSpec,revision_id:'cli-stale-000001',base_sha256:'0'.repeat(64)}));let failure;
 try{cli(f,['revise',f.entry(),'--spec',stale,'--expected-sha','0'.repeat(64),'--json']);}catch(e){failure=e;}
 assert.equal(failure.status,3);assert.equal(JSON.parse(failure.stdout).diagnostics[0].code,'STALE_PIN');
 assert.throws(()=>cli(f,['recover',f.entry(),'--revision-id',revisionSpec.revision_id,'--action','resume','--afterOperation','bypass','--json']));
});

test('unchanged owned backup survives create retry without a new ownership assertion',()=>{
 const f=own(fixture()),original=f.put('input','proof'),backup=f.put('backup','proof'),sha256=hash('proof');
 const l=locator({kind:'bundled',path:'sources/c-001/file.bin',service_id:null,sha256,bytes:5,backup:{status:'verified-owned',locator:backup,sha256,verified_at:'2026-10-03T00:00:00Z'}}),spec={header:header({sources:[capture({locators:[l]})]}),assets:[{relativePath:l.path,fromPath:original,sha256}]};
 create(f,spec,{verifyOwnedBackup:()=>({owned:true,evidence:evidence()})});assert.equal(create(f,spec).created,false);
});

test('new participant references resolve through flat folder self and mapped workspace doors',()=>{
 for(const [person,path] of [['flat-person','people/flat-person.md'],['folder-person','people/folder-person/friend.md'],['self','self/self.md'],['self','user/USER.md']]){
  const f=own(fixture());f.put(path,'---\nname: "Synthetic record"\n---\n');
  create(f,{header:header({participants:[participant({person,status:'proposed'})]})});
  assert.equal(readConversation(f.entry()).header.participants[0].status,'proposed');
 }
 const f=own(fixture()),mapped=own(fixture());mapped.put('contacts/mapped-person/friend.md','---\nname: "Synthetic mapped record"\n---\n');mapped.put('profile/self.md','---\nname: "Synthetic self"\n---\n');
 writeFileSync(join(f.root,'.freedom.json'),JSON.stringify({paths:{transcripts:f.rel,people:join(mapped.root,'contacts'),self:join(mapped.root,'profile')}}));
 create(f,{header:header({participants:[participant({person:'mapped-person',status:'confirmed',evidence:[evidence()]}),participant({id:'p-002',person:'self',status:'proposed'})]})});assert.equal(readConversation(f.entry()).header.participants.length,2);
});
test('missing unreadable and unrelated-workspace participant references refuse before mutation',()=>{
 for(const problem of ['missing','unreadable','other-workspace']){
  const f=own(fixture()),other=own(fixture());let unreadable;
  if(problem==='unreadable'){unreadable=f.put('people/private-person.md','Synthetic unreadable record.');chmodSync(unreadable,0);}
  if(problem==='other-workspace')other.put('people/private-person.md','Synthetic unrelated record.');
  const journal=conversationLockContext(f.root).journalDir;
  try{
   assert.throws(()=>create(f,{header:header({participants:[participant({person:'private-person',status:'proposed'})]}),annotations:'Do not create.'}),error=>{
    assert.equal(error.code,'PERSON_REFERENCE_UNRESOLVED');assert.deepEqual(error.diagnostics,[{code:'PERSON_REFERENCE_UNRESOLVED',severity:'error',path:null,field:'participants[0].person',message:'New participant reference requires an existing readable record in the referring workspace.'}]);assert.doesNotMatch(JSON.stringify(error.diagnostics),/private-person|conversation-reader-/);return true;
   });assert.equal(existsSync(f.entry()),false);assert.equal(existsSync(join(dirname(f.entry()),'annotations.md')),false);assert.equal(existsSync(journal),false);
  }finally{if(unreadable)chmodSync(unreadable,0o600);}
 }
});
test('unchanged participant references preserve exact create retry after record removal',()=>{
 const f=own(fixture()),personFile=f.put('people/former-person.md','Synthetic existing record.');const spec={header:header({participants:[participant({person:'former-person',status:'confirmed',evidence:[evidence()]})]})};
 const first=create(f,spec);unlinkSync(personFile);assert.equal(create(f,spec).created,false);assert.equal(readConversation(f.entry()).fileSha256,first.fileSha256);
});
test('verified backup must be a distinct physical file with matching exact bytes',()=>{
 for(const problem of ['same-path','hardlink','wrong-bytes']){
  const f=own(fixture()),original=f.put('input','proof'),sha256=hash('proof');let backup=original;
  if(problem==='hardlink'){backup=join(f.root,'backup');linkSync(original,backup);}if(problem==='wrong-bytes')backup=f.put('backup','other');
  const l=locator({kind:'bundled',path:'sources/c-001/file.bin',service_id:null,sha256,bytes:5,backup:{status:'verified-owned',locator:backup,sha256,verified_at:'2026-10-03T00:00:00Z'}});
  assert.throws(()=>create(f,{header:header({sources:[capture({locators:[l]})]}),assets:[{relativePath:l.path,fromPath:original,sha256}]},{verifyOwnedBackup:()=>({owned:true,evidence:evidence()})}),/BACKUP_UNPROVEN/);assert.equal(existsSync(f.entry()),false);
 }
});
test('missing historical coverage refuses annotation and creation before all product writes',()=>{
 const source=own(fixture());create(source,{body,header:header({review:{transcription:'human-reviewed',attribution:'unreviewed',processing:'processed',evidence:[evidence()]}})});const before=readConversation(source.entry());
 ownedMutation({file:source.entry()},()=>writerModule.reviseConversation({file:source.entry(),spec:{schema_version:1,revision_id:'annotate-history',base_sha256:before.fileSha256,mode:'routine',authorization:null,operations:[{op:'append-turns',after_turn_id:null,turns:[{id:'t-000002',speaker:null,sources:[],timing:null,source_gap:'Unavailable.',text:'New unreviewed words.\n'}]}],log},expectedSha:before.fileSha256,pid:process.pid,by:'test'}));const current=readConversation(source.entry()),h=structuredClone(current.header);h.extensions.conversation_revision.protected_turns=[];
 const f=own(fixture());f.put(join(f.rel,'example-call','transcript.md'),bytes(h,current.body));const raw=readFileSync(f.entry()),record=readConversation(f.entry());
 assert.throws(()=>annotateConversation({file:f.entry(),spec:annotation(),expectedSha:record.fileSha256,pid:process.pid,by:'test'}),/REVIEW_PROTECTION_UNRESOLVED/);assert.deepEqual(readFileSync(f.entry()),raw);assert.equal(existsSync(join(dirname(f.entry()),'annotations.md')),false);assert.equal(existsSync(conversationLockContext(f.root).journalDir),false);
 const g=own(fixture());assert.throws(()=>create(g,{header:h,body:current.body.toString(),annotations:'Unproven interpretation.'}),/REVIEW_PROTECTION_UNRESOLVED/);assert.equal(existsSync(g.entry()),false);assert.equal(existsSync(join(dirname(g.entry()),'annotations.md')),false);assert.equal(existsSync(conversationLockContext(g.root).journalDir),false);
});
test('Now and fenced Log examples do not establish actual historical Log evidence',()=>{
 const f=own(fixture()),example='<!-- revision '+JSON.stringify({revision_id:'example-review01',evidence:[evidence()],turn_ids:[],prior_review:{transcription:'human-reviewed',attribution:'unreviewed',processing:'processed',evidence:[evidence()]}})+' -->';
 const supplied=body.replace('## Now\n\n','## Now\n\n'+example+'\n').replace('## Log\n\n','## Log\n\n```json\n'+example+'\n```\n');create(f,{body:supplied});const before=readConversation(f.entry());
 annotateConversation({file:f.entry(),spec:annotation(),expectedSha:before.fileSha256,pid:process.pid,by:'test'});const after=readConversation(f.entry());assert.equal(after.header.review.processing,'processed');assert.deepEqual(after.turns[0].text,before.turns[0].text);assert.ok(after.body.includes(Buffer.from(example)));
});

// Every new writer call proves its journal/lock belongs to this outside-source fixture.
function withIsolatedLogWriter(f,fn){
 const keys=['FREEDOM_HOME','FREEDOM_WORKSPACE','GIT_DIR','GIT_WORK_TREE','GIT_COMMON_DIR'],previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 process.env.FREEDOM_HOME=f.root;for(const key of keys.slice(1))delete process.env[key];
 try{
  const c=conversationLockContext(f.root),captureState=stateDir('catch-up-freeda',f.root);assert.equal(c.gitCommonDir,null);assert.equal(process.env.FREEDOM_HOME,f.root);
  for(const path of [c.root,c.transcripts,f.entry(),c.lockPath,c.journalDir,captureState,join(captureState,'.lock')])assert.ok(path===f.root||path.startsWith(f.root+sep),path);
  return fn(c);
 }finally{for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
function logExample(review='unreviewed'){
 const prior_review={transcription:review,attribution:'unreviewed',processing:'processed',evidence:review==='human-reviewed'?[evidence()]:[]};
 return '- 2026-10-03 - revision example-log-01: Literal example. <!-- revision '+JSON.stringify({revision_id:'example-log-01',evidence:[evidence()],turn_ids:[],prior_review,protected_turn_ids:review==='human-reviewed'?['t-000001']:[]})+' -->';
}
const withLogExample=example=>body.replace('## Log\n\n','## Log\n\n'+example+'\n');
const acceptedLogRecord=(f,supplied)=>{
 const record=parseConversation(bytes(header(),supplied),{file:f.entry(),layout:'canonical'});assert.deepEqual(record.diagnostics.filter(d=>d.severity==='error'),[]);return record;
};
for(const review of ['unreviewed','human-reviewed']){
 test(`creation preserves actual blockquoted Log ${review} examples without claiming history`,()=>{
  const f=own(fixture()),example='> '+logExample(review)+'\r\n  >> '+logExample(review)+'\n',supplied=withLogExample(example),before=acceptedLogRecord(f,supplied);
  const result=withIsolatedLogWriter(f,()=>create(f,{body:supplied}));assert.equal(result.created,true);const after=readConversation(f.entry());
  assert.deepEqual(after.sections.find(s=>s.name==='Log').bytes,before.sections.find(s=>s.name==='Log').bytes);assert.deepEqual(after.sections.find(s=>s.name==='Transcript').bytes,before.sections.find(s=>s.name==='Transcript').bytes);
  assert.deepEqual(after.turns.map(t=>t.text),before.turns.map(t=>t.text));assert.deepEqual(after.header.extensions,{});
  const exact=readFileSync(f.entry());assert.equal(withIsolatedLogWriter(f,()=>create(f,{body:supplied})).created,false);assert.deepEqual(readFileSync(f.entry()),exact);
 });
 test(`annotation preserves actual blockquoted Log ${review} examples on reader-accepted input`,()=>{
  const f=own(fixture()),example='> '+logExample(review)+'\r\n',supplied=withLogExample(example);acceptedLogRecord(f,supplied);f.put(join(f.rel,'example-call','transcript.md'),bytes(header(),supplied));const before=readConversation(f.entry());
  withIsolatedLogWriter(f,()=>annotateConversation({file:f.entry(),root:f.root,spec:annotation(),expectedSha:before.fileSha256,pid:process.pid,by:'test'}));const after=readConversation(f.entry());
  assert.equal(after.header.review.processing,'processed');assert.deepEqual(after.sections.find(s=>s.name==='Transcript').bytes,before.sections.find(s=>s.name==='Transcript').bytes);assert.deepEqual(after.turns.map(t=>t.text),before.turns.map(t=>t.text));
  const oldLog=before.sections.find(s=>s.name==='Log').bytes;assert.ok(after.sections.find(s=>s.name==='Log').bytes.subarray(0,oldLog.length).equals(oldLog));assert.deepEqual(after.header.extensions.conversation_revision.protected_turns,[]);
  assert.match(readFileSync(join(dirname(f.entry()),'annotations.md'),'utf8'),/Interpretation only/);
 });
}
const literalLogExamples=()=>{
 const entry=logExample('human-reviewed'),comment=entry.slice(entry.indexOf('<!-- revision ')),tabEntry=entry.replace('- 2026-10-03 - revision ','* 2026-10-03\t- revision ');
 return ['```json\n'+entry+'\n```\n','~~~json\n'+entry+'\n~~~\n','    '+entry+'\n','\t'+entry+'\n','Literal marker in prose: '+comment+'\n','- Literal inline example: `'+comment+'`\n','``'+entry+'``\n','> ~~~json\n> '+entry+'\n> ~~~\n',
  '> '+tabEntry+'\n','```\n'+tabEntry+'\n```\n','    '+tabEntry+'\n','\t'+tabEntry+'\n','Literal tab example: '+tabEntry+'\n','- `'+tabEntry+'`\n','- Literal revision example: `'+comment+'`\n'].join('');
};
for(const operation of ['create','annotate'])test(`${operation} preserves code and prose Log markers as literal examples`,()=>{
 const f=own(fixture()),supplied=withLogExample(literalLogExamples()),before=acceptedLogRecord(f,supplied);
 if(operation==='create')withIsolatedLogWriter(f,()=>create(f,{body:supplied}));
 else{f.put(join(f.rel,'example-call','transcript.md'),bytes(header(),supplied));withIsolatedLogWriter(f,()=>annotateConversation({file:f.entry(),root:f.root,spec:annotation(),expectedSha:hash(readFileSync(f.entry())),pid:process.pid,by:'test'}));}
 const after=readConversation(f.entry()),oldLog=before.sections.find(s=>s.name==='Log').bytes;assert.ok(after.sections.find(s=>s.name==='Log').bytes.subarray(0,oldLog.length).equals(oldLog));assert.deepEqual(after.sections.find(s=>s.name==='Transcript').bytes,before.sections.find(s=>s.name==='Transcript').bytes);
 if(operation==='create')assert.deepEqual(after.header.extensions,{});else assert.deepEqual(after.header.extensions.conversation_revision.protected_turns,[]);
});
test('malformed actual Log history refuses creation and annotation without product writes',()=>{
 const entry=logExample('human-reviewed');
 for(const malformed of [entry.replace('2026-10-03','invalid-date'),entry.replace('example-log-01:','mismatched-log-01:'),entry.replace('"protected_turn_ids":["t-000001"]','"protected_turn_ids":null'),entry.replace('"revision_id":"example-log-01"','"revision_id":"example-log-01","revision_id":"example-log-01"'),entry.replace(/\{.*\}/,'{broken'),entry.slice(0,-4),entry.slice(entry.indexOf('<!-- revision '))])for(const operation of ['create','annotate']){
  const f=own(fixture()),supplied=withLogExample('> '+entry+'\n'+malformed);acceptedLogRecord(f,supplied);let raw;
  if(operation==='annotate'){f.put(join(f.rel,'example-call','transcript.md'),bytes(header(),supplied));raw=readFileSync(f.entry());}
  withIsolatedLogWriter(f,c=>{
   assert.throws(()=>operation==='create'?create(f,{body:supplied,annotations:'Must not appear.'}):annotateConversation({file:f.entry(),root:f.root,spec:annotation(),expectedSha:hash(raw),pid:process.pid,by:'test'}),error=>error.code==='REVIEW_PROTECTION_UNRESOLVED');
   if(raw)assert.deepEqual(readFileSync(f.entry()),raw);else assert.equal(existsSync(f.entry()),false);assert.equal(existsSync(join(dirname(f.entry()),'annotations.md')),false);assert.equal(existsSync(c.journalDir),false);
  });
 }
});

function retainedReviewedLog(){
 const f=own(fixture()),review={transcription:'human-reviewed',attribution:'unreviewed',processing:'processed',evidence:[evidence()]};
 const supplied=body.replace('## Log\n\n','### t-000002\n<!-- turn {"speaker":null,"sources":[],"timing":null,"source_gap":"Unavailable."} -->\nSecond reviewed words.\n\n## Log\n\n');
 withIsolatedLogWriter(f,()=>create(f,{body:supplied,header:header({review})}));const before=readConversation(f.entry());
 withIsolatedLogWriter(f,()=>writerModule.reviseConversation({file:f.entry(),root:f.root,spec:{schema_version:1,revision_id:'retained-history01',base_sha256:before.fileSha256,mode:'routine',authorization:null,operations:[{op:'append-turns',after_turn_id:null,turns:[{id:'t-000003',speaker:null,sources:[],timing:null,source_gap:'Unavailable.',text:'New unreviewed words.\n'}]}],log},expectedSha:before.fileSha256,pid:process.pid,by:'test'}));
 const record=readConversation(f.entry());assert.equal(record.header.review.transcription,'unreviewed');assert.deepEqual(record.header.extensions.conversation_revision.protected_turns.map(p=>p.turn_id),['t-000001','t-000002']);return record;
}
for(const marker of ['- ','* ','+ '])for(const separator of [' - ','\t- ','\t-\t'])for(const map of ['missing','empty','partial'])for(const operation of ['create','annotate'])test(`copied retained history ${JSON.stringify(marker)} separator ${JSON.stringify(separator)} ${map} map refuses ${operation} without journals`,()=>{
 const current=retainedReviewedLog(),h=structuredClone(current.header);
 if(map==='missing')delete h.extensions.conversation_revision;else h.extensions.conversation_revision.protected_turns=map==='empty'?[]:h.extensions.conversation_revision.protected_turns.slice(1);
 const prefix=marker+'2026-10-03'+separator+'revision ',supplied=current.body.toString().replace(/(^|\n)- 2026-10-03 - revision /,'$1'+prefix);assert.ok(supplied.includes(prefix+'retained-history01:'));
 assert.deepEqual(supplied.match(/<!-- revision .* -->/g),current.body.toString().match(/<!-- revision .* -->/g));
 const f=own(fixture()),input=bytes(h,supplied),parsed=parseConversation(input,{file:f.entry(),layout:'canonical'});assert.deepEqual(parsed.diagnostics.filter(d=>d.severity==='error'),[]);
 if(operation==='annotate')f.put(join(f.rel,'example-call','transcript.md'),input);
 const sidecar=join(dirname(f.entry()),'annotations.md');if(operation==='annotate')f.put(join(f.rel,'example-call','annotations.md'),'Exact retained sidecar.\r\n');
 withIsolatedLogWriter(f,c=>{
  assert.equal(existsSync(c.journalDir),false);
  assert.throws(()=>operation==='create'?create(f,{header:h,body:supplied,annotations:'Must not appear.'}):annotateConversation({file:f.entry(),root:f.root,spec:annotation(),expectedSha:hash(input),pid:process.pid,by:'test'}),error=>error.code==='REVIEW_PROTECTION_UNRESOLVED');
  if(operation==='annotate')assert.deepEqual(readFileSync(f.entry()),input);else assert.equal(existsSync(f.entry()),false);
  if(operation==='annotate')assert.equal(readFileSync(sidecar,'utf8'),'Exact retained sidecar.\r\n');else assert.equal(existsSync(sidecar),false);
  assert.equal(existsSync(c.journalDir),false);assert.equal(existsSync(c.lockPath),false);assert.equal(existsSync(join(stateDir('catch-up-freeda',f.root),'.lock')),false);
 });
});
test('copied retained complete history permits create and annotation with exact protected origins',()=>{
 const current=retainedReviewedLog(),f=own(fixture());
 withIsolatedLogWriter(f,()=>create(f,{header:current.header,body:current.body.toString()}));const before=readConversation(f.entry());
 assert.deepEqual(before.header.extensions.conversation_revision.protected_turns,current.header.extensions.conversation_revision.protected_turns);
 withIsolatedLogWriter(f,()=>annotateConversation({file:f.entry(),root:f.root,spec:annotation(),expectedSha:before.fileSha256,pid:process.pid,by:'test'}));const after=readConversation(f.entry());
 assert.deepEqual(after.header.extensions.conversation_revision.protected_turns,current.header.extensions.conversation_revision.protected_turns);assert.deepEqual(after.turns.map(t=>t.text),current.turns.map(t=>t.text));
 const oldLog=current.sections.find(s=>s.name==='Log').bytes;assert.ok(after.sections.find(s=>s.name==='Log').bytes.subarray(0,oldLog.length).equals(oldLog));
});


function withPinnedAnnotationFixture(t, fn) {
 const f=fixture();t.after(()=>f.close());
 return withIsolatedLogWriter(f,()=>{
  const c=conversationLockContext(f.root);assert.equal(c.gitCommonDir,null);
  for(const path of [c.root,c.transcripts,c.lockPath,c.journalDir,f.entry(),join(dirname(f.entry()),'annotations.md'),stateDir('catch-up-freeda',f.root),join(stateDir('catch-up-freeda',f.root),'.lock')])assert.ok(path===f.root||path.startsWith(f.root+sep),path);
  return fn(f);
 });
}
function retainedSidecar(f) {
 const original=Buffer.from('## Action Items\r\n- [ ] Synthetic: ship the draft\r\n');
 create(f,{body,annotations:original.toString()});
 const parent=readConversation(f.entry());
 annotateConversation({root:f.root,file:f.entry(),spec:annotation(),expectedSha:parent.fileSha256,pid:process.pid,by:'test'});
 const sidecar=join(dirname(f.entry()),'annotations.md');
 const citation={repository:null,path:sidecar,record_id:'example-call',revision:{kind:'sha256',value:hash(original)},selector:{kind:'lines',start:2,end:2,text_sha256:hash(Buffer.from('- [ ] Synthetic: ship the draft\r\n'))},sources:[]};
 return {sidecar,original,citation};
}
test('historical sidecar citations stay resolvable independently of live annotation preconditions',t=>withPinnedAnnotationFixture(t,f=>{
 const {sidecar,citation}=retainedSidecar(f);
 writeFileSync(sidecar,'Changed current interpretation.\n');const current=readConversation(f.entry());
 // This actual pre-addendum behavior demonstrates why a current pin is distinct
 // from a valid historical citation. Omission remains compatible after the fix.
 annotateConversation({root:f.root,file:f.entry(),spec:annotation([citation]),expectedSha:current.fileSha256,pid:process.pid,by:'test'});
 assert.match(readFileSync(sidecar,'utf8'),/^Changed current interpretation/);
}));
test('annotation refuses stale live sidecar despite a resolvable retained historical citation',t=>withPinnedAnnotationFixture(t,f=>{
 const {sidecar,citation}=retainedSidecar(f),pin=hash(readFileSync(sidecar));
 writeFileSync(sidecar,'Changed between card read and shared lock.\n');
 const before=readFileSync(f.entry()),raw=readFileSync(sidecar),c=conversationLockContext(f.root),journals=readdirSync(c.journalDir);
 assert.throws(()=>annotateConversation({root:f.root,file:f.entry(),spec:{...annotation([citation]),expected_annotations_sha256:pin},expectedSha:hash(before),pid:process.pid,by:'test'}),e=>e.code==='STALE_PIN');
 assert.deepEqual(readFileSync(f.entry()),before);assert.deepEqual(readFileSync(sidecar),raw);assert.deepEqual(readdirSync(c.journalDir),journals);
}));
for(const mode of ['present','absent-null','omitted'])test(`annotation accepts ${mode} current sidecar precondition`,t=>withPinnedAnnotationFixture(t,f=>{
 create(f,{body,annotations:mode==='present'?'Original interpretation.\n':null});
 const sidecar=join(dirname(f.entry()),'annotations.md'),spec=annotation();
 if(mode==='present')spec.expected_annotations_sha256=hash(readFileSync(sidecar));
 if(mode==='absent-null')spec.expected_annotations_sha256=null;
 const before=readConversation(f.entry());annotateConversation({root:f.root,file:f.entry(),spec,expectedSha:before.fileSha256,pid:process.pid,by:'test'});
 assert.deepEqual(readConversation(f.entry()).turns.map(t=>t.text),before.turns.map(t=>t.text));assert.match(readFileSync(sidecar,'utf8'),/Interpretation only/);
}));
for(const [name,pin,sidecar] of [['missing','a'.repeat(64),null],['present-null',null,'Existing.'],['changed','a'.repeat(64),'Existing.'],['malformed','not-a-sha',null],['wrong-type',false,null]])test(`annotation ${name} precondition refuses before bytes or journals`,t=>withPinnedAnnotationFixture(t,f=>{
 create(f,{body,annotations:sidecar});const c=conversationLockContext(f.root),before=readFileSync(f.entry()),ann=join(dirname(f.entry()),'annotations.md'),journals=readdirSync(c.journalDir);
 assert.throws(()=>annotateConversation({root:f.root,file:f.entry(),spec:{...annotation(),expected_annotations_sha256:pin},expectedSha:hash(before),pid:process.pid,by:'test'}),e=>e.code===(name==='malformed'||name==='wrong-type'?'ANNOTATE_SPEC_INVALID':'STALE_PIN'));
 assert.deepEqual(readFileSync(f.entry()),before);assert.equal(existsSync(ann),sidecar!==null);if(sidecar!==null)assert.equal(readFileSync(ann,'utf8'),sidecar);assert.deepEqual(readdirSync(c.journalDir),journals);
}));
