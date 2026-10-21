import * as core from '../../lib/freedom-workspace.mjs';
import {probe} from './native.mjs';
export const stateDir = (...args)=>probe(core.stateDir,args);
