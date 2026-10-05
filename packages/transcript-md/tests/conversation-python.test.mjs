import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from './helpers/native.mjs';
import {fileURLToPath} from 'node:url';
import {join, dirname, relative, sep} from 'node:path';
import {readFileSync, chmodSync, mkdirSync} from 'node:fs';
import {fixture, bytes, header, participant, capture, locator, evidence, git} from './helpers/conversation-fixture.mjs';
import {conversationLockContext} from './helpers/guarded-freedom-conversation-lock.mjs';
import {stateDir} from './helpers/guarded-freedom-workspace.mjs';
import {MIGRATE_LOCK} from './helpers/guarded-freedom-migrate-common.mjs';
import {createConversation, reviseConversation} from './helpers/guarded-freedom-conversation-write.mjs';

const lib=fileURLToPath(new URL('../lib/',import.meta.url));
const cli=join(lib,'freedom-conversations-cli.mjs');
const python=process.env.PYTHON??'python3';
const own=t=>{const f=fixture({mapped:true});t.after(()=>f.close());
 const keys=['FREEDOM_HOME','FREEDOM_WORKSPACE','GIT_DIR','GIT_WORK_TREE','GIT_COMMON_DIR'];
 const prior=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 process.env.FREEDOM_HOME=join(f.root,'state-home');for(const key of keys.slice(1))delete process.env[key];
 try{const c=conversationLockContext(f.root);assert.equal(c.gitCommonDir,null);
  for(const path of [c.root,c.transcripts,c.lockPath,c.journalDir,process.env.FREEDOM_HOME,join(f.root,'board-state')])assert.ok(path===f.root||path.startsWith(f.root+sep),path);
  git(f.root,'init','-q','-b','main');git(f.root,'add','--','.freedom.json');git(f.root,'commit','-q','-m','synthetic workspace','--','.freedom.json');
 }finally{for(const key of keys)if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}
 return f;};
const env=f=>({...process.env,FREEDOM_HOME:join(f.root,'state-home'),FREEDOM_WORKSPACE:f.root,FREEDOM_CONVERSATIONS_CLI:cli,GIT_DIR:undefined,GIT_WORK_TREE:undefined,GIT_COMMON_DIR:undefined,PATH:dirname(process.execPath)+':'+process.env.PATH});
function py(f,code,args=[],extra={}) {
 const r=spawnSync(python,['-B','-I','-S','-c','import sys,json;sys.path.insert(0,sys.argv[1]);from freedom_conversations import *;'+code,lib,...args],{cwd:f.root,env:{...env(f),...extra},encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);
}
function isolated(f,fn,workspace=f.root,file=f.entry()) {
 const values=env(f),keys=['FREEDOM_HOME','FREEDOM_WORKSPACE','GIT_DIR','GIT_WORK_TREE','GIT_COMMON_DIR'];
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 for(const k of keys)if(values[k]===undefined)delete process.env[k];else process.env[k]=values[k];
 try {
  const c=conversationLockContext(workspace);
  assert.equal(c.gitCommonDir,join(workspace,'.git'));
  for(const p of [c.root,c.transcripts,file,c.gitCommonDir,c.lockPath,c.journalDir,stateDir(MIGRATE_LOCK,workspace),join(stateDir(MIGRATE_LOCK,workspace),'.lock'),join(dirname(file),'annotations.md'),join(f.root,'state-home'),join(f.root,'board-state')]) {
   const rel=relative(f.root,p);assert.ok(rel===''||!rel.startsWith('..'+sep)&&rel!=='..'&&!rel.startsWith(sep),p);
  }
  return fn();
 }finally{for(const k of keys)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
}
function mutate(f,code,args) {return isolated(f,()=>py(f,code,args));}
const text='Exact synthetic λ words.\r\n\r\n';
const body='\n## Now\n\n## Transcript\n\n### t-000001\n<!-- turn {"speaker":"p-001","sources":[],"timing":null,"source_gap":"Unavailable."} -->\n'+text+'## Log\n\n## Open questions\n';
const log={date:'2026-10-04',text:'Synthetic correction.',evidence:[evidence()]};
const spec=(sha,id,operations,extra={})=>({schema_version:1,revision_id:id,base_sha256:sha,mode:'routine',authorization:null,operations,log,...extra});
function entry(f,review='unreviewed') {
 f.put('self/self.md','---\nname: Synthetic self\n---\n');
 f.put('people/synthetic-person/friend.md','---\nname: Synthetic person\n---\n');
 return isolated(f,()=>createConversation({root:f.root,spec:{header:header({participants:[participant({person:'self',status:'confirmed',evidence:[evidence()]})],review:{transcription:review,attribution:'unreviewed',processing:'processed',evidence:review==='human-reviewed'?[evidence()]:[]}}),body,assets:[],annotations:null},pid:process.pid,by:'python-test'}));
}

test('Python bridge reads mapped canonical records without sections unless requested',t=>{
 const f=own(t);f.put(f.rel+'/example-call/transcript.md',bytes());
 const rows=py(f,'print(json.dumps(list_records(workspace=sys.argv[2])))',[f.root]);
 assert.equal(rows.length,1);assert.equal(rows[0].id,'example-call');assert.equal('sections' in rows[0],false);
 const sections=py(f,'print(json.dumps(list_records(transcripts_dir=sys.argv[2],include_sections=True)))',[join(f.root,f.rel)]);
 assert.ok(sections[0].sections.some(s=>s.name==='Transcript'));
 const one=py(f,'print(json.dumps(read_record(sys.argv[2],include_body=True)))',[f.entry()]);assert.equal(one.id,'example-call');assert.equal(typeof one.body,'string');
});
test('Python sources preserve exact identity and normalize bundled paths against actual entry folder',t=>{
 const f=own(t);const external=join(f.root,'original.m4a');
 const sources=[capture({roles:['supplemental','metadata'],locators:[locator({kind:'bundled',path:'sources/c-001/audio.m4a',service_id:null}),locator({kind:'external-local',path:external,service_id:null})]}),capture({id:'c-002',service:'meet',recording_id:'Opaque:Case',locators:[locator({service_id:'Opaque:Case'})]}),capture({id:'c-003',type:'voice_memo',service:null,recording_id:null,locators:[],availability:'unknown'})];
 f.put(f.rel+'/example-call/transcript.md',bytes(header({sources})));
 const refs=py(f,'print(json.dumps(read_source_refs(sys.argv[2])))',[f.entry()]);
 assert.equal(refs.length,6);assert.deepEqual(refs.slice(0,4).map(r=>r.role),['supplemental','metadata','supplemental','metadata']);
 assert.equal(refs[0].path,'sources/c-001/audio.m4a');assert.equal(refs[0].resolvedPath,join(dirname(f.entry()),refs[0].path));
 assert.equal(refs[2].path,external);assert.equal(refs[2].resolvedPath,external);
 assert.equal(refs[4].service,'meet');assert.equal(refs[4].recordingId,'Opaque:Case');assert.equal(refs[4].resolvedPath,null);assert.equal(refs[5].availability,'unknown');
});
test('Python revision transports confirmed mapping and exact pin and refuses stale retries',t=>{
 const f=own(t);const created=entry(f);const revision=spec(created.fileSha256,'python-mapping-001',[{op:'map-participant',participant_id:'p-001',person:'synthetic-person',status:'confirmed',evidence:[evidence()]}]);
 const result=mutate(f,'print(json.dumps(revise_record(sys.argv[2],json.loads(sys.argv[3]),sys.argv[4],workspace=sys.argv[5])))',[f.entry(),JSON.stringify(revision),created.fileSha256,f.root]);
 assert.equal(result.changed,true);assert.equal(result.before_sha256,created.fileSha256);
 const after=py(f,'print(json.dumps(read_record(sys.argv[2],include_body=True)))',[f.entry()]);assert.equal(after.participants[0].person,'synthetic-person');assert.equal(after.turns[0].text,text);assert.equal(after.turns[0].id,'t-000001');
 const frozen=readFileSync(f.entry());const stale=spec(created.fileSha256,'python-stale-001',[{op:'retitle',title:'Stale'}]);
 const failure=mutate(f,'\ntry: revise_record(sys.argv[2],json.loads(sys.argv[3]),sys.argv[4],workspace=sys.argv[5])\nexcept ConversationError as e: print(json.dumps({"status":e.returncode,"codes":[d["code"] for d in e.diagnostics]}))',[f.entry(),JSON.stringify(stale),created.fileSha256,f.root]);
 assert.equal(failure.status,3);assert.ok(failure.codes.includes('STALE_PIN'));assert.deepEqual(readFileSync(f.entry()),frozen);
});
test('Python revision preserves deliberate authorization and historical protection after downgrade',t=>{
 const f=own(t);const created=entry(f,'human-reviewed');
 const op={op:'map-participant',participant_id:'p-001',person:'synthetic-person',status:'confirmed',evidence:[evidence()]};
 const routine=spec(created.fileSha256,'python-guard-001',[op]);const raw=readFileSync(f.entry());
 const failCode='\ntry: revise_record(sys.argv[2],json.loads(sys.argv[3]),sys.argv[4],workspace=sys.argv[5])\nexcept ConversationError as e: print(json.dumps([d["code"] for d in e.diagnostics]))';
 assert.ok(mutate(f,failCode,[f.entry(),JSON.stringify(routine),created.fileSha256,f.root]).includes('REVIEWED_TRANSCRIPT_REVISION_REQUIRED'));assert.deepEqual(readFileSync(f.entry()),raw);
 const deliberate=spec(created.fileSha256,'python-deliberate-001',[op],{mode:'deliberate-transcript-revision',authorization:{decision:evidence(),base_sha256:created.fileSha256,turn_ids:['t-000001']}});
 mutate(f,'print(json.dumps(revise_record(sys.argv[2],json.loads(sys.argv[3]),sys.argv[4],workspace=sys.argv[5])))',[f.entry(),JSON.stringify(deliberate),created.fileSha256,f.root]);
 const after=py(f,'print(json.dumps(read_record(sys.argv[2],include_body=True)))',[f.entry()]);assert.equal(after.review.attribution,'unreviewed');assert.ok(after.header.extensions.conversation_revision.protected_turns.length);assert.equal(after.turns[0].text,text);
 const next=spec(after.fileSha256,'python-history-001',[{...op,person:'self'}]);assert.ok(mutate(f,failCode,[f.entry(),JSON.stringify(next),after.fileSha256,f.root]).includes('REVIEWED_TRANSCRIPT_REVISION_REQUIRED'));
});
test('Python recovery reverses the shared interrupted journal with exact original bytes',t=>{
 const f=own(t);const created=entry(f);const original=readFileSync(f.entry());const revision=spec(created.fileSha256,'python-recovery-001',[{op:'retitle',title:'Replacement'}]);
 isolated(f,()=>assert.throws(()=>reviseConversation({file:f.entry(),root:f.root,spec:revision,expectedSha:created.fileSha256,pid:process.pid,by:'python-test',afterOperation:()=>{throw Error('synthetic interruption');}}),/REVISION_INCOMPLETE/));
 const result=mutate(f,'print(json.dumps(recover_revision(sys.argv[2],sys.argv[3],"reverse",workspace=sys.argv[4])))',[f.entry(),revision.revision_id,f.root]);
 assert.equal(result.recovered,'reverse');assert.deepEqual(readFileSync(f.entry()),original);
});
test('relative external source origins refuse while tilde spelling remains exact',t=>{
 const f=own(t);const source=p=>capture({type:'voice_memo',service:null,recording_id:null,locators:[locator({kind:'external-local',path:p,service_id:null})]});
 f.put(f.rel+'/example-call/transcript.md',bytes(header({sources:[source('recording.m4a')]})));
 const fail=py(f,'\ntry: read_source_refs(sys.argv[2])\nexcept ConversationError as e: print(json.dumps(str(e)))',[f.entry()]);assert.match(fail,/origin unresolved/);
 f.put(f.rel+'/example-call/transcript.md',bytes(header({sources:[source('~/synthetic-missing.m4a')]})));
 const refs=py(f,'print(json.dumps(read_source_refs(sys.argv[2])))',[f.entry()]);assert.equal(refs[0].path,'~/synthetic-missing.m4a');assert.ok(refs[0].resolvedPath.startsWith('/'));assert.ok(refs[0].resolvedPath.endsWith('/synthetic-missing.m4a'));
});
test('Python mutation forwards an explicit workspace for externally mapped entries',t=>{
 const f=own(t),workspace=join(f.root,'nested-workspace'),transcripts=join(f.root,'external-transcripts');
 f.put('nested-workspace/.freedom.json',JSON.stringify({paths:{transcripts}}));
 mkdirSync(transcripts);
 // The external workspace and its common Git directory are independently
 // owned inside this fixture; no enclosing source repository supplies identity.
 git(workspace,'init','-q','-b','main');
 git(workspace,'add','--','.freedom.json');
 git(workspace,'commit','-q','-m','synthetic external mapping','--','.freedom.json');
 const file=join(transcripts,'example-call','transcript.md');
 const created=isolated(f,()=>createConversation({root:workspace,spec:{header:header(),body:'\n## Now\n\n## Transcript\n\n## Log\n\n## Open questions\n',assets:[],annotations:null},pid:process.pid,by:'python-test'}),workspace,file);
 const revision=spec(created.fileSha256,'python-external-001',[{op:'retitle',title:'Explicit external root'}]);
 const failure=isolated(f,()=>py(f,'\ntry: revise_record(sys.argv[2],json.loads(sys.argv[3]),sys.argv[4])\nexcept ConversationError as e: print(json.dumps([d["code"] for d in e.diagnostics]))',[file,JSON.stringify(revision),created.fileSha256]),workspace,file);
 assert.ok(failure.includes('TARGET_MISMATCH')||failure.includes('WORKSPACE_REQUIRED'));
 const result=isolated(f,()=>py(f,'import os;result=revise_record(sys.argv[2],json.loads(sys.argv[3]),sys.argv[4],workspace=sys.argv[5]);print(json.dumps({"result":result,"parent_binding":os.environ["FREEDOM_WORKSPACE"]}))',[file,JSON.stringify(revision),created.fileSha256,workspace]),workspace,file);
 assert.equal(result.result.path,file);assert.equal(result.result.changed,true);assert.equal(result.parent_binding,f.root);
 assert.equal(py(f,'print(json.dumps(read_record(sys.argv[2],workspace=sys.argv[3])))',[file,workspace]).title,'Explicit external root');
});

test('Python annotate transports complete spec, exact pin and explicit workspace through actual guard',t=>{
 const f=own(t);const created=entry(f,'human-reviewed');const original=py(f,'print(json.dumps(read_record(sys.argv[2],include_body=True)))',[f.entry()]);
 const annotation={markdown:'Synthetic completion interpretation.',citations:[],processing:null,expected_annotations_sha256:null,log};
 const result=isolated(f,()=>py(f,'import os; result=annotate_record(sys.argv[2],json.loads(sys.argv[3]),sys.argv[4],workspace=sys.argv[5]);print(json.dumps({"result":result,"binding":os.environ["FREEDOM_WORKSPACE"]}))',[f.entry(),JSON.stringify(annotation),created.fileSha256,f.root],{FREEDOM_WORKSPACE:join(f.root,'conflicting-binding')}));
 assert.equal(result.result.path,f.entry());assert.match(result.result.fileSha256,/^[a-f0-9]{64}$/);assert.equal(result.binding,join(f.root,'conflicting-binding'));
 const after=py(f,'print(json.dumps(read_record(sys.argv[2],include_body=True)))',[f.entry()]);assert.equal(after.turns[0].text,original.turns[0].text);assert.deepEqual(after.review,original.review);assert.equal(after.turns[0].id,'t-000001');
 assert.match(readFileSync(join(dirname(f.entry()),'annotations.md'),'utf8'),/Synthetic completion interpretation/);
 const frozen=readFileSync(f.entry());
 const fail=mutate(f,'\ntry: annotate_record(sys.argv[2],json.loads(sys.argv[3]),sys.argv[4],workspace=sys.argv[5])\nexcept ConversationError as e: print(json.dumps({"status":e.returncode,"codes":[d["code"] for d in e.diagnostics]}))',[f.entry(),JSON.stringify(annotation),created.fileSha256,f.root]);
 assert.equal(fail.status,3);assert.ok(fail.codes.includes('STALE_PIN'));assert.deepEqual(readFileSync(f.entry()),frozen);
});
