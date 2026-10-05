// Synthetic records only. No workspace or runtime lookups.
export const sha = "a".repeat(64);
export const evidence = (patch = {}) => ({kind:"operator-decision",locator:"synthetic-choice",revision:null,note:"Explicit synthetic choice",...patch});
export const header = (patch = {}) => ({schema_version:1,kind:"conversation",id:"example-call",title:"Example call",description:null,read_when:[],date:null,start:null,as_of:"2026-10-03",audience:"freeda",keep:{scope:"home",group:null,decision:null},participants:[],sources:[],connections:[],aliases:[],review:{transcription:"unreviewed",attribution:"unreviewed",processing:"unprocessed",evidence:[]},body_format:"turns-v1",legacy:null,extensions:{},...patch});
export const emptyBody = "\n## Now\n\n## Transcript\n\n## Log\n\n## Open questions\n";
export const bytes = (h = header(),body = emptyBody) => Buffer.concat([Buffer.from("---\n"+Object.entries(h).map(([k,v])=>`${k}: ${JSON.stringify(v)}\n`).join("")+"---\n"),Buffer.isBuffer(body)?body:Buffer.from(body)]);
export const locator = (patch = {}) => ({kind:"service",path:null,url:null,service_id:"opaque-ID",media_type:null,sha256:null,bytes:null,checked_at:null,backup:{status:"unverified",locator:null,sha256:null,verified_at:null},...patch});
export const capture = (patch = {}) => ({id:"c-001",type:"cloud_recording",service:"zoom",recording_id:"opaque-ID",vendor_id:null,roles:["unknown"],locators:[locator()],availability:"remote-only",evidence:[],...patch});
export const participant = (patch = {}) => ({id:"p-001",label:"Speaker 1",person:null,status:"unknown",role:"speaker",evidence:[],...patch});
export const protectedTurn = (patch = {}) => ({turn_id:"t-000001",baseline_sha256:sha,reviewed_versions:[{turn_id:"t-000001",entry_revision:{kind:"sha256",value:sha},entry_path:"example-call/transcript.md",snapshot_sha256:sha,dimensions:["transcription"],evidence:[evidence()]}],authorized_changes:[],retired:false,...patch});

// Isolated synthetic workspace. Call close (or register with test.after) after use.
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {spawnSync,guard,rememberFixture,releaseFixture} from './native.mjs';
import {join,dirname} from 'node:path';
export const legacy = Buffer.from('---\ntitle: Old call\n---\n\n## Transcript\n\nExact old words.\n');
// Only owned temporary repositories call this; no global configuration or network.
export function git(root,...args) {
 const result=spawnSync('git',args,{cwd:root,encoding:'utf8',env:{...process.env,GIT_DIR:undefined,GIT_WORK_TREE:undefined,GIT_COMMON_DIR:undefined}});
 if(result.status!==0)throw new Error(`synthetic git ${args.join(' ')} failed: ${result.stderr}`);
 return result.stdout.trim();
}
export function fixture({mapped=false,tracked=false}={}) {
 guard();
 const root=realpathSync(mkdtempSync(join(tmpdir(),'conversation-reader-')));
 const rel=mapped?'records/calls':'meeting-transcripts';
 const put=(path,content)=>{const file=join(root,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,content);rememberFixture(file);return file;};
 put('.freedom.json',JSON.stringify({paths:{transcripts:rel}}));mkdirSync(join(root,rel),{recursive:true});
 if(tracked){git(root,'init','-q','-b','main');git(root,'add','--','.freedom.json');git(root,'commit','-q','-m','synthetic workspace','--','.freedom.json');}
 return {root,rel,put,entry:(id='example-call')=>join(root,rel,id,'transcript.md'),close:()=>{releaseFixture(root);rmSync(root,{recursive:true,force:true});}};
}
