import {test} from 'node:test';
import assert from 'node:assert/strict';
import {header,bytes,sha,evidence,capture,locator,participant,protectedTurn} from './helpers/conversation-fixture.mjs';
import {parseConversationHeader,serializeConversationHeader,validateConversation} from './helpers/guarded-frontmatter-conversation.mjs';
import {realpathSync} from 'node:fs';
const ownedTempBase=()=>realpathSync(process.env.TRANSCRIPT_MD_OWNED);
const errors = h => validateConversation(h).filter(d=>d.severity==='error');
const has = (h,code,context) => validateConversation(h,context).some(d=>d.code===code);
test('structured header preserves types and body bytes',()=>{
 const b=Buffer.from('\r\n## Transcript\r\nexact words\r\n');
 const r=parseConversationHeader(bytes(header({body_format:'legacy'}),b.toString()));
 assert.equal(r.header.date,null); assert.deepEqual(r.body,b);
 assert.deepEqual(parseConversationHeader(serializeConversationHeader(r.header,r.body)).body,b);
 assert.ok(has(header({id:'other'}),'ID_FOLDER_MISMATCH',{folderId:'example-call'}));
 assert.ok(has(header({keep:{scope:'share',group:null,decision:null}}),'SHARE_DECISION_REQUIRED'));
});
test('BOM CRLF and absent trailing newline preserve raw bytes',()=>{
 const raw=Buffer.from('schema_version: 1\r\nkind: "conversation"\r\n');
 const body=Buffer.from('\r\nwords\r\n---\r\nlast');
 const r=parseConversationHeader(Buffer.concat([Buffer.from('\ufeff---\r\n'),raw,Buffer.from('---\r\n'),body]));
 assert.deepEqual(r.rawHeader,raw); assert.deepEqual(r.body,body);
 assert.deepEqual(parseConversationHeader(serializeConversationHeader(header(),body)).body,body);
 assert.equal(parseConversationHeader(Buffer.from('---\na: null\n---')).body.length,0);
 assert.deepEqual(parseConversationHeader(Buffer.from('words')).body,Buffer.from('words'));
});
test('invalid syntax refuses interpretation without losing original bytes',()=>{
 for(const [input,code] of [['---\na: null\na: 1\n---\n','DUPLICATE_KEY'],['---\na: text\n---\n','INVALID_JSON_VALUE'],['---\na: {"nested":{"constructor":1}}\n---\n','PROTOTYPE_KEY'],['---\na: null\n','MALFORMED_DELIMITER'],['--- \na: null\n---\n','MALFORMED_DELIMITER'],['---\n  a: 1\n---\n','INVALID_HEADER_LINE']]) {
  const b=Buffer.from(input),r=parseConversationHeader(b); assert.equal(r.header,null,code); assert.ok(r.diagnostics.some(d=>d.code===code)); assert.deepEqual(r.body,b);
 }
 const b=Buffer.concat([bytes(),Buffer.from([0xff])]);const r=parseConversationHeader(b);assert.equal(r.header,null);assert.ok(r.diagnostics.some(d=>d.code==='INVALID_UTF8'));assert.deepEqual(r.body,b);
});
test('serialization refuses lossy non-JSON values and prototype keys',()=>{
 for(const bad of [NaN,undefined,()=>1,Infinity,1n])assert.throws(()=>serializeConversationHeader(header({extensions:{bad}}),Buffer.alloc(0)));
 assert.throws(()=>serializeConversationHeader(header({extensions:JSON.parse('{"__proto__":{}}')}),Buffer.alloc(0)));
});
test('schema rejects missing wrong and unknown fields without leaking values',()=>{
 assert.equal(errors(header()).length,0);
 for(const patch of [{schema_version:2},{date:'2026-02-30'},{id:'../escape'},{title:''},{read_when:[null]},{participants:{}},{body_format:'other'},{extra:'secret-value'}])assert.ok(errors(header(patch)).length>0,JSON.stringify(patch));
 const h=header();delete h.keep;assert.ok(errors(h).length>0);
 assert.ok(has(header({schema_version:2}),'UNSUPPORTED_SCHEMA_VERSION'));
 assert.ok(has(header({extra:'secret-value'}),'UNKNOWN_KEY'));
 assert.ok(!JSON.stringify(errors(header({extra:'secret-value'}))).includes('secret-value'));
 assert.ok(has(header({audience:null}),'AUDIENCE_REQUIRED',{newRecord:true}));assert.equal(errors(header({audience:null})).length,0);
 assert.ok(has(header({id:'Portable Legacy'}),'INVALID_NEW_ID',{newRecord:true}));
});
test('unknown facts report warning gaps rather than invented defaults',()=>{
 const d=validateConversation(header({title:null,audience:null,as_of:null}));
 for(const field of ['title','audience','date','start','as_of'])assert.ok(d.some(x=>x.code==='UNKNOWN_FACT'&&x.field===field&&x.severity==='warning'));
});
test('start validates calendar timezone offset and agreement',()=>{
 const start={local:'10:20',timezone:null,instant:null,precision:'minute',evidence:[]};
 assert.equal(errors(header({start})).length,0);
 for(const patch of [{local:null},{local:'29:01'},{timezone:'Invented/Zone'},{instant:'2026-10-03T10:20:00'},{instant:'2026-02-30T10:20:00Z'},{instant:'2026-10-03T10:20:00+25:00'}])assert.ok(errors(header({start:{...start,...patch}})).length>0);
 assert.ok(has(header({date:'2026-10-03',start:{...start,timezone:'America/Chicago',instant:'2026-10-03T10:20:00Z'}}),'START_CONTRADICTION'));
 assert.equal(errors(header({date:'2026-10-03',start:{...start,timezone:'America/Chicago',instant:'2026-10-03T15:20:00Z'}})).length,0);
});
test('sharing evidence is required independently of audience',()=>{
 assert.ok(has(header({keep:{scope:'family',group:null,decision:evidence()}}),'FAMILY_GROUP_REQUIRED'));
 assert.ok(has(header({keep:{scope:'family',group:'people/groups/sample.md',decision:null}}),'FAMILY_DECISION_REQUIRED'));
 assert.ok(errors(header({keep:{scope:'family',group:'../group',decision:evidence()}})).length);
 assert.ok(has(header({audience:'public',keep:{scope:'share',group:null,decision:evidence({kind:'machine-check'})}}),'SHARE_DECISION_REQUIRED'));
 assert.equal(errors(header({keep:{scope:'share',group:null,decision:evidence()}})).length,0);
});
test('participant identity and duplicate ids refuse unsupported confirmation',()=>{
 assert.ok(has(header({participants:[participant({status:'confirmed',person:'sample'})]}),'CONFIRMED_IDENTITY_EVIDENCE_REQUIRED'));
 assert.ok(errors(header({participants:[participant({person:'sample'})]})).length);
 assert.ok(errors(header({participants:[participant(),participant()]})).length);
 assert.equal(errors(header({participants:[participant({status:'confirmed',person:'sample',evidence:[evidence({kind:'source-span'})]})]})).length,0);
});
test('capture identity and locator backup constraints preserve opaque service ids',()=>{
 assert.equal(errors(header({sources:[capture()]})).length,0);
 for(const patch of [{service:null},{service:'Zoom!'},{recording_id:null},{vendor_id:'another'},{roles:[]},{locators:[locator({service_id:'different'})]}])assert.ok(errors(header({sources:[capture(patch)]})).length,JSON.stringify(patch));
 assert.ok(errors(header({sources:[capture({type:'audio',service:'zoom',recording_id:null})]})).length);
 assert.ok(errors(header({sources:[capture({locators:[locator({kind:'bundled',path:'../escape',service_id:null})]})]})).length);
 assert.ok(errors(header({sources:[capture({locators:[locator({backup:{status:'verified-owned',locator:'owned-copy',sha256:sha,verified_at:'2026-10-03T10:20:00Z'}})]})]})).length);
 assert.equal(errors(header({sources:[capture({locators:[locator({sha256:sha,backup:{status:'verified-owned',locator:'owned-copy',sha256:sha,verified_at:'2026-10-03T10:20:00Z'}})]})]})).length,0);
});
test('aliases citations review and legacy hashes have structural and semantic rules',()=>{
 assert.ok(errors(header({aliases:[{kind:'source-id',value:'opaque',namespace:null}]})).length);
 assert.ok(errors(header({review:{transcription:'human-reviewed',attribution:'unreviewed',processing:'processed',evidence:[]}})).length);
 const citation={repository:null,path:'example-call/transcript.md',record_id:'example-call',revision:{kind:'git',value:'b'.repeat(40)},selector:{kind:'lines',start:2,end:1,text_sha256:sha},sources:[]};
 assert.ok(errors(header({connections:[{relation:'related',target:{kind:'conversation',id:'other'},citation}]})).length);
 assert.ok(errors(header({legacy:{original_path:'old.md',original_revision:{kind:'sha256',value:sha},raw_header_base64:null,raw_header_sha256:sha,fields:{},unparsed_keys:[],body_sha256:sha}})).length);
});
test('reserved protection extension cannot discard reviewed origin or admit fabricated decisions',()=>{
 const state={next_turn_number:2,retired_turn_ids:[],protected_turns:[protectedTurn()]};
 assert.equal(errors(header({extensions:{vendor:{flag:true},conversation_revision:state}})).length,0);
 for(const patch of [{reviewed_versions:[]},{reviewed_versions:[{...protectedTurn().reviewed_versions[0],evidence:[]}]},{baseline_sha256:'wrong'},{authorized_changes:[{revision_id:'revision-1',from_sha256:sha,to_sha256:null,decision:evidence({kind:'machine-check'})}]}]) assert.ok(errors(header({extensions:{conversation_revision:{...state,protected_turns:[protectedTurn(patch)]}}})).length);
 assert.ok(errors(header({extensions:{conversation_revision:{...state,unknown:true}}})).length);
});
test('nested duplicate keys and sparse arrays cannot erase metadata',()=>{
 const r=parseConversationHeader(Buffer.from('---\nextensions: {"vendor":{"id":1,"id":2}}\n---\nwords'));
 assert.equal(r.header,null);assert.ok(r.diagnostics.some(d=>d.code==='DUPLICATE_KEY'));
 const sparse=[];sparse.length=1;assert.throws(()=>serializeConversationHeader(header({extensions:{sparse}}),Buffer.alloc(0)));
});
test('malformed nested values return diagnostics rather than throwing',()=>{
 for(const patch of [{participants:[participant({evidence:[null],status:'confirmed',person:'sample'})]},{sources:[capture({locators:[null]})]},{extensions:{conversation_revision:{next_turn_number:1,retired_turn_ids:[],protected_turns:[{...protectedTurn(),reviewed_versions:[null]}]}}}])assert.ok(errors(header(patch)).length);
});

test('schema load refuses unsupported keywords instead of weakening validation',async()=>{
 const {mkdtempSync,writeFileSync,readFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {spawnSync}=await import('./helpers/native.mjs');
 const dir=mkdtempSync(join(ownedTempBase(),'conversation-schema-'));
 try {
  writeFileSync(join(dir,'conversation.mjs'),readFileSync(new URL('../lib/frontmatter/conversation.mjs',import.meta.url)));
  writeFileSync(join(dir,'conversation.schema.json'),JSON.stringify({type:'object',unsupported:true}));
  const result=spawnSync(process.execPath,[join(dir,'conversation.mjs')],{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/unsupported conversation schema keyword/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('typed nested fields and enums cannot bypass the shared schema',()=>{
 for(const patch of [{sources:[capture({availability:'invented'})]},{sources:[capture({roles:['invented']})]},{participants:[participant({role:'invented'})]},{keep:{scope:'invented',group:null,decision:null}},{aliases:[{kind:'invented',value:'a',namespace:null}]},{review:{transcription:'invented',attribution:'unreviewed',processing:'processed',evidence:[]}}])assert.ok(errors(header(patch)).length);
 for(const key of Object.keys(header())){const h=header();delete h[key];assert.ok(errors(h).length,key);}
 const p=participant();delete p.evidence;assert.ok(errors(header({participants:[p]})).length);
 const c=capture();delete c.service;assert.ok(errors(header({sources:[c]})).length);
});

test('structural identity evidence preserves valid evidence kinds without claiming factual review',()=>{
 assert.equal(errors(header({participants:[participant({person:'sample',status:'confirmed',evidence:[evidence({kind:'source-metadata'})]})]})).length,0);
});
test('unknown capture provenance and unzoned local starts produce explicit gaps',()=>{
 const d=validateConversation(header({sources:[capture({type:null,service:null,recording_id:null,locators:[],availability:'unknown'})],start:{local:'10:20',timezone:null,instant:null,precision:'minute',evidence:[]}}));
 for(const field of ['sources[0].type','sources[0].availability','sources[0].roles','start.timezone'])assert.ok(d.some(x=>x.code==='UNKNOWN_FACT'&&x.field===field&&x.severity==='warning'),field);
});

test('numeric timezone offsets cannot masquerade as IANA zones',()=>{
 const start={local:'10:20',timezone:'+01:00',instant:null,precision:'minute',evidence:[]};
 assert.ok(has(header({start}),'INVALID_TIMEZONE'));
});

test('unknown fields inside nullable objects name the rejected key',()=>{
 const d=validateConversation(header({start:{local:'10:20',timezone:null,instant:null,precision:'minute',evidence:[],invented:'secret'}}));
 assert.ok(d.some(x=>x.code==='UNKNOWN_KEY'&&x.field==='start.invented'));
 assert.ok(!JSON.stringify(d).includes('secret'));
});

test('opaque direct and nested extension or legacy timestamp names remain uninterpreted',()=>{
 const legacyFields = fields => ({original_path:'original.md',original_revision:{kind:'sha256',value:sha},raw_header_base64:null,raw_header_sha256:null,fields,unparsed_keys:[],body_sha256:sha});
 for(const key of ['instant','checked_at','verified_at'])for(const value of [{[key]:'opaque vendor token'},{vendor:{[key]:'opaque vendor token'}}]) {
  for(const h of [header({extensions:value}),header({legacy:legacyFields(value)})]) {
   assert.equal(errors(h).length,0,JSON.stringify(h.extensions));
   const parsed=parseConversationHeader(serializeConversationHeader(h,Buffer.from('synthetic words')));
   assert.deepEqual(parsed.header.extensions,h.extensions);assert.deepEqual(parsed.header.legacy,h.legacy);
   assert.equal(parsed.diagnostics.filter(d=>d.severity==='error').length,0);
  }
 }
 // Skipping opaque metadata must not weaken the reserved extension's schema.
 assert.ok(errors(header({extensions:{conversation_revision:{next_turn_number:0,retired_turn_ids:[],protected_turns:[]}}})).length);
});
test('schema-owned core timestamps still reject invalid calendar instants',()=>{
 const invalid='2026-02-30T10:20:00Z';
 const start={local:null,timezone:null,instant:invalid,precision:'second',evidence:[]};
 for(const [h,field] of [[header({start}),'start.instant'],[header({sources:[capture({locators:[locator({checked_at:invalid})]})]}),'sources[0].locators[0].checked_at'],[header({sources:[capture({locators:[locator({sha256:sha,backup:{status:'verified-owned',locator:'owned-copy',sha256:sha,verified_at:invalid}})]})]}),'sources[0].locators[0].backup.verified_at']]) {
  assert.ok(validateConversation(h).some(d=>d.code==='INVALID_INSTANT'&&d.field===field),field);
 }
});
test('all C0 and C1 controls are refused in canonical ids aliases and citation record ids',()=>{
 const codes=[...Array.from({length:32},(_,i)=>i),...Array.from({length:33},(_,i)=>127+i)];
 for(const code of codes) {
  const id=`legacy-${String.fromCodePoint(code)}-stem`;
  const h=header({id});assert.ok(has(h,'INVALID_RECORD_ID'),`canonical U+${code.toString(16)}`);assert.equal(h.id,id);
  assert.ok(has(header({aliases:[{kind:'record-id',value:id,namespace:null}]}),'INVALID_RECORD_ID'),`alias U+${code.toString(16)}`);
  const citation={repository:null,path:'original/transcript.md',record_id:id,revision:{kind:'sha256',value:sha},selector:{kind:'lines',start:1,end:1,text_sha256:sha},sources:[]};
  assert.ok(has(header({connections:[{relation:'related',target:{kind:'conversation',id:'related-record'},citation}]}),'CITATION_PATH_INVALID'),`citation U+${code.toString(16)}`);
 }
 const h=header({id:'Portable Café Legacy'});assert.equal(errors(h).length,0);assert.equal(parseConversationHeader(serializeConversationHeader(h,Buffer.alloc(0))).header.id,'Portable Café Legacy');
});

test('unknown participant role reports one gap even when a proposed person is nonnull',()=>{
 for(const p of [participant({role:'unknown'}),participant({role:'unknown',person:'candidate',status:'proposed'})]) {
  const h=header({participants:[p]}),before=structuredClone(h),d=validateConversation(h);
  assert.equal(d.filter(x=>x.field==='participants[0].role'&&x.code==='UNKNOWN_FACT'&&x.severity==='warning').length,1);assert.deepEqual(h,before);
 }
});

// Exact shared-codec prerequisite: RFC3339 numeric offsets are caller facts, not UTC rewrites.
test('schema-owned instants retain positive negative and fractional numeric offsets',()=>{
 for(const instant of ['2026-10-04T09:10:11-05:00','2026-10-04T15:10:11+01:00','2026-10-04T19:55:11.125+05:45','2026-10-04T10:40:11-03:30','2026-10-04T14:10:11Z']) {
  for(const h of [header({start:{local:null,timezone:null,instant,precision:'second',evidence:[]}}),header({sources:[capture({locators:[locator({checked_at:instant})]})]}),header({sources:[capture({locators:[locator({sha256:sha,backup:{status:'verified-owned',locator:'owned-copy',sha256:sha,verified_at:instant}})]})]})]) {
   assert.deepEqual(errors(h),[],instant);const r=parseConversationHeader(serializeConversationHeader(h,Buffer.from('Exact speech.')));assert.deepEqual(r.header,h);assert.deepEqual(r.diagnostics.filter(d=>d.severity==='error'),[]);
  }
 }
});
test('numeric offsets keep calendar range grammar and local-start agreement checks',()=>{
 for(const instant of ['2026-02-30T10:20:00-05:00','2026-10-04T25:20:00+01:00','2026-10-04T10:20:00+24:00','2026-10-04T10:20:00-01:60','2026-10-04T10:20+01:00','2026-10-04T10:20:00'])assert.ok(errors(header({start:{local:null,timezone:null,instant,precision:'second',evidence:[]}})).length,instant);
 const start={local:'09:10',timezone:'America/Chicago',instant:'2026-10-04T09:10:11-05:00',precision:'minute',evidence:[]};assert.deepEqual(errors(header({date:'2026-10-04',start})),[]);assert.ok(has(header({date:'2026-10-04',start:{...start,local:'10:10'}}),'START_CONTRADICTION'));
});
test('on_behalf_of and setting, as Supersuit writes them, validate clean',()=>{
 const h=header({on_behalf_of:['example-person'],setting:'remote'});
 assert.deepEqual(errors(h),[]);
 assert.ok(!validateConversation(h).some(d=>d.code==='UNKNOWN_KEY'));
 const parsed=parseConversationHeader(bytes(h));assert.deepEqual(parsed.header.on_behalf_of,['example-person']);
 for(const setting of ['in-person','remote','hybrid','unknown'])assert.deepEqual(errors(header({setting})),[]);
 assert.ok(has(header({setting:'online'}),'SCHEMA_INVALID'));
 for(const bad of [[''],'example-person',[7]])assert.ok(has(header({on_behalf_of:bad}),'SCHEMA_INVALID'),JSON.stringify(bad));
 // Both are optional: a record without them stays clean.
 assert.deepEqual(errors(header()),[]);
});
