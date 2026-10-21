import * as core from '../../lib/frontmatter/conversation.mjs';
import {probe} from './native.mjs';
export const parseConversationHeader = (...args)=>probe(core.parseConversationHeader,args);
export const serializeConversationHeader = (...args)=>probe(core.serializeConversationHeader,args);
export const validateConversation = (...args)=>probe(core.validateConversation,args);
export const stampStandard = (...args)=>probe(core.stampStandard,args);
