// Immutable selection and explicit timing only. No repository discovery, media IO or clock guessing.
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {parseConversation} from './freedom-conversations.mjs';
import {parseConversationInstant,conversationCaptureOffsetMs} from './freedom-conversation-time.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const nonempty=value=>typeof value==='string'&&!!value.trim();
const turnIds=ids=>Array.isArray(ids)&&ids.length>0&&ids.every(id=>typeof id==='string'&&/^t-\d{6,}$/.test(id));
const revisionValid=(r,repository)=>r&&Object.keys(r).sort().join(',')==='kind,value'&&(r.kind==='sha256'&&sha(r.value)||r.kind==='git'&&nonempty(repository)&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(r.value));
const diagnostic=code=>({code,severity:'error',path:null,field:null,message:'Citation or timing could not be resolved from the supplied version and explicit mapping.'});
const refuse=code=>{throw Object.assign(new Error('Conversation citation could not be created.'),{code});};
const blocked=record=>!record?.header||record.diagnostics.some(d=>d.severity==='error');
const selectedTurns=(record,ids)=>ids.map(id=>record.turns.find(t=>t.id===id));

export function citeConversation(record,{turnIds:ids,repository=null,revision={kind:'sha256',value:record.fileSha256}}={}) {
 if(blocked(record)||record.header.body_format!=='turns-v1')refuse('CITATION_RECORD_INVALID');
 if(!turnIds(ids))refuse('CITATION_SELECTOR_INVALID');
 if(repository!==null&&!nonempty(repository)||!revisionValid(revision,repository))refuse('CITATION_REVISION_INVALID');
 if(revision.kind==='sha256'&&revision.value!==record.fileSha256)refuse('CITATION_REVISION_MISMATCH');
 const turns=selectedTurns(record,ids);if(turns.some(t=>!t))refuse('NOT_FOUND');
 return {repository,path:record.file,record_id:record.id,revision:{...revision},selector:{kind:'turn',ids:[...ids],text_sha256:hash(Buffer.concat(turns.map(t=>t.text)))},sources:structuredClone(turns.flatMap(t=>t.sources))};
}

export function resolveCitation(citation,{readVersion}={}) {
 const fail=code=>({text:Buffer.alloc(0),diagnostics:[diagnostic(code)]});
 if(!citation||!nonempty(citation.path)||!nonempty(citation.record_id)||(citation.repository!==null&&!nonempty(citation.repository))||!revisionValid(citation.revision,citation.repository)||!sha(citation.selector?.text_sha256)||!Array.isArray(citation.sources))return fail('CITATION_INVALID');
 let bytes;
 try {bytes=readVersion(citation.repository,citation.path,citation.revision);}catch{return fail('CITATION_VERSION_UNAVAILABLE');}
 if(!Buffer.isBuffer(bytes))return fail('CITATION_VERSION_UNAVAILABLE');
 // A Git readVersion implementation must read this exact repository/path/commit, never HEAD.
 if(citation.revision.kind==='sha256'&&hash(bytes)!==citation.revision.value)return fail('CITATION_REVISION_MISMATCH');
 try {new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return fail('INVALID_UTF8');}
 const selector=citation.selector;let text;
 if(selector.kind==='lines') {
  if(!Number.isSafeInteger(selector.start)||!Number.isSafeInteger(selector.end)||selector.start<1||selector.end<selector.start)return fail('CITATION_SELECTOR_INVALID');
  const starts=[0];for(let i=0;i<bytes.length;i++)if(bytes[i]===10&&i+1<bytes.length)starts.push(i+1);
  if(!bytes.length||selector.end>starts.length)return fail('CITATION_SELECTOR_INVALID');
  text=bytes.subarray(starts[selector.start-1],starts[selector.end]??bytes.length);
 }else if(selector.kind==='turn') {
  if(!turnIds(selector.ids))return fail('CITATION_SELECTOR_INVALID');
  const record=parseConversation(bytes,{file:citation.path});
  if(blocked(record)||record.header.body_format!=='turns-v1')return fail('CITATION_RECORD_INVALID');
  if(record.id!==citation.record_id)return fail('CITATION_RECORD_MISMATCH');
  const turns=selectedTurns(record,selector.ids);if(turns.some(t=>!t))return fail('NOT_FOUND');
  if(!isDeepStrictEqual(citation.sources,turns.flatMap(t=>t.sources)))return fail('CITATION_SOURCES_MISMATCH');
  text=Buffer.concat(turns.map(t=>t.text));
 }else return fail('CITATION_SELECTOR_INVALID');
 if(hash(text)!==selector.text_sha256)return fail('CITATION_TEXT_MISMATCH');
 return {text,diagnostics:[]};
}

// A selected locator supplies a path; an unknown locator never silently picks the first asset.
function candidatePaths(record,turn,captureId) {
 const capture=record.header.sources.find(c=>c.id===captureId);
 const refs=turn.sources.filter(s=>s.capture===captureId);
 const paths=refs.map(ref=>{
  const locator=ref.locator===null?null:capture.locators[ref.locator];
  return locator?.kind==='bundled'?resolve(record.file,'..',locator.path):locator?.path??null;
 });
 return [...new Set(paths.length?paths:[null])];
}
export function seekConversation(record,{turnId,captureId}={}) {
 const fail=code=>({candidates:[],gaps:[diagnostic(code)]});
 if(blocked(record))return fail('CONVERSATION_INVALID');
 const turn=record.turns.find(t=>t.id===turnId);if(!turn)return fail('NOT_FOUND');
 const t=turn.timing;if(t===null)return fail('TIMING_UNRESOLVED');
 let spans=[];
 if(t.basis==='capture')spans=[{capture:t.capture,offset_ms:t.start_ms,end_ms:t.end_ms}];
 if(t.basis==='conversation')spans=t.mapping.filter(m=>t.start_ms>=m.conversation_start_ms&&t.start_ms<m.conversation_end_ms).map(m=>({capture:m.capture,offset_ms:m.capture_start_ms+(t.start_ms-m.conversation_start_ms),end_ms:t.end_ms===null?null:m.capture_start_ms+(Math.min(t.end_ms,m.conversation_end_ms)-m.conversation_start_ms),partial:t.end_ms!==null&&t.end_ms>m.conversation_end_ms}));
 if(t.basis==='wall-clock') {
  const start=parseConversationInstant(t.start),end=parseConversationInstant(t.end);
  spans=t.mapping.flatMap(m=>{
   const anchor=parseConversationInstant(m.wall_start),offset=conversationCaptureOffsetMs(start,anchor,m.capture_start_ms);
   if(offset.negative)return [];
   return [{capture:m.capture,offset_ms:offset.value,end_ms:end===null?null:conversationCaptureOffsetMs(end,anchor,m.capture_start_ms).value}];
  });
 }
 if(captureId!==undefined)spans=spans.filter(s=>s.capture===captureId);
 const candidates=spans.flatMap(span=>candidatePaths(record,turn,span.capture).map(path=>({capture:span.capture,path,offset_ms:span.offset_ms,end_ms:span.end_ms})));
 const gaps=[];
 if(!candidates.length)gaps.push(diagnostic('TIMING_GAP'));
 if(candidates.length>1)gaps.push(diagnostic(captureId===undefined?'CAPTURE_SELECTION_REQUIRED':'TIMING_MAPPING_AMBIGUOUS'));
 if(spans.some(s=>s.partial))gaps.push(diagnostic('TIMING_PARTIAL_COVERAGE'));
 return {candidates,gaps};
}
