// Version-1 conversation headers only. This module performs no workspace or network IO.
// Structural rules come from the exported schema; semantic rules below need multiple fields.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
export const conversationSchema = freeze(JSON.parse(readFileSync(new URL('./conversation.schema.json', import.meta.url), 'utf8')));
const keywords = new Set(['type','enum','const','required','properties','additionalProperties','items','oneOf','anyOf','pattern','minLength','minimum']);
function checkSchema(schema) {
  for (const key of Object.keys(schema)) if (!keywords.has(key)) throw new Error(`unsupported conversation schema keyword: ${key}`);
  for (const child of Object.values(schema.properties ?? {})) checkSchema(child);
  if (schema.items) checkSchema(schema.items);
  for (const key of ['oneOf','anyOf']) for (const child of schema[key] ?? []) checkSchema(child);
}
checkSchema(conversationSchema);
/** The page that defines this format. Every transcript.md names it in its `standard` key. */
export const STANDARD='https://hypercontext.wiki/standards/conversation';
/** Error-level, so checkers count it; it never stops a read, because records predate the rule. */
export const SELF_DOC_MISSING='self-doc:missing';
/** Error diagnostics that stop interpretation: every error except a missing standard. */
export const blockingDiagnostics=diagnostics=>(Array.isArray(diagnostics)?diagnostics:[]).filter(d=>d?.severity==='error'&&d.code!==SELF_DOC_MISSING);
const diagnostic = (code,field,message,severity='error') => ({code,severity,path:null,field,message});
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const protoKeys = new Set(['__proto__','prototype','constructor']);
function jsonProblem(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? null : 'NON_JSON_VALUE';
  if (typeof value !== 'object') return 'NON_JSON_VALUE';
  if (ancestors.has(value)) return 'NON_JSON_VALUE';
  if (!Array.isArray(value) && ![Object.prototype,null].includes(Object.getPrototypeOf(value))) return 'NON_JSON_VALUE';
  if (Array.isArray(value) && (Object.keys(value).length !== value.length || Object.keys(value).some((k,i)=>k!==String(i)))) return 'NON_JSON_VALUE';
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') return 'NON_JSON_VALUE';
    if (protoKeys.has(key)) return 'PROTOTYPE_KEY';
    const descriptor = Object.getOwnPropertyDescriptor(value,key);
    if (!('value' in descriptor)) return 'NON_JSON_VALUE';
    if (!descriptor.enumerable && !(Array.isArray(value) && key === 'length')) return 'NON_JSON_VALUE';
    const problem = jsonProblem(descriptor.value,ancestors); if (problem) return problem;
  }
  ancestors.delete(value); return null;
}
const decoder = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
// JSON.parse accepts duplicate object keys. Scan valid JSON so none are overwritten.
function duplicateJsonKeys(raw) {
  let cursor=0, duplicate=false;
  const space=()=>{while(cursor<raw.length&&/\s/.test(raw[cursor]))cursor++;};
  const string=()=>{
    const start=cursor++;
    while(cursor<raw.length) { const ch=raw[cursor++];if(ch==='\\')cursor++;else if(ch==='"')break; }
    return JSON.parse(raw.slice(start,cursor));
  };
  const value=()=>{
    space();const ch=raw[cursor];
    if(ch==='"') { string();return; }
    if(ch==='{'||ch==='[') {
      const map=ch==='{',end=map?'}':']',keys=new Set();cursor++;space();
      while(raw[cursor]!==end) {
        if(map) { const key=string();if(keys.has(key))duplicate=true;keys.add(key);space();cursor++; }
        value();space();if(raw[cursor]===',') { cursor++;space(); }else break;
      }
      cursor++;return;
    }
    while(cursor<raw.length&&!/[\s,\]}]/.test(raw[cursor]))cursor++;
  };
  value();return duplicate;
}
/** On refusal, original bytes remain the body and no partial header is returned. */
export function parseConversationHeader(bytes) {
  if (!Buffer.isBuffer(bytes)) throw new TypeError('conversation input must be a Buffer');
  const refuse = code => ({header:null,body:bytes,rawHeader:null,diagnostics:[diagnostic(code,null,'Conversation header cannot be interpreted safely.')]});
  let text; try { text=decoder.decode(bytes); } catch { return refuse('INVALID_UTF8'); }
  const offset=bytes.subarray(0,3).equals(Buffer.from([0xef,0xbb,0xbf])) ? 3 : 0;
  const open = /^(?:\uFEFF)?---(\r?\n)/.exec(text);
  if (!open) return /^(?:\uFEFF)?---/.test(text) ? refuse('MALFORMED_DELIMITER') : {header:null,body:bytes,rawHeader:null,diagnostics:[]};
  const start=offset+3+Buffer.byteLength(open[1]);
  let cursor=start, closing=null;
  while(cursor<bytes.length) {
    const lf=bytes.indexOf(10,cursor), end=lf<0?bytes.length:lf;
    const line=bytes.subarray(cursor,end).toString('utf8');
    if (line==='---'||line==='---\r') { closing={start:cursor,end:lf<0?end:end+1}; break; }
    cursor=lf<0?bytes.length:lf+1;
  }
  if (!closing) return refuse('MALFORMED_DELIMITER');
  const rawHeader=bytes.subarray(start,closing.start), header={};
  const lines=rawHeader.toString('utf8').split(/\r?\n/); if(lines.at(-1)==='')lines.pop();
  for(const line of lines) {
    const match=/^([a-z][a-z0-9_]*): (.*)$/.exec(line); if(!match)return refuse('INVALID_HEADER_LINE');
    const [,key,raw]=match;
    if(protoKeys.has(key))return refuse('PROTOTYPE_KEY');
    if(Object.hasOwn(header,key))return refuse('DUPLICATE_KEY');
    let value;try { value=JSON.parse(raw); } catch { return refuse('INVALID_JSON_VALUE'); }
    if(duplicateJsonKeys(raw))return refuse('DUPLICATE_KEY');
    const problem=jsonProblem(value);if(problem)return refuse(problem);
    header[key]=value;
  }
  return {header,body:bytes.subarray(closing.end),rawHeader,diagnostics:validateConversation(header)};
}
/** Canonical LF header; the body is concatenated without decoding or normalization. */
export function serializeConversationHeader(header,body) {
  if(!object(header)||!Buffer.isBuffer(body))throw new TypeError('header must be an object and body a Buffer');
  const problem=jsonProblem(header);if(problem)throw new Error(problem);
  const lines=Object.entries(header).map(([key,value])=>{
    if(!/^[a-z][a-z0-9_]*$/.test(key))throw new Error('INVALID_HEADER_KEY');
    return `${key}: ${JSON.stringify(value)}\n`;
  });
  return Buffer.concat([Buffer.from(`---\n${lines.join('')}---\n`),body]);
}
const matchesType=(type,value)=>!type || (type==='null'?value===null:type==='object'?object(value):type==='array'?Array.isArray(value):type==='integer'?Number.isInteger(value):type==='number'?typeof value==='number'&&Number.isFinite(value):typeof value===type);
function schemaErrors(schema,value,field='') {
  const out=[]; const fail=(code='SCHEMA_INVALID')=>out.push(diagnostic(code,field||null,'Value does not satisfy the conversation schema.'));
  const type=schema.type;
  if(!matchesType(type,value)) { fail();return out; }
  if(schema.enum&&!schema.enum.some(v=>Object.is(v,value)))fail();
  if(Object.hasOwn(schema,'const')&&!Object.is(schema.const,value))fail();
  if(typeof value==='string') {
    if(schema.pattern&&!new RegExp(schema.pattern).test(value))fail();
    if(schema.minLength!==undefined&&[...value].length<schema.minLength)fail();
  }
  if(typeof value==='number'&&schema.minimum!==undefined&&value<schema.minimum)fail();
  if(object(value)) {
    for(const key of schema.required??[])if(!Object.hasOwn(value,key))out.push(diagnostic('REQUIRED_FIELD',field?`${field}.${key}`:key,'Required conversation field is missing.'));
    for(const [key,child] of Object.entries(value)) {
      const path=field?`${field}.${key}`:key;
      if(schema.properties?.[key])out.push(...schemaErrors(schema.properties[key],child,path));
      else if(schema.additionalProperties===false)out.push(diagnostic('UNKNOWN_KEY',path,'Unknown conversation field.'));
    }
  }
  if(Array.isArray(value)&&schema.items)value.forEach((child,i)=>out.push(...schemaErrors(schema.items,child,`${field}[${i}]`)));
  for(const union of ['oneOf','anyOf'])if(schema[union]) {
    const branches=schema[union].map(child=>({schema:child,errors:schemaErrors(child,value,field)}));
    const passing=branches.filter(child=>child.errors.length===0).length;
    if(union==='oneOf'?passing!==1:passing===0) {
      const applicable=branches.filter(child=>matchesType(child.schema.type,value));
      const best=(applicable.length?applicable:branches).sort((a,b)=>a.errors.length-b.errors.length)[0];
      if(passing===0&&best.errors.length)out.push(...best.errors);else fail();
    }
  }
  return out;
}
const validDay = s => {
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const [y,m,d]=s.split('-').map(Number);
  const leap=y%4===0&&(y%100!==0||y%400===0);
  return m>=1&&m<=12&&d>=1&&d<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
};
const validInstant=s=>{
  if(typeof s!=='string')return false;
  const m=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(s);
  return Boolean(m&&validDay(m[1])&&+m[2]<24&&+m[3]<60&&+m[4]<60&&(!m[7]||(+m[7]<24&&+m[8]<60))&&Number.isFinite(Date.parse(s)));
};
const repoPath=s=>typeof s==='string'&&s.length>0&&!/^[\\/~]|^[a-zA-Z]:|[\\\x00-\x1f\x7f]/.test(s)&&s.split('/').every(p=>p&&p!=='.'&&p!=='..');
const validId=s=>typeof s==='string'&&s.length>0&&s===s.normalize('NFC')&&!/[\/\\\p{Cc}]|[ .]$/u.test(s)&&s!=='.'&&s!=='..';
const decisions=entries=>Array.isArray(entries)&&entries.some(e=>e.kind==='operator-decision');
/** Pure structural/context checks. Person/group existence and mutation history belong to doors. */
export function validateConversation(header,context={}) {
  const problem=jsonProblem(header);if(problem)return [diagnostic(problem,null,'Conversation metadata is not safe JSON.')];
  const out=schemaErrors(conversationSchema,header);
  const add=(code,field,message,severity)=>out.push(diagnostic(code,field,message,severity));
  if(!object(header))return out;
  if(header.standard!==STANDARD)add(SELF_DOC_MISSING,'standard',`Record does not name its standard, ${STANDARD}.`,'error');
  if(header.schema_version!==1)add('UNSUPPORTED_SCHEMA_VERSION','schema_version','Unsupported conversation schema version.');
  if(typeof header.id==='string'&&!validId(header.id))add('INVALID_RECORD_ID','id','Record id is not a portable directory component.');
  if(context.folderId!==undefined&&header.id!==context.folderId)add('ID_FOLDER_MISMATCH','id','Record id must match its parent folder.');
  if(context.newRecord&&typeof header.id==='string'&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(header.id))add('INVALID_NEW_ID','id','New record ids must be lowercase kebab case.');
  if(context.newRecord&&header.audience===null)add('AUDIENCE_REQUIRED','audience','New conversations require an intended reader.');
  // Shape failures are already classified; never inspect malformed nested structures.
  if(out.some(d=>d.code==='SCHEMA_INVALID'||d.code==='REQUIRED_FIELD'||d.code==='UNKNOWN_KEY'))return out;
  for(const field of ['title','description','date','start','as_of','audience'])if(header[field]===null)add('UNKNOWN_FACT',field,'Conversation fact is unknown.','warning');
  for(const field of ['date','as_of'])if(header[field]!=null&&!validDay(header[field]))add('INVALID_DATE',field,'Expected a valid calendar day.');
  // Check semantic date/instant/path rules everywhere their typed field occurs.
  const walk=(value,field='')=>{
    // These complete containers are opaque, even when a retained key names a core field.
    // Reserved conversation_revision structure was validated above; its semantics stay below.
    if(field==='extensions'||field==='legacy.fields')return;
    if(Array.isArray(value)) { value.forEach((v,i)=>walk(v,`${field}[${i}]`));return; }
    if(!object(value))return;
    for(const [k,v] of Object.entries(value)) {
      const p=field?`${field}.${k}`:k;
      if(v!=null&&['instant','checked_at','verified_at'].includes(k))if(!validInstant(v))add('INVALID_INSTANT',p,'Expected an RFC 3339 instant with seconds and timezone offset.');
      walk(v,p);
    }
  };walk(header);
  if(object(header.start)) {
    const s=header.start;
    if(s.local!==null&&s.timezone===null&&s.instant===null)add('UNKNOWN_FACT','start.timezone','Local start has no zone or instant; cross-zone arithmetic is unavailable.','warning');
    if(s.local===null&&s.instant===null)add('START_REQUIRED','start','Start requires a local time or an instant.');
    if(s.local!=null&&!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s.local))add('INVALID_LOCAL_TIME','start.local','Expected a real local clock time.');
    let formatter=null;
    if(s.timezone!=null)try {
      // Recent ICU also accepts numeric offsets, which are not IANA identifiers.
      if(!/^[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)*$/.test(s.timezone))throw new Error('not an IANA identifier');
      formatter=new Intl.DateTimeFormat('en-CA',{timeZone:s.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    }catch{add('INVALID_TIMEZONE','start.timezone','Expected a validated IANA timezone.');}
    if(s.local!=null&&s.precision==='second'&&s.local.length!==8)add('START_PRECISION_MISMATCH','start.precision','Second precision requires local seconds.');
    if(formatter&&validDay(header.date)&&validInstant(s.instant)&&typeof s.local==='string') {
      const parts=Object.fromEntries(formatter.formatToParts(new Date(s.instant)).map(p=>[p.type,p.value]));
      const date=`${parts.year}-${parts.month}-${parts.day}`,local=`${parts.hour}:${parts.minute}:${parts.second}`;
      if(date!==header.date||local.slice(0,s.local.length)!==s.local)add('START_CONTRADICTION','start','Known date, local time, zone and instant disagree.');
    }
  }
  if(object(header.keep)) {
    const k=header.keep;
    if(k.scope==='unknown')add('UNKNOWN_FACT','keep.scope','Sharing boundary is unknown; effective boundary is private.','warning');
    if(k.group!=null&&!repoPath(k.group))add('INVALID_GROUP_PATH','keep.group','Group reference must be workspace relative.');
    if(k.scope==='family'&&k.group===null)add('FAMILY_GROUP_REQUIRED','keep.group','Family sharing requires a permitted group.');
    if(k.scope==='family'&&k.decision?.kind!=='operator-decision')add('FAMILY_DECISION_REQUIRED','keep.decision','Family sharing requires an explicit group decision.');
    if(k.scope==='share'&&k.decision?.kind!=='operator-decision')add('SHARE_DECISION_REQUIRED','keep.decision','Sharing requires an explicit operator choice.');
  }
  const unique=(entries,key,field)=>{
    const seen=new Set();for(const [i,item] of (Array.isArray(entries)?entries:[]).entries()) {
      const value=typeof item==='string'?item:item?.[key];
      if(seen.has(value))add('DUPLICATE_ID',`${field}[${i}]`,'Identifiers must be unique.');seen.add(value);
    }
  };
  unique(header.participants,'id','participants');unique(header.sources,'id','sources');
  for(const [i,p] of (Array.isArray(header.participants)?header.participants:[]).entries())if(object(p)) {
    const f=`participants[${i}]`;
    if(p.role==='unknown')add('UNKNOWN_FACT',`${f}.role`,'Participant role is unknown.','warning');
    if(p.status==='unknown'&&p.person!==null)add('UNKNOWN_PERSON_REQUIRED',`${f}.person`,'Unknown identity must remain null.');
    if(p.person===null)add('UNKNOWN_FACT',`${f}.person`,'Participant identity is unknown.','warning');
    if(p.status==='confirmed'&&(p.person===null||!Array.isArray(p.evidence)||p.evidence.length===0))add('CONFIRMED_IDENTITY_EVIDENCE_REQUIRED',f,'Confirmed identity requires identifying evidence.');
  }
  for(const [i,c] of (Array.isArray(header.sources)?header.sources:[]).entries())if(object(c)) {
    const f=`sources[${i}]`;
    if(c.type===null)add('UNKNOWN_FACT',`${f}.type`,'Capture type is unknown.','warning');
    if(c.availability==='unknown')add('UNKNOWN_FACT',`${f}.availability`,'Capture availability is unknown.','warning');
    if(c.roles.includes('unknown'))add('UNKNOWN_FACT',`${f}.roles`,'Source coverage role is unknown.','warning');
    if(c.type==='cloud_recording') {
      if(c.service==null||c.recording_id==null||c.vendor_id!==null)add('CLOUD_IDENTITY_INVALID',f,'Cloud recordings require exact service and recording id with no vendor id.');
      for(const [j,l] of (Array.isArray(c.locators)?c.locators:[]).entries())if(l?.kind==='service'&&l.service_id!==c.recording_id)add('SOURCE_ID_CONFLICT',`${f}.locators[${j}].service_id`,'Service locator identity must match the cloud recording.');
    } else if(c.service!==null||c.recording_id!==null)add('NONCLOUD_IDENTITY_INVALID',f,'Noncloud captures have null cloud identity fields.');
    if(Array.isArray(c.roles)&&(c.roles.length===0||new Set(c.roles).size!==c.roles.length))add('CAPTURE_ROLES_INVALID',`${f}.roles`,'Capture roles are a nonempty subset.');
    for(const [j,l] of (Array.isArray(c.locators)?c.locators:[]).entries())if(object(l)) {
      const p=`${f}.locators[${j}]`;
      if(l.kind==='service'?(l.path!==null||(!l.url&&!l.service_id)):(l.path===null||l.url!==null||l.service_id!==null))add('LOCATOR_IDENTITY_INVALID',p,'Locator requires only its applicable identifiers.');
      if(l.kind==='bundled'&&!repoPath(l.path))add('INVALID_BUNDLED_PATH',`${p}.path`,'Bundled path must be relative without traversal.');
      if(l.media_type!=null&&!/^[^\s/]+\/[^\s/]+$/.test(l.media_type))add('INVALID_MEDIA_TYPE',`${p}.media_type`,'Expected a MIME type.');
      const b=l.backup;
      if(object(b)&&b.status==='unverified'&&[b.locator,b.sha256,b.verified_at].some(v=>v!==null))add('BACKUP_UNVERIFIED_FIELDS',`${p}.backup`,'Unverified backup cannot claim verification fields.');
      if(object(b)&&b.status==='verified-owned'&&(!b.locator||!b.sha256||!b.verified_at||b.sha256!==l.sha256||[l.path,l.url,l.service_id].includes(b.locator)))add('BACKUP_VERIFICATION_REQUIRED',`${p}.backup`,'Owned backup requires a distinct locator, matching readable checksum and verification instant.');
    }
  }
  for(const [i,a] of (Array.isArray(header.aliases)?header.aliases:[]).entries())if(object(a)) {
    if(a.kind==='source-id'?!a.namespace:a.namespace!==null)add('ALIAS_NAMESPACE_INVALID',`aliases[${i}].namespace`,'Only source aliases require an identity namespace.');
    if(a.kind==='record-id'&&!validId(a.value))add('INVALID_RECORD_ID',`aliases[${i}].value`,'Record alias must be a portable id.');
  }
  const checkCitation=(c,f)=>{
    if(!object(c))return;
    if(!repoPath(c.path)||!validId(c.record_id))add('CITATION_PATH_INVALID',f,'Citation requires a relative path and portable record id.');
    if(c.revision?.kind==='git'&&!c.repository)add('CITATION_REPOSITORY_REQUIRED',f,'Git citations require repository identity.');
    if(c.selector?.kind==='lines'&&c.selector.end<c.selector.start)add('CITATION_RANGE_INVALID',f,'Citation end must not precede its start.');
    if(c.selector?.kind==='turn'&&(!c.selector.ids?.length||new Set(c.selector.ids).size!==c.selector.ids.length))add('CITATION_TURNS_INVALID',f,'Turn citation needs distinct turn ids.');
    for(const s of Array.isArray(c.sources)?c.sources:[]) {
      // Historical citations refer to a different revision; do not resolve against live captures.
      if(s.end_ms!=null&&(s.start_ms==null||s.end_ms<s.start_ms))add('SOURCE_RANGE_INVALID',f,'Capture span end requires an ordered start.');
    }
  };
  for(const [i,c] of (Array.isArray(header.connections)?header.connections:[]).entries())if(object(c)) {
    if(c.target?.kind==='path'&&!repoPath(c.target.id))add('CONNECTION_PATH_INVALID',`connections[${i}].target`,'Path connection must be relative.');
    checkCitation(c.citation,`connections[${i}].citation`);
  }
  if(object(header.review))for(const dimension of ['transcription','attribution'])if(header.review[dimension]==='human-reviewed'&&!decisions(header.review.evidence))add('REVIEW_EVIDENCE_REQUIRED',`review.${dimension}`,'Human review requires applicable operator evidence.');
  if(object(header.legacy)) {
    const l=header.legacy;
    if((l.raw_header_base64===null)!==(l.raw_header_sha256===null))add('LEGACY_HEADER_PROOF_INVALID','legacy','Raw legacy header and hash must both be present or both null.');
    if(typeof l.raw_header_base64==='string') {
      const bytes=Buffer.from(l.raw_header_base64,'base64');
      if(bytes.toString('base64')!==l.raw_header_base64||createHash('sha256').update(bytes).digest('hex')!==l.raw_header_sha256)add('LEGACY_HEADER_PROOF_INVALID','legacy','Legacy header hash must match exact retained bytes.');
    }
  }
  const state=header.extensions?.conversation_revision;
  if(object(state)) {
    unique(state.retired_turn_ids,null,'extensions.conversation_revision.retired_turn_ids');
    unique(state.protected_turns,'turn_id','extensions.conversation_revision.protected_turns');
    for(const [i,p] of (Array.isArray(state.protected_turns)?state.protected_turns:[]).entries())if(object(p)) {
      const f=`extensions.conversation_revision.protected_turns[${i}]`;
      if(!p.reviewed_versions?.length)add('REVIEWED_ORIGIN_REQUIRED',f,'Protected turns require retained reviewed versions.');
      for(const v of Array.isArray(p.reviewed_versions)?p.reviewed_versions:[]) {
        if(!decisions(v.evidence))add('REVIEW_EVIDENCE_REQUIRED',f,'Reviewed versions require actual operator decisions.');
        if(!v.dimensions?.length||new Set(v.dimensions).size!==v.dimensions.length)add('REVIEW_DIMENSIONS_REQUIRED',f,'Reviewed versions require distinct review dimensions.');
        if(!repoPath(v.entry_path))add('REVIEW_ENTRY_PATH_INVALID',f,'Reviewed entry path must be relative.');
      }
      for(const a of Array.isArray(p.authorized_changes)?p.authorized_changes:[])if(a.decision?.kind!=='operator-decision')add('REVISION_AUTHORIZATION_REQUIRED',f,'Authorized transitions require an operator decision.');
    }
  }
  return out;
}
/** The header with `standard` directly after `kind`, or unchanged when it already has the key.
 * Writers serialize this, so a record they emit always names its standard. */
export function withStandard(header) {
  if(!object(header)||Object.hasOwn(header,'standard'))return header;
  const out={};let placed=false;
  for(const [key,value] of Object.entries(header)){out[key]=value;if(key==='kind'){out.standard=STANDARD;placed=true;}}
  return placed?out:{standard:STANDARD,...out};
}
/** Plan the byte-preserving edit that makes a record name its standard. Pure.
 * status: 'stamped' (output differs), 'current', 'no-header', 'not-conversation' or 'refused'
 * (a header this codec will not interpret; reason is its diagnostic code). Only the one
 * `standard` line is inserted (after `kind:`) or rewritten in place; every other byte,
 * line order and CRLF are kept, and the result is reparsed to prove it. */
export function stampPlan(input) {
  const buffer=Buffer.isBuffer(input);
  if(!buffer&&typeof input!=='string')throw new TypeError('stampPlan takes a Buffer or a string');
  const bytes=buffer?input:Buffer.from(input,'utf8');
  const keep=(status,reason=null)=>({output:input,status,reason});
  const parsed=parseConversationHeader(bytes);
  if(!parsed.header)return parsed.diagnostics.length?keep('refused',parsed.diagnostics[0].code):keep('no-header','NO_HEADER');
  if(parsed.header.kind!=='conversation')return keep('not-conversation','NOT_CONVERSATION');
  if(parsed.header.standard===STANDARD)return keep('current');
  const start=parsed.rawHeader.byteOffset-bytes.byteOffset,end=start+parsed.rawHeader.length;
  const lines=[];for(let at=start;at<end;){const lf=bytes.indexOf(10,at);lines.push({start:at,end:lf+1});at=lf+1;}
  const line=prefix=>lines.find(l=>bytes.subarray(l.start,l.end).toString('utf8').startsWith(prefix));
  const eol=l=>bytes[l.end-2]===13?'\r\n':'\n';
  const value=`standard: ${JSON.stringify(STANDARD)}`;
  const existing=line('standard: '),kind=line('kind: ');
  let out;
  if(existing)out=Buffer.concat([bytes.subarray(0,existing.start),Buffer.from(value+eol(existing)),bytes.subarray(existing.end)]);
  // kind is "conversation" here, so its line exists: the parser admits only `key: value` lines.
  else out=Buffer.concat([bytes.subarray(0,kind.end),Buffer.from(value+eol(kind)),bytes.subarray(kind.end)]);
  const check=parseConversationHeader(out),{standard:_old,...was}=parsed.header,{standard,...now}=check.header??{};
  if(!check.header||standard!==STANDARD||JSON.stringify(now)!==JSON.stringify(was)||!check.body.equals(parsed.body))return keep('refused','STAMP_UNVERIFIED');
  return {output:buffer?out:out.toString('utf8'),status:'stamped',reason:null};
}
/** `input` naming STANDARD, as the same type (Buffer or string). Idempotent; anything stampPlan
 * will not stamp comes back unchanged. */
export const stampStandard=input=>stampPlan(input).output;
