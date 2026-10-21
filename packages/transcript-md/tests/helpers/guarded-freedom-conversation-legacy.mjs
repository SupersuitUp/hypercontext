import * as core from '../../lib/freedom-conversation-legacy.mjs';
import {probe} from './native.mjs';
export const legacySourceRefs = (...args)=>probe(core.legacySourceRefs,args);
export const normalizeLegacy = (...args)=>probe(core.normalizeLegacy,args);
