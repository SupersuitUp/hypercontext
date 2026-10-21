import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {existsSync,readFileSync,mkdtempSync,mkdirSync,symlinkSync,writeFileSync} from 'node:fs';
import {spawnSync,probe} from './helpers/native.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url));
const consumer=mkdtempSync(join(process.env.TRANSCRIPT_MD_OWNED,'boundary-'));
mkdirSync(join(consumer,'node_modules/@supersuit'),{recursive:true});symlinkSync(repo,join(consumer,'node_modules/@supersuit/transcript-md'));
const require=createRequire(join(consumer,'example.mjs'));
test('bare package import exposes reviewed codec reader writer and citation APIs',async()=>{
 const api=await import(require.resolve('@supersuit/transcript-md'));
 for(const name of ['parseConversationHeader','serializeConversationHeader','validateConversation','readConversation','listConversationDirectory','createConversation','annotateConversation','reviseConversation','recoverConversationRevision','citeConversation','resolveCitation','resolveConversationCitation'])assert.equal(typeof api[name],'function',name);
 for(const subpath of ['codec','reader','writer','citations','schema','python','cli'])assert.ok(existsSync(require.resolve('@supersuit/transcript-md/'+subpath)),subpath);
 assert.throws(()=>require.resolve('@supersuit/transcript-md/lib/freedom-workspace.mjs'),/not defined by "exports"/);
});
test('shipped CLI supports help and invalid argument exits without global discovery',()=>{
 const cli=join(repo,'lib/freedom-conversations-cli.mjs');
 const help=spawnSync(process.execPath,[cli,'--help'],{cwd:consumer,encoding:'utf8'});assert.equal(help.status,0,help.stderr);assert.match(help.stdout,/expected-sha/);
 const bad=spawnSync(process.execPath,[cli,'list','--unknown','--json'],{cwd:consumer,encoding:'utf8'});assert.equal(bad.status,2);assert.equal(JSON.parse(bad.stdout).diagnostics[0].code,'INVALID_ARGUMENTS');
});
test('Python asset discovers its adjacent CLI and ignores global Freedom selection',()=>{
 const asset=join(repo,'lib/freedom_conversations.py');
 const code="import importlib.util,sys,json; s=importlib.util.spec_from_file_location('freedom_conversations',sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.list_records(workspace=sys.argv[2])))";
 const root=join(consumer,'records');mkdirSync(root);mkdirSync(join(root,'meeting-transcripts'));
 const got=spawnSync(process.env.PYTHON,['-B','-I','-S','-c',code,asset,root],{cwd:consumer,encoding:'utf8',env:{...process.env,FREEDOM_CONVERSATIONS_CLI:'/nonexistent/global-cli',FREEDOM_WORKSPACE:'/nonexistent/global-root'}});assert.equal(got.status,0,got.stderr);assert.deepEqual(JSON.parse(got.stdout),[]);
});
test('caller roots have no HOME or inherited workspace fallback',async()=>{
 const {listConversations}=await import(require.resolve('@supersuit/transcript-md'));
 assert.throws(()=>probe(listConversations,[]),/explicit workspace root/);
 const root=join(consumer,'explicit');mkdirSync(root);mkdirSync(join(root,'meeting-transcripts'));assert.deepEqual(probe(listConversations,[root]).records,[]);
});

test('new participant self references retain the source legacy USER.md filename',async()=>{
 const {createConversation}=await import(require.resolve('@supersuit/transcript-md'));
 const {header,emptyBody,evidence}=await import('./helpers/conversation-fixture.mjs');
 const root=join(consumer,'legacy-self');mkdirSync(join(root,'user'),{recursive:true});writeFileSync(join(root,'user/USER.md'),'Synthetic profile.\n');
 const h=header({participants:[{id:'p-001',label:'Speaker',person:'self',status:'confirmed',role:'speaker',evidence:[evidence()]}]});
 const result=probe(createConversation,[{root,spec:{header:h,body:emptyBody,assets:[],annotations:null},pid:process.pid,by:'package-test'}]);assert.ok(existsSync(result.path));
});
