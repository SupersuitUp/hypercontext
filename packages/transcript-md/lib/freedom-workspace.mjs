// Portable boundary: explicit caller roots and local markers only. No environment/home discovery.
import {existsSync,readFileSync,realpathSync,lstatSync} from 'node:fs';
import {resolve,join,dirname,isAbsolute} from 'node:path';
const required=root=>{if(typeof root!=='string'||!root)throw Object.assign(Error('explicit workspace root required'),{code:'WORKSPACE_REQUIRED'});return realpathSync(resolve(root));};
export function resolveTrackedRoot(root){return required(root);}
export function enclosingWorkspace(start){let dir=resolve(start);for(;;){if(existsSync(join(dir,'.freedom.json')))return required(dir);const parent=dirname(dir);if(parent===dir)return null;dir=parent;}}
export function paths(root){
 root=required(root);const config=join(root,'.freedom.json');let cfg={};
 if(existsSync(config)){cfg=JSON.parse(readFileSync(config,'utf8'));if(!cfg||typeof cfg!=='object'||Array.isArray(cfg)||cfg.paths!==undefined&&(!cfg.paths||typeof cfg.paths!=='object'||Array.isArray(cfg.paths)))throw Error('Invalid caller root configuration');}
 const defaults={transcripts:'meeting-transcripts',state:'.agents/state',people:'people',self:'self',user:'user'};
 const out={root};for(const [key,fallback]of Object.entries(defaults)){const value=cfg.paths?.[key]??fallback;if(typeof value!=='string'||!value||value.startsWith('~'))throw Error('Caller paths must be explicit paths');out[key]=resolve(root,value);}
 // Relative state is shared by linked Git worktrees, matching the common-repository capture lock.
 const dotgit=join(root,'.git');if(existsSync(dotgit)&&lstatSync(dotgit).isFile()){
  const match=/^gitdir:\s*(.+)$/m.exec(readFileSync(dotgit,'utf8'));
  if(match){const gitdir=resolve(root,match[1]),common=join(gitdir,'commondir');if(existsSync(common)){const main=dirname(realpathSync(resolve(gitdir,readFileSync(common,'utf8').trim())));const value=cfg.paths?.state??defaults.state;if(!isAbsolute(value))out.state=resolve(main,value);}}
 }
 return out;
}
export function stateDir(skill,root){if(typeof skill!=='string'||!skill||/[/\\]/.test(skill)||skill==='.'||skill==='..')throw Error('stateDir needs a bare skill name');return join(paths(root).state,skill);}
