// Only existing caller-owned person references; no person discovery or operational processing.
import {statSync} from 'node:fs';
import {join,resolve as resolvePath,sep} from 'node:path';
import {paths} from './freedom-workspace.mjs';
export function peopleDir(root){return paths(root).people;}
const isFile=p=>{try{return statSync(p).isFile();}catch{return false;}};
export function safeSlug(dir,slug){if(typeof slug!=='string'||!slug||slug.startsWith('/')||/[\\\0]/.test(slug))return false;if(slug.split('/').some(seg=>seg===''||seg.startsWith('.')))return false;const root=resolvePath(dir);return resolvePath(root,slug).startsWith(root+sep);}
export function recordPath(dir,slug){if(!safeSlug(dir,slug))return null;for(const c of [join(dir,slug,'friend.md'),join(dir,`${slug}.md`),join(dir,'archive',slug,'friend.md'),join(dir,'archive',`${slug}.md`)])if(isFile(c))return c;return null;}
