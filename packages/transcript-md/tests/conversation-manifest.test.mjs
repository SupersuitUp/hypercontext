// The shipped standard manifest (standards/conversation/v1.json) must say exactly what the
// codec enforces: its standard is STANDARD, its codes are the code table, and the table holds
// every code validateConversation and parseConversationHeader can emit. Synthetic data only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import * as api from '../index.mjs';
import {header} from './helpers/conversation-fixture.mjs';
import {validateConversation,parseConversationHeader} from './helpers/guarded-frontmatter-conversation.mjs';

const repo=new URL('../',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('standards/conversation/v1.json',repo),'utf8'));
const codec=readFileSync(new URL('lib/frontmatter/conversation.mjs',repo),'utf8');

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

test('the table holds every code the header codec can emit, and nothing it cannot',()=>{
 // Every code reaches a diagnostic through one of these call shapes in the codec source.
 const emitted=new Set();
 for(const m of codec.matchAll(/\b(?:add|refuse|fail|diagnostic)\(\s*'([A-Za-z0-9_:-]+)'/g))emitted.add(m[1]);
 for(const m of codec.matchAll(/return '([A-Z0-9_]+)'/g))emitted.add(m[1]);
 for(const m of codec.matchAll(/\bcode:(SELF_DOC_[A-Z]+)/g))emitted.add(api[m[1]]);
 assert.deepEqual([...emitted].sort(),Object.keys(api.DIAGNOSTIC_CODES).sort());
 // Emitting a code that is not in the table is a bug the codec refuses at runtime.
 assert.throws(()=>api.conversationDiagnostic('NOT_A_CODE',null,'x'),/NOT_A_CODE/);
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
