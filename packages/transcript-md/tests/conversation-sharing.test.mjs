import {test} from 'node:test';
import assert from 'node:assert/strict';
import {header,evidence,bytes,emptyBody} from './helpers/conversation-fixture.mjs';
import {parseConversation,effectiveSharing,canProjectConversation} from './helpers/guarded-freedom-conversations.mjs';
import {serializeConversationHeader} from './helpers/guarded-frontmatter-conversation.mjs';

const group='people/groups/example.md';
const sharing=(scope,patch={})=>({scope,group:scope==='family'?group:null,decision:scope==='family'||scope==='share'?evidence():null,...patch});
const record=patch=>({header:header(patch),diagnostics:[]});
const publicTarget={kind:'public'};
const groupTarget={kind:'group',group};
const context={resolveGroup:ref=>ref===group?{exists:true,authorized:true}:{exists:false,authorized:false}};
const project=(r,target=publicTarget,ctx=context)=>canProjectConversation(r,target,ctx);

// Catch permission inferred from audience, or boundary checks treated as delivery approval.
test('public intended reader grants no publication permission',()=>{
 const r=record({audience:'public',keep:sharing('unknown')});
 assert.equal(project(r).allowed,false);
 assert.equal(effectiveSharing(r).effectiveScope,'home');
});
test('effectiveSharing never authorizes delivery without a target',()=>{
 for(const scope of ['home','unknown','family','share']) {
  const result=effectiveSharing(record({keep:sharing(scope)}));
  assert.equal(result.allowed,false);
  assert.equal(result.effectiveScope,scope==='unknown'?'home':scope);
 }
});

// Catch reliance on supplied diagnostics instead of revalidating the current header.
test('missing and malformed sharing refuse even with empty diagnostics',()=>{
 for(const keep of [undefined,null,sharing('share',{decision:null}),sharing('family',{group:null}),sharing('family',{group:'../escape.md'})]) {
  const r=record({keep});
  assert.equal(project(r).allowed,false);
  assert.equal(effectiveSharing(r).effectiveScope,'home');
 }
});
test('invalid schema and reader errors refuse otherwise explicit share',()=>{
 for(const r of [record({schema_version:2,keep:sharing('share')}),record({kind:'transcript',keep:sharing('share')}),{...record({keep:sharing('share')}),diagnostics:[{code:'TURN_SOURCE_INVALID',severity:'error'}]}]) {
  assert.equal(project(r).allowed,false);
  assert.equal(project(r).effectiveScope,'home');
 }
 assert.equal(project(null).allowed,false);
});
test('unresolved restriction diagnostic refuses even if only warning severity',()=>{
 const r={...record({keep:sharing('share')}),diagnostics:[{code:'RESTRICTION_UNRESOLVED',severity:'warning'}]};
 assert.deepEqual(project(r),{allowed:false,effectiveScope:'home',reason:'RESTRICTION_UNRESOLVED'});
});

// Catch a live/session choice replacing absent persisted boundary evidence.
test('context decisions cannot upgrade home unknown or missing stored choices',()=>{
 for(const keep of [sharing('home'),sharing('unknown'),sharing('share',{decision:null}),sharing('family',{decision:null})]) {
  assert.equal(project(record({keep}),keep.scope==='family'?groupTarget:publicTarget,{...context,decision:evidence()}).allowed,false);
 }
});
test('explicit recorded share permits public boundary projection',()=>{
 const r=record({audience:'freeda',keep:sharing('share')});
 assert.deepEqual(project(r),{allowed:true,effectiveScope:'share',reason:'SHARING_ALLOWED'});
});
test('supplementary context evidence is validated without granting session authorization',()=>{
 const r=record({keep:sharing('share')});
 assert.equal(project(r,publicTarget,{decision:evidence({kind:'machine-check'})}).allowed,true);
 for(const decision of [null,{},evidence({locator:''}),evidence({note:''}),evidence({revision:{kind:'sha256',value:'bad'}})]) {
  assert.equal(project(r,publicTarget,{decision}).allowed,false);
 }
});
test('nonoperator or malformed evidence cannot grant share',()=>{
 for(const decision of [evidence({kind:'machine-check'}),evidence({locator:''}),evidence({note:''}),evidence({revision:{kind:'sha256',value:'bad'}})]) {
  assert.equal(project(record({keep:sharing('share',{decision})})).allowed,false);
 }
});

// Catch family treated as public, wrong-group delivery, or truthy unverified membership.
test('family permits only its actual matching authorized group',()=>{
 const r=record({keep:sharing('family')});
 assert.deepEqual(project(r,groupTarget),{allowed:true,effectiveScope:'family',reason:'SHARING_ALLOWED'});
 assert.equal(project(r).allowed,false);
 assert.equal(project(r,{kind:'group',group:'people/groups/other.md'}).allowed,false);
});
test('share scope permits an authorized group and optional public target group metadata',()=>{
 const r=record({keep:sharing('share')});
 assert.equal(project(r,groupTarget).allowed,true);
 assert.equal(project(r,{kind:'public',group}).allowed,true);
});
test('group missing inaccessible malformed or revoked facts refuse',()=>{
 for(const keep of [sharing('family'),sharing('share')])for(const resolveGroup of [undefined,()=>({exists:false,authorized:true}),()=>({exists:true,authorized:false}),()=>null,()=>({exists:'true',authorized:1}),()=>Promise.resolve({exists:true,authorized:true}),()=>{throw new Error('synthetic private failure');}]) {
  const result=project(record({keep}),groupTarget,{resolveGroup});
  assert.equal(result.allowed,false);
  assert.equal(result.effectiveScope,'home');
  assert.ok(!result.reason.includes('synthetic private failure'));
 }
});
test('membership is resolved afresh at each delivery boundary',()=>{
 const r=record({keep:sharing('family')});let authorized=true;
 const ctx={resolveGroup:()=>({exists:true,authorized})};
 assert.equal(project(r,groupTarget,ctx).allowed,true);
 authorized=false;
 assert.equal(project(r,groupTarget,ctx).allowed,false);
});
test('invalid or missing targets cannot pass an explicit share boundary',()=>{
 for(const target of [null,{}, {kind:'email'},{kind:'group'},{kind:'group',group:'../escape.md'}]) {
  assert.equal(project(record({keep:sharing('share')}),target).allowed,false);
 }
});

// Catch canonical relocation or later explicit choice discarding legacy restrictions.
test('legacy private and sensitivity restrictions survive canonical relocation',()=>{
 for(const restriction of ['private: true','sensitivity: private','sensitivity: confidential','sensitivity: restricted']) {
  const old=parseConversation(Buffer.from(`---\n${restriction}\n---\n\r\n## Transcript\r\nExact synthetic words.\r\n`),{file:'/synthetic/example-call.md',layout:'legacy'});
  assert.equal(project(old).allowed,false);
  const moved=parseConversation(serializeConversationHeader({...old.header,keep:sharing('share')},old.body),{file:'/synthetic/example-call/transcript.md'});
  assert.equal(project(moved).allowed,false);
  assert.equal(project(moved).effectiveScope,'home');
 }
});
test('untranslated or conflicting retained restrictions cannot grant share',()=>{
 for(const restriction of ['sensitivity: surprising','private: perhaps','scope: share','sharing: public','keep: share','private: true\nsensitivity: surprising','private: false\nprivate: true']) {
  const old=parseConversation(Buffer.from(`---\n${restriction}\n---\n\n## Transcript\n\nSynthetic words.\n`),{file:'/synthetic/example-call.md',layout:'legacy'});
  const moved=parseConversation(serializeConversationHeader({...old.header,keep:sharing('share')},old.body),{file:'/synthetic/example-call/transcript.md'});
  assert.deepEqual(project(moved),{allowed:false,effectiveScope:'home',reason:'RESTRICTION_UNRESOLVED'});
 }
});
test('legacy private false grants nothing but does not negate a later stored share choice',()=>{
 const old=parseConversation(Buffer.from('---\nprivate: false\naudience: public\n---\n\n## Transcript\n\nSynthetic words.\n'),{file:'/synthetic/example-call.md',layout:'legacy'});
 assert.equal(project(old).allowed,false);
 const moved=parseConversation(serializeConversationHeader({...old.header,keep:sharing('share')},old.body),{file:'/synthetic/example-call/transcript.md'});
 assert.equal(project(moved).allowed,true);
});

// Catch annotations or source metadata being used as independent permission.
test('source and annotation projection inherits the parent conversation boundary',()=>{
 const r=record({keep:sharing('home'),extensions:{annotations:{keep:sharing('share')},source:{audience:'public'}}});
 assert.equal(project(r).allowed,false);
 assert.equal(project(r,publicTarget,{...context,decision:evidence()} ).allowed,false);
});
test('sharing reads preserve record object exact header and body bytes',()=>{
 const input=bytes(header({keep:sharing('family')}),Buffer.from(emptyBody.replaceAll('\n','\r\n')));
 const r=parseConversation(input,{file:'/synthetic/example-call/transcript.md'});
 const before=structuredClone(r),headerBefore=Buffer.from(r.rawHeader),bodyBefore=Buffer.from(r.body),inputBefore=Buffer.from(input);
 effectiveSharing(r);project(r,groupTarget);project(r,groupTarget,{resolveGroup:()=>({exists:true,authorized:false})});
 assert.deepEqual(structuredClone(r),before);
 assert.deepEqual(r.rawHeader,headerBefore);assert.deepEqual(r.body,bodyBefore);assert.deepEqual(input,inputBefore);
});
