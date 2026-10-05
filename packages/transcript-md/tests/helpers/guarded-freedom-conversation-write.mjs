import * as core from '../../lib/freedom-conversation-write.mjs';
import {probe} from './native.mjs';
export const annotateConversation = (...args)=>probe(core.annotateConversation,args);
export const assertConversationProjection = (...args)=>probe(core.assertConversationProjection,args);
export const createConversation = (...args)=>probe(core.createConversation,args);
export const recoverConversationRevision = (...args)=>probe(core.recoverConversationRevision,args);
export const reviseConversation = (...args)=>probe(core.reviseConversation,args);
