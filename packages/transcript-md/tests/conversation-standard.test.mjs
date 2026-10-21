// Self-documenting records: every transcript.md names the standard it follows.
// Synthetic speakers and words only; no real conversation is copied here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from './helpers/native.mjs';
import {fixture,header,emptyBody,bytes} from './helpers/conversation-fixture.mjs';
import {validateConversation,stampStandard} from './helpers/guarded-frontmatter-conversation.mjs';
import {createConversation,annotateConversation,reviseConversation} from './helpers/guarded-freedom-conversation-write.mjs';
import {readConversation} from './helpers/guarded-freedom-conversations.mjs';
import * as api from '../index.mjs';

const URL_='https://hypercontext.wiki/standards/conversation/v1';
const BARE='https://hypercontext.wiki/standards/conversation';
const V2='https://hypercontext.wiki/standards/conversation/v2';
const lib=fileURLToPath(new URL('../lib/',import.meta.url));
const cli=join(lib,'freedom-conversations-cli.mjs');
const hash=b=>createHash('sha256').update(b).digest('hex');
const run=(f,args)=>spawnSync(process.execPath,[cli,...args],{cwd:f.root,encoding:'utf8',env:{...process.env,FREEDOM_HOME:join(f.root,'state-home'),FREEDOM_WORKSPACE:''}});
const unstamped=(patch={})=>{const h=header(patch);delete h.standard;return h;};
const turnBody=()=>{
 const meta={speaker:null,sources:[],timing:null,source_gap:'Original capture unavailable.'};
 return '\n## Now\n\n## Transcript\n\n### t-000001\n<!-- turn '+JSON.stringify(meta)+' -->\nInvented words from a made-up call.\n\n## Log\n\n## Open questions\n';
};
const evidence={kind:'operator-decision',locator:'synthetic:choice',revision:null,note:'Synthetic explicit choice.'};
const log={date:'2026-10-20',text:'Synthetic change.',evidence:[evidence]};
const selfDoc=diagnostics=>diagnostics.filter(d=>d.code==='self-doc:missing');
const selfVersion=diagnostics=>diagnostics.filter(d=>d.code==='self-doc:version');

test('STANDARD is version 1 of the hypercontext conversation standard; the schema also reads the bare URL',()=>{
 assert.equal(api.STANDARD,URL_);
 assert.deepEqual(api.conversationSchema.properties.standard,{enum:[URL_,BARE]});
 assert.deepEqual(validateConversation(header({standard:URL_})).filter(d=>d.severity==='error'),[]);
 const other=validateConversation(header({standard:'https://example.invalid/standards/conversation'}));
 assert.ok(!other.some(d=>d.code==='UNKNOWN_KEY'||d.code==='SCHEMA_INVALID'));
 assert.equal(selfDoc(other).length,1);
});
test('the bare unversioned URL predates versions: self-doc:missing, pointing at stamp-standard',()=>{
 const d=validateConversation(header({standard:BARE}));
 assert.ok(!d.some(x=>x.code==='SCHEMA_INVALID'));
 const s=selfDoc(d);assert.equal(s.length,1);assert.equal(s[0].severity,'error');assert.equal(s[0].field,'standard');
 assert.match(s[0].message,/predates versions/);assert.match(s[0].message,/stamp-standard --apply/);
 assert.equal(selfVersion(d).length,0);
});
test('a version this package does not implement is self-doc:version, never a schema failure',()=>{
 for(const standard of [V2,'https://hypercontext.wiki/standards/conversation/v17']){
  const d=validateConversation(header({standard}));
  assert.ok(!d.some(x=>x.code==='SCHEMA_INVALID'||x.code==='self-doc:missing'),JSON.stringify(d));
  const v=selfVersion(d);assert.equal(v.length,1);assert.equal(v[0].severity,'error');assert.equal(v[0].field,'standard');
 }
 for(const standard of ['https://hypercontext.wiki/standards/conversation/v0','https://hypercontext.wiki/standards/conversation/v01','https://hypercontext.wiki/standards/friend/v1',7])
  assert.equal(selfDoc(validateConversation(header({standard}))).length,1,String(standard));
 // Neither code stops interpretation.
 assert.deepEqual(api.blockingDiagnostics(validateConversation(header({standard:V2}))),[]);
 assert.deepEqual(api.blockingDiagnostics(validateConversation(header({standard:BARE}))),[]);
});
test('a missing standard is reported as self-doc:missing at level error',()=>{
 const d=selfDoc(validateConversation(unstamped()));
 assert.equal(d.length,1);assert.equal(d[0].severity,'error');assert.equal(d[0].field,'standard');
 assert.equal(selfDoc(validateConversation(header())).length,0);
});
test('create stamps standard directly after kind even when the caller left it out',()=>{
 const f=fixture();test.after(()=>f.close());
 const result=createConversation({root:f.root,spec:{header:unstamped(),body:emptyBody,assets:[],annotations:null},pid:process.pid,by:'test'});
 const text=readFileSync(result.path,'utf8');
 assert.match(text,/^---\nschema_version: 1\nkind: "conversation"\nstandard: "https:\/\/hypercontext\.wiki\/standards\/conversation\/v1"\nid: /);
 assert.equal(selfDoc(readConversation(result.path).diagnostics).length,0);
});
test('readers keep reading an unstamped record and report it; validate refuses it',()=>{
 const f=fixture();test.after(()=>f.close());
 const file=f.put(join(f.rel,'example-call','transcript.md'),bytes(unstamped({body_format:'turns-v1'}),turnBody()));
 const record=readConversation(file);
 assert.equal(record.turns.length,1);assert.equal(selfDoc(record.diagnostics).length,1);
 const read=run(f,['read',file,'--workspace',f.root,'--json']);assert.equal(read.status,0,read.stdout);
 const validate=run(f,['validate',file,'--workspace',f.root,'--json']);assert.equal(validate.status,2);
 assert.ok(JSON.parse(validate.stdout).diagnostics.some(d=>d.code==='self-doc:missing'&&d.severity==='error'));
});
test('readers keep reading bare and future-version records and report them; validate refuses both',()=>{
 const f=fixture();test.after(()=>f.close());
 for(const [id,standard,code] of [['bare-call',BARE,'self-doc:missing'],['future-call',V2,'self-doc:version']]){
  const file=f.put(join(f.rel,id,'transcript.md'),bytes(header({id,standard}),turnBody()));
  const record=readConversation(file);
  assert.equal(record.turns.length,1);assert.equal(record.diagnostics.filter(d=>d.code===code).length,1);
  const read=run(f,['read',file,'--workspace',f.root,'--json']);assert.equal(read.status,0,read.stdout);
  const validate=run(f,['validate',file,'--workspace',f.root,'--json']);assert.equal(validate.status,2);
  assert.ok(JSON.parse(validate.stdout).diagnostics.some(d=>d.code===code&&d.severity==='error'));
 }
});
test('writers upgrade a bare record to v1 in place and refuse to downgrade a future version',()=>{
 const f=fixture();test.after(()=>f.close());
 const a=f.put(join(f.rel,'bare-call','transcript.md'),bytes(header({id:'bare-call',standard:BARE}),turnBody()));
 annotateConversation({file:a,root:f.root,spec:{markdown:'Synthetic note.',citations:[],processing:null,log},expectedSha:hash(readFileSync(a)),pid:process.pid,by:'test'});
 const after=readConversation(a);assert.equal(after.header.standard,URL_);assert.equal(Object.keys(after.header)[2],'standard');
 const b=f.put(join(f.rel,'future-call','transcript.md'),bytes(header({id:'future-call',standard:V2}),turnBody()));
 const before=readFileSync(b);
 assert.throws(()=>annotateConversation({file:b,root:f.root,spec:{markdown:'Synthetic note.',citations:[],processing:null,log},expectedSha:hash(before),pid:process.pid,by:'test'}),e=>e.code==='self-doc:version');
 assert.deepEqual(readFileSync(b),before);
});
test('annotate and revise stamp an unstamped record through their guarded paths',()=>{
 const f=fixture();test.after(()=>f.close());
 const a=f.put(join(f.rel,'example-call','transcript.md'),bytes(unstamped({body_format:'turns-v1'}),turnBody()));
 annotateConversation({file:a,root:f.root,spec:{markdown:'Synthetic note.',citations:[],processing:null,log},expectedSha:hash(readFileSync(a)),pid:process.pid,by:'test'});
 assert.equal(readConversation(a).header.standard,URL_);
 const b=f.put(join(f.rel,'second-call','transcript.md'),bytes(unstamped({id:'second-call',body_format:'turns-v1'}),turnBody()));
 const base=hash(readFileSync(b));
 reviseConversation({file:b,root:f.root,spec:{schema_version:1,revision_id:'retitle-0001',base_sha256:base,mode:'routine',authorization:null,operations:[{op:'retitle',title:'Renamed call'}],log},expectedSha:base,pid:process.pid,by:'test'});
 const after=readConversation(b);assert.equal(after.header.standard,URL_);assert.equal(Object.keys(after.header)[2],'standard');
});
test('stampStandard inserts after kind, keeps every other byte and CRLF, and is idempotent',()=>{
 const lf=bytes(unstamped(),emptyBody),out=stampStandard(lf);
 assert.ok(Buffer.isBuffer(out));
 const expected=Buffer.from(lf.toString('utf8').replace('kind: "conversation"\n','kind: "conversation"\nstandard: "'+URL_+'"\n'));
 assert.deepEqual(out,expected);assert.deepEqual(stampStandard(out),out);
 const crlf=lf.toString('utf8').replace(/\n/g,'\r\n'),stamped=stampStandard(crlf);
 assert.equal(typeof stamped,'string');
 assert.equal(stamped,crlf.replace('kind: "conversation"\r\n','kind: "conversation"\r\nstandard: "'+URL_+'"\r\n'));
 assert.equal(stampStandard(stamped),stamped);
 const wrong=bytes(header({standard:'https://example.invalid/x'}),emptyBody);
 assert.deepEqual(stampStandard(wrong),bytes(header(),emptyBody));
 const bare=bytes(header({standard:BARE}),emptyBody),upgraded=stampStandard(bare);
 assert.deepEqual(upgraded,Buffer.from(bare.toString('utf8').replace('standard: "'+BARE+'"\n','standard: "'+URL_+'"\n')));
 assert.deepEqual(stampStandard(upgraded),upgraded);
 const bareCrlf=bare.toString('utf8').replace(/\n/g,'\r\n');
 assert.equal(stampStandard(bareCrlf),bareCrlf.replace('standard: "'+BARE+'"\r\n','standard: "'+URL_+'"\r\n'));
 const future=bytes(header({standard:V2}),emptyBody);
 assert.deepEqual(stampStandard(future),future);
 assert.deepEqual(api.stampPlan(future),{output:future,status:'refused',reason:'self-doc:version'});
 for(const untouched of ['No header at all.\n','---\na: text\n---\nbody\n','---\nschema_version: 1\nkind: "conversation-redirect"\nto: "x/transcript.md"\n---\n'])assert.equal(stampStandard(untouched),untouched);
});
test('stamp-standard is a dry run by default, applies once, and skips what it cannot parse',()=>{
 const f=fixture();test.after(()=>f.close());
 const one=f.put(join(f.rel,'one-call','transcript.md'),bytes(unstamped({id:'one-call'}),emptyBody));
 const crlfBytes=Buffer.from(bytes(unstamped({id:'two-call'}),emptyBody).toString('utf8').replace(/\n/g,'\r\n'));
 const two=f.put(join(f.rel,'two-call','transcript.md'),crlfBytes);
 const done=f.put(join(f.rel,'done-call','transcript.md'),bytes(header({id:'done-call'}),emptyBody));
 const broken=f.put(join(f.rel,'broken-call','transcript.md'),'---\nkind: not-json\n---\nWords.\n');
 const bare=f.put(join(f.rel,'bare-call','transcript.md'),'Words with no header.\n');
 const old=f.put(join(f.rel,'old-call','transcript.md'),bytes(header({id:'old-call',standard:BARE}),emptyBody));
 const future=f.put(join(f.rel,'future-call','transcript.md'),bytes(header({id:'future-call',standard:V2}),emptyBody));
 const before=[one,two,done,broken,bare].map(p=>readFileSync(p)),oldBefore=readFileSync(old),futureBefore=readFileSync(future);
 const dry=run(f,['stamp-standard','--workspace',f.root,'--json']);assert.equal(dry.status,0,dry.stderr);
 const plan=JSON.parse(dry.stdout);
 assert.equal(plan.applied,false);assert.equal(plan.standard,URL_);
 assert.deepEqual(plan.changed.map(c=>c.id).sort(),['old-call','one-call','two-call']);
 assert.deepEqual(plan.current.map(c=>c.id),['done-call']);
 assert.deepEqual(plan.skipped.map(s=>[s.id,s.reason]).sort(),[['bare-call','NO_HEADER'],['broken-call','INVALID_JSON_VALUE'],['future-call','self-doc:version']]);
 assert.deepEqual([one,two,done,broken,bare].map(p=>readFileSync(p)),before);
 const applied=run(f,['stamp-standard','--workspace',f.root,'--apply','--json']);assert.equal(applied.status,0,applied.stderr);
 assert.equal(JSON.parse(applied.stdout).applied,true);
 assert.deepEqual(readFileSync(one),stampStandard(before[0]));
 assert.deepEqual(readFileSync(two),stampStandard(before[1]));
 assert.match(readFileSync(two,'utf8'),/kind: "conversation"\r\nstandard: "[^"]+"\r\nid: /);
 assert.deepEqual(readFileSync(old),stampStandard(oldBefore));assert.equal(readConversation(old).header.standard,URL_);
 assert.deepEqual(readFileSync(future),futureBefore);
 for(const [i,p] of [[2,done],[3,broken],[4,bare]])assert.deepEqual(readFileSync(p),before[i]);
 const again=JSON.parse(run(f,['stamp-standard','--workspace',f.root,'--apply','--json']).stdout);
 assert.deepEqual(again.changed,[]);assert.equal(again.current.length,4);
});
test('stamp-standard leaves a version that something cites, and apply needs a workspace',()=>{
 const f=fixture();test.after(()=>f.close());
 const cited=f.put(join(f.rel,'cited-call','transcript.md'),bytes(unstamped({id:'cited-call'}),emptyBody));
 f.put(join(f.rel,'other-call','annotations.md'),'<!-- citations [{"revision":{"kind":"sha256","value":"'+hash(readFileSync(cited))+'"}}] -->\n');
 f.put(join(f.rel,'other-call','transcript.md'),bytes(header({id:'other-call'}),emptyBody));
 const plan=JSON.parse(run(f,['stamp-standard','--workspace',f.root,'--apply','--json']).stdout);
 assert.deepEqual(plan.skipped.map(s=>[s.id,s.reason]),[['cited-call','CITED_VERSION']]);
 assert.ok(!readFileSync(cited,'utf8').includes('standard:'));
 const loose=join(f.root,'loose');mkdirSync(join(loose,'a-call'),{recursive:true});
 writeFileSync(join(loose,'a-call','transcript.md'),bytes(unstamped({id:'a-call'}),emptyBody));
 const dry=run(f,['stamp-standard','--transcripts-dir',loose,'--json']);assert.equal(dry.status,0,dry.stderr);
 assert.deepEqual(JSON.parse(dry.stdout).changed.map(c=>c.id),['a-call']);
 const refused=run(f,['stamp-standard','--transcripts-dir',loose,'--apply','--json']);assert.equal(refused.status,2);
 assert.equal(JSON.parse(refused.stdout).diagnostics[0].code,'WORKSPACE_REQUIRED');
 assert.ok(!readFileSync(join(loose,'a-call','transcript.md'),'utf8').includes('standard:'));
});
test('the Python companion reads v1, bare, future and unstamped records alike',()=>{
 const f=fixture();test.after(()=>f.close());
 f.put(join(f.rel,'bare-call','transcript.md'),bytes(header({id:'bare-call',standard:BARE}),emptyBody));
 f.put(join(f.rel,'future-call','transcript.md'),bytes(header({id:'future-call',standard:V2}),emptyBody));
 f.put(join(f.rel,'old-call','transcript.md'),bytes(unstamped({id:'old-call'}),emptyBody));
 f.put(join(f.rel,'new-call','transcript.md'),bytes(header({id:'new-call'}),emptyBody));
 const code="import importlib.util,sys,json; s=importlib.util.spec_from_file_location('freedom_conversations',sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(sorted(r['id'] for r in m.list_records(workspace=sys.argv[2]))))";
 const got=spawnSync(process.env.PYTHON,['-B','-I','-S','-c',code,join(lib,'freedom_conversations.py'),f.root],{cwd:f.root,encoding:'utf8',env:{...process.env,FREEDOM_WORKSPACE:f.root,FREEDOM_HOME:join(f.root,'state-home')}});
 assert.equal(got.status,0,got.stderr);assert.deepEqual(JSON.parse(got.stdout),['bare-call','future-call','new-call','old-call']);
});
