// The shipped standard manifest (standards/conversation/v1.json) must say exactly what the
// codec enforces: its standard is STANDARD, its codes are the code table, and the table holds
// every code the manifest's check (`validate`) can report: the header codec, the reader, the
// legacy reader and the command itself. Synthetic data only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import * as api from '../index.mjs';
import {header} from './helpers/conversation-fixture.mjs';
import {validateConversation,parseConversationHeader} from './helpers/guarded-frontmatter-conversation.mjs';
import {readConversation} from './helpers/guarded-freedom-conversations.mjs';
import {fixture,bytes} from './helpers/conversation-fixture.mjs';
import {spawnSync} from './helpers/native.mjs';
import {join} from 'node:path';

const repo=new URL('../',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('standards/conversation/v1.json',repo),'utf8'));
const codec=readFileSync(new URL('lib/frontmatter/conversation.mjs',repo),'utf8');
const cli=fileURLToPath(new URL('lib/freedom-conversations-cli.mjs',repo));

test('the manifest is the shipped, exported twin of version 1',()=>{
 assert.deepEqual(api.MANIFEST,manifest);
 assert.ok(Object.isFrozen(api.MANIFEST));
 assert.equal(manifest.manifest_version,1);
 assert.equal(manifest.standard,api.STANDARD);
 assert.equal(manifest.standard,'https://hypercontext.wiki/standards/conversation/v1');
 assert.equal(manifest.kind,'conversation');assert.equal(manifest.version,1);
 assert.equal(manifest.status,'current');assert.equal(manifest.superseded_by,null);
 assert.equal(manifest.latest,'https://hypercontext.wiki/standards/conversation');
 assert.deepEqual(manifest.record,{path:'<transcripts>/<id>/transcript.md',format:'md'});
 const pkg=JSON.parse(readFileSync(new URL('package.json',repo),'utf8'));
 assert.ok(pkg.files.includes('standards/'));
 assert.equal(pkg.exports['./standards/conversation/v1.json'],'./standards/conversation/v1.json');
 assert.equal(manifest.validator.package,pkg.name);
 assert.equal(manifest.validator.implements_since,'0.2.0');
 assert.equal(manifest.validator.check,'npx -y @supersuit/transcript-md@^0.2.0 validate <file> --json');
 assert.equal(manifest.validator.backfill,'npx -y @supersuit/transcript-md@^0.2.0 stamp-standard --workspace . --apply');
 assert.match(manifest.validator.check_scope,/one file/);assert.match(manifest.validator.check_scope,/umbrella/);
 assert.equal(manifest.umbrella,'npx -y @supersuit/hypercontext check <workspace>');
 assert.equal(createRequire(import.meta.url).resolve('@supersuit/transcript-md/standards/conversation/v1.json'),fileURLToPath(new URL('standards/conversation/v1.json',repo)));
});

test('header keys come from the schema: its required keys plus standard, and its real consts and enums',()=>{
 const schema=api.conversationSchema;
 assert.deepEqual(manifest.header.required,[...schema.required.slice(0,2),'standard',...schema.required.slice(2)]);
 const keys={};
 for(const [key,rule] of Object.entries(schema.properties)){
  if(key==='standard')continue;
  if(Object.hasOwn(rule,'const'))keys[key]={const:rule.const};
  else if(rule.enum)keys[key]={enum:rule.enum};
 }
 keys.standard={const:api.STANDARD};
 assert.deepEqual(manifest.header.keys,keys);
 // The schema still reads the bare URL so older records parse; the standard itself is v1.
 assert.deepEqual(schema.properties.standard.enum,[api.STANDARD,'https://hypercontext.wiki/standards/conversation']);
});

test('manifest codes equal the code table, level for level',()=>{
 const table=api.DIAGNOSTIC_CODES;
 assert.ok(Object.isFrozen(table));
 assert.deepEqual(manifest.codes.map(c=>c.code),Object.keys(table));
 for(const c of manifest.codes){
  assert.deepEqual(Object.keys(c),['code','level','means','fix']);
  assert.deepEqual({level:c.level,means:c.means,fix:c.fix},table[c.code],c.code);
  assert.ok(['error','warning'].includes(c.level));
  assert.ok(c.means.length>10&&c.fix.length>5,c.code);
 }
 assert.equal(table['self-doc:missing'].level,'error');assert.equal(table['self-doc:version'].level,'error');
 assert.equal(table.UNKNOWN_FACT.level,'warning');
});

// Code-shaped literals in these sources that are NOT diagnostics, each with where it lives.
const NOT_DIAGNOSTICS={
 NO_HEADER:'stampPlan reason',NOT_CONVERSATION:'stampPlan reason',STAMP_UNVERIFIED:'stampPlan reason',
 INVALID_HEADER_KEY:'serializeConversationHeader throw',
 SHARING_HOME:'sharing decision reason',SHARING_UNKNOWN:'sharing decision reason',SHARING_ALLOWED:'sharing decision reason',
 INVALID_SCHEMA:'sharing decision reason',DELIVERY_TARGET_REQUIRED:'sharing decision reason',INVALID_CONTEXT_DECISION:'sharing decision reason',
 INVALID_PROJECTION_TARGET:'sharing decision reason',GROUP_MISMATCH:'sharing decision reason',GROUP_UNRESOLVED:'sharing decision reason',
};
// Codes the `validate` command adds itself, beyond what the codec and reader emit.
const CLI_VALIDATE=['INVALID_ARGUMENTS'];
const sources=['lib/frontmatter/conversation.mjs','lib/freedom-conversations.mjs','lib/freedom-conversation-legacy.mjs'].map(f=>readFileSync(new URL(f,repo),'utf8'));

test('the table holds every code the codec and the reader can emit, and nothing they cannot',()=>{
 // Every quoted code-shaped literal in the codec, reader and legacy reader is a diagnostic code
 // unless it is named in NOT_DIAGNOSTICS; indirect forms (ternaries, tuples, helpers) are caught too.
 const emitted=new Set();
 for(const src of sources)for(const m of src.matchAll(/'([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|self-doc:[a-z]+)'/g))if(!Object.hasOwn(NOT_DIAGNOSTICS,m[1]))emitted.add(m[1]);
 for(const m of codec.matchAll(/\bcode:(SELF_DOC_[A-Z]+)/g))emitted.add(api[m[1]]);
 for(const code of CLI_VALIDATE)emitted.add(code);
 assert.deepEqual([...emitted].sort(),Object.keys(api.DIAGNOSTIC_CODES).sort());
 for(const code of Object.keys(NOT_DIAGNOSTICS))assert.ok(!Object.hasOwn(api.DIAGNOSTIC_CODES,code),code);
 // Emitting a code that is not in the table is a bug the codec and the reader refuse at runtime.
 assert.throws(()=>api.conversationDiagnostic('NOT_A_CODE',null,'x'),/NOT_A_CODE/);
 assert.throws(()=>api.diagnosticLevel('NOT_A_CODE'),/NOT_A_CODE/);
 for(const src of sources.slice(1))assert.doesNotMatch(src,/severity\s*=\s*'(?:error|warning)'/,'reader levels come from the table');
});

test('reader and legacy diagnostics, and everything validate reports, carry the table level',()=>{
 const f=fixture();test.after(()=>f.close());
 const run=args=>spawnSync(process.execPath,[cli,...args],{cwd:f.root,encoding:'utf8',env:{...process.env,FREEDOM_HOME:join(f.root,'state-home'),FREEDOM_WORKSPACE:''}});
 const odd=f.put(join(f.rel,'odd-call','transcript.md'),bytes(header({id:'odd-call'}),'\n# Another title\n\n## Now\n\n## Transcript\n\n## Log\n\n## Open questions\n\n## Extra\n'));
 const turns='\n## Now\n\n## Transcript\n\nloose words\n### t-000001\nnot metadata\n### t-000001\n<!-- turn {"speaker":"p-404","sources":[],"timing":null,"source_gap":null} -->\n\n## Log\n\n## Open questions\n';
 const canonical=f.put(join(f.rel,'turn-call','transcript.md'),bytes(header({id:'turn-call'}),turns));
 const flat=f.put(join(f.rel,'old-notes.md'),'---\ntitle: Old\ndate: 2026-02-30\nprivate: maybe\nstarted_at: noon\nsource: zoom\nrecording_id: \nweird line\n---\nWords.\n');
 const seen=[];
 for(const file of [odd,canonical,flat]){
  seen.push(...readConversation(file).diagnostics);
  const v=run(['validate',file,'--workspace',f.root,'--json']);seen.push(...JSON.parse(v.stdout).diagnostics);
 }
 for(const args of [['validate'],['validate',canonical,'--workspace',join(f.root,'no-such-dir'),'--json']]){
  const v=run(args.includes('--json')?args:[...args,'--json']);seen.push(...JSON.parse(v.stdout).diagnostics);
 }
 const codes=new Set(seen.map(d=>d.code));
 for(const code of ['TITLE_MISMATCH','CANONICAL_SECTIONS_INVALID','TURN_GRAMMAR_INVALID','TURN_METADATA_INVALID','TURN_ID_DUPLICATE','INVALID_DATE','INVALID_ARGUMENTS','READ_INCOMPLETE'])assert.ok(codes.has(code),code+' in '+[...codes]);
 for(const d of seen){
  assert.ok(Object.hasOwn(api.DIAGNOSTIC_CODES,d.code),'validate reported an unlisted code: '+d.code);
  assert.equal(d.severity,api.DIAGNOSTIC_CODES[d.code].level,d.code);
 }
});

test('emitted diagnostics carry the table level',()=>{
 const seen=[
  ...validateConversation((({standard,...rest})=>({...rest,schema_version:2,title:null}))(header())),
  ...validateConversation(header({standard:'https://hypercontext.wiki/standards/conversation/v9'})),
  ...parseConversationHeader(Buffer.from('---\nkind: nope\n---\n')).diagnostics,
 ];
 assert.ok(seen.length>=4);
 for(const d of seen)assert.equal(d.severity,api.DIAGNOSTIC_CODES[d.code]?.level,d.code);
});
