import * as core from '../../lib/freedom-conversation-citations.mjs';
import {probe} from './native.mjs';
export const citeConversation = (...args)=>probe(core.citeConversation,args);
export const resolveCitation = (...args)=>probe(core.resolveCitation,args);
export const seekConversation = (...args)=>probe(core.seekConversation,args);
