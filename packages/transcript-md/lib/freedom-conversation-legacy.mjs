// Read-only compatibility projection. Original bytes, not this projection, are authoritative.
import {createHash} from 'node:crypto';
import {basename,resolve} from 'node:path';
import {parseFlat,stripTrailingComment} from './frontmatter/yaml.mjs';
import {validateConversation,SELF_DOC_MISSING} from './frontmatter/conversation.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
const text=v=>typeof v==='string'&&v.length>0?v:null;
const list=v=>Array.isArray(v)?v: text(v)?[v]:[];
const safeKey=k=>/^[a-z][a-z0-9_]*$/.test(k)&&!['__proto__','prototype','constructor'].includes(k);
const diag=(code,field,severity='error')=>({code,severity,path:null,field,message:'Legacy metadata requires an explicit resolution; original bytes are retained.'});
// Existing concat producers declare scalar notes. Preserve them as metadata only;
// sourcesFrom deliberately never uses note as locator, identity or coverage proof.
const sourceKeys=new Set(['type','path','url','id','role','service','recording_id','note']);
const roles=new Set(['transcript-body','metadata','generated-notes','supplemental','unknown']);
const service=s=>typeof s==='string'&&/^[a-z][a-z0-9-]*$/.test(s);

// The flat parser is deliberately string-typed. Screen syntax it otherwise accepts literally
// (maps, anchors, tags and block scalars) before handing it any value.
function scalar(raw) {
 const s=stripTrailingComment(raw);
 if(!s||/^[\[\]{}|>&*!%@`]/.test(s))throw new Error('unsupported scalar');
 if(s[0]==='"'||s[0]==="'") {
  const q=s[0];let end=-1;
  for(let i=1;i<s.length;i++){if(q==='"'&&s[i]==='\\'){i++;continue;}if(s[i]===q){end=i;break;}}
  if(end!==s.length-1)throw new Error('unsupported quote');
 } else if(/:\s|\s[&*!][^\s]/.test(s))throw new Error('unsupported scalar');
 return parseFlat(`value: ${s}`).value;
}
function flatBlock(key,lines) {
 const raw=stripTrailingComment(lines[0].slice(lines[0].indexOf(':')+1));
 if(raw.startsWith('[')) {
  if(!raw.endsWith(']')||lines.slice(1).some(l=>l.trim()&&!l.trim().startsWith('#')))throw new Error('complex list');
  const inner=raw.slice(1,-1);let q=null,part='',parts=[];
  for(let i=0;i<inner.length;i++){const c=inner[i];if(q){part+=c;if(c==='\\'&&q==='"'){part+=inner[++i]??'';}else if(c===q)q=null;}else if(c==='"'||c==="'"){q=c;part+=c;}else if(c===','){parts.push(part);part='';}else part+=c;}
  if(q)throw new Error('unclosed quote');
  if(inner.trim()){parts.push(part);parts.forEach(scalar);}
 } else if(raw) {
  scalar(raw);if(lines.slice(1).some(l=>l.trim()&&!l.trim().startsWith('#')))throw new Error('continuation');
 } else {
  const items=lines.slice(1).filter(l=>l.trim()&&!l.trim().startsWith('#'));
  const indents=new Set();
  for(const line of items){const m=/^( +)- (.+)$/.exec(line);if(!m)throw new Error('nested');indents.add(m[1].length);scalar(m[2]);}
  if(indents.size>1)throw new Error('indent');
 }
 return parseFlat(lines.join('\n'))[key];
}
function sourceBlock(lines) {
 if(lines[0].slice(lines[0].indexOf(':')+1).trim())throw new Error('inline sources');
 const items=[];let current=null,base=null,unknown=false;
 for(const line of lines.slice(1)) {
  if(!line.trim()||line.trim().startsWith('#'))continue;
  const head=/^( +)- ([a-z][a-z0-9_]*):\s*(.*)$/.exec(line);
  let key,raw;
  if(head){if(base===null)base=head[1].length;if(head[1].length!==base)throw new Error('indent');current={};items.push(current);[, ,key,raw]=head;}
  else {const m=/^( +)([a-z][a-z0-9_]*):\s*(.*)$/.exec(line);if(!current||!m||m[1].length!==base+2)throw new Error('source shape');[, ,key,raw]=m;}
  if(!safeKey(key)||Object.hasOwn(current,key))throw new Error('source key');
  const value=scalar(raw);current[key]=value;if(!sourceKeys.has(key))unknown=true;
 }
 return {items,unknown};
}
function fieldsFrom(rawHeader) {
 const fields={},unparsed=new Set(),diagnostics=[];
 if(rawHeader===null)return {fields,unparsed,diagnostics};
 const blocks=[];let block=null;
 for(const line of rawHeader.toString('utf8').split(/\r?\n/)) {
  if(!line.trim()||line.trim().startsWith('#')){if(block)block.lines.push(line);continue;}
  if(!/^\s/.test(line)){const m=/^([^:]+):/.exec(line);block={key:m?.[1]??'unknown',lines:[line]};blocks.push(block);}
  else if(block)block.lines.push(line);else{unparsed.add('unknown');diagnostics.push(diag('LEGACY_FIELD_UNPARSED',null));}
 }
 const counts=new Map();for(const b of blocks)counts.set(b.key,(counts.get(b.key)??0)+1);
 for(const b of blocks) {
  const {key,lines}=b;
  try {
   if(!safeKey(key)||counts.get(key)>1)throw new Error('duplicate or unsafe');
   if(key==='sources'){const s=sourceBlock(lines);fields[key]=s.items;if(s.unknown)unparsed.add(key);}
   else fields[key]=flatBlock(key,lines);
  }catch{unparsed.add(key);}
 }
 for(const key of unparsed)diagnostics.push(diag(key==='date'&&counts.get(key)>1?'DATE_CONFLICT':'LEGACY_FIELD_UNPARSED',safeKey(key)?key:null));
 return {fields,unparsed,diagnostics};
}
const locator=patch=>({kind:'service',path:null,url:null,service_id:null,media_type:null,sha256:null,bytes:null,checked_at:null,backup:{status:'unverified',locator:null,sha256:null,verified_at:null},...patch});
const namespace=c=>c.type==='cloud_recording'?`cloud:${c.service}`:c.type==='zoom_cloud'&&/^GMT\d{8}-\d{6}$/.test(c.vendor_id??'')?'zoom-cloud-gmt':({granola:'granola',meet_cloud:'meet',voice_memo:'voice-memo'}[c.type]??c.type);

function sourcesFrom(fields,evidence=()=>[]) {
 const captures=[],aliases=[],diagnostics=[];
 const alias=(namespace,value)=>{if(namespace&&text(value)&&!aliases.some(a=>a.namespace===namespace&&a.value===value))aliases.push({kind:'source-id',namespace,value});};
 const identity=c=>c.type==='cloud_recording'?c.recording_id:c.vendor_id;
 function add(s,field,top=false) {
  let type=text(s.type),vendor=text(s.id),svc=null,recording=null;
  const url=text(s.url),path=text(s.path);
  if(type==='cloud_recording') {
   svc=text(s.service);recording=text(s.recording_id);
   if(!service(svc)){diagnostics.push(diag('SOURCE_SERVICE_UNRESOLVED',field));return;}
   if(!recording){diagnostics.push(diag('RECORDING_ID_UNRESOLVED',field));return;}
   if(vendor&&vendor!==recording)diagnostics.push(diag('SOURCE_ID_CONFLICT',field));vendor=null;
  }
  if(type==='meet_cloud'&&url){const id=/\/file\/d\/([^/?#]+)/.exec(url)?.[1];if(id&&vendor&&id!==vendor){diagnostics.push(diag('SOURCE_ID_CONFLICT',field));return;}vendor??=id??null;}
  let role=text(s.role)??'unknown';if(!roles.has(role)){diagnostics.push(diag('SOURCE_ROLE_UNRESOLVED',field));role='unknown';}
  const locators=[];
  if(path)locators.push(locator({kind:'external-local',path}));
  if(url||recording||vendor)locators.push(locator({url,service_id:recording??vendor}));
  const c={id:null,type,service:svc,recording_id:recording,vendor_id:vendor,roles:[role],locators,availability:path?'unknown':locators.length?'remote-only':'unknown',evidence:evidence(field)};
  // Only list/top-level equivalence folds. Multiple distinct list captures stay distinct.
  const peers=top?captures.filter(x=>x.type===type&&x.service===svc):[];
  const existing=peers.find(x=>identity(x)&&identity(x)===identity(c))??peers[0];
  if(existing) {
   const a=identity(existing),b=identity(c);
   const overlaps=['path','url','service_id'];
   const left={path:existing.locators.find(l=>l.path)?.path??null,url:existing.locators.find(l=>l.url)?.url??null,service_id:existing.locators.find(l=>l.service_id)?.service_id??null};
   const right={path,url,service_id:recording??vendor};
   if(a&&b&&a!==b||overlaps.some(k=>left[k]&&right[k]&&left[k]!==right[k])){diagnostics.push(diag('SOURCE_ID_CONFLICT',field));return;}
   if(a&&b&&a===b){existing.roles=[...new Set([...existing.roles,role])];existing.evidence.push(...c.evidence);for(const l of locators)if(!existing.locators.some(x=>JSON.stringify(x)===JSON.stringify(l)))existing.locators.push(l);return;}
  }
  c.id=`c-${String(captures.length+1).padStart(3,'0')}`;captures.push(c);
  alias(namespace(c),identity(c));if(type==='zoom_cloud')alias('zoom-cloud-url',url);
 }
 for(const [i,s] of (Array.isArray(fields.sources)?fields.sources:[]).entries())if(s&&typeof s==='object'&&!Array.isArray(s))add(s,`sources[${i}]`);
 for(const [key,type,urlKey] of [['granola_id','granola','granola_url'],['meet_id','meet_cloud',null],['zoom_gmt','zoom_cloud',null],['voice_memo_id','voice_memo',null]])if(text(fields[key])) {
  if(key==='zoom_gmt'&&!/^GMT\d{8}-\d{6}$/.test(fields[key]))diagnostics.push(diag('RECORDING_ID_UNRESOLVED',key));
  else add({type,id:fields[key],url:fields[urlKey]},key,true);
 }
 if(text(fields.recording_id)){if(service(fields.source)&&fields.source!=='granola')add({type:'cloud_recording',service:fields.source,recording_id:fields.recording_id,url:fields.url},'recording_id',true);else diagnostics.push(diag('SOURCE_SERVICE_UNRESOLVED','recording_id'));}
 if(text(fields.zoom_id)){alias('zoom-meeting',fields.zoom_id);diagnostics.push(diag('RECORDING_ID_UNRESOLVED','zoom_id'));}
 return {captures,aliases,diagnostics};
}
/** Exact compatibility refs; no filesystem probes or remote fetches. */
export function legacySourceRefs(fields) {
 return sourcesFrom(fields).captures.flatMap(c=>(c.locators.length?c.locators:[null]).flatMap(l=>c.roles.map(role=>({capture:c.id,type:c.type,service:c.service,recordingId:c.recording_id,vendorId:c.vendor_id,role,path:l?.path??null,url:l?.url??null,serviceId:l?.service_id??null,availability:c.availability}))));
}

/** Normalize an explicit old file; never infer facts from its name or modify its bytes. */
export function normalizeLegacy(bytes,{file}) {
 if(!Buffer.isBuffer(bytes)||typeof file!=='string'||!file)throw new TypeError('legacy input requires bytes and a file');
 const absolute=resolve(file),relativePath=basename(file),id=relativePath.replace(/\.md$/i,'');
 const fileSha256=hash(bytes);
 const base={file:absolute,relativePath,id,layout:'legacy',header:null,legacyFields:{},rawHeader:null,body:bytes,fileSha256,bodySha256:hash(bytes),sections:[],turns:[],gaps:[],diagnostics:[]};
 const refuse=code=>({...base,diagnostics:[diag(code,null)]});
 let decoded;try{decoded=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{return refuse('INVALID_UTF8');}
 const open=/^(?:\uFEFF)?---(\r?\n)/.exec(decoded);
 if(!open&&/^(?:\uFEFF)?---/.test(decoded))return refuse('MALFORMED_DELIMITER');
 if(open){const offset=bytes.subarray(0,3).equals(Buffer.from([239,187,191]))?3:0;const start=offset+3+Buffer.byteLength(open[1]);let cursor=start,close=null;
  while(cursor<bytes.length){const lf=bytes.indexOf(10,cursor),end=lf<0?bytes.length:lf;const line=bytes.subarray(cursor,end).toString('utf8');if(line==='---'||line==='---\r'){close={start:cursor,end:lf<0?end:end+1};break;}cursor=lf<0?bytes.length:lf+1;}
  if(!close)return refuse('MALFORMED_DELIMITER');base.rawHeader=bytes.subarray(start,close.start);base.body=bytes.subarray(close.end);base.bodySha256=hash(base.body);
 }
 const parsed=fieldsFrom(base.rawHeader),f=parsed.fields;base.legacyFields=f;
 const evidence=field=>[{kind:'existing-header',locator:`${file}#${field}`,revision:{kind:'sha256',value:fileSha256},note:'Original header declares this metadata; no human confirmation is inferred.'}];
 const source=sourcesFrom(f,evidence);
 const h={schema_version:1,kind:'conversation',id,title:text(f.title),description:text(f.description),read_when:list(f.read_when),date:null,start:null,as_of:null,audience:text(f.audience),keep:{scope:'unknown',group:null,decision:null},participants:[],sources:source.captures,connections:[],aliases:[{kind:'legacy-path',value:file,namespace:null},...source.aliases],review:{transcription:'unreviewed',attribution:'unreviewed',processing:'unprocessed',evidence:[]},body_format:'legacy',legacy:{original_path:file,original_revision:{kind:'sha256',value:fileSha256},raw_header_base64:base.rawHeader?.toString('base64')??null,raw_header_sha256:base.rawHeader===null?null:hash(base.rawHeader),fields:f,unparsed_keys:[...parsed.unparsed],body_sha256:base.bodySha256},extensions:{}};
 const diagnostics=[...parsed.diagnostics,...source.diagnostics];
 for(const key of ['date','as_of'])if(text(f[key])){const candidate={...h,[key]:f[key]};if(validateConversation(candidate).some(d=>d.field===key&&d.severity==='error'))diagnostics.push(diag('INVALID_DATE',key));else h[key]=f[key];}
 if(['started_at','happened_at','timezone','time_precision','inferred_from','time_local','start_local','start'].some(k=>Object.hasOwn(f,k)||parsed.unparsed.has(k)))diagnostics.push(diag('TIME_BASIS_UNRESOLVED','start','warning'));
 for(const key of ['private','sensitivity','keep','scope','sharing']) {
  if(parsed.unparsed.has(key)){diagnostics.push(diag('RESTRICTION_UNRESOLVED',key));continue;}
  if(!Object.hasOwn(f,key))continue;
  if(key==='private'&&f[key]==='true'||key==='sensitivity'&&['private','confidential','restricted'].includes(f[key]))h.keep.scope='home';
  else if(!(key==='private'&&f[key]==='false'))diagnostics.push(diag('RESTRICTION_UNRESOLVED',key));
 }
 for(const key of ['participants','attendees'])for(const label of list(f[key]).filter(text))h.participants.push({id:`p-${String(h.participants.length+1).padStart(3,'0')}`,label,person:null,status:'unknown',role:key==='attendees'?'attendee':'unknown',evidence:evidence(key)});
 if(text(f.id)&&f.id!==id)h.aliases.push({kind:'record-id',value:f.id,namespace:null});
 if(text(f.meeting_key))h.extensions.meeting_key=f.meeting_key;
 // This header is the reader's projection of a flat legacy file, not stored bytes; there is
 // no transcript.md to stamp, so a missing standard is not a finding about this record.
 diagnostics.push(...validateConversation(h).filter(d=>d.code!==SELF_DOC_MISSING));
 if(h.sources.length===0)diagnostics.push(diag('SOURCE_UNKNOWN','sources','warning'));
 base.header=h;base.diagnostics=diagnostics;base.gaps=diagnostics.filter(d=>d.severity==='warning'||d.code.endsWith('_UNRESOLVED'));
 return base;
}
