import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,symlinkSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from './helpers/native.mjs';
import {fixture,bytes,header,legacy,capture,locator,participant} from './helpers/conversation-fixture.mjs';
import {normalizeLegacy} from './helpers/guarded-freedom-conversation-legacy.mjs';
import {serializeConversationHeader} from './helpers/guarded-frontmatter-conversation.mjs';
import {classifyConversationPath,parseConversation,readConversation,listConversations,listConversationDirectory,indexConversations,resolveConversation,conversationCount,conversationSections,conversationSourceRefs} from './helpers/guarded-freedom-conversations.mjs';
const canonicalBody='\n## Now\nUnreviewed.\n\n## Transcript\n\n### t-000001\n<!-- turn {"speaker":null,"sources":[],"timing":null,"source_gap":"Capture not supplied."} -->\nExact words.\n\n## Log\n\n## Open questions\n';
const canonical=(patch={},body=canonicalBody)=>bytes(header(patch),body);
const setup=t=>{const f=fixture({mapped:true});t.after(f.close);return f;};
const codes=r=>r.diagnostics.map(d=>d.code);
const cli=fileURLToPath(new URL('../lib/freedom-conversations-cli.mjs',import.meta.url));
const run=(f,args)=>spawnSync(process.execPath,[cli,...args],{cwd:f.root,encoding:'utf8',env:{...process.env,FREEDOM_HOME:f.root,FREEDOM_WORKSPACE:''}});

test('mapped root counts one flat and one folder, excluding attachments',t=>{
 const f=setup(t);f.put(f.rel+'/old-call.md',legacy);f.put(f.rel+'/example-call/transcript.md',canonical());
 for(const p of ['example-call/annotations.md','example-call/sources/c-001/export.md','example-call/derived/c-001/export.md','_staging/draft.md','.hidden.md','README.md','staging/transcript.md'])f.put(f.rel+'/'+p,legacy);
 const r=listConversations(f.root);assert.equal(r.records.length,2);assert.deepEqual(r.records.map(x=>x.id).sort(),['example-call','old-call']);assert.equal(conversationCount(f.root),2);
 assert.deepEqual(listConversationDirectory(join(f.root,f.rel)).records.map(x=>x.id),r.records.map(x=>x.id));
 assert.equal(r.records.find(x=>x.id==='example-call').relativePath,'example-call/transcript.md');
 f.put(f.rel+'/example-call.md',legacy);assert.ok(codes(listConversations(f.root)).includes('ID_COLLISION'));
});
test('enumeration reports unknown nested markdown and symlinks without following them',t=>{
 const f=setup(t);f.put(f.rel+'/unexpected/deep/note.md',legacy);const outside=f.put('outside/secret.md',legacy);
 symlinkSync(outside,join(f.root,f.rel,'linked.md'));symlinkSync(join(f.root,'outside'),join(f.root,f.rel,'linked-folder'));
 const r=listConversations(f.root);assert.equal(r.records.length,0);assert.ok(codes(r).includes('UNCLASSIFIED_MARKDOWN'));assert.equal(r.diagnostics.filter(d=>d.code==='SYMLINK_EXCLUDED').length,2);
 assert.equal(classifyConversationPath('a/transcript.md'),'canonical');assert.equal(classifyConversationPath('a.md'),'legacy');
 for(const p of ['../a.md','a/../transcript.md','_a/transcript.md','sources/transcript.md','derived/transcript.md','annotations.md','a/sources/c/file.md','a\\transcript.md'])assert.equal(classifyConversationPath(p),'excluded',p);
});
test('canonical ids come from headers with mismatch refusal, and malformed canonical is never legacy',()=>{
 const r=parseConversation(canonical({id:'header-owned'}),{file:'/synthetic/folder/transcript.md'});assert.equal(r.id,'header-owned');assert.ok(codes(r).includes('ID_FOLDER_MISMATCH'));
 for(const b of [bytes(header({schema_version:2})),Buffer.from('---\nschema_version: 1\nkind: "conversation"\nid: not-json\n---\n'),Buffer.from('## Transcript\nwords')]) {
  const r=parseConversation(b,{file:'/synthetic/example-call/transcript.md'});assert.equal(r.layout,'canonical');assert.ok(r.diagnostics.some(d=>d.severity==='error'));assert.equal(r.sections.length,0);
 }
 const r2=parseConversation(Buffer.concat([canonical(),Buffer.from([0xff])]),{file:'/synthetic/example-call/transcript.md'});assert.ok(codes(r2).includes('INVALID_UTF8'));assert.equal(r2.header,null);
});
test('canonical schema markers refuse fallback even in flat files',()=>{
 const r=parseConversation(bytes(header({schema_version:99})),{file:'/synthetic/old.md'});assert.ok(codes(r).includes('UNSUPPORTED_SCHEMA_VERSION'));assert.equal(r.legacyFields,null);assert.equal(r.sections.length,0);
});
test('sections preserve UTF-8 CRLF byte spans and physical lines outside fences',()=>{
 const b=Buffer.from('---\ntitle: sample\n---\n\n## Summary\r\nInterpretation.\r\n## FULL TRANSCRIPT\r\nCafé words.\r\n```md\r\n## Summary\r\nquoted heading\r\n```\r\n### Detail\r\nstill speech\r\n## Action Items\r\nDo something.\r\n');
 const r=parseConversation(b,{file:'/synthetic/old.md'}),sections=conversationSections(r),speech=sections.find(s=>s.kind==='transcript');
 assert.equal(speech.startLine,7);assert.equal(speech.endLine,14);assert.deepEqual(speech.bytes,Buffer.from('## FULL TRANSCRIPT\r\nCafé words.\r\n```md\r\n## Summary\r\nquoted heading\r\n```\r\n### Detail\r\nstill speech\r\n'));
 assert.ok(sections.some(s=>s.name==='Action Items'&&s.kind==='interpretation'));assert.deepEqual(r.body,b.subarray(b.indexOf('\n---\n')+5));assert.deepEqual(r.turns,[]);
});
test('attribution warnings remain independently exposed and headingless notes never become speech',()=>{
 const body='\n> [!WARNING]\n> Speaker attribution is unreviewed.\n\n## Transcript\nExact words.\n\n## Attribution warning\nLabels are provisional.\n';
 const r=parseConversation(Buffer.from(body),{file:'/synthetic/old.md'});assert.equal(r.sections.filter(s=>s.kind==='warning').length,2);assert.ok(r.sections.some(s=>s.bytes.includes(Buffer.from('Speaker attribution is unreviewed.'))));
 const note=parseConversation(Buffer.from('A note without evidence headings.\n'),{file:'/synthetic/note.md'});assert.ok(codes(note).includes('TRANSCRIPT_SECTION_UNKNOWN'));assert.ok(note.sections.every(s=>s.kind!=='transcript'));
});
test('canonical sections require exact names order uniqueness and report empty speech',()=>{
 for(const body of ['## Transcript\nwords\n','## Transcript\nwords\n## Now\n## Log\n## Open questions\n',canonicalBody+'\n## Transcript\nextra\n'])assert.ok(codes(parseConversation(canonical({},body),{file:'/synthetic/example-call/transcript.md'})).includes('CANONICAL_SECTIONS_INVALID'));
 const r=parseConversation(canonical({},'## Now\n\n## Transcript\n\n## Log\n\n## Open questions\n'),{file:'/synthetic/example-call/transcript.md'});assert.ok(r.gaps.some(d=>d.code==='TRANSCRIPT_EMPTY'));
});
test('unknown participant roles survive as a single normalized gap without changing identity',()=>{
 const p=participant({person:'candidate',status:'proposed',role:'unknown'}),r=parseConversation(canonical({participants:[p]}),{file:'/synthetic/example-call/transcript.md'});
 assert.deepEqual(r.header.participants,[p]);assert.equal(r.gaps.filter(d=>d.field==='participants[0].role').length,1);
});
test('indexes expose all colliding ids and namespaced aliases without preferring records',()=>{
 const record=(id,aliases=[])=>parseConversation(canonical({id,aliases}),{file:`/synthetic/${id}/transcript.md`});
 const a=record('alpha',[{kind:'source-id',namespace:'cloud:zoom',value:'same'}]),b=record('beta',[{kind:'source-id',namespace:'cloud:meet',value:'same'}]),c=record('gamma',[{kind:'source-id',namespace:'cloud:zoom',value:'same'}]);
 const records=[a,b,c],ix=indexConversations(records);assert.deepEqual(ix.byId.get('alpha'),[a]);assert.deepEqual(ix.byAlias.get('cloud:zoom:same'),[a,c]);assert.ok(codes(ix).includes('AMBIGUOUS_ALIAS'));
 assert.equal(resolveConversation(records,'cloud:meet:same').record,b);assert.equal(resolveConversation(records,'same').record,null);assert.ok(codes(resolveConversation(records,'same')).includes('AMBIGUOUS_ALIAS'));assert.equal(resolveConversation(records,'alpha').record,null);assert.ok(codes(resolveConversation(records,'absent')).includes('NOT_FOUND'));
 const caseCollision=indexConversations([record('Café'),record('CAFÉ')]);assert.ok(codes(caseCollision).includes('ID_COLLISION'));
 const shadow=record('delta',[{kind:'record-id',namespace:null,value:'alpha'}]);assert.equal(resolveConversation([a,shadow],'alpha').record,null);
});
test('all locator and role combinations retain exact source identities without filesystem probing',()=>{
 const c=capture({roles:['transcript-body','supplemental'],locators:[locator(),locator({kind:'external-local',path:'~/original.wav',service_id:null})]});
 const r=parseConversation(canonical({sources:[c]}),{file:'/synthetic/example-call/transcript.md'}),refs=conversationSourceRefs(r);
 assert.equal(refs.length,4);assert.deepEqual(refs.map(x=>[x.role,x.path,x.service,x.recordingId]),[['transcript-body',null,'zoom','opaque-ID'],['supplemental',null,'zoom','opaque-ID'],['transcript-body','~/original.wav','zoom','opaque-ID'],['supplemental','~/original.wav','zoom','opaque-ID']]);
});
test('cloud-only service and recording_id stay usable after canonical relocation encoding',()=>{
 const b=Buffer.from('---\nsources:\n  - type: cloud_recording\n    service: zoom\n    recording_id: "987654321"\n---\n\n## Transcript\n\nExact words.\n');
 const old=normalizeLegacy(b,{file:'/synthetic/meeting-transcripts/cloud-call.md'}),c=old.header.sources[0];assert.equal(c.service,'zoom');assert.equal(c.recording_id,'987654321');assert.deepEqual(c.roles,['unknown']);assert.equal(c.locators[0].url,null);assert.equal(c.locators[0].path,null);
 const moved=parseConversation(serializeConversationHeader(old.header,old.body),{file:'/synthetic/meeting-transcripts/cloud-call/transcript.md'});const pick=r=>conversationSourceRefs(r).map(x=>[x.service,x.recordingId,x.role,x.path,x.url]);
 assert.deepEqual(pick(old),[['zoom','987654321','unknown',null,null]]);assert.deepEqual(pick(moved),pick(old));assert.ok(moved.header.aliases.some(a=>a.namespace==='cloud:zoom'&&a.value==='987654321'));assert.deepEqual(moved.body,old.body);
});
test('vendor identity matrix survives relocation without filename or timestamp inference',()=>{
 for(const [fields,type,id,ns] of [['granola_id: opaque-G','granola','opaque-G','granola'],['meet_id: opaque-M','meet_cloud','opaque-M','meet'],['zoom_gmt: GMT20260101-120000','zoom_cloud','GMT20260101-120000','zoom-cloud-gmt'],['voice_memo_id: opaque-V','voice_memo','opaque-V','voice-memo'],['source: zoom\nrecording_id: opaque-Z','cloud_recording','opaque-Z','cloud:zoom']]) {
  const old=normalizeLegacy(Buffer.from(`---\n${fields}\n---\n## Transcript\nWords.\n`),{file:'/synthetic/2020-01-01-old.md'});const moved=parseConversation(serializeConversationHeader(old.header,old.body),{file:'/synthetic/2020-01-01-old/transcript.md'});
  assert.equal(moved.header.date,null);assert.equal(moved.header.start,null);assert.deepEqual(conversationSourceRefs(moved),conversationSourceRefs(old));assert.equal(moved.header.sources[0].type,type);assert.ok(moved.header.aliases.some(a=>a.namespace===ns&&a.value===id));
 }
 const unresolved=parseConversation(Buffer.from('---\nzoom_id: meeting-only\n---\n## Transcript\nWords.\n'),{file:'/synthetic/2020-01-01-old.md'});assert.ok(codes(unresolved).includes('RECORDING_ID_UNRESOLVED'));assert.equal(unresolved.header.sources.length,0);
 const conflicting=parseConversation(Buffer.from('---\nzoom_id: meeting-only\nsources:\n  - type: cloud_recording\n    service: zoom\n    recording_id: different-recording\n---\n## Transcript\nWords.\n'),{file:'/synthetic/old.md'});assert.ok(codes(conflicting).includes('RECORDING_ID_UNRESOLVED'));assert.equal(conversationSourceRefs(conflicting)[0].recordingId,'different-recording');
});
test('explicit reads preserve bytes and missing files are diagnosed',t=>{
 const f=setup(t),file=f.put('outside/note.md',legacy),before=readFileSync(file);assert.equal(readConversation(file).relativePath,'note.md');assert.deepEqual(readFileSync(file),before);
 assert.ok(codes(readConversation(join(f.root,'missing.md'))).includes('NOT_FOUND'));assert.ok(codes(listConversationDirectory(join(f.root,'missing-directory'))).includes('READ_INCOMPLETE'));
 let observed;const r=readConversation('/synthetic/old.md',{read:p=>{observed=p;return legacy;}});assert.equal(observed,'/synthetic/old.md');assert.equal(r.header.title,'Old call');
});
test('CLI outside repository emits versioned metadata and explicit text payloads',t=>{
 const f=setup(t),file=f.put(f.rel+'/example-call/transcript.md',canonical({sources:[capture()]}));
 for(const args of [['list','--workspace',f.root],['list','--transcripts-dir',join(f.root,f.rel)],['read',file],['validate',file],['resolve','example-call','--workspace',f.root]]) {
  const p=run(f,[...args,'--json']);assert.equal(p.status,0,p.stderr||p.stdout);assert.equal(p.stderr,'');const data=JSON.parse(p.stdout);assert.equal(data.api_version,1);assert.equal(data.records.length,1);assert.equal(data.records[0].id,'example-call');assert.equal(data.records[0].body,undefined);assert.ok(!p.stdout.includes('Exact words.'));
 }
 const p=run(f,['read',file,'--include-body','--json']),data=JSON.parse(p.stdout);assert.equal(p.status,0);assert.equal(data.records[0].body,canonicalBody);assert.equal(typeof data.records[0].sections[1].bytes,'string');assert.equal(typeof data.records[0].rawHeader,'string');
 const sections=JSON.parse(run(f,['list','--workspace',f.root,'--include-sections','--json']).stdout);assert.ok(sections.records[0].sections.some(x=>x.bytes.includes('Exact words.')));assert.equal(sections.records[0].body,undefined);
 const src=JSON.parse(run(f,['sources',file,'--json']).stdout);assert.equal(src.records[0].sources[0].recordingId,'opaque-ID');
 assert.equal(run(f,['resolve','absent','--workspace',f.root,'--json']).status,1);
 assert.equal(run(f,['list','--workspace',f.root,'--transcripts-dir',join(f.root,f.rel),'--json']).status,2);
 f.put(f.rel+'/example-call.md',legacy);assert.equal(run(f,['list','--workspace',f.root,'--json']).status,3);
 const bad=f.put('bad/transcript.md',bytes(header({schema_version:99})));assert.equal(run(f,['read',bad,'--json']).status,2);
 assert.equal(run(f,['list','--unexpected','--json']).status,2);
});
test('CLI help and capabilities work without workspace and advertise only implemented commands',t=>{
 const f=setup(t);const p=run(f,['--capabilities','--json']);assert.equal(p.status,0);assert.deepEqual(JSON.parse(p.stdout),{api_version:1,schema_versions:[1],commands:['list','read','validate','sources','resolve','cite','seek','create','annotate','revise','recover'],revision:null});assert.equal(run(f,['--help']).status,0);
 const file=f.put('old.md',legacy),text=run(f,['read',file]);assert.equal(text.status,0);assert.match(text.stderr,/UNKNOWN_FACT/);assert.ok(!text.stdout.includes('UNKNOWN_FACT'));
});

const redirect=to=>Buffer.from(`---\nschema_version: 1\nkind: "conversation-redirect"\nto: ${JSON.stringify(to)}\n---\n`);
test('explicit redirects require root and resolve chains without counting forwarding records',t=>{
 const f=setup(t),target=f.put(f.rel+'/example-call/transcript.md',canonical()),a=f.put(f.rel+'/old.md',redirect(f.rel+'/middle.md'));
 f.put(f.rel+'/middle.md',redirect(f.rel+'/example-call/transcript.md'));
 assert.ok(codes(readConversation(a)).includes('REDIRECT_WORKSPACE_REQUIRED'));
 const r=readConversation(a,{root:f.root});assert.equal(r.file,target);assert.equal(r.id,'example-call');assert.equal(r.diagnostics.filter(d=>d.severity==='error').length,0);
 const all=listConversations(f.root);assert.equal(all.records.length,1);assert.equal(resolveConversation(all.records,f.rel+'/old.md',{root:f.root}).record.file,target);
 assert.equal(run(f,['read',a,'--workspace',f.root,'--json']).status,0);
 assert.equal(run(f,['resolve',f.rel+'/old.md','--workspace',f.root,'--json']).status,0);
});
test('redirects refuse loops escapes missing targets malformed bodies and more than eight hops',t=>{
 const f=setup(t),a=f.put(f.rel+'/a.md',redirect(f.rel+'/b.md'));f.put(f.rel+'/b.md',redirect(f.rel+'/a.md'));
 assert.ok(codes(readConversation(a,{root:f.root})).includes('REDIRECT_LOOP'));
 f.put(f.rel+'/a.md',redirect('../outside.md'));assert.ok(codes(readConversation(a,{root:f.root})).includes('REDIRECT_OUTSIDE_WORKSPACE'));
 f.put(f.rel+'/a.md',redirect('missing.md'));assert.ok(codes(readConversation(a,{root:f.root})).includes('NOT_FOUND'));
 f.put(f.rel+'/a.md',Buffer.concat([redirect('missing.md'),Buffer.from('nonempty body')]));assert.ok(codes(readConversation(a,{root:f.root})).includes('INVALID_REDIRECT'));
 const external=fixture();t.after(external.close);external.put('escape.md',legacy);symlinkSync(external.root,join(f.root,'escape'));
 f.put(f.rel+'/a.md',redirect('escape/escape.md'));assert.ok(codes(readConversation(a,{root:f.root})).includes('REDIRECT_OUTSIDE_WORKSPACE'));
 for(let i=0;i<9;i++)f.put(f.rel+`/hop-${i}.md`,redirect(i===8?f.rel+'/example-call/transcript.md':f.rel+`/hop-${i+1}.md`));f.put(f.rel+'/example-call/transcript.md',canonical());
 assert.ok(codes(readConversation(join(f.root,f.rel,'hop-0.md'),{root:f.root})).includes('REDIRECT_HOP_LIMIT'));
 assert.equal(readConversation(join(f.root,f.rel,'hop-1.md'),{root:f.root}).id,'example-call');
});

test('legacy display titles do not hide transcript headings while nested spoken headings stay included',()=>{
 const r=parseConversation(Buffer.from('# Display title\n\n## Transcript\nWords.\n### Summary\nThese remain spoken words.\n## Summary\nInterpretation.\n'),{file:'/synthetic/old.md'});
 assert.deepEqual(r.sections.filter(s=>s.kind==='transcript').map(s=>s.bytes.toString()),['## Transcript\nWords.\n### Summary\nThese remain spoken words.\n']);
 assert.equal(r.sections.filter(s=>s.kind==='interpretation').length,1);
});
test('invalid canonical source shape returns no refs instead of crashing a caller',()=>{
 const r=parseConversation(canonical({sources:[null]}),{file:'/synthetic/example-call/transcript.md'});assert.deepEqual(conversationSourceRefs(r),[]);
});
test('redirects refuse a final legacy file instead of treating it as a canonical destination',t=>{
 const f=setup(t);f.put(f.rel+'/legacy.md',legacy);const a=f.put(f.rel+'/forward.md',redirect(f.rel+'/legacy.md'));
 assert.ok(codes(readConversation(a,{root:f.root})).includes('REDIRECT_TARGET_INVALID'));
});
test('canonical absent captures and participants remain explicit gaps',()=>{
 const r=parseConversation(canonical(),{file:'/synthetic/example-call/transcript.md'});
 assert.ok(r.gaps.some(d=>d.field==='sources'));assert.ok(r.gaps.some(d=>d.field==='participants'));
});

test('unknown headings inside legacy speech are retained until a known equal-level interpretation boundary',()=>{
 const r=parseConversation(Buffer.from('## Transcript\nFirst.\n## A spoken heading\nSecond.\n### Summary\nStill spoken.\n## Summary\nInterpretation.\n'),{file:'/synthetic/old.md'});
 assert.equal(r.sections.find(s=>s.kind==='transcript').bytes.toString(),'## Transcript\nFirst.\n## A spoken heading\nSecond.\n### Summary\nStill spoken.\n');
});
test('former record id aliases participate in portable id collisions without folding vendor ids',()=>{
 const a=parseConversation(canonical({id:'Café'}),{file:'/synthetic/Café/transcript.md'});
 const b=parseConversation(canonical({id:'beta',aliases:[{kind:'record-id',namespace:null,value:'CAFÉ'}]}),{file:'/synthetic/beta/transcript.md'});
 assert.ok(codes(indexConversations([a,b])).includes('AMBIGUOUS_ALIAS'));assert.equal(resolveConversation([a,b],'Café').record,null);
});
test('unsupported schemas never project recognizable but unvalidated metadata',t=>{
 const f=setup(t),file=f.put('future/transcript.md',canonical({schema_version:99,title:'Unvalidated future title',sources:[capture()]}));
 const p=run(f,['read',file,'--json']);assert.equal(p.status,2);assert.ok(!p.stdout.includes('Unvalidated future title'));assert.ok(!p.stdout.includes('opaque-ID'));
});

test('one malformed alias container cannot hide other enumerated records or crash resolution',t=>{
 const f=setup(t);f.put(f.rel+'/example-call/transcript.md',canonical());
 for(const [id,aliases] of [['bad-object',{}],['bad-null',[null]]])f.put(f.rel+`/${id}/transcript.md`,canonical({id,aliases}));
 const r=listConversations(f.root);assert.equal(r.records.length,3);assert.ok(r.diagnostics.some(d=>d.code==='SCHEMA_INVALID'));assert.equal(resolveConversation(r.records,'example-call').record.id,'example-call');
});

test('portable id collision checks cover case folds that expand characters',()=>{
 const records=['Straße','STRASSE'].map(id=>parseConversation(canonical({id}),{file:`/synthetic/${id}/transcript.md`}));
 assert.ok(codes(indexConversations(records)).includes('ID_COLLISION'));
});

test('CLI refuses invalid UTF-8 without emitting lossy replacement text as an exact body',t=>{
 const f=setup(t),file=f.put('invalid/transcript.md',Buffer.concat([canonical(),Buffer.from([0xff])]));
 const p=run(f,['read',file,'--include-body','--json']);assert.equal(p.status,2);const r=JSON.parse(p.stdout).records[0];assert.equal(r.body,undefined);assert.equal(r.rawHeader,undefined);assert.ok(!p.stdout.includes('\uFFFD'));
});

test('pinned full default Unicode folding catches portability collisions without inventing locale equivalence',()=>{
 const record=id=>parseConversation(canonical({id}),{file:`/synthetic/${id}/transcript.md`});
 for(const [a,b] of [['id-ß','id-SS'],['id-ẞ','id-SS'],['id-ς','id-σ'],['id-ﬃ','id-ffi'],['id-\uA7DD','id-\u0277'],['id-café','id-cafe\u0301']]) {
  const records=[record(a),record(b)];assert.ok(codes(indexConversations(records)).includes('ID_COLLISION'),`${a} / ${b}`);assert.equal(resolveConversation(records,a).record,null);
 }
 for(const [a,b] of [['id-I','id-ı'],['id-İ','id-i']]) {const records=[record(a),record(b)];assert.ok(!codes(indexConversations(records)).includes('ID_COLLISION'));assert.equal(resolveConversation(records,a).record,records[0]);}
 assert.equal(resolveConversation([record('Exact')],'exact').record,null);
});
test('vendor alias values preserve case even when portability folding would equate them',()=>{
 const records=['ß','SS'].map((value,i)=>parseConversation(canonical({id:`record-${i}`,aliases:[{kind:'source-id',namespace:'cloud:zoom',value}]}),{file:`/synthetic/record-${i}/transcript.md`}));
 assert.equal(indexConversations(records).diagnostics.length,0);assert.equal(resolveConversation(records,'cloud:zoom:ß').record.id,'record-0');assert.equal(resolveConversation(records,'cloud:zoom:SS').record.id,'record-1');
});

test('canonical Now and Log own nested transcript-shaped headings as non-speech',()=>{
 const body='## Now\n### Transcript\nGenerated interpretation in Now.\n### Attribution warning\nLabels remain provisional.\n## Transcript\nActual speech.\n### Full transcript\nStill actual speech.\n## Log\n### Full transcript\nInterpretation in Log.\n## Open questions\n### Transcript\nUnresolved question.\n';
 const r=parseConversation(canonical({},body),{file:'/synthetic/example-call/transcript.md'});
 assert.ok(codes(r).includes('TURN_GRAMMAR_INVALID'));assert.deepEqual(r.turns,[]);
 assert.deepEqual(conversationSections(r).filter(s=>s.kind==='transcript').map(s=>s.bytes.toString()),['## Transcript\nActual speech.\n### Full transcript\nStill actual speech.\n']);
 assert.ok(r.sections.find(s=>s.name==='Now').bytes.includes(Buffer.from('Generated interpretation in Now.')));
 assert.ok(r.sections.find(s=>s.name==='Log').bytes.includes(Buffer.from('Interpretation in Log.')));
 assert.ok(r.sections.some(s=>s.kind==='warning'&&s.bytes.includes(Buffer.from('Labels remain provisional.'))));
 assert.deepEqual(r.body,Buffer.from(body));
});

test('count refuses missing partial and colliding discovery instead of returning an authoritative number',t=>{
 const f=setup(t);
 assert.equal(conversationCount(f.root),0);
 assert.throws(()=>conversationCount(join(f.root,'absent')),{code:'READ_INCOMPLETE'});
 f.put(f.rel+'/example-call/transcript.md',canonical());assert.equal(conversationCount(f.root),1);
 const unreadable=f.put(f.rel+'/unreadable.md',legacy);chmodSync(unreadable,0);
 try {
  const listing=listConversations(f.root);assert.equal(listing.records.length,1);assert.ok(codes(listing).includes('READ_INCOMPLETE'));
  assert.throws(()=>conversationCount(f.root),error=>error.code==='READ_INCOMPLETE'&&error.diagnostics.some(d=>d.code==='READ_INCOMPLETE')&&!error.message.includes('Old call'));
 }finally{chmodSync(unreadable,0o600);}
 assert.equal(conversationCount(f.root),2);
 f.put(f.rel+'/example-call.md',legacy);
 assert.throws(()=>conversationCount(f.root),error=>error.code==='ID_COLLISION'&&error.diagnostics.filter(d=>d.code==='ID_COLLISION').length===2);
});

test('proven flat transcript filename retains legacy parsing through enumeration root context and pure blobs',t=>{
 const f=setup(t),file=f.put(f.rel+'/transcript.md',legacy),before=readFileSync(file);
 const listed=listConversations(f.root);assert.equal(listed.records.length,1);assert.equal(listed.records[0].id,'transcript');assert.equal(listed.records[0].layout,'legacy');assert.equal(listed.diagnostics.filter(d=>d.severity==='error').length,0);
 for(const r of [parseConversation(legacy,{file:'/synthetic/git-blob/transcript.md',layout:'legacy'}),readConversation(file,{root:f.root}),readConversation('/synthetic/git-blob/transcript.md',{layout:'legacy',read:()=>legacy})]) {
  assert.equal(r.id,'transcript');assert.equal(r.layout,'legacy');assert.equal(r.header.title,'Old call');assert.ok(r.sections.some(s=>s.kind==='transcript'));assert.deepEqual(r.body,Buffer.from('\n## Transcript\n\nExact old words.\n'));
 }
 const p=run(f,['read',file,'--workspace',f.root,'--include-body','--json']);assert.equal(p.status,0,p.stdout);assert.equal(JSON.parse(p.stdout).records[0].id,'transcript');assert.deepEqual(readFileSync(file),before);
 const ambiguous=parseConversation(legacy,{file:'/synthetic/ambiguous/transcript.md'});assert.equal(ambiguous.header,null);assert.ok(ambiguous.diagnostics.some(d=>d.severity==='error'));
 const nested=f.put(f.rel+'/nested/transcript.md',legacy);assert.equal(readConversation(nested,{root:f.root}).header,null);assert.equal(parseConversation(legacy,{file:nested,layout:'canonical'}).header,null);
 const future=parseConversation(bytes(header({schema_version:99})),{file,layout:'legacy'});assert.ok(codes(future).includes('UNSUPPORTED_SCHEMA_VERSION'));
});

test('a unique alias cannot bypass its records portable collision while unrelated records still resolve',()=>{
 const record=(id,aliases=[])=>parseConversation(canonical({id,aliases}),{file:`/synthetic/${id}/transcript.md`});
 const a=record('Café',[{kind:'source-id',namespace:'cloud:zoom',value:'unique-source'}]),b=record('CAFÉ'),safe=record('safe');
 const r=resolveConversation([a,b,safe],'cloud:zoom:unique-source');assert.equal(r.record,null);assert.deepEqual(r.diagnostics.filter(d=>d.code==='ID_COLLISION').map(d=>d.path).sort(),[a.file,b.file].sort());assert.equal(resolveConversation([a,b,safe],'safe').record,safe);
});
test('other blocking alias memberships also remain blocking through a unique alias',()=>{
 const record=(id,aliases)=>parseConversation(canonical({id,aliases}),{file:`/synthetic/${id}/transcript.md`});
 const source=value=>({kind:'source-id',namespace:'cloud:zoom',value});
 const a=record('alpha',[source('shared'),source('only-a')]),b=record('beta',[source('shared')]);
 const result=resolveConversation([a,b],'cloud:zoom:only-a');assert.equal(result.record,null);assert.deepEqual(new Set(result.diagnostics.filter(d=>d.code==='AMBIGUOUS_ALIAS').map(d=>d.path)),new Set([a.file,b.file]));
});

test('explicit path and redirect resolution cannot bypass an indexed record collision',t=>{
 const f=setup(t),file=f.put(f.rel+'/Alpha/transcript.md',canonical({id:'Alpha'}));
 const a=readConversation(file),b=parseConversation(canonical({id:'ALPHA'}),{file:join(f.root,f.rel,'ALPHA','transcript.md')});
 f.put(f.rel+'/forward.md',redirect(f.rel+'/Alpha/transcript.md'));
 for(const query of [f.rel+'/Alpha/transcript.md',f.rel+'/forward.md']) {
  const r=resolveConversation([a,b],query,{root:f.root});assert.ok(r.record===null);assert.ok(codes(r).includes('ID_COLLISION'));
 }
});

test('explicit path resolution checks collision membership without replacing a fresh read with indexed bytes',t=>{
 const f=setup(t),file=f.put(f.rel+'/example-call/transcript.md',canonical()),records=[readConversation(file)];
 f.put(f.rel+'/example-call/transcript.md',canonical({title:'Updated synthetic title'}));
 const r=resolveConversation(records,f.rel+'/example-call/transcript.md',{root:f.root});assert.equal(r.record.header.title,'Updated synthetic title');
});


const turnMeta=(patch={})=>({speaker:null,sources:[],timing:null,source_gap:'Capture not supplied.',...patch});
const turnBody=(entries)=>'## Now\nUnreviewed.\n## Transcript\n'+entries+'## Log\n## Open questions\n';
const turnText=(id,text,meta=turnMeta())=>`### ${id}\n<!-- turn ${JSON.stringify(meta)} -->\n${text}`;
test('canonical turns preserve raw CRLF UTF-8 utterances and allocated ids after insertion',()=>{
 const words='Café.\r\n\r\n```md\r\n### t-999999\r\n<!-- turn {} -->\r\n```\r\n';
 const body=turnBody(turnText('t-000001',words)+turnText('t-000003','Inserted.\n')+turnText('t-000002','Last.\n'));
 const b=canonical({},body),r=parseConversation(b,{file:'/synthetic/example-call/transcript.md'});
 assert.deepEqual(r.turns.map(t=>t.id),['t-000001','t-000003','t-000002']);
 assert.deepEqual(r.turns[0].text,Buffer.from(words));assert.equal(r.diagnostics.filter(d=>d.severity==='error').length,0);
 const lines=b.toString().split('\n');assert.equal(lines[r.turns[0].startLine-1],'### t-000001');assert.equal(lines[r.turns[0].endLine-1],'```\r');
 assert.equal(r.turns[0].speaker,null);assert.equal(r.turns[0].timing,null);
});
test('canonical turn grammar refuses unstructured speech duplicate ids and malformed comments',()=>{
 const bad=[
  'Unstructured words.\n',
  turnText('t-000001','A.\n')+turnText('t-000001','B.\n'),
  turnText('t-1','Words.\n'),
  turnText('t-000001','Words.\n').replace('<!-- turn ','<!--turn '),
  turnText('t-000001','Words.\n').replace('"speaker":null','"speaker":null,"speaker":"p-001"'),
  turnText('t-000001','Words.\n').replace('"speaker":null','"__proto__":{},"speaker":null'),
  '### t-000001\nWords without metadata.\n',
 ];
 for(const speech of bad){const r=parseConversation(canonical({},turnBody(speech)),{file:'/synthetic/example-call/transcript.md'});assert.ok(r.diagnostics.some(d=>d.severity==='error'),speech);assert.deepEqual(r.turns,[]);}
});
test('turn references and explicit timing are validated without inventing identities or clocks',()=>{
 const good={speaker:'p-001',sources:[{capture:'c-001',locator:0,start_ms:20,end_ms:null}],timing:{basis:'capture',capture:'c-001',start_ms:20,end_ms:null},source_gap:null};
 const parse=meta=>parseConversation(canonical({participants:[participant()],sources:[capture()]},turnBody(turnText('t-000001','12:34 is speech.\n',meta))),{file:'/synthetic/example-call/transcript.md'});
 assert.equal(parse(good).turns.length,1);assert.equal(parse(turnMeta()).turns[0].timing,null);
 for(const meta of [
  {...good,speaker:'p-absent'}, {...good,extra:true}, {...good,source_gap:5},
  {...good,sources:[]}, {...good,sources:[{...good.sources[0],capture:'c-absent'}]},
  {...good,sources:[{...good.sources[0],locator:1}]}, {...good,sources:[{...good.sources[0],start_ms:null,end_ms:5}]},
  {...good,timing:{...good.timing,capture:'c-absent'}}, {...good,timing:{...good.timing,start_ms:-1}},
  {...good,timing:{...good.timing,start_ms:20,end_ms:10}}, {...good,timing:{basis:'wall-clock',start:'12:34',end:null,mapping:[]}},
  {...good,timing:{basis:'wall-clock',start:'2026-02-30T12:00:00Z',end:null,mapping:[]}},
  {...good,timing:{basis:'conversation',start_ms:0,end_ms:null,mapping:[{capture:'c-001',conversation_start_ms:0,conversation_end_ms:10,capture_start_ms:5,capture_end_ms:20}]}},
 ]) {const r=parse(meta);assert.ok(r.diagnostics.some(d=>d.severity==='error'),JSON.stringify(meta));assert.deepEqual(r.turns,[]);}
});
test('shared omitted-body fixture is empty canonical and explicitly supplied bytes remain exact',()=>{
 const r=parseConversation(bytes(),{file:'/synthetic/example-call/transcript.md'});assert.equal(r.diagnostics.filter(d=>d.severity==='error').length,0);assert.ok(codes(r).includes('TRANSCRIPT_EMPTY'));
 const body=Buffer.from([0x00,0xff,0x0d,0x0a]);assert.deepEqual(bytes(header(),body).subarray(-body.length),body);
});

test('canonical section headings follow exact grammar rather than Markdown display equivalence',()=>{
 for(const heading of ['  ## Transcript','## Transcript ##','## Transcript  ','##\tTranscript']) {
  const r=parseConversation(canonical({},canonicalBody.replace('## Transcript',heading)),{file:'/synthetic/example-call/transcript.md'});
  assert.ok(codes(r).includes('CANONICAL_SECTIONS_INVALID'),heading);assert.deepEqual(r.turns,[]);
 }
});
test('unknown turn speaker timing and capture coverage remain visible gaps',()=>{
 const r=parseConversation(canonical({},turnBody(turnText('t-000001','Unknown facts.\n'))),{file:'/synthetic/example-call/transcript.md'});
 for(const code of ['SPEAKER_UNRESOLVED','TIMING_UNRESOLVED','TURN_SOURCE_UNRESOLVED'])assert.ok(r.gaps.some(d=>d.code===code),code);
});

test('unknown selected locator source spans and timing ends each produce addressed gaps',()=>{
 const source={capture:'c-001',locator:0,start_ms:0,end_ms:2};
 const timing={basis:'capture',capture:'c-001',start_ms:0,end_ms:2};
 const make=(sources,timing)=>parseConversation(canonical({sources:[capture()]},turnBody(turnText('t-000001','Words.\n',turnMeta({sources,timing,source_gap:null})))),{file:'/synthetic/example-call/transcript.md'});
 const fields=['turns[0].sources[0].locator','turns[0].sources[0].start_ms','turns[0].sources[0].end_ms','turns[0].timing.end_ms'];
 const known=make([source],timing);assert.equal(known.diagnostics.filter(d=>d.severity==='error').length,0);assert.ok(fields.every(field=>!known.gaps.some(d=>d.field===field)));
 const unknownSource={...source,locator:null,start_ms:null,end_ms:null},unknownTiming={...timing,end_ms:null};
 const unknown=make([unknownSource],unknownTiming);
 assert.deepEqual(unknown.turns[0].sources,[unknownSource]);assert.deepEqual(unknown.turns[0].timing,unknownTiming);
 for(const field of fields)assert.equal(unknown.gaps.filter(d=>d.field===field&&d.severity==='warning').length,1,field);
 const partial=make([source,{...source,end_ms:null}],timing);assert.ok(partial.gaps.some(d=>d.field==='turns[0].sources[1].end_ms'));assert.ok(!partial.gaps.some(d=>d.field==='turns[0].sources[1].start_ms'));
 const conversation=make([source],{basis:'conversation',start_ms:0,end_ms:null,mapping:[]});assert.ok(conversation.gaps.some(d=>d.field==='turns[0].timing.end_ms'));
 const wall=make([source],{basis:'wall-clock',start:'2026-10-03T15:00:00Z',end:null,mapping:[]});assert.ok(wall.gaps.some(d=>d.field==='turns[0].timing.end'));assert.ok(!wall.gaps.some(d=>d.field==='turns[0].timing.end_ms'));
 assert.ok(!JSON.stringify(unknown.diagnostics).includes('Words.'));
});

test('canonical completeness counts utterance bytes rather than turn markup',()=>{
 const read=entries=>parseConversation(canonical({},turnBody(entries)),{file:'/synthetic/example-call/transcript.md'});
 for(const text of ['', ' \t\r\n\r\n']) {
  const r=read(turnText('t-000001',text));
  assert.equal(r.diagnostics.filter(d=>d.severity==='error').length,0);assert.deepEqual(r.turns[0].text,Buffer.from(text));
  assert.equal(r.gaps.filter(d=>d.code==='TURN_EMPTY'&&d.field==='turns[0].text').length,1);
  assert.equal(r.gaps.filter(d=>d.code==='TRANSCRIPT_EMPTY').length,1);
 }
 const emptyPair=read(turnText('t-000001','')+turnText('t-000002','\t\n'));
 assert.deepEqual(emptyPair.gaps.filter(d=>d.code==='TURN_EMPTY').map(d=>d.field),['turns[0].text','turns[1].text']);assert.equal(emptyPair.gaps.filter(d=>d.code==='TRANSCRIPT_EMPTY').length,1);
 const mixed=read(turnText('t-000001','')+turnText('t-000002','Actual words.\n'));
 assert.deepEqual(mixed.turns.map(t=>t.text),[Buffer.alloc(0),Buffer.from('Actual words.\n')]);assert.equal(mixed.gaps.filter(d=>d.code==='TURN_EMPTY').length,1);assert.ok(!mixed.gaps.some(d=>d.code==='TRANSCRIPT_EMPTY'));
 const noTurns=read('');assert.equal(noTurns.gaps.filter(d=>d.code==='TRANSCRIPT_EMPTY').length,1);assert.ok(!noTurns.gaps.some(d=>d.code==='TURN_EMPTY'));
});

test('wall-clock ordering preserves arbitrary fractional second precision',()=>{
 const make=(start,end)=>parseConversation(canonical({sources:[capture()]},turnBody(turnText('t-000001','Words.\n',turnMeta({timing:{basis:'wall-clock',start,end,mapping:[]}})))),{file:'/synthetic/example-call/transcript.md'});
 for(const [start,end] of [
  ['2026-10-03T15:00:00.0009Z','2026-10-03T15:00:00.0001Z'],
  ['2026-10-03T15:00:00.123456789012345678901234567891Z','2026-10-03T15:00:00.123456789012345678901234567890Z'],
  ['2026-10-03T10:00:00.0009-05:00','2026-10-03T15:00:00.0001Z'],
 ]) {const r=make(start,end);assert.ok(codes(r).includes('TURN_TIMING_INVALID'));assert.deepEqual(r.turns,[]);}
 for(const [start,end] of [
  ['2026-10-03T10:00:00.12345678901234567890123456789-05:00','2026-10-03T15:00:00.123456789012345678901234567890Z'],
  ['2026-10-03T15:00:00.999999999999999999999999Z','2026-10-03T15:00:01Z'],
 ]) {const r=make(start,end);assert.equal(r.diagnostics.filter(d=>d.severity==='error').length,0);assert.equal(r.turns[0].timing.start,start);assert.equal(r.turns[0].timing.end,end);}
});
