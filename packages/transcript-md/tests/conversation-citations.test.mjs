import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {renameSync} from 'node:fs';
import {relative,join} from 'node:path';
import {spawnSync} from './helpers/native.mjs';
import {fileURLToPath} from 'node:url';
import {bytes,header,capture,locator,fixture} from './helpers/conversation-fixture.mjs';
import {parseConversation,conversationTurns} from './helpers/guarded-freedom-conversations.mjs';
import {citeConversation,resolveCitation,seekConversation} from './helpers/guarded-freedom-conversation-citations.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const file='/synthetic/example-call/transcript.md';
const meta=(timing=null)=>({speaker:null,sources:[{capture:'c-001',locator:0,start_ms:100,end_ms:300}],timing,source_gap:null});
const turn=(id,text='Exact café.\r\n',m=meta())=>`### ${id}\n<!-- turn ${JSON.stringify(m)} -->\n${text}`;
const body=entries=>`## Now\nUnreviewed.\n## Transcript\n${entries}## Log\n## Open questions\n`;
const captures=[capture({locators:[locator({kind:'external-local',path:'~/unchanged.wav',service_id:null})]}),capture({id:'c-002',recording_id:'other-ID',locators:[locator({service_id:'other-ID'})]})];
const record=(entries,patch={})=>{const original=bytes(header({sources:captures,...patch}),body(entries));return {original,r:parseConversation(original,{file})};};
const codes=result=>(result.diagnostics??result.gaps).map(d=>d.code);

test('an immutable line citation refuses a different complete file version before selecting text',()=>{
 const original=Buffer.from('one\ntwo\n');
 const citation={repository:null,path:'call/transcript.md',record_id:'call',revision:{kind:'sha256',value:sha(original)},selector:{kind:'lines',start:2,end:2,text_sha256:sha(Buffer.from('two\n'))},sources:[]};
 assert.deepEqual(resolveCitation(citation,{readVersion:()=>original}).text,Buffer.from('two\n'));
 const refused=resolveCitation(citation,{readVersion:()=>Buffer.from('changed\ntwo\n')});
 assert.ok(codes(refused).includes('CITATION_REVISION_MISMATCH'));assert.equal(refused.text.length,0);
});
test('line selectors preserve CRLF multibyte text and final lines without a newline',()=>{
 const original=Buffer.from('one\r\ncafé\r\nlast');
 const c={repository:null,path:'old.md',record_id:'old',revision:{kind:'sha256',value:sha(original)},selector:{kind:'lines',start:2,end:3,text_sha256:sha(Buffer.from('café\r\nlast'))},sources:[]};
 assert.deepEqual(resolveCitation(c,{readVersion:()=>original}).text,Buffer.from('café\r\nlast'));
 for(const selector of [{...c.selector,start:0},{...c.selector,end:4},{...c.selector,start:3,end:2}])assert.equal(resolveCitation({...c,selector},{readVersion:()=>original}).text.length,0);
});
test('turn citations use complete input hash original absolute path and supplied turn order',()=>{
 const {r,original}=record(turn('t-000001')+turn('t-000003','Inserted.\n')+turn('t-000002','Last.\n'));
 r.relativePath='example-call/transcript.md';
 const c=citeConversation(r,{turnIds:['t-000002','t-000001']});
 assert.equal(c.repository,null);assert.equal(c.path,file);assert.equal(c.record_id,'example-call');assert.deepEqual(c.revision,{kind:'sha256',value:sha(original)});
 assert.deepEqual(c.selector,{kind:'turn',ids:['t-000002','t-000001'],text_sha256:sha(Buffer.from('Last.\nExact café.\r\n'))});
 assert.deepEqual(c.sources,[...meta().sources,...meta().sources]);assert.deepEqual(conversationTurns(r),r.turns);
 assert.deepEqual(resolveCitation(c,{readVersion:()=>original}),{text:Buffer.from('Last.\nExact café.\r\n'),diagnostics:[]});
 const changed=record(turn('t-000001')+turn('t-000003','Inserted.\n')+turn('t-000002','Changed.\n')).original;
 assert.ok(codes(resolveCitation({...c,revision:{kind:'sha256',value:sha(changed)}},{readVersion:()=>changed})).includes('CITATION_TEXT_MISMATCH'));
 assert.ok(codes(resolveCitation({...c,record_id:'other'},{readVersion:()=>original})).includes('CITATION_RECORD_MISMATCH'));
});
test('resolution retains historical path and revision and reports unavailable historical bytes',()=>{
 const {r,original}=record(turn('t-000001'));const c=citeConversation(r,{turnIds:['t-000001']});
 const missing=resolveCitation(c,{readVersion:()=>{throw new Error('private path or text');}});assert.equal(missing.text.length,0);assert.ok(codes(missing).includes('CITATION_VERSION_UNAVAILABLE'));assert.ok(!JSON.stringify(missing).includes('private path or text'));
 assert.ok(codes(resolveCitation(c,{readVersion:()=>null})).includes('CITATION_VERSION_UNAVAILABLE'));
 assert.throws(()=>citeConversation(r,{turnIds:['t-000001'],revision:{kind:'git',value:'b'.repeat(40)}}));
});
test('citation creation refuses unknown turns invalid records legacy bodies and false hash revisions',()=>{
 const {r}=record(turn('t-000001'));
 for(const turnIds of [[],['t-absent']])assert.throws(()=>citeConversation(r,{turnIds}));
 assert.throws(()=>citeConversation(r,{turnIds:['t-000001'],revision:{kind:'sha256',value:'0'.repeat(64)}}));
 assert.throws(()=>citeConversation(record('unstructured\n').r,{turnIds:['t-000001']}));
 assert.throws(()=>citeConversation(parseConversation(Buffer.from('## Transcript\nold words\n'),{file:'/synthetic/old.md'}),{turnIds:['t-000001']}));
});
test('capture seek uses declared offsets preserves external locators and never parses clock-shaped words',()=>{
 const {r}=record(turn('t-000001','12:34 is speech.\n',meta({basis:'capture',capture:'c-001',start_ms:1250,end_ms:4800})));
 assert.deepEqual(seekConversation(r,{turnId:'t-000001'}),{candidates:[{capture:'c-001',path:'~/unchanged.wav',offset_ms:1250,end_ms:4800}],gaps:[]});
 assert.equal(seekConversation(r,{turnId:'t-000001',captureId:'c-002'}).candidates.length,0);
 const unknown=seekConversation(record(turn('t-000001')).r,{turnId:'t-000001'});assert.equal(unknown.candidates.length,0);assert.ok(codes(unknown).includes('TIMING_UNRESOLVED'));
 assert.ok(codes(seekConversation(r,{turnId:'t-999999'})).includes('NOT_FOUND'));
});
test('piecewise seek uses closed-start open-end offsets and refuses gaps',()=>{
 const mapping=[{capture:'c-001',conversation_start_ms:1000,conversation_end_ms:2000,capture_start_ms:100,capture_end_ms:1100},{capture:'c-002',conversation_start_ms:2500,conversation_end_ms:3500,capture_start_ms:50,capture_end_ms:1050}];
 const seek=(start,end=null)=>seekConversation(record(turn('t-000001','Words.\n',meta({basis:'conversation',start_ms:start,end_ms:end,mapping}))).r,{turnId:'t-000001'});
 assert.deepEqual(seek(1200,1700).candidates,[{capture:'c-001',path:'~/unchanged.wav',offset_ms:300,end_ms:800}]);
 assert.deepEqual(seek(2500).candidates,[{capture:'c-002',path:null,offset_ms:50,end_ms:null}]);
 for(const start of [999,2000,2499,3500]){const result=seek(start);assert.equal(result.candidates.length,0);assert.ok(codes(result).includes('TIMING_GAP'));}
 assert.equal(seek(1800,3000).candidates[0].end_ms,1100);
});
test('overlapping mappings return all candidates and require an explicit unique capture choice',()=>{
 const mapping=[{capture:'c-001',conversation_start_ms:0,conversation_end_ms:1000,capture_start_ms:500,capture_end_ms:1500},{capture:'c-002',conversation_start_ms:0,conversation_end_ms:1000,capture_start_ms:20,capture_end_ms:1020}];
 const {r}=record(turn('t-000001','Words.\n',meta({basis:'conversation',start_ms:100,end_ms:200,mapping})));
 const all=seekConversation(r,{turnId:'t-000001'});assert.deepEqual(all.candidates.map(c=>c.offset_ms),[600,120]);assert.ok(codes(all).includes('CAPTURE_SELECTION_REQUIRED'));
 assert.deepEqual(seekConversation(r,{turnId:'t-000001',captureId:'c-002'}),{candidates:[{capture:'c-002',path:null,offset_ms:120,end_ms:220}],gaps:[]});
});
test('wall-clock seek honors explicit timezone offsets and never invents a negative capture offset',()=>{
 const timing={basis:'wall-clock',start:'2026-10-03T10:00:01-05:00',end:'2026-10-03T15:00:03Z',mapping:[{capture:'c-001',wall_start:'2026-10-03T15:00:00Z',capture_start_ms:500}]};
 const seek=t=>seekConversation(record(turn('t-000001','Words.\n',meta(t))).r,{turnId:'t-000001'});
 assert.deepEqual(seek(timing).candidates,[{capture:'c-001',path:'~/unchanged.wav',offset_ms:1500,end_ms:3500}]);
 assert.ok(codes(seek({...timing,start:'2026-10-03T14:00:00Z'})).includes('TIMING_GAP'));
});
test('CLI cite and seek run outside the source repository and preserve selected text privacy',t=>{
 const f=fixture();t.after(f.close);const {original}=record(turn('t-000001','Private synthetic words.\n',meta({basis:'capture',capture:'c-001',start_ms:100,end_ms:300})));const target=f.put('example-call/transcript.md',original);
 const cli=fileURLToPath(new URL('../lib/freedom-conversations-cli.mjs',import.meta.url));
 const run=args=>spawnSync(process.execPath,[cli,...args],{cwd:f.root,encoding:'utf8',env:{...process.env,FREEDOM_HOME:f.root,FREEDOM_WORKSPACE:''}});
 const cited=run(['cite',target,'--turn','t-000001','--json']);assert.equal(cited.status,0,cited.stdout);assert.equal(JSON.parse(cited.stdout).selector.kind,'turn');assert.ok(!cited.stdout.includes('Private synthetic words'));
 const seek=run(['seek',target,'--turn','t-000001','--json']);assert.equal(seek.status,0,seek.stdout);assert.equal(JSON.parse(seek.stdout).candidates[0].offset_ms,100);
 assert.equal(run(['seek',target,'--turn','t-999999','--json']).status,1);assert.equal(run(['cite',target,'--json']).status,2);
 assert.equal(run(['seek',target,'--turn','t-000001','--turn','t-000002','--json']).status,2);
 const read=run(['read',target,'--include-body','--json']);assert.equal(JSON.parse(read.stdout).records[0].turns[0].text,'Private synthetic words.\n');
});

test('a retained actual Git revision resolves original words and path after a live rename and edit',t=>{
 const f=fixture();t.after(f.close);
 const git=(...args)=>{const result=spawnSync('git',args,{cwd:f.root,encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout.trim();};
 git('init','--quiet');
 const original=record(turn('t-000001','Historical words.\n')).original;
 const target=f.put('example-call/transcript.md',original);
 git('add','--','example-call/transcript.md');git('-c','core.hooksPath=/dev/null','-c','commit.gpgsign=false','commit','--quiet','-m','synthetic historical record','--','example-call/transcript.md');
 const commit=git('rev-parse','HEAD'),r=parseConversation(original,{file:target});
 const c=citeConversation(r,{turnIds:['t-000001'],repository:f.root,revision:{kind:'git',value:commit}});
 renameSync(join(f.root,'example-call'),join(f.root,'renamed-call'));f.put('renamed-call/transcript.md',record(turn('t-000001','Current words.\n'),{id:'renamed-call'}).original);
 const readVersion=(repository,path,revision)=>{
  assert.equal(repository,f.root);assert.equal(path,target);assert.deepEqual(revision,{kind:'git',value:commit});
  const result=spawnSync('git',['show',`${revision.value}:${relative(repository,path)}`],{cwd:repository});
  if(result.status!==0)throw new Error('Historical version unavailable');return result.stdout;
 };
 assert.deepEqual(resolveCitation(c,{readVersion}),{text:Buffer.from('Historical words.\n'),diagnostics:[]});
});
test('a clamped seek reports partial coverage and same-capture overlaps remain ambiguous',()=>{
 const first={capture:'c-001',conversation_start_ms:0,conversation_end_ms:1000,capture_start_ms:100,capture_end_ms:1100};
 const seek=(mapping,end_ms,captureId)=>seekConversation(record(turn('t-000001','Words.\n',meta({basis:'conversation',start_ms:100,end_ms,mapping}))).r,{turnId:'t-000001',captureId});
 assert.ok(codes(seek([first],1200)).includes('TIMING_PARTIAL_COVERAGE'));
 const result=seek([first,{...first,capture_start_ms:200,capture_end_ms:1200}],200,'c-001');
 assert.deepEqual(result.candidates.map(c=>c.offset_ms),[200,300]);assert.ok(codes(result).includes('TIMING_MAPPING_AMBIGUOUS'));
});
test('historical turn resolution refuses a source claim not carried by the selected turns',()=>{
 const {r,original}=record(turn('t-000001')),c=citeConversation(r,{turnIds:['t-000001']});
 const result=resolveCitation({...c,sources:[{...c.sources[0],capture:'c-002'}]},{readVersion:()=>original});
 assert.equal(result.text.length,0);assert.ok(codes(result).includes('CITATION_SOURCES_MISMATCH'));
});
test('a chosen bundled locator resolves under its original record folder while unknown remains null',()=>{
 const sources=[capture({locators:[locator({kind:'bundled',path:'sources/c-001/audio.wav',service_id:null})]})];
 const timing={basis:'capture',capture:'c-001',start_ms:100,end_ms:null};
 assert.equal(seekConversation(record(turn('t-000001','Words.\n',meta(timing)),{sources}).r,{turnId:'t-000001'}).candidates[0].path,'/synthetic/example-call/sources/c-001/audio.wav');
 const unknown={...meta(timing),sources:[{capture:'c-001',locator:null,start_ms:null,end_ms:null}]};
 assert.equal(seekConversation(record(turn('t-000001','Words.\n',unknown),{sources}).r,{turnId:'t-000001'}).candidates[0].path,null);
});
test('zero-length mapping intervals remain recorded but contain no seekable instant',()=>{
 const timing={basis:'conversation',start_ms:100,end_ms:100,mapping:[{capture:'c-001',conversation_start_ms:100,conversation_end_ms:100,capture_start_ms:500,capture_end_ms:500}]};
 const {r}=record(turn('t-000001','Words.\n',meta(timing)));
 assert.equal(r.diagnostics.filter(d=>d.severity==='error').length,0);assert.deepEqual(r.turns[0].timing,timing);
 assert.deepEqual(seekConversation(r,{turnId:'t-000001'}).candidates,[]);assert.ok(codes(seekConversation(r,{turnId:'t-000001'})).includes('TIMING_GAP'));
});
test('CLI reports blocking overlap and partial coverage and accepts an unambiguous capture choice',t=>{
 const f=fixture();t.after(f.close);
 const mapping=[{capture:'c-001',conversation_start_ms:0,conversation_end_ms:1000,capture_start_ms:100,capture_end_ms:1100},{capture:'c-002',conversation_start_ms:0,conversation_end_ms:1500,capture_start_ms:0,capture_end_ms:1500}];
 const {original}=record(turn('t-000001','Words.\n',meta({basis:'conversation',start_ms:100,end_ms:1200,mapping})));const target=f.put('example-call/transcript.md',original);
 const cli=fileURLToPath(new URL('../lib/freedom-conversations-cli.mjs',import.meta.url));
 const run=extra=>spawnSync(process.execPath,[cli,'seek',target,'--turn','t-000001','--json',...extra],{cwd:f.root,encoding:'utf8',env:{...process.env,FREEDOM_HOME:f.root,FREEDOM_WORKSPACE:''}});
 const ambiguous=run([]);assert.equal(ambiguous.status,2);assert.equal(JSON.parse(ambiguous.stdout).candidates.length,2);
 const partial=run(['--capture','c-001']);assert.equal(partial.status,2);assert.ok(JSON.parse(partial.stdout).gaps.some(d=>d.code==='TIMING_PARTIAL_COVERAGE'));
 assert.equal(run(['--capture','c-002']).status,0);
});

test('repeated selected ids preserve each occurrence order exact text and source spans',()=>{
 const second={...meta(),sources:[{capture:'c-002',locator:0,start_ms:null,end_ms:null}]};
 const {r,original}=record(turn('t-000001','First.\r\n')+turn('t-000002','Second.\n',second));
 const c=citeConversation(r,{turnIds:['t-000002','t-000001','t-000002']});
 assert.deepEqual(c.selector.ids,['t-000002','t-000001','t-000002']);assert.equal(c.selector.text_sha256,sha(Buffer.from('Second.\nFirst.\r\nSecond.\n')));
 assert.deepEqual(c.sources,[...second.sources,...meta().sources,...second.sources]);
 assert.deepEqual(resolveCitation(c,{readVersion:()=>original}),{text:Buffer.from('Second.\nFirst.\r\nSecond.\n'),diagnostics:[]});
});

test('wall-clock seek subtracts exact fractional instants before Number millisecond conversion',()=>{
 const seek=(start,end,wall_start,capture_start_ms=0)=>seekConversation(record(turn('t-000001','Words.\n',meta({basis:'wall-clock',start,end,mapping:[{capture:'c-001',wall_start,capture_start_ms}]}))).r,{turnId:'t-000001'});
 const r=seek('2026-10-03T15:00:00.0009Z','2026-10-03T15:00:00.0029Z','2026-10-03T15:00:00.0001Z');
 assert.deepEqual(r.candidates,[{capture:'c-001',path:'~/unchanged.wav',offset_ms:0.8,end_ms:2.8}]);assert.deepEqual(r.gaps,[]);
 const zoned=seek('2026-10-03T10:00:00.0009-05:00','2026-10-03T15:00:00.0029Z','2026-10-03T15:00:00.0001Z');assert.deepEqual(zoned,r);
 const late=seek('9999-10-03T15:00:00.123456789012345679Z',null,'9999-10-03T15:00:00.123456789012345678Z');assert.equal(late.candidates[0].offset_ms,1e-15);assert.equal(late.candidates[0].end_ms,null);
 const equal=seek('2026-10-03T10:00:00.000900-05:00',null,'2026-10-03T15:00:00.0009Z',0.125);assert.equal(equal.candidates[0].offset_ms,0.125);
 const tinyBase=seek('2026-10-03T15:00:00.0000000002Z',null,'2026-10-03T15:00:00Z',1e-7);assert.equal(tinyBase.candidates[0].offset_ms,3e-7);
 const largeBase=seek('2026-10-03T15:00:00Z',null,'2026-10-03T15:00:00Z',1e21);assert.equal(largeBase.candidates[0].offset_ms,1e21);
 const epoch=seek('1970-01-01T00:00:00.0001Z',null,'1969-12-31T23:59:59.9999Z');assert.equal(epoch.candidates[0].offset_ms,0.2);
 const before=seek('2026-10-03T15:00:00.0001Z',null,'2026-10-03T15:00:00.0009Z');assert.equal(before.candidates.length,0);assert.ok(codes(before).includes('TIMING_GAP'));
 const cancellation=seek('2026-10-03T15:00:00.00009999999999999999999Z',null,'2026-10-03T15:00:00.0009Z',0.8);assert.equal(cancellation.candidates.length,0);assert.ok(codes(cancellation).includes('TIMING_GAP'));
});
