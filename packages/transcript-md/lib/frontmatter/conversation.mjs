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
/** The machine-readable twin of the standard page, shipped as standards/conversation/v1.json. */
export const MANIFEST = freeze(JSON.parse(readFileSync(new URL('../../standards/conversation/v1.json', import.meta.url), 'utf8')));
/** Version 1 of the page that defines this format. Every transcript.md names it in `standard`. */
export const STANDARD='https://hypercontext.wiki/standards/conversation/v1';
/** The unversioned URL records carried before versions existed. Still read; stamp-standard upgrades it. */
export const STANDARD_UNVERSIONED='https://hypercontext.wiki/standards/conversation';
/** Error-level, so checkers count it; it never stops a read, because records predate the rule. */
export const SELF_DOC_MISSING='self-doc:missing';
/** Error-level: the record names a version of this standard that this package does not implement. */
export const SELF_DOC_VERSION='self-doc:version';
/** The codes that say a record is not self-documenting. Reported, never blocking a read. */
export const SELF_DOC_CODES=Object.freeze([SELF_DOC_MISSING,SELF_DOC_VERSION]);
const VERSIONED=/^https:\/\/hypercontext\.wiki\/standards\/conversation\/v([1-9][0-9]*)$/;
/** Every code parseConversationHeader and validateConversation can emit, with its one level.
 * standards/conversation/v1.json ships the same table as `codes`; a test proves they agree. */
export const DIAGNOSTIC_CODES=freeze({
  INVALID_UTF8:{level:'error',means:'The file is not valid UTF-8, so its header cannot be read.',fix:'Re-save the file as UTF-8 from its original bytes.'},
  MALFORMED_DELIMITER:{level:'error',means:'The header opens with --- but has no well-formed opening or closing --- line.',fix:'Put --- alone on the first line and on the line that ends the header.'},
  INVALID_HEADER_LINE:{level:'error',means:'A header line is not one snake_case key, a colon, a space and a value.',fix:'Write each header line as `key: <compact JSON>`.'},
  PROTOTYPE_KEY:{level:'error',means:'The header uses __proto__, prototype or constructor as a key.',fix:'Remove or rename that key.'},
  DUPLICATE_KEY:{level:'error',means:'A key appears twice, at the top level or inside a JSON value.',fix:'Keep one occurrence of the key.'},
  INVALID_JSON_VALUE:{level:'error',means:'A header value is not valid JSON.',fix:'Write the value as compact JSON (strings quoted).'},
  NON_JSON_VALUE:{level:'error',means:'A header value is not plain JSON data (a non-finite number, a cycle, a non-plain object).',fix:'Use only JSON strings, numbers, booleans, null, arrays and objects.'},
  SCHEMA_INVALID:{level:'error',means:'A value does not satisfy the conversation schema.',fix:'Correct the field to the type and values the schema allows.'},
  REQUIRED_FIELD:{level:'error',means:'A field the schema requires is missing.',fix:'Add the field; use null or unknown where the fact is not known.'},
  UNKNOWN_KEY:{level:'error',means:'A field the schema does not declare is present.',fix:'Remove it, or move it under extensions.'},
  [SELF_DOC_MISSING]:{level:'error',means:'The record names no standard, the bare unversioned URL (written before versions), or a value that is not a conversation standard version.',fix:'transcript-md stamp-standard --workspace . --apply'},
  [SELF_DOC_VERSION]:{level:'error',means:'The record names a version of the conversation standard this package does not implement.',fix:'Install a @supersuit/transcript-md that implements that version.'},
  UNSUPPORTED_SCHEMA_VERSION:{level:'error',means:'schema_version is not 1.',fix:'Read it with a package that supports that schema version.'},
  INVALID_RECORD_ID:{level:'error',means:'The record id, or a record-id alias, is not a portable directory name.',fix:'Use an NFC id with no slash, control character or trailing space or dot.'},
  ID_FOLDER_MISMATCH:{level:'error',means:'The record id differs from the name of the folder holding it.',fix:'Rename the folder or the id so they match.'},
  INVALID_NEW_ID:{level:'error',means:'A new record id is not lowercase kebab case.',fix:'Choose an id like `team-call-2026-10-20`.'},
  AUDIENCE_REQUIRED:{level:'error',means:'A new record has no intended reader.',fix:'Set audience.'},
  UNKNOWN_FACT:{level:'warning',means:'A fact is recorded as unknown (null or unknown).',fix:'Fill it in when it becomes known; nothing is wrong meanwhile.'},
  INVALID_DATE:{level:'error',means:'date or as_of is not a real calendar day.',fix:'Write YYYY-MM-DD for a day that exists.'},
  INVALID_INSTANT:{level:'error',means:'An instant is not RFC 3339 with seconds and a timezone offset.',fix:'Write e.g. 2026-10-20T14:05:00-04:00.'},
  START_REQUIRED:{level:'error',means:'start has neither a local time nor an instant.',fix:'Give start.local or start.instant, or set start to null.'},
  INVALID_LOCAL_TIME:{level:'error',means:'start.local is not a real clock time.',fix:'Write HH:MM or HH:MM:SS.'},
  INVALID_TIMEZONE:{level:'error',means:'start.timezone is not a valid IANA timezone name.',fix:'Use a name like America/New_York.'},
  START_PRECISION_MISMATCH:{level:'error',means:'Second precision is declared but start.local has no seconds.',fix:'Add seconds to start.local or lower the precision.'},
  START_CONTRADICTION:{level:'error',means:'date, local start, timezone and instant disagree.',fix:'Correct whichever of them is wrong.'},
  INVALID_GROUP_PATH:{level:'error',means:'keep.group is not a workspace-relative path.',fix:'Use a relative path with no traversal.'},
  FAMILY_GROUP_REQUIRED:{level:'error',means:'Family sharing names no group.',fix:'Set keep.group.'},
  FAMILY_DECISION_REQUIRED:{level:'error',means:'Family sharing has no explicit operator decision.',fix:'Record the operator-decision evidence in keep.decision.'},
  SHARE_DECISION_REQUIRED:{level:'error',means:'Sharing has no explicit operator decision.',fix:'Record the operator-decision evidence in keep.decision.'},
  DUPLICATE_ID:{level:'error',means:'Two participants, sources, retired turns or protected turns share an id.',fix:'Give each a unique id.'},
  UNKNOWN_PERSON_REQUIRED:{level:'error',means:'A participant of unknown status names a person.',fix:'Set person to null, or confirm the identity with evidence.'},
  CONFIRMED_IDENTITY_EVIDENCE_REQUIRED:{level:'error',means:'A confirmed participant has no person or no identifying evidence.',fix:'Add the person and the evidence, or lower the status.'},
  CLOUD_IDENTITY_INVALID:{level:'error',means:'A cloud recording lacks its service or recording id, or carries a vendor id.',fix:'Set service and recording_id; set vendor_id to null.'},
  SOURCE_ID_CONFLICT:{level:'error',means:'A service locator names a different recording than its cloud capture.',fix:'Make the locator service_id equal the capture recording_id.'},
  NONCLOUD_IDENTITY_INVALID:{level:'error',means:'A non-cloud capture carries cloud identity fields.',fix:'Set service and recording_id to null.'},
  CAPTURE_ROLES_INVALID:{level:'error',means:'A capture has no roles or repeats one.',fix:'List each role once, at least one.'},
  LOCATOR_IDENTITY_INVALID:{level:'error',means:'A locator carries identifiers that do not apply to its kind.',fix:'Service locators use url or service_id; others use path only.'},
  INVALID_BUNDLED_PATH:{level:'error',means:'A bundled locator path is absolute or traverses.',fix:'Use a path relative to the record folder.'},
  INVALID_MEDIA_TYPE:{level:'error',means:'A locator media_type is not a MIME type.',fix:'Write type/subtype, e.g. audio/mp4.'},
  BACKUP_UNVERIFIED_FIELDS:{level:'error',means:'An unverified backup claims verification fields.',fix:'Null them, or mark the backup verified-owned.'},
  BACKUP_VERIFICATION_REQUIRED:{level:'error',means:'An owned backup lacks a distinct locator, a matching checksum or a verification instant.',fix:'Record all three, or mark it unverified.'},
  ALIAS_NAMESPACE_INVALID:{level:'error',means:'A source-id alias has no namespace, or another alias has one.',fix:'Give namespaces to source-id aliases only.'},
  CITATION_PATH_INVALID:{level:'error',means:'A citation lacks a relative path or a portable record id.',fix:'Correct the citation path and record_id.'},
  CITATION_REPOSITORY_REQUIRED:{level:'error',means:'A git citation names no repository.',fix:'Set repository.'},
  CITATION_RANGE_INVALID:{level:'error',means:'A line citation ends before it starts.',fix:'Order start and end.'},
  CITATION_TURNS_INVALID:{level:'error',means:'A turn citation has no turn ids or repeats one.',fix:'List distinct turn ids.'},
  SOURCE_RANGE_INVALID:{level:'error',means:'A cited capture span ends without an ordered start.',fix:'Give start_ms no later than end_ms.'},
  CONNECTION_PATH_INVALID:{level:'error',means:'A path connection is not relative.',fix:'Use a workspace-relative path.'},
  REVIEW_EVIDENCE_REQUIRED:{level:'error',means:'Human review is claimed without operator-decision evidence.',fix:'Add the evidence, or mark it unreviewed.'},
  LEGACY_HEADER_PROOF_INVALID:{level:'error',means:'The retained legacy header bytes and their hash are missing in part or disagree.',fix:'Keep both, matching, or both null.'},
  REVIEWED_ORIGIN_REQUIRED:{level:'error',means:'A protected turn retains no reviewed versions.',fix:'Restore its reviewed versions from the revision journal.'},
  REVIEW_DIMENSIONS_REQUIRED:{level:'error',means:'A reviewed version has no review dimensions or repeats one.',fix:'List each dimension once.'},
  REVIEW_ENTRY_PATH_INVALID:{level:'error',means:'A reviewed version entry path is not relative.',fix:'Use the record-relative path.'},
  REVISION_AUTHORIZATION_REQUIRED:{level:'error',means:'An authorized change to a protected turn has no operator decision.',fix:'Record the operator-decision evidence.'},
});
/** Error diagnostics that stop interpretation: every error except the self-documentation codes. */
export const blockingDiagnostics=diagnostics=>(Array.isArray(diagnostics)?diagnostics:[]).filter(d=>d?.severity==='error'&&!SELF_DOC_CODES.includes(d.code));
/** One diagnostic, its level taken from DIAGNOSTIC_CODES. An unlisted code is a bug and throws. */
export function conversationDiagnostic(code,field,message) {
  const entry=Object.hasOwn(DIAGNOSTIC_CODES,code)?DIAGNOSTIC_CODES[code]:null;
  if(!entry)throw new Error(`unlisted conversation diagnostic code: ${code}`);
  return {code,severity:entry.level,path:null,field,message};
}
const diagnostic=conversationDiagnostic;
/** The self-documentation finding for a `standard` value, or null when it is STANDARD. */
export function standardFinding(value) {
  if(value===STANDARD)return null;
  if(value===undefined)return {code:SELF_DOC_MISSING,message:`Record does not name its standard, ${STANDARD}.`};
  if(value===STANDARD_UNVERSIONED)return {code:SELF_DOC_MISSING,message:`Record names the unversioned standard URL, which predates versions; \`transcript-md stamp-standard --apply\` upgrades it to ${STANDARD}.`};
  if(typeof value==='string'&&VERSIONED.test(value))return {code:SELF_DOC_VERSION,message:`Record names a version of the conversation standard this package does not implement; it implements ${STANDARD}.`};
  return {code:SELF_DOC_MISSING,message:`Record names a standard other than ${STANDARD}.`};
}
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
  const out=[]; const fail=()=>out.push(diagnostic('SCHEMA_INVALID',field||null,'Value does not satisfy the conversation schema.'));
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
  // `standard` is judged by standardFinding alone, so a missing, older or future version is a
  // self-documentation finding (never blocking) rather than a schema failure (blocking).
  const out=schemaErrors(conversationSchema,header).filter(d=>d.field!=='standard');
  const add=(code,field,message)=>out.push(diagnostic(code,field,message));
  if(!object(header))return out;
  const finding=standardFinding(header.standard);
  if(finding)add(finding.code,'standard',finding.message);
  if(header.schema_version!==1)add('UNSUPPORTED_SCHEMA_VERSION','schema_version','Unsupported conversation schema version.');
  if(typeof header.id==='string'&&!validId(header.id))add('INVALID_RECORD_ID','id','Record id is not a portable directory component.');
  if(context.folderId!==undefined&&header.id!==context.folderId)add('ID_FOLDER_MISMATCH','id','Record id must match its parent folder.');
  if(context.newRecord&&typeof header.id==='string'&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(header.id))add('INVALID_NEW_ID','id','New record ids must be lowercase kebab case.');
  if(context.newRecord&&header.audience===null)add('AUDIENCE_REQUIRED','audience','New conversations require an intended reader.');
  // Shape failures are already classified; never inspect malformed nested structures.
  if(out.some(d=>d.code==='SCHEMA_INVALID'||d.code==='REQUIRED_FIELD'||d.code==='UNKNOWN_KEY'))return out;
  for(const field of ['title','description','date','start','as_of','audience'])if(header[field]===null)add('UNKNOWN_FACT',field,'Conversation fact is unknown.');
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
    if(s.local!==null&&s.timezone===null&&s.instant===null)add('UNKNOWN_FACT','start.timezone','Local start has no zone or instant; cross-zone arithmetic is unavailable.');
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
    if(k.scope==='unknown')add('UNKNOWN_FACT','keep.scope','Sharing boundary is unknown; effective boundary is private.');
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
    if(p.role==='unknown')add('UNKNOWN_FACT',`${f}.role`,'Participant role is unknown.');
    if(p.status==='unknown'&&p.person!==null)add('UNKNOWN_PERSON_REQUIRED',`${f}.person`,'Unknown identity must remain null.');
    if(p.person===null)add('UNKNOWN_FACT',`${f}.person`,'Participant identity is unknown.');
    if(p.status==='confirmed'&&(p.person===null||!Array.isArray(p.evidence)||p.evidence.length===0))add('CONFIRMED_IDENTITY_EVIDENCE_REQUIRED',f,'Confirmed identity requires identifying evidence.');
  }
  for(const [i,c] of (Array.isArray(header.sources)?header.sources:[]).entries())if(object(c)) {
    const f=`sources[${i}]`;
    if(c.type===null)add('UNKNOWN_FACT',`${f}.type`,'Capture type is unknown.');
    if(c.availability==='unknown')add('UNKNOWN_FACT',`${f}.availability`,'Capture availability is unknown.');
    if(c.roles.includes('unknown'))add('UNKNOWN_FACT',`${f}.roles`,'Source coverage role is unknown.');
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
/** The header naming STANDARD: added directly after `kind` when missing, and the bare
 * unversioned URL upgraded in place. Any other value is left for the writer to refuse, so a
 * record from a future version is never silently downgraded. Writers serialize this. */
export function withStandard(header) {
  if(!object(header))return header;
  if(header.standard===STANDARD_UNVERSIONED)return {...header,standard:STANDARD};
  if(Object.hasOwn(header,'standard'))return header;
  const out={};let placed=false;
  for(const [key,value] of Object.entries(header)){out[key]=value;if(key==='kind'){out.standard=STANDARD;placed=true;}}
  return placed?out:{standard:STANDARD,...out};
}
/** Plan the byte-preserving edit that makes a record name its standard. Pure.
 * status: 'stamped' (output differs), 'current', 'no-header', 'not-conversation' or 'refused'
 * (a header this codec will not interpret, or a standard version it does not implement; reason
 * is the diagnostic code). The bare unversioned URL is upgraded to STANDARD. Only the one
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
  // Never rewrite a version this package does not implement: that would downgrade the record.
  if(standardFinding(parsed.header.standard)?.code===SELF_DOC_VERSION)return keep('refused',SELF_DOC_VERSION);
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
