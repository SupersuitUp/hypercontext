import * as core from '../../lib/freedom-conversation-lock.mjs';
import {probe} from './native.mjs';
export const conversationLockContext = (...args)=>probe(core.conversationLockContext,args);
export const withConversationLock = (...args)=>probe(core.withConversationLock,args);
