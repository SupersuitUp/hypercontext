// Existing self reference only; no profile/global workspace discovery.
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {paths} from './freedom-workspace.mjs';
export function workspaceFile(root,key){if(key!=='self.md')throw Error('Unsupported self reference');const p=paths(root),fresh=join(p.self,'self.md'),legacy=join(p.user,'USER.md');return existsSync(fresh)?fresh:existsSync(legacy)?legacy:fresh;}
