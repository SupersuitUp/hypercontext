import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {normalizeLegacy,legacySourceRefs} from './helpers/guarded-freedom-conversation-legacy.mjs';
import {parseConversationHeader,serializeConversationHeader} from './helpers/guarded-frontmatter-conversation.mjs';
import {parseConversation,conversationSourceRefs} from './helpers/guarded-freedom-conversations.mjs';

const read=(header,body='\n## Transcript\nExact words.\n',file='/synthetic/call.md')=>normalizeLegacy(Buffer.from(`---\n${header}---\n${body}`),{file});
const codes=r=>r.diagnostics.map(d=>d.code);
const hash=b=>createHash('sha256').update(b).digest('hex');

test('legacy filename never invents date and unsupported fields retain exact bytes',()=>{
 const b=Buffer.from('---\ncustom: >-\n  keep this unknown value\nprivate: true\n---\n\r\n## Transcript\r\nwords\r\n');
 const r=normalizeLegacy(b,{file:'/archive/2020-01-01-call.md'});
 assert.equal(r.header.date,null);assert.equal(r.header.audience,null);assert.equal(r.header.keep.scope,'home');
 assert.deepEqual(Buffer.from(r.header.legacy.raw_header_base64,'base64'),r.rawHeader);
 assert.ok(r.header.legacy.unparsed_keys.includes('custom'));assert.equal(r.body.toString(),'\r\n## Transcript\r\nwords\r\n');
 assert.equal(r.fileSha256,hash(b));assert.equal(r.bodySha256,hash(r.body));assert.equal(r.header.legacy.original_revision.value,hash(b));
});
test('headerless and BOM CRLF records retain bodies without invented facts',()=>{
 const b=Buffer.from('\uFEFF## Transcript\r\nWords without final newline');const r=normalizeLegacy(b,{file:'/synthetic/old.md'});
 assert.deepEqual(r.body,b);assert.equal(r.rawHeader,null);assert.equal(r.header.legacy.raw_header_base64,null);assert.equal(r.header.title,null);
 assert.equal(r.layout,'legacy');assert.equal(r.relativePath,'old.md');assert.equal(r.id,'old');assert.deepEqual(r.sections,[]);assert.deepEqual(r.turns,[]);
 const cr=normalizeLegacy(Buffer.from('\uFEFF---\r\ntitle: "A call"\r\n---\r\n\uFEFFbody\r\n'),{file:'/synthetic/old.md'});
 assert.equal(cr.rawHeader.toString(),'title: "A call"\r\n');assert.equal(cr.body.toString(),'\uFEFFbody\r\n');
});
test('invalid UTF8 and delimiter shapes refuse interpretation without losing input',()=>{
 for(const b of [Buffer.from([0xff]),Buffer.from('---\ntitle: secret'),Buffer.from('--- broken\nsecret')]){
  const r=normalizeLegacy(b,{file:'/synthetic/call.md'});assert.equal(r.header,null);assert.deepEqual(r.body,b);assert.ok(r.diagnostics.some(d=>d.severity==='error'));
  assert.ok(!JSON.stringify(r.diagnostics).includes('secret'));
 }
});
test('safe scalar and string list metadata remains retained, including reserved names',()=>{
 const r=read('title: "A call"\ndescription: a description\naudience: public\nread_when: ["first", "second, cue"]\ncustom: opaque token\ninstant: vendor token\nkeep: custom-restriction\n');
 assert.equal(r.header.title,'A call');assert.deepEqual(r.header.read_when,['first','second, cue']);assert.equal(r.header.legacy.fields.custom,'opaque token');
 assert.equal(r.header.legacy.fields.instant,'vendor token');assert.equal(r.header.legacy.fields.keep,'custom-restriction');assert.equal(r.header.keep.scope,'unknown');
 assert.ok(codes(r).includes('RESTRICTION_UNRESOLVED'));assert.equal(r.header.review.transcription,'unreviewed');
});
test('participants and attendees preserve labels without confirming people or splitting scalar labels',()=>{
 const scalar=read('participants: Speaker One, Speaker Two\n');assert.deepEqual(scalar.header.participants.map(p=>p.label),['Speaker One, Speaker Two']);
 const r=read('participants: ["Speaker One", "speaker-two"]\nattendees:\n  - Observer\n');
 assert.deepEqual(r.header.participants.map(p=>[p.id,p.label,p.role,p.person,p.status]),[['p-001','Speaker One','unknown',null,'unknown'],['p-002','speaker-two','unknown',null,'unknown'],['p-003','Observer','attendee',null,'unknown']]);
 assert.ok(r.gaps.some(d=>d.field==='participants[0].person'));
});
test('inline participant labels keep escaped quotes and commas exactly in legacy and canonical fields',()=>{
 const r=read(`participants: ${JSON.stringify(['Speaker "A, guest','Speaker B'])}\n`);
 assert.deepEqual(r.header.legacy.fields.participants,['Speaker "A, guest','Speaker B']);
 assert.deepEqual(r.legacyFields.participants,['Speaker "A, guest','Speaker B']);
 assert.deepEqual(r.header.participants.map(p=>p.label),['Speaker "A, guest','Speaker B']);
 assert.deepEqual(r.header.legacy.unparsed_keys,[]);
 assert.ok(!r.diagnostics.some(d=>d.severity==='error'));
 assert.ok(r.header.participants.every(p=>p.person===null&&p.status==='unknown'));
});
test('duplicate and complex blocks never yield a partial guessed value',()=>{
 const r=read('date: 2020-01-01\ndate: 2020-01-02\ncustom: {nested: value}\nlabels: [plain, {nested: value}]\nother: &anchor value\nreview:\n  transcription: human-reviewed\n');
 assert.equal(r.header.date,null);assert.ok(codes(r).includes('DATE_CONFLICT'));assert.deepEqual(new Set(r.header.legacy.unparsed_keys),new Set(['date','custom','labels','other','review']));
 assert.equal(r.legacyFields.date,undefined);assert.equal(r.header.review.transcription,'unreviewed');
});
test('calendar dates come only from valid declared header days',()=>{
 assert.equal(read('date: 2020-02-29\nas_of: 2021-01-02\n').header.date,'2020-02-29');
 for(const date of ['2021-02-29','2020-01-01T09:00:00Z','tomorrow']){const r=read(`date: ${date}\n`);assert.equal(r.header.date,null);assert.ok(codes(r).includes('INVALID_DATE'));}
});
test('clock strings and recording timestamps never establish a start or date',()=>{
 const r=read('time_local: 09:30\nstart_local: 09:30\nstarted_at: 2020-01-01T09:30:00Z\nhappened_at: 2020-01-01T09:30:00Z\ntimezone: UTC\ntime_precision: minute\ninferred_from: capture creation\nzoom_gmt: GMT20200101-093000\n');assert.equal(r.header.start,null);assert.equal(r.header.date,null);assert.ok(codes(r).includes('TIME_BASIS_UNRESOLVED'));
 for(const key of ['time_local','start_local','started_at','happened_at','timezone','time_precision','inferred_from']){const x=read(`${key}: opaque\n`);assert.equal(x.header.start,null);assert.equal(x.legacyFields[key],'opaque');assert.ok(codes(x).includes('TIME_BASIS_UNRESOLVED'));}
});
test('privacy remains restrictive without inventing sharing decisions',()=>{
 for(const field of ['private: true','sensitivity: confidential','sensitivity: private'])assert.equal(read(`${field}\n`).header.keep.scope,'home');
 for(const field of ['private: false','audience: public'])assert.equal(read(`${field}\n`).header.keep.scope,'unknown');
 for(const field of ['private: perhaps','sensitivity: unusual','private:\n  nested: value'])assert.ok(codes(read(`${field}\n`)).includes('RESTRICTION_UNRESOLVED'));
});
test('legacy record alias preserves the old id while filename stem remains authoritative',()=>{
 const r=read('id: former-id\n');assert.equal(r.header.id,'call');assert.ok(r.header.aliases.some(a=>a.kind==='record-id'&&a.value==='former-id'&&a.namespace===null));
 assert.ok(r.header.aliases.some(a=>a.kind==='legacy-path'&&a.value==='/synthetic/call.md'));
 const bad=read('',undefined,'/synthetic/bad .md');assert.equal(bad.id,'bad ');assert.ok(codes(bad).includes('INVALID_RECORD_ID'));
});
test('cloud-only source keeps exact service recording identity and unknown coverage',()=>{
 const r=read('sources:\n  - type: cloud_recording\n    service: zoom\n    recording_id: "987654321"\n');const c=r.header.sources[0];
 assert.equal(c.service,'zoom');assert.equal(c.recording_id,'987654321');assert.equal(c.vendor_id,null);assert.deepEqual(c.roles,['unknown']);assert.equal(c.availability,'remote-only');
 assert.equal(c.locators[0].url,null);assert.equal(c.locators[0].path,null);assert.equal(c.locators[0].service_id,'987654321');assert.equal(c.locators[0].backup.status,'unverified');
 assert.ok(r.header.aliases.some(a=>a.namespace==='cloud:zoom'&&a.value==='987654321'));
 assert.deepEqual(legacySourceRefs(r.legacyFields).map(x=>[x.service,x.recordingId,x.role,x.path,x.url]),[['zoom','987654321','unknown',null,null]]);
 const round=parseConversationHeader(serializeConversationHeader(r.header,r.body));assert.deepEqual(round.body,r.body);assert.ok(!round.diagnostics.some(d=>d.severity==='error'));
});
test('multiple source maps retain order roles exact locators and independent cloud services',()=>{
 const r=read('sources:\n  - type: audio\n    path: ~/missing-original.wav\n    role: supplemental\n  - type: cloud_recording\n    service: zoom\n    recording_id: "A/1:Case"\n    url: https://example.test/recording\n    role: transcript-body\n  - type: cloud_recording\n    service: teams\n    recording_id: "A/1:Case"\n');
 assert.deepEqual(r.header.sources.map(c=>c.id),['c-001','c-002','c-003']);assert.equal(r.header.sources[0].availability,'unknown');assert.equal(r.header.sources[0].locators[0].path,'~/missing-original.wav');
 assert.deepEqual(legacySourceRefs(r.legacyFields).map(x=>[x.type,x.role,x.service]),[['audio','supplemental',null],['cloud_recording','transcript-body','zoom'],['cloud_recording','unknown','teams']]);
});
test('unsupported source syntax stays raw rather than partially parsing supported siblings',()=>{
 for(const shape of ['  - type: audio\n    path:\n      nested: value\n','  - type: cloud_recording\n    service: zoom\n    service: teams\n    recording_id: x\n','  - {type: audio, path: file.wav}\n']){
  const r=read(`sources:\n${shape}`);assert.deepEqual(r.header.sources,[]);assert.ok(r.header.legacy.unparsed_keys.includes('sources'));assert.ok(codes(r).includes('LEGACY_FIELD_UNPARSED'));
 }
});
test('unknown source keys retain raw metadata while supported scalar source fields remain usable',()=>{
 const r=read('sources:\n  - type: audio\n    path: /synthetic/original.wav\n    opaque: vendor-value\n');assert.equal(r.header.sources[0].locators[0].path,'/synthetic/original.wav');assert.ok(r.header.legacy.unparsed_keys.includes('sources'));
 assert.ok(r.rawHeader.includes(Buffer.from('opaque: vendor-value')));
});
test('top-level supported vendor identities use exact contract namespaces',()=>{
 for(const [field,value,type,namespace] of [['granola_id','GrAn-1','granola','granola'],['meet_id','MeEt-2','meet_cloud','meet'],['zoom_gmt','GMT20200101-093000','zoom_cloud','zoom-cloud-gmt'],['voice_memo_id','Memo-3','voice_memo','voice-memo']]){
  const r=read(`${field}: ${value}\n`);assert.equal(r.header.sources[0].type,type);assert.equal(r.header.sources[0].vendor_id,value);assert.ok(r.header.aliases.some(a=>a.namespace===namespace&&a.value===value));assert.equal(r.header.sources[0].locators[0].service_id,value);
 }
 const r=read('granola_id: GrAn-1\ngranola_url: https://example.test/note\nmeeting_key: candidate-only\n');assert.equal(r.header.sources[0].locators[0].url,'https://example.test/note');assert.equal(r.header.extensions.meeting_key,'candidate-only');
});
test('top-level cloud source identity is usable without a URL and missing service stays unresolved',()=>{
 const r=read('source: zoom\nrecording_id: "A:opaque"\n');assert.equal(r.header.sources[0].recording_id,'A:opaque');assert.equal(r.header.sources[0].service,'zoom');
 for(const h of ['recording_id: opaque\n','source: Invalid service\nrecording_id: opaque\n','source: granola\nrecording_id: opaque\n']){const x=read(h);assert.deepEqual(x.header.sources,[]);assert.ok(codes(x).includes('SOURCE_SERVICE_UNRESOLVED'));}
});
test('zoom meeting ids and invalid GMT ids never fabricate recording identities',()=>{
 const r=read('zoom_id: meeting-only\nzoom_gmt: timestamp-guess\n');assert.deepEqual(r.header.sources,[]);assert.ok(codes(r).includes('RECORDING_ID_UNRESOLVED'));assert.ok(r.header.aliases.some(a=>a.namespace==='zoom-meeting'&&a.value==='meeting-only'));
});
test('matching list and top-level identity fold only when overlapping locators agree',()=>{
 const r=read('sources:\n  - type: cloud_recording\n    service: zoom\n    recording_id: opaque\n    role: transcript-body\nsource: zoom\nrecording_id: opaque\n');assert.equal(r.header.sources.length,1);assert.deepEqual(r.header.sources[0].roles,['transcript-body','unknown']);assert.equal(r.header.sources[0].evidence.length,2);
 const conflict=read('sources:\n  - type: cloud_recording\n    service: zoom\n    recording_id: opaque\n    url: https://example.test/a\nsource: zoom\nrecording_id: opaque\nurl: https://example.test/b\n');assert.ok(codes(conflict).includes('SOURCE_ID_CONFLICT'));assert.equal(conflict.header.sources.length,1);
});
test('meet URLs yield only their declared id and conflicting vendor evidence blocks relocation',()=>{
 const r=read('sources:\n  - type: meet_cloud\n    url: https://example.test/file/d/Exact-ID/view\n');assert.equal(r.header.sources[0].vendor_id,'Exact-ID');
 const c=read('meet_id: Different-ID\nsources:\n  - type: meet_cloud\n    url: https://example.test/file/d/Exact-ID/view\n');assert.ok(codes(c).includes('SOURCE_ID_CONFLICT'));
 const z=read('sources:\n  - type: zoom_cloud\n    url: https://example.test/Share?token=Case\n');assert.ok(z.header.aliases.some(a=>a.namespace==='zoom-cloud-url'&&a.value==='https://example.test/Share?token=Case'));
});
test('diagnostics redact unsupported values and missing captures remain unknown',()=>{
 const r=read('sources:\n  - type: cloud_recording\n    service: zoom\nzoom_id: Sensitive-token\nsensitivity: Secret-name\n');assert.ok(!JSON.stringify(r.diagnostics).includes('Sensitive-token'));assert.ok(!JSON.stringify(r.diagnostics).includes('Secret-name'));assert.ok(codes(r).includes('RECORDING_ID_UNRESOLVED'));assert.ok(r.gaps.length>0);
});
test('top-level identity folds with the matching list capture regardless of list position',()=>{
 const r=read('sources:\n  - type: cloud_recording\n    service: zoom\n    recording_id: first\n  - type: cloud_recording\n    service: zoom\n    recording_id: second\nsource: zoom\nrecording_id: second\n');
 assert.equal(r.header.sources.length,2);assert.equal(r.header.sources[1].evidence.length,2);assert.ok(!codes(r).includes('SOURCE_ID_CONFLICT'));
});
test('quote and string-list syntax cannot hide empty or complex values as facts',()=>{
 for(const value of ['[one,,two]','[one,]','["one", {two: nested}]','"unterminated',"'one' trailing",'|']){const r=read(`custom: ${value}\n`);assert.equal(r.legacyFields.custom,undefined);assert.ok(r.header.legacy.unparsed_keys.includes('custom'));}
});
test('typed source-list vendor ids are opaque rather than coerced into GMT timestamps',()=>{
 const r=read('sources:\n  - type: zoom_cloud\n    id: "Opaque:Case/ID"\n    url: https://example.test/share\n');
 assert.equal(r.header.sources[0].vendor_id,'Opaque:Case/ID');assert.equal(legacySourceRefs(r.legacyFields)[0].vendorId,'Opaque:Case/ID');assert.ok(!codes(r).includes('RECORDING_ID_UNRESOLVED'));
});

test('supported scalar source notes survive actual legacy reading and lossless encoding without provenance',()=>{
 const note='Three captures, explicit \\"quote\\" and opaque id-not-proof.';
 const h='sources:\n  - type: concat\n    note: '+JSON.stringify(note)+'\n  - type: voice_memo\n    role: transcript-body\n    path: /synthetic/memo-a.m4a\n  - type: voice_memo\n    role: supplemental\n    path: /synthetic/memo-b.m4a\n';
 const original=Buffer.from('---\n'+h+'---\n\r\n## Transcript\r\nExact words.\r\n');
 const r=parseConversation(original,{file:'/synthetic/call.md',layout:'legacy'});
 assert.deepEqual(r.diagnostics.filter(d=>d.severity==='error'),[]);
 assert.equal(r.legacyFields.sources[0].note,note);assert.deepEqual(r.rawHeader,Buffer.from(h));
 const refs=conversationSourceRefs(r);assert.equal(refs[0].path,null);assert.equal(refs[0].vendorId,null);assert.equal(refs[0].recordingId,null);
 assert.deepEqual(refs.slice(1).map(x=>[x.path,x.role]),[['/synthetic/memo-a.m4a','transcript-body'],['/synthetic/memo-b.m4a','supplemental']]);
 const round=parseConversationHeader(serializeConversationHeader(r.header,r.body));
 assert.deepEqual(round.body,r.body);assert.equal(round.header.legacy.fields.sources[0].note,note);
 assert.deepEqual(Buffer.from(round.header.legacy.raw_header_base64,'base64'),Buffer.from(h));
 assert.ok(!round.header.aliases.some(a=>a.value.includes('id-not-proof')));
});
test('source note support never admits unknown fields complex values or duplicate keys',()=>{
 for(const fields of ['    opaque: value\n','    note: {nested: value}\n','    note: |\n      multiline\n','    note: one\n    note: two\n']) {
  const r=read('sources:\n  - type: audio\n    path: /synthetic/original.wav\n'+fields);
  assert.ok(r.diagnostics.some(d=>d.code==='LEGACY_FIELD_UNPARSED'&&d.severity==='error'));
  assert.ok(r.header.legacy.unparsed_keys.includes('sources'));
 }
});
