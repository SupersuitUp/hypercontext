import {test} from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixture,header} from './helpers/conversation-fixture.mjs';
import {createConversation,reviseConversation} from './helpers/guarded-freedom-conversation-write.mjs';
import {readConversation} from './helpers/guarded-freedom-conversations.mjs';
import {conversationLockContext} from './helpers/guarded-freedom-conversation-lock.mjs';
import {stateDir} from './helpers/guarded-freedom-workspace.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const evidence={kind:'operator-decision',locator:'synthetic:choice',revision:null,note:'Synthetic explicit attribution choice.'};
const log={date:'2026-10-03',text:'Synthetic controlled revision.',evidence:[evidence]};
const rev=(base,id,operations,extra={})=>({schema_version:1,revision_id:id,base_sha256:base,mode:'routine',authorization:null,operations,log,...extra});
function revisionFixture(review='unreviewed'){
 const f=fixture();test.after(()=>f.close());f.put('self/self.md','---\nname: "Synthetic Operator"\n---\n');
 const meta={speaker:'p-001',sources:[],timing:null,source_gap:'Original capture unavailable.'};
 const body='\n## Now\n\nOne synthetic turn; source missing.\n\n## Transcript\n\n### t-000001\n<!-- turn '+JSON.stringify(meta)+' -->\nOriginal words.\n\n## Log\n\n## Open questions\n\n- Where is the source?\n';
 const h=header({participants:[{id:'p-001',label:'SPEAKER_00',person:'self',status:'confirmed',role:'speaker',evidence:[evidence]}],
 review:{transcription:review,attribution:'unreviewed',processing:'processed',evidence:review==='human-reviewed'?[evidence]:[]}});
 const result=createConversation({root:f.root,spec:{header:h,body,assets:[],annotations:null},pid:process.pid,by:'test'});
 return {f,path:result.path,before:readConversation(result.path)};
}
test('confirmed mapping correction preserves ids labels and utterances',()=>{
 const {path,before}=revisionFixture();
 const spec=rev(before.fileSha256,'mapping-0001',[{op:'map-participant',participant_id:'p-001',person:null,status:'unknown',evidence:[evidence]}]);
 reviseConversation({file:path,spec,expectedSha:before.fileSha256,pid:process.pid,by:'test'});
 const after=readConversation(path);
 assert.equal(after.header.participants[0].person,null);assert.equal(after.header.participants[0].label,'SPEAKER_00');
 assert.deepEqual(after.turns.map(t=>[t.id,t.text]),before.turns.map(t=>[t.id,t.text]));
 assert.equal(after.header.review.processing,'unprocessed');
});
test('capture and new turn retry adds neither a second source nor a second log',()=>{
 const {path,before}=revisionFixture();
 const locator={kind:'service',path:null,url:null,service_id:'987654321',media_type:null,sha256:null,bytes:null,checked_at:null,backup:{status:'unverified',locator:null,sha256:null,verified_at:null}};
 const capture={id:'c-001',type:'cloud_recording',service:'zoom',recording_id:'987654321',vendor_id:null,roles:['transcript-body'],locators:[locator],availability:'remote-only',evidence:[evidence]};
 const turn={id:'t-000002',speaker:'p-001',sources:[{capture:'c-001',locator:0,start_ms:null,end_ms:null}],timing:null,source_gap:null,text:'Additional exact words.\n'};
 const spec=rev(before.fileSha256,'capture-0001',[{op:'add-capture',capture,assets:[]},{op:'append-turns',after_turn_id:null,turns:[turn]}]);
 reviseConversation({file:path,spec,expectedSha:before.fileSha256,pid:process.pid,by:'test'});
 const once=readConversation(path);
 const retry=reviseConversation({file:path,spec,expectedSha:before.fileSha256,pid:process.pid,by:'test'});
 assert.equal(retry.changed,false);assert.equal(readConversation(path).fileSha256,once.fileSha256);
 assert.equal(once.header.sources.length,1);assert.deepEqual(once.turns.map(t=>t.id),['t-000001','t-000002']);
});
test('retitle and rediarization both refuse stale base hashes',()=>{
 const {path,before}=revisionFixture();const stale='0'.repeat(64);const t=before.turns[0];
 const change={turn_id:t.id,before_text_sha256:hash(t.text),speaker:null,sources:[],timing:null,source_gap:'Source missing.',text:t.text.toString(),evidence:[evidence]};
 for(const op of [{op:'retitle',title:'New title'},{op:'revise-turns',changes:[change]}]){
  assert.throws(()=>reviseConversation({file:path,spec:rev(stale,'stale-00001',[op]),expectedSha:stale,pid:process.pid,by:'test'}),/STALE_PIN/);
 }
 assert.equal(readConversation(path).fileSha256,before.fileSha256);
});
test('reviewed speech requires a deliberate revision scoped to the pinned turn',()=>{
 const {path,before}=revisionFixture('human-reviewed');const t=before.turns[0];
 const op={op:'revise-turns',changes:[{turn_id:t.id,before_text_sha256:hash(t.text),speaker:t.speaker,sources:t.sources,timing:t.timing,source_gap:t.source_gap,text:'Corrected words.\n',evidence:[evidence]}]};
 const routine=rev(before.fileSha256,'reviewed-0001',[op]);
 assert.throws(()=>reviseConversation({file:path,spec:routine,expectedSha:before.fileSha256,pid:process.pid,by:'test'}),/REVIEWED_TRANSCRIPT_REVISION_REQUIRED/);
 const deliberate=rev(before.fileSha256,'reviewed-0002',[op],{mode:'deliberate-transcript-revision',authorization:{decision:evidence,base_sha256:before.fileSha256,turn_ids:[t.id]}});
 reviseConversation({file:path,spec:deliberate,expectedSha:before.fileSha256,pid:process.pid,by:'test'});
 const after=readConversation(path);assert.equal(after.turns[0].id,t.id);assert.equal(after.header.review.transcription,'unreviewed');
});

test('append cannot unlock historically reviewed words mapping sources timing or retirement',()=>{
 const {path,before}=revisionFixture('human-reviewed');
 const locator={kind:'service',path:null,url:null,service_id:'987654321',media_type:null,sha256:null,bytes:null,checked_at:null,backup:{status:'unverified',locator:null,sha256:null,verified_at:null}};
 const capture={id:'c-001',type:'cloud_recording',service:'zoom',recording_id:'987654321',vendor_id:null,roles:['transcript-body'],locators:[locator],availability:'remote-only',evidence:[evidence]};
 const next={id:'t-000002',speaker:'p-001',sources:[{capture:'c-001',locator:0,start_ms:null,end_ms:null}],timing:null,source_gap:null,text:'New unreviewed speech.\n'};
 const append=rev(before.fileSha256,'append-guard-01',[{op:'add-capture',capture,assets:[]},{op:'append-turns',after_turn_id:null,turns:[next]}]);
 reviseConversation({file:path,spec:append,expectedSha:before.fileSha256,pid:process.pid,by:'test'});
 const current=readConversation(path);const old=current.turns.find(t=>t.id==='t-000001');
 assert.equal(current.header.review.transcription,'unreviewed');
 const protectedBefore=current.header.extensions.conversation_revision.protected_turns;
 assert.ok(protectedBefore.some(p=>p.turn_id===old.id));
 const change={turn_id:old.id,before_text_sha256:hash(old.text),speaker:old.speaker,sources:old.sources,timing:old.timing,source_gap:old.source_gap,text:old.text.toString(),evidence:[evidence]};
 const ops=[
  {op:'revise-turns',changes:[{...change,text:'Routine overwrite.\n'}]},
  {op:'map-participant',participant_id:'p-001',person:null,status:'unknown',evidence:[evidence]},
  {op:'revise-turns',changes:[{...change,sources:[{capture:'c-001',locator:0,start_ms:null,end_ms:null}],source_gap:null}]},
  {op:'revise-turns',changes:[{...change,timing:{basis:'capture',capture:'c-001',start_ms:0,end_ms:1000}}]},
  {op:'retire-turns',turn_ids:[old.id],replacement_turn_ids:[next.id],evidence:[evidence]}
 ];
 for(const [i,op] of ops.entries()){
  const spec=rev(current.fileSha256,'routine-after-append-'+i,[op]);
  assert.throws(()=>reviseConversation({file:path,spec,expectedSha:current.fileSha256,pid:process.pid,by:'test'}),/REVIEWED_TRANSCRIPT_REVISION_REQUIRED/);
  assert.equal(readConversation(path).fileSha256,current.fileSha256);
 }
 const deliberate=rev(current.fileSha256,'deliberate-after-append',[{op:'revise-turns',changes:[{...change,text:'Authorized corrected words.\n'}]}],
  {mode:'deliberate-transcript-revision',authorization:{decision:evidence,base_sha256:current.fileSha256,turn_ids:[old.id]}});
 reviseConversation({file:path,spec:deliberate,expectedSha:current.fileSha256,pid:process.pid,by:'test'});
 const corrected=readConversation(path);const p0=protectedBefore.find(p=>p.turn_id===old.id);
 const p1=corrected.header.extensions.conversation_revision.protected_turns.find(p=>p.turn_id===old.id);
 assert.ok(p1);assert.deepEqual(p1.reviewed_versions,p0.reviewed_versions);assert.notEqual(p1.baseline_sha256,p0.baseline_sha256);
 assert.equal(corrected.header.review.transcription,'unreviewed');assert.equal(corrected.turns[0].id,old.id);
 const again=corrected.turns[0];const overwrite=rev(corrected.fileSha256,'routine-after-correction',[{op:'revise-turns',changes:[{...change,before_text_sha256:hash(again.text),text:'Another routine overwrite.\n'}]}]);
 assert.throws(()=>reviseConversation({file:path,spec:overwrite,expectedSha:corrected.fileSha256,pid:process.pid,by:'test'}),/REVIEWED_TRANSCRIPT_REVISION_REQUIRED/);
 assert.equal(readConversation(path).fileSha256,corrected.fileSha256);
});

import {readFileSync,writeFileSync,existsSync,statSync,readdirSync,unlinkSync} from 'node:fs';
import {join,dirname,sep} from 'node:path';
import {capture as makeCapture,locator as makeLocator,participant as makeParticipant,bytes} from './helpers/conversation-fixture.mjs';
import {annotateConversation,recoverConversationRevision} from './helpers/guarded-freedom-conversation-write.mjs';
const apply=(path,before,id,operations,extra={},options={})=>reviseConversation({file:path,spec:rev(before.fileSha256,id,operations,extra),expectedSha:before.fileSha256,pid:process.pid,by:'test',...options});
const nextTurn=(id='t-000002',text='Additional exact words.\n')=>({id,speaker:'p-001',sources:[],timing:null,source_gap:'Capture unavailable.',text});
const change=(t,patch={})=>({turn_id:t.id,before_text_sha256:hash(t.text),speaker:t.speaker,sources:t.sources,timing:t.timing,source_gap:t.source_gap,text:t.text.toString(),evidence:[evidence],...patch});
const deliberate=(before,ids)=>({mode:'deliberate-transcript-revision',authorization:{decision:evidence,base_sha256:before.fileSha256,turn_ids:ids}});

test('retitle preserves all words immutable metadata and annotations',()=>{
 const {path,before,f}=revisionFixture();const annotations=f.put(join(f.rel,'example-call','annotations.md'),'Original interpretation.\n');
 apply(path,before,'retitle-0001',[{op:'retitle',title:'Replacement title'}]);const after=readConversation(path);
 assert.equal(after.header.title,'Replacement title');assert.deepEqual(after.turns.map(t=>[t.id,t.text]),before.turns.map(t=>[t.id,t.text]));
 for(const key of ['id','date','start','keep','audience','aliases','legacy'])assert.deepEqual(after.header[key],before.header[key]);assert.equal(readFileSync(annotations,'utf8'),'Original interpretation.\n');
});
test('same-spec append cannot downgrade protection before edit and stale new spec refuses',()=>{
 const {path,before}=revisionFixture('human-reviewed');const ops=[{op:'append-turns',after_turn_id:null,turns:[nextTurn()]},{op:'revise-turns',changes:[change(before.turns[0],{text:'Forbidden.\n'})]}];
 assert.throws(()=>apply(path,before,'same-spec-0001',ops),/REVIEWED_TRANSCRIPT_REVISION_REQUIRED/);assert.equal(readConversation(path).fileSha256,before.fileSha256);
 apply(path,before,'append-0000001',[ops[0]]);assert.throws(()=>apply(path,before,'stale-after-01',[{op:'retitle',title:'Stale'}]),/STALE_PIN/);
});
test('wrong authorization set or base refuses without writes',()=>{
 const {path,before}=revisionFixture('human-reviewed');const op={op:'revise-turns',changes:[change(before.turns[0],{text:'Authorized only with exact scope.\n'})]};
 for(const extra of [deliberate(before,[]),deliberate(before,['t-000002']),{...deliberate(before,['t-000001']),authorization:{...deliberate(before,['t-000001']).authorization,base_sha256:'0'.repeat(64)}}])assert.throws(()=>apply(path,before,'bad-auth-00001',[op],extra),/REVISION_AUTHORIZATION_MISMATCH/);
 assert.equal(readConversation(path).fileSha256,before.fileSha256);
});
test('manual protected semantic baseline mismatch refuses even a retitle',()=>{
 const {path,before}=revisionFixture('human-reviewed');const raw=readFileSync(path,'utf8');writeFileSync(path,raw.replace('Original words.','Unapproved words.'));const modified=readConversation(path);
 assert.throws(()=>apply(path,modified,'manual-mismatch',[{op:'retitle',title:'Cannot reset baseline'}]),/REVIEW_BASELINE_MISMATCH/);assert.equal(readFileSync(path,'utf8'),raw.replace('Original words.','Unapproved words.'));
});
test('participant label immutable and discriminated operations reject arbitrary patches',()=>{
 const {path,before}=revisionFixture();
 for(const op of [{op:'map-participant',participant_id:'p-001',person:null,status:'unknown',label:'Changed',evidence:[evidence]},{op:'patch',path:'/keep/scope',value:'share'},{op:'retitle',title:'Title',date:'2026-10-04'}])assert.throws(()=>apply(path,before,'invalid-op-001',[op]),/REVISION_SPEC_INVALID/);
 assert.equal(readConversation(path).fileSha256,before.fileSha256);
});
test('append preserves physical order and refuses reused ids with changed bytes',()=>{
 const {path,before}=revisionFixture();apply(path,before,'append-order-01',[{op:'append-turns',after_turn_id:null,turns:[nextTurn()]}]);const middle=readConversation(path);
 apply(path,middle,'insert-order-01',[{op:'append-turns',after_turn_id:'t-000001',turns:[nextTurn('t-000003','Inserted exact words.\r\n')]}]);const after=readConversation(path);
 assert.deepEqual(after.turns.map(t=>t.id),['t-000001','t-000003','t-000002']);assert.equal(after.turns[1].text.toString(),'Inserted exact words.\r\n');
 assert.throws(()=>apply(path,after,'reuse-differ-01',[{op:'append-turns',after_turn_id:null,turns:[nextTurn('t-000002','Different words.\n')]}]),/TURN_ID_COLLISION/);
});
test('retirement retains original journal bytes and propagates protection to replacements',()=>{
 const {path,before}=revisionFixture('human-reviewed');const operations=[{op:'append-turns',after_turn_id:null,turns:[nextTurn('t-000002','Replacement exact words.\n')]},{op:'retire-turns',turn_ids:['t-000001'],replacement_turn_ids:['t-000002'],evidence:[evidence]}];
 const result=apply(path,before,'retirement-0001',operations,deliberate(before,['t-000001']));const after=readConversation(path);assert.deepEqual(after.turns.map(t=>t.id),['t-000002']);
 const state=after.header.extensions.conversation_revision,old=state.protected_turns.find(p=>p.turn_id==='t-000001'),replacement=state.protected_turns.find(p=>p.turn_id==='t-000002');
 assert.equal(old.retired,true);assert.deepEqual(replacement.reviewed_versions,old.reviewed_versions);assert.ok(state.retired_turn_ids.includes('t-000001'));assert.equal(state.next_turn_number,3);
 const journal=JSON.parse(readFileSync(result.journal_path));assert.ok(journal.reviewed_input_base64);assert.ok(journal.operations.some(o=>o.before_base64&&Buffer.from(o.before_base64,'base64').equals(readFileSync(path))===false));
 assert.throws(()=>apply(path,after,'retired-reuse-01',[{op:'append-turns',after_turn_id:null,turns:[nextTurn('t-000001')]}]),/TURN_ID_RETIRED/);
 assert.throws(()=>apply(path,after,'replace-guard-01',[{op:'revise-turns',changes:[change(after.turns[0],{text:'Forbidden replacement edit.\n'})]}]),/REVIEWED_TRANSCRIPT_REVISION_REQUIRED/);
});
test('capture identities are exact and participant/capture identical additions are no-ops',()=>{
 const {path,before}=revisionFixture();apply(path,before,'capture-add-001',[{op:'add-capture',capture:makeCapture(),assets:[]}]);let current=readConversation(path);
 assert.throws(()=>apply(path,current,'capture-dupe-01',[{op:'add-capture',capture:makeCapture({id:'c-002'}),assets:[]}]),/CAPTURE_IDENTITY_COLLISION/);
 apply(path,current,'service-new-001',[{op:'add-capture',capture:makeCapture({id:'c-002',service:'meet'}),assets:[]}]);current=readConversation(path);
 const result=apply(path,current,'identical-00001',[{op:'add-capture',capture:makeCapture(),assets:[]},{op:'add-participant',participant:current.header.participants[0]}]);assert.equal(result.changed,false);assert.equal(readConversation(path).fileSha256,current.fileSha256);
 assert.throws(()=>apply(path,current,'participant-dupe',[{op:'add-participant',participant:{...current.header.participants[0],label:'Other label'}}]),/PARTICIPANT_ID_COLLISION/);
});
test('old retry never succeeds after later revision, same id different spec refuses',()=>{
 const {path,before}=revisionFixture();const spec=rev(before.fileSha256,'retry-first-001',[{op:'retitle',title:'First title'}]);const result=reviseConversation({file:path,spec,expectedSha:before.fileSha256,pid:process.pid,by:'test'});let current=readConversation(path);
 assert.throws(()=>reviseConversation({file:path,spec:{...spec,log:{...log,text:'Different request'}},expectedSha:before.fileSha256,pid:process.pid,by:'test'}),/REVISION_ID_COLLISION/);
 apply(path,current,'retry-later-001',[{op:'retitle',title:'Later title'}]);assert.throws(()=>reviseConversation({file:path,spec,expectedSha:before.fileSha256,pid:process.pid,by:'test'}),/STALE_REVISION_RETRY/);assert.equal(readConversation(path).header.title,'Later title');assert.equal(statSync(result.journal_path).mode&0o777,0o600);
});
test('source locator additions preserve selected locator protection and reject asset collisions',()=>{
 const {path,before,f}=revisionFixture('human-reviewed');const from=f.put('input.bin','bytes');const sha256=hash('bytes');const l=makeLocator({kind:'bundled',path:'sources/c-001/file.bin',service_id:null,sha256,bytes:5});
 apply(path,before,'source-0000001',[{op:'add-capture',capture:makeCapture(),assets:[]}]);let current=readConversation(path),protectedBefore=current.header.extensions.conversation_revision.protected_turns;
 apply(path,current,'locator-0000001',[{op:'add-capture-locator',capture_id:'c-001',locator:l,asset:{relativePath:l.path,fromPath:from,sha256},evidence:[evidence]}]);current=readConversation(path);assert.deepEqual(current.header.extensions.conversation_revision.protected_turns,protectedBefore);
 const other=f.put('other.bin','other');assert.throws(()=>apply(path,current,'asset-collide-01',[{op:'add-capture-locator',capture_id:'c-001',locator:{...l,sha256:hash('other')},asset:{relativePath:l.path,fromPath:other,sha256:hash('other')},evidence:[evidence]}]),/ASSET_PATH_COLLISION/);
});
test('full protection pre/postimages survive resume and reverse after every revision file',()=>{
 for(const action of ['resume','reverse'])for(const stop of [1,2,3]){
  const {path,before,f}=revisionFixture('human-reviewed');const raw=readFileSync(path);const from=f.put('input.bin','source');const sha256=hash('source');
  const locator=makeLocator({kind:'bundled',path:'sources/c-001/file.bin',service_id:null,sha256,bytes:6});const cap=makeCapture({locators:[locator]});
  const operations=[{op:'add-capture',capture:cap,assets:[{relativePath:locator.path,fromPath:from,sha256},{relativePath:'derived/c-001/segments.json',fromPath:from,sha256}]},{op:'revise-turns',changes:[change(before.turns[0],{text:'Authorized corrected words.\n'})]}];
  const spec=rev(before.fileSha256,`crash-${action}-${stop}-0001`,operations,deliberate(before,['t-000001']));let journal;
  assert.throws(()=>reviseConversation({file:path,spec,expectedSha:before.fileSha256,pid:process.pid,by:'test',afterOperation:(_op,j)=>{journal=j;if(j.completed===stop)throw new Error('synthetic crash');}}),/REVISION_INCOMPLETE/);
  const persisted=JSON.parse(readFileSync(journal.journal_path));assert.deepEqual(persisted.protection_before,before.header.extensions.conversation_revision);assert.equal(persisted.state,'applying');
  assert.throws(()=>apply(path,readConversation(path),'blocked-new-001',[{op:'retitle',title:'No new revision'}]),/REVISION_INCOMPLETE/);
  recoverConversationRevision({file:path,revisionId:spec.revision_id,action,pid:process.pid,by:'test'});const after=readConversation(path);
  if(action==='reverse'){assert.deepEqual(readFileSync(path),raw);assert.deepEqual(after.header.extensions.conversation_revision,persisted.protection_before);assert.equal(existsSync(join(dirname(path),locator.path)),false);}
  else{assert.deepEqual(after.header.extensions.conversation_revision,persisted.protection_after);assert.equal(after.turns[0].text.toString(),'Authorized corrected words.\n');assert.equal(after.body.toString().split('revision '+spec.revision_id).length-1,1);const retry=reviseConversation({file:path,spec,expectedSha:before.fileSha256,pid:process.pid,by:'test'});assert.equal(retry.changed,false);assert.deepEqual(readConversation(path).header.extensions.conversation_revision,persisted.protection_after);}
 }
});
test('recovery refuses third-state edit before restoring any other touched path',()=>{
 const {path,before,f}=revisionFixture();const from=f.put('input','source'),sha256=hash('source');const l=makeLocator({kind:'bundled',path:'sources/c-001/file.bin',service_id:null,sha256,bytes:6});
 const spec=rev(before.fileSha256,'third-state-001',[{op:'add-capture',capture:makeCapture({locators:[l]}),assets:[{relativePath:l.path,fromPath:from,sha256}]}]);let journal;
 assert.throws(()=>reviseConversation({file:path,spec,expectedSha:before.fileSha256,pid:process.pid,by:'test',afterOperation:(_op,j)=>{journal=j;throw new Error('crash');}}),/REVISION_INCOMPLETE/);
 writeFileSync(path,Buffer.concat([readFileSync(path),Buffer.from('Third-state edit.\n')]));const original=readFileSync(path),asset=readFileSync(join(dirname(path),l.path));
 for(const action of ['resume','reverse'])assert.throws(()=>recoverConversationRevision({file:path,revisionId:spec.revision_id,action,pid:process.pid,by:'test'}),/RECOVERY_THIRD_STATE/);
 assert.deepEqual(readFileSync(path),original);assert.deepEqual(readFileSync(join(dirname(path),l.path)),asset);
});

test('preexisting reviewed input without metadata initializes baseline in same reversible journal',()=>{
 const f=fixture();test.after(()=>f.close());const h=header({participants:[makeParticipant()],review:{transcription:'human-reviewed',attribution:'unreviewed',processing:'processed',evidence:[evidence]}});
 const body='\n## Now\n\n## Transcript\n\n### t-000001\n<!-- turn {"speaker":"p-001","sources":[],"timing":null,"source_gap":"Unavailable."} -->\nOriginal uninitialized exact words.\n\n## Log\n\n## Open questions\n';
 f.put(join(f.rel,'example-call','transcript.md'),bytes(h,body));const path=f.entry(),before=readConversation(path),raw=readFileSync(path);
 const result=apply(path,before,'initialize-0001',[{op:'retitle',title:'Initialized title'}]);const journal=JSON.parse(readFileSync(result.journal_path));const protectedTurn=readConversation(path).header.extensions.conversation_revision.protected_turns[0];
 assert.equal(protectedTurn.reviewed_versions[0].entry_revision.value,hash(raw));assert.deepEqual(Buffer.from(journal.reviewed_input_base64,'base64'),raw);assert.equal(journal.protection_before,null);
 recoverConversationRevision({file:path,revisionId:'initialize-0001',action:'reverse',pid:process.pid,by:'test'});assert.deepEqual(readFileSync(path),raw);
 assert.throws(()=>apply(path,readConversation(path),'reprotect-00001',[{op:'revise-turns',changes:[change(readConversation(path).turns[0],{text:'Routine overwrite.\n'})]}]),/REVIEWED_TRANSCRIPT_REVISION_REQUIRED/);
});
test('lost historical reviewed protection cannot be reset by unreviewed flag',()=>{
 const {path,before}=revisionFixture('human-reviewed');apply(path,before,'append-hist-001',[{op:'append-turns',after_turn_id:null,turns:[nextTurn()]}]);const current=readConversation(path),h=structuredClone(current.header);delete h.extensions.conversation_revision;writeFileSync(path,bytes(h,current.body));const raw=readFileSync(path);
 assert.throws(()=>apply(path,readConversation(path),'lost-protect-01',[{op:'retitle',title:'Cannot hide history'}]),/REVIEW_PROTECTION_UNRESOLVED/);assert.deepEqual(readFileSync(path),raw);
});
test('existing selected locator additions are routine and preserve full protected state',()=>{
 const f=fixture();test.after(()=>f.close());const h=header({participants:[makeParticipant()],sources:[makeCapture()],review:{transcription:'human-reviewed',attribution:'human-reviewed',processing:'processed',evidence:[evidence]}});
 const body='\n## Now\n\n## Transcript\n\n### t-000001\n<!-- turn {"speaker":"p-001","sources":[{"capture":"c-001","locator":0,"start_ms":0,"end_ms":1000}],"timing":{"basis":"capture","capture":"c-001","start_ms":0,"end_ms":1000},"source_gap":null} -->\nExact protected source words.\n\n## Log\n\n## Open questions\n';
 createConversation({root:f.root,spec:{header:h,body,assets:[],annotations:null},pid:process.pid,by:'test'});const before=readConversation(f.entry());
 apply(f.entry(),before,'loc-preserve-01',[{op:'add-capture-locator',capture_id:'c-001',locator:makeLocator({url:'https://synthetic.invalid/recording'}),asset:null,evidence:[evidence]}]);const after=readConversation(f.entry());
 assert.deepEqual(after.header.extensions.conversation_revision.protected_turns,before.header.extensions.conversation_revision.protected_turns);assert.equal(after.header.review.transcription,'human-reviewed');assert.equal(after.header.review.processing,'processed');
});
test('new participant/capture references may precede additions within the same spec',()=>{
 const {path,before}=revisionFixture();const t={...nextTurn(),speaker:'p-002',sources:[{capture:'c-001',locator:0,start_ms:null,end_ms:null}],source_gap:null};
 apply(path,before,'future-refs-001',[{op:'append-turns',after_turn_id:null,turns:[t]},{op:'add-participant',participant:makeParticipant({id:'p-002'})},{op:'add-capture',capture:makeCapture(),assets:[]}]);assert.equal(readConversation(path).turns[1].speaker,'p-002');
});
test('untouched sidecar changes during fault injection block next entry write',()=>{
 const {path,before,f}=revisionFixture();const ann=f.put(join(f.rel,'example-call','annotations.md'),'Pinned interpretation.\n');const from=f.put('input','source'),sha256=hash('source');const l=makeLocator({kind:'bundled',path:'sources/c-001/file.bin',service_id:null,sha256,bytes:6});
 assert.throws(()=>apply(path,before,'sidecar-race-01',[{op:'add-capture',capture:makeCapture({locators:[l]}),assets:[{relativePath:l.path,fromPath:from,sha256}]}],{},{afterOperation:()=>writeFileSync(ann,'Other writer interpretation.\n')}),/RECOVERY_THIRD_STATE|REVISION_INCOMPLETE/);
 assert.equal(readConversation(path).fileSha256,before.fileSha256);assert.equal(readFileSync(ann,'utf8'),'Other writer interpretation.\n');
});

test('later completed no-op journal still makes an older completed spec stale',()=>{
 const {path,before}=revisionFixture();const operations=[{op:'retitle',title:'One title'}];apply(path,before,'ordered-first-01',operations);const current=readConversation(path);const noop=apply(path,current,'ordered-next-001',operations);assert.equal(noop.changed,false);
 assert.throws(()=>apply(path,before,'ordered-first-01',operations),/STALE_REVISION_RETRY/);
});

test('disputed review stays disputed and stale utterance hashes refuse',()=>{
 const {path,before}=revisionFixture('disputed');assert.throws(()=>apply(path,before,'utterance-stale',[{op:'revise-turns',changes:[change(before.turns[0],{before_text_sha256:'0'.repeat(64),text:'Changed.\n'})]}]),/STALE_TURN_PIN/);
 apply(path,before,'disputed-change',[{op:'revise-turns',changes:[change(before.turns[0],{text:'Unreviewed correction.\n'})]}]);assert.equal(readConversation(path).header.review.transcription,'disputed');
});
test('full journal integrity binds spec bytes and protection images before recovery',()=>{
 const {path,before}=revisionFixture('human-reviewed');let journal;
 assert.throws(()=>apply(path,before,'journal-tamper-01',[{op:'retitle',title:'Pinned title'}],{},{afterOperation:(_op,j)=>{journal=j;throw new Error('crash');}}),/REVISION_INCOMPLETE/);const persisted=JSON.parse(readFileSync(journal.journal_path)),raw=readFileSync(path);persisted.protection_after.protected_turns=[];writeFileSync(journal.journal_path,JSON.stringify(persisted));
 assert.throws(()=>recoverConversationRevision({file:path,revisionId:'journal-tamper-01',action:'resume',pid:process.pid,by:'test'}),/JOURNAL_IDENTITY_MISMATCH/);assert.deepEqual(readFileSync(path),raw);
});
test('new changed and confirmed-upgrade participant references need readable records before journaling',()=>{
 for(const kind of ['add','change','upgrade']){
  const {f,path,before}=revisionFixture();let current=before;
  if(kind==='upgrade'){
   f.put('people/later-missing.md','Synthetic candidate.');apply(path,current,'candidate-map01',[{op:'map-participant',participant_id:'p-001',person:'later-missing',status:'proposed',evidence:[evidence]}]);current=readConversation(path);unlinkSync(join(f.root,'people/later-missing.md'));
  }
  const person=kind==='upgrade'?'later-missing':'not-present',op=kind==='add'?{op:'add-participant',participant:makeParticipant({id:'p-002',person,status:'proposed'})}:{op:'map-participant',participant_id:'p-001',person,status:kind==='upgrade'?'confirmed':'proposed',evidence:[evidence]};
  const ann=f.put(join(f.rel,'example-call','annotations.md'),'Existing interpretation.\n'),raw=readFileSync(path),beforeJournals=readdirSync(conversationLockContext(f.root).journalDir).sort();
  assert.throws(()=>apply(path,current,'person-refuse01',[op]),error=>{assert.equal(error.code,'PERSON_REFERENCE_UNRESOLVED');assert.equal(error.diagnostics[0].path,null);return true;});
  assert.deepEqual(readFileSync(path),raw);assert.equal(readFileSync(ann,'utf8'),'Existing interpretation.\n');assert.deepEqual(readdirSync(conversationLockContext(f.root).journalDir).sort(),beforeJournals);
 }
});
test('unchanged historical participant references survive later missing records and exact revision retry',()=>{
 const {f,path,before}=revisionFixture();unlinkSync(join(f.root,'self/self.md'));const operations=[{op:'retitle',title:'Historical reference retained'}];
 const result=apply(path,before,'historical-ref01',operations),once=readConversation(path);assert.equal(once.header.participants[0].person,'self');assert.equal(result.changed,true);
 assert.equal(apply(path,before,'historical-ref01',operations).changed,false);assert.equal(readConversation(path).fileSha256,once.fileSha256);
});

function copiedReviewedHistory(){
 const source=fixture(),copy=fixture();test.after(()=>source.close());test.after(()=>copy.close());
 const meta='<!-- turn { "speaker" : null, "sources" : [], "timing" : null, "source_gap" : "Unavailable capture." } -->\n';
 const body='\n## Now\n\n## Transcript\n\n### t-000001\n'+meta+'First reviewed λ words.\r\n\r\n### t-000002\n'+meta+'Second reviewed words.\n\n## Log\n\n## Open questions\n';
 withIsolatedLogWriter(source,()=>createConversation({root:source.root,spec:{header:header({review:{transcription:'human-reviewed',attribution:'unreviewed',processing:'processed',evidence:[evidence]}}),body,assets:[],annotations:null},pid:process.pid,by:'test'}));
 withIsolatedLogWriter(source,()=>apply(source.entry(),readConversation(source.entry()),'reviewed-copy01',[{op:'append-turns',after_turn_id:null,turns:[{...nextTurn('t-000003'),speaker:null}]}],{},{root:source.root}));
 copy.put(join(copy.rel,'example-call','transcript.md'),readFileSync(source.entry()));assert.equal(existsSync(conversationLockContext(copy.root).journalDir),false);
 return copy;
}
for(const missing of ['empty','partial'])test(`copied reviewed history refuses ${missing} protection map without local journals`,()=>{
 const f=copiedReviewedHistory(),current=readConversation(f.entry()),h=structuredClone(current.header);
 h.extensions.conversation_revision.protected_turns=missing==='empty'?[]:h.extensions.conversation_revision.protected_turns.filter(p=>p.turn_id!=='t-000001');
 writeFileSync(f.entry(),bytes(h,current.body));const before=readConversation(f.entry()),raw=readFileSync(f.entry());const ann=f.put(join(f.rel,'example-call','annotations.md'),'Preserved copied interpretation.\n');
 assert.throws(()=>apply(f.entry(),before,'copied-missing01',[{op:'revise-turns',changes:[change(before.turns[0],{text:'Forbidden routine overwrite.\n'})]}]),/REVIEW_PROTECTION_UNRESOLVED/);
 assert.deepEqual(readFileSync(f.entry()),raw);assert.equal(readFileSync(ann,'utf8'),'Preserved copied interpretation.\n');assert.equal(existsSync(conversationLockContext(f.root).journalDir),false);
});
test('copied complete protection permits unrelated unreviewed append and protects historical speech',()=>{
 const f=copiedReviewedHistory(),before=readConversation(f.entry()),protectedBefore=structuredClone(before.header.extensions.conversation_revision.protected_turns);
 apply(f.entry(),before,'copied-append01',[{op:'append-turns',after_turn_id:null,turns:[{...nextTurn('t-000004','Unrelated unreviewed words.\n'),speaker:null}]}]);const appended=readConversation(f.entry());
 assert.deepEqual(appended.header.extensions.conversation_revision.protected_turns,protectedBefore);assert.deepEqual(appended.turns.slice(0,3).map(t=>t.text),before.turns.map(t=>t.text));
 assert.throws(()=>apply(f.entry(),appended,'copied-guard01',[{op:'revise-turns',changes:[change(appended.turns[0],{text:'Forbidden historical edit.\n'})]}]),/REVIEWED_TRANSCRIPT_REVISION_REQUIRED/);
 apply(f.entry(),appended,'copied-newer01',[{op:'revise-turns',changes:[change(appended.turns[2],{text:'Allowed unreviewed correction.\n'})]}]);assert.equal(readConversation(f.entry()).turns[2].text.toString(),'Allowed unreviewed correction.\n');
});
test('ordinary retitle preserves noncompact transcript metadata with a later display title',()=>{
 const f=fixture();test.after(()=>f.close());
 const body='\r\n## Now\r\n\r\n## Transcript\r\n\r\n### t-000001\r\n<!-- turn { "speaker" : null, "sources" : [], "timing" : null, "source_gap" : "Unavailable capture." } -->\r\nExact retained λ words.\r\n\r\n## Log\r\n\r\n## Open questions\r\n\r\n  # Example call ##\r\n';
 createConversation({root:f.root,spec:{header:header(),body,assets:[],annotations:null},pid:process.pid,by:'test'});const before=readConversation(f.entry()),transcript=before.sections.find(s=>s.name==='Transcript').bytes;
 apply(f.entry(),before,'later-h1-title01',[{op:'retitle',title:'Changed display title'}]);const after=readConversation(f.entry());assert.equal(after.header.title,'Changed display title');
 assert.match(after.body.toString(),/  # Changed display title ##\r\n/);assert.deepEqual(after.sections.find(s=>s.name==='Transcript').bytes,transcript);assert.deepEqual(after.turns.map(t=>t.text),before.turns.map(t=>t.text));
 for(const key of ['id','participants','sources','keep','audience','date','start','aliases','legacy'])assert.deepEqual(after.header[key],before.header[key]);
});
test('retitle locates a later display title after same-spec transcript reconstruction',()=>{
 const f=fixture();test.after(()=>f.close());const body='\n## Now\n\n## Transcript\n\n### t-000001\n<!-- turn { "speaker" : null, "sources" : [], "timing" : null, "source_gap" : "Unavailable." } -->\nExact original words.\n\n## Log\n\n## Open questions\n\n# Example call\n';
 createConversation({root:f.root,spec:{header:header(),body,assets:[],annotations:null},pid:process.pid,by:'test'});const before=readConversation(f.entry());
 apply(f.entry(),before,'later-h1-mixed01',[{op:'append-turns',after_turn_id:null,turns:[{...nextTurn('t-000002'),speaker:null}]},{op:'retitle',title:'Mixed replacement title'}]);const after=readConversation(f.entry());
 assert.equal(after.header.title,'Mixed replacement title');assert.match(after.body.toString(),/\n# Mixed replacement title\n/);assert.deepEqual(after.turns[0].text,before.turns[0].text);assert.equal(after.turns.length,2);
});
const legacyLogBody=body=>Buffer.from(body.toString().replace(/<!-- revision (\{.*\}) -->/g,(_all,json)=>{const value=JSON.parse(json);delete value.protected_turn_ids;return '<!-- revision '+JSON.stringify(value)+' -->';}));
test('older structured human review without coverage needs its matching owned journal',()=>{
 const f=copiedReviewedHistory(),record=readConversation(f.entry());writeFileSync(f.entry(),bytes(record.header,legacyLogBody(record.body)));const before=readConversation(f.entry()),raw=readFileSync(f.entry());
 assert.throws(()=>apply(f.entry(),before,'legacy-no-proof',[{op:'retitle',title:'Unproven legacy title'}]),/REVIEW_PROTECTION_UNRESOLVED/);assert.deepEqual(readFileSync(f.entry()),raw);assert.equal(existsSync(conversationLockContext(f.root).journalDir),false);
 const source=revisionFixture('human-reviewed');apply(source.path,source.before,'legacy-with-proof',[{op:'append-turns',after_turn_id:null,turns:[nextTurn()]}]);const current=readConversation(source.path),oldBody=legacyLogBody(current.body);writeFileSync(source.path,bytes(current.header,oldBody));
 const historicalLine=oldBody.toString().split(/\r?\n/).find(line=>line.includes('<!-- revision '));assert.ok(historicalLine);
 apply(source.path,readConversation(source.path),'legacy-proved01',[{op:'retitle',title:'Proven legacy title'}]);const after=readConversation(source.path);assert.deepEqual(after.header.extensions.conversation_revision.protected_turns,current.header.extensions.conversation_revision.protected_turns);assert.ok(after.body.includes(Buffer.from(historicalLine)));
});
test('malformed declared protection coverage refuses before any record or journal changes',()=>{
 for(const coverage of [null,'t-000001',['t-000002','t-000001'],['t-000001','t-000001'],['unknown-turn']]){
  const f=copiedReviewedHistory(),record=readConversation(f.entry()),body=record.body.toString().replace(/<!-- revision (\{.*\}) -->/g,(_all,json)=>{const value=JSON.parse(json);value.protected_turn_ids=coverage;return '<!-- revision '+JSON.stringify(value)+' -->';});writeFileSync(f.entry(),bytes(record.header,body));const before=readConversation(f.entry()),raw=readFileSync(f.entry());
  assert.throws(()=>apply(f.entry(),before,'malformed-cover',[{op:'retitle',title:'Cannot mutate'}]),/REVIEW_PROTECTION_UNRESOLVED/);assert.deepEqual(readFileSync(f.entry()),raw);assert.equal(existsSync(conversationLockContext(f.root).journalDir),false);
 }
});
test('copied retirement coverage retains retired origins and protected replacements',()=>{
 for(const missing of [null,'t-000001','t-000002']){
  const source=revisionFixture('human-reviewed'),copy=fixture();test.after(()=>copy.close());
  apply(source.path,source.before,'copied-retire01',[{op:'append-turns',after_turn_id:null,turns:[nextTurn()]},{op:'retire-turns',turn_ids:['t-000001'],replacement_turn_ids:['t-000002'],evidence:[evidence]}],deliberate(source.before,['t-000001']));const record=readConversation(source.path),h=structuredClone(record.header);
  if(missing)h.extensions.conversation_revision.protected_turns=h.extensions.conversation_revision.protected_turns.filter(p=>p.turn_id!==missing);copy.put(join(copy.rel,'example-call','transcript.md'),bytes(h,record.body));const before=readConversation(copy.entry()),raw=readFileSync(copy.entry());
  assert.throws(()=>apply(copy.entry(),before,'copy-retire-edit',[{op:'revise-turns',changes:[change(before.turns[0],{text:'Forbidden replacement edit.\n'})]}]),missing?/REVIEW_PROTECTION_UNRESOLVED/:/REVIEWED_TRANSCRIPT_REVISION_REQUIRED/);assert.deepEqual(readFileSync(copy.entry()),raw);assert.equal(existsSync(conversationLockContext(copy.root).journalDir),false);
 }
});
test('retitle refuses an H1 owned by utterance bytes without rewriting or journaling',()=>{
 const f=fixture();test.after(()=>f.close());const body='\n## Now\n\n## Transcript\n\n### t-000001\n<!-- turn {"speaker":null,"sources":[],"timing":null,"source_gap":"Unavailable."} -->\nExact utterance.\n\n# Example call\n\n## Log\n\n## Open questions\n';
 createConversation({root:f.root,spec:{header:header(),body,assets:[],annotations:null},pid:process.pid,by:'test'});const before=readConversation(f.entry()),raw=readFileSync(f.entry()),files=readdirSync(conversationLockContext(f.root).journalDir).sort();assert.ok(before.turns[0].text.includes(Buffer.from('# Example call')));
 assert.throws(()=>apply(f.entry(),before,'speech-h1-refuse',[{op:'retitle',title:'Cannot rewrite speech'}]),/TITLE_MISMATCH/);assert.deepEqual(readFileSync(f.entry()),raw);assert.deepEqual(readdirSync(conversationLockContext(f.root).journalDir).sort(),files);
});

function withIsolatedLogWriter(f,fn){
 const keys=['FREEDOM_HOME','FREEDOM_WORKSPACE','GIT_DIR','GIT_WORK_TREE','GIT_COMMON_DIR'],previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 process.env.FREEDOM_HOME=f.root;for(const key of keys.slice(1))delete process.env[key];
 try{
  const c=conversationLockContext(f.root),captureState=stateDir('catch-up-freeda',f.root);assert.equal(c.gitCommonDir,null);assert.equal(process.env.FREEDOM_HOME,f.root);
  for(const path of [c.root,c.transcripts,f.entry(),c.lockPath,c.journalDir,captureState,join(captureState,'.lock')])assert.ok(path===f.root||path.startsWith(f.root+sep),path);
  return fn(c);
 }finally{for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
function revisionLogExample(review='unreviewed'){
 return '- 2026-10-03 - revision example-log-01: Literal example. <!-- revision '+JSON.stringify({revision_id:'example-log-01',evidence:[evidence],turn_ids:[],prior_review:{transcription:review,attribution:'unreviewed',processing:'processed',evidence:review==='human-reviewed'?[evidence]:[]},protected_turn_ids:review==='human-reviewed'?['t-000001']:[]})+' -->';
}
function rawLogFixture(example){
 const f=fixture();test.after(()=>f.close());
 const body='\n## Now\n\n## Transcript\n\n### t-000001\n<!-- turn { "speaker" : null, "sources" : [], "timing" : null, "source_gap" : "Unavailable." } -->\nExact retained λ words.\r\n\r\n## Log\n\n'+example+'\n## Open questions\n';
 f.put(join(f.rel,'example-call','transcript.md'),bytes(header(),body));const before=readConversation(f.entry());assert.deepEqual(before.diagnostics.filter(d=>d.severity==='error'),[]);return {f,before};
}
for(const review of ['unreviewed','human-reviewed'])test(`revision preserves actual blockquoted Log ${review} examples without protecting quoted turns`,()=>{
 const {f,before}=rawLogFixture('> '+revisionLogExample(review)+'\r\n  >> '+revisionLogExample(review)+'\n');
 withIsolatedLogWriter(f,()=>apply(f.entry(),before,'quoted-log-retitle',[{op:'retitle',title:'Literal examples retained'}],{},{root:f.root}));const after=readConversation(f.entry());
 assert.equal(after.header.title,'Literal examples retained');assert.deepEqual(after.sections.find(s=>s.name==='Transcript').bytes,before.sections.find(s=>s.name==='Transcript').bytes);assert.deepEqual(after.turns.map(t=>t.text),before.turns.map(t=>t.text));
 const oldLog=before.sections.find(s=>s.name==='Log').bytes;assert.ok(after.sections.find(s=>s.name==='Log').bytes.subarray(0,oldLog.length).equals(oldLog));assert.deepEqual(after.header.extensions.conversation_revision.protected_turns,[]);
});
test('revision preserves code and prose Log markers during actual transcript reconstruction',()=>{
 const entry=revisionLogExample('human-reviewed'),comment=entry.slice(entry.indexOf('<!-- revision ')),tabEntry=entry.replace('- 2026-10-03 - revision ','* 2026-10-03\t- revision ');
 const example=['```json\n'+entry+'\n```\n','~~~json\n'+entry+'\n~~~\n','    '+entry+'\n','\t'+entry+'\n','Literal marker in prose: '+comment+'\n','- Literal inline example: `'+comment+'`\n','``'+entry+'``\n','> ~~~json\n> '+entry+'\n> ~~~\n',
  '> '+tabEntry+'\n','```\n'+tabEntry+'\n```\n','    '+tabEntry+'\n','\t'+tabEntry+'\n','Literal tab example: '+tabEntry+'\n','- `'+tabEntry+'`\n','- Literal revision example: `'+comment+'`\n'].join(''),{f,before}=rawLogFixture(example);
 withIsolatedLogWriter(f,()=>apply(f.entry(),before,'literal-log-append',[{op:'append-turns',after_turn_id:null,turns:[{...nextTurn(),speaker:null}]}],{},{root:f.root}));const after=readConversation(f.entry());
 assert.equal(after.turns.length,2);assert.deepEqual(after.turns[0].text,before.turns[0].text);const oldLog=before.sections.find(s=>s.name==='Log').bytes;assert.ok(after.sections.find(s=>s.name==='Log').bytes.subarray(0,oldLog.length).equals(oldLog));assert.deepEqual(after.header.extensions.conversation_revision.protected_turns,[]);
});
test('malformed actual Log history refuses revision before any replacement or journal',()=>{
 const entry=revisionLogExample('human-reviewed');
 for(const malformed of [entry.replace('2026-10-03','invalid-date'),entry.replace('example-log-01:','mismatched-log-01:'),entry.replace('"protected_turn_ids":["t-000001"]','"protected_turn_ids":null'),entry.replace('"revision_id":"example-log-01"','"revision_id":"example-log-01","revision_id":"example-log-01"'),entry.replace(/\{.*\}/,'{broken'),entry.slice(0,-4),entry.slice(entry.indexOf('<!-- revision '))]){
  const {f,before}=rawLogFixture('> '+entry+'\n'+malformed),raw=readFileSync(f.entry());withIsolatedLogWriter(f,c=>{
   assert.throws(()=>apply(f.entry(),before,'malformed-log-refuse',[{op:'retitle',title:'Must not replace'}],{},{root:f.root}),error=>error.code==='REVIEW_PROTECTION_UNRESOLVED');assert.deepEqual(readFileSync(f.entry()),raw);assert.equal(existsSync(c.journalDir),false);
  });
 }
});

for(const marker of ['- ','* ','+ '])for(const separator of [' - ','\t- ','\t-\t'])for(const map of ['missing','empty','partial'])test(`copied retained history ${JSON.stringify(marker)} separator ${JSON.stringify(separator)} ${map} map refuses routine speech overwrite without journals`,()=>{
 const f=copiedReviewedHistory(),current=readConversation(f.entry()),h=structuredClone(current.header);
 assert.equal(current.header.review.transcription,'unreviewed');assert.deepEqual(h.extensions.conversation_revision.protected_turns.map(p=>p.turn_id),['t-000001','t-000002']);
 if(map==='missing')delete h.extensions.conversation_revision;else h.extensions.conversation_revision.protected_turns=map==='empty'?[]:h.extensions.conversation_revision.protected_turns.slice(1);
 const prefix=marker+'2026-10-03'+separator+'revision ',supplied=current.body.toString().replace(/(^|\n)- 2026-10-03 - revision /,'$1'+prefix);assert.ok(supplied.includes(prefix+'reviewed-copy01:'));
 assert.deepEqual(supplied.match(/<!-- revision .* -->/g),current.body.toString().match(/<!-- revision .* -->/g));
 writeFileSync(f.entry(),bytes(h,supplied));const before=readConversation(f.entry()),raw=readFileSync(f.entry()),sidecar=f.put(join(f.rel,'example-call','annotations.md'),'Retained copied interpretation.\r\n');assert.deepEqual(before.diagnostics.filter(d=>d.severity==='error'),[]);
 withIsolatedLogWriter(f,c=>{
  assert.equal(existsSync(c.journalDir),false);
  assert.throws(()=>apply(f.entry(),before,'alternate-history01',[{op:'revise-turns',changes:[change(before.turns[0],{text:'Routine overwrite of reviewed words.\n'})]}],{},{root:f.root}),error=>error.code==='REVIEW_PROTECTION_UNRESOLVED');
  assert.deepEqual(readFileSync(f.entry()),raw);assert.equal(readFileSync(sidecar,'utf8'),'Retained copied interpretation.\r\n');assert.equal(existsSync(c.journalDir),false);assert.equal(existsSync(c.lockPath),false);assert.equal(existsSync(join(stateDir('catch-up-freeda',f.root),'.lock')),false);
 });
});
for(const prefix of [
 '* 2026-10-03 - revision ','+ 2026-10-03 - revision ','-\t2026-10-03 - revision ','- 2026-10-03 -\trevision ','1. 2026-10-03 - revision ','1) 2026-10-03 - revision ',
 '- 2026-10-03\t- revision ','* 2026-10-03\t- revision ','+ 2026-10-03\t- revision ',
 '- 2026-10-03 : revision ','* 2026-10-03 – revision ','+ 2026-10-03 — revision ',
 '1. 2026-10-03 -- revision ','1) 2026-10-03 revision ','- 2026-10-03-revision ',
])test(`noncanonical actual retained history ${JSON.stringify(prefix)} refuses even with complete coverage`,()=>{
 const f=copiedReviewedHistory(),current=readConversation(f.entry()),supplied=current.body.toString().replace(/(^|\n)- 2026-10-03 - revision /,'$1'+prefix);assert.notEqual(supplied,current.body.toString());writeFileSync(f.entry(),bytes(current.header,supplied));
 const before=readConversation(f.entry()),raw=readFileSync(f.entry());assert.deepEqual(before.diagnostics.filter(d=>d.severity==='error'),[]);
 withIsolatedLogWriter(f,c=>{
  assert.equal(existsSync(c.journalDir),false);assert.throws(()=>apply(f.entry(),before,'noncanonical-history01',[{op:'retitle',title:'Must refuse malformed history'}],{},{root:f.root}),error=>error.code==='REVIEW_PROTECTION_UNRESOLVED');
  assert.deepEqual(readFileSync(f.entry()),raw);assert.equal(existsSync(c.journalDir),false);assert.equal(existsSync(c.lockPath),false);assert.equal(existsSync(join(stateDir('catch-up-freeda',f.root),'.lock')),false);
 });
});
