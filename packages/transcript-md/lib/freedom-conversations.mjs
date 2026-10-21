// Synchronous read door. Explicit roots only; no binding discovery, writes or media probes.
import {readFileSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,relative,basename,dirname,join,isAbsolute,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {paths} from './freedom-workspace.mjs';
import {parseConversationHeader,validateConversation,blockingDiagnostics,diagnosticLevel} from './frontmatter/conversation.mjs';
// A missing `standard` is reported in diagnostics but never stops a read: records predate the rule.
const blocks=diagnostics=>blockingDiagnostics(diagnostics).length>0;
import {parseConversationInstant,compareConversationInstants} from './freedom-conversation-time.mjs';
import {normalizeLegacy} from './freedom-conversation-legacy.mjs';
import {conversationIdCollisionKey as foldId} from './freedom-conversation-casefold.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// Every level comes from DIAGNOSTIC_CODES; an unlisted code throws.
const diagnostic=(code,path=null,field=null)=>({code,severity:diagnosticLevel(code),path,field,message:'Conversation record requires explicit resolution; no source content is included in this diagnostic.'});
const excludedPart=p=>/^[._]/.test(p)||['sources','derived','staging'].includes(p);
export function classifyConversationPath(p) {
 if(typeof p!=='string'||p.includes('\\')||p.includes('\0'))return 'excluded';
 const parts=p.split('/');
 if(parts.some(p=>!p||excludedPart(p))||parts.at(-1)==='README.md'||parts.at(-1)==='annotations.md')return 'excluded';
 if(parts.length===2&&parts[1]==='transcript.md')return 'canonical';
 if(parts.length===1&&/\.md$/.test(p))return 'legacy';
 return 'excluded';
}
const emptyRecord=(file,bytes=Buffer.alloc(0),layout='canonical')=>({file:resolve(file),relativePath:basename(file),id:null,layout,header:null,legacyFields:null,rawHeader:null,body:bytes,fileSha256:hash(bytes),bodySha256:hash(bytes),sections:[],turns:[],gaps:[],diagnostics:[]});
const attachGaps=r=>{r.diagnostics=r.diagnostics.map(d=>({...d,path:d.path??r.file}));r.gaps=r.diagnostics.filter(d=>d.severity==='warning'||d.code.endsWith('_UNRESOLVED'));return r;};

// Byte offsets, including original CRLF separators, remain independent of JS string lengths.
function physicalLines(bytes,startLine=1) {
 const lines=[];let start=0,line=startLine;
 while(start<bytes.length){const lf=bytes.indexOf(10,start),end=lf<0?bytes.length:lf+1;lines.push({start,end,line:line++,text:bytes.subarray(start,lf<0?end:lf).toString('utf8').replace(/\r$/,'')});start=end;}
 return lines;
}
const interpretation=/^(?:granola notes|summary|key quotes|action items|notes|generated notes|generated interpretation)$/i;
const warning=/^(?:attribution warning|speaker attribution(?: warning)?|transcription warning|warning|warnings)$/i;
function sectionsFor(record,bodyStartLine) {
 const lines=physicalLines(record.body,bodyStartLine),headings=[],warningStarts=[];let fence=null;
 for(let i=0;i<lines.length;i++) {
  const text=lines[i].text;
  if(fence){if(new RegExp(`^ {0,3}${fence.char}{${fence.length},}\\s*$`).test(text))fence=null;continue;}
  const opening=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
  if(opening&&!(opening[1][0]==='`'&&opening[2].includes('`'))){fence={char:opening[1][0],length:opening[1].length};continue;}
  const m=/^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(text);
  if(m)headings.push({index:i,level:m[1].length,name:m[2]});
  if(/^\s*>\s*\[!WARNING\]/i.test(text)||/^\s*(?:>\s*)?\*\*(?:speaker )?attribution warning\b/i.test(text))warningStarts.push(i);
 }
 const canonical=record.header.body_format==='turns-v1';
 const kind=h=>canonical?(h.level===2&&h.name==='Transcript'?'transcript':'other'):/^(?:Transcript|Full transcript)$/i.test(h.name)?'transcript':warning.test(h.name)?'warning':interpretation.test(h.name)?'interpretation':'other';
 // Canonical section ownership is H2-only; nested names never create another speech span.
 const sectionHeadings=canonical?headings.filter(h=>h.level<=2):headings;
 const sections=[];
 const add=(name,kind,start,end)=>{if(start>=end)return;sections.push({name,kind,startLine:lines[start].line,endLine:lines[end-1].line,bytes:record.body.subarray(lines[start].start,lines[end-1].end)});};
 // Select outer sections; nested headings remain part of the parent exact byte span.
 let consumed=0;
 for(let i=0;i<sectionHeadings.length;i++) {
  const h=sectionHeadings[i];if(h.index<consumed)continue;
  if(h.index>consumed)add('', 'other',consumed,h.index);
  let end=lines.length;
  for(let j=i+1;j<sectionHeadings.length;j++) {
   const next=sectionHeadings[j];
   const boundary=kind(next)!=='other'||canonical&&['Now','Log','Open questions'].includes(next.name);
   if(next.level<=h.level&&(kind(h)!=='transcript'||boundary)){end=next.index;break;}
  }
  // A display title or notes container must not swallow a nested Transcript heading.
  if(kind(h)!=='transcript')end=sectionHeadings[i+1]?.index??lines.length;
  add(h.name,kind(h),h.index,end);consumed=end;
 }
 if(consumed<lines.length)add('', 'other',consumed,lines.length);
 // Warnings are independent views even where they overlap a larger transcript section.
 for(const h of headings.filter(h=>warning.test(h.name)))if(!sections.some(s=>s.startLine===lines[h.index].line&&s.kind==='warning')) {
  const next=headings.find(x=>x.index>h.index&&x.level<=h.level);add(h.name,'warning',h.index,next?.index??lines.length);
 }
 for(const start of warningStarts){let end=start+1;while(end<lines.length&&lines[end].text.trim()&&(!lines[start].text.trimStart().startsWith('>')||lines[end].text.trimStart().startsWith('>')))end++;add('Attribution warning','warning',start,end);}
 if(canonical) {
  const required=['Now','Transcript','Log','Open questions'],actual=headings.filter(h=>h.level===2).map(h=>h.name);
  if(JSON.stringify(actual)!==JSON.stringify(required)||headings.some(h=>h.level===2&&lines[h.index].text!==`## ${h.name}`))record.diagnostics.push(diagnostic('CANONICAL_SECTIONS_INVALID',record.file,'body'));
  const titles=headings.filter(h=>h.level===1);
  if(titles.length>1||titles.some(h=>h.name!==record.header.title))record.diagnostics.push(diagnostic('TITLE_MISMATCH',record.file,'title'));
 }
 const transcripts=sections.filter(s=>s.kind==='transcript');
 if(!transcripts.length)record.diagnostics.push(diagnostic('TRANSCRIPT_SECTION_UNKNOWN',record.file,'body'));
 else if(!canonical&&transcripts.every(s=>!s.bytes.toString('utf8').replace(/^[^\n]*(?:\n|$)/,'').trim()))record.diagnostics.push(diagnostic('TRANSCRIPT_EMPTY',record.file,'body'));
 return sections.sort((a,b)=>a.startLine-b.startLine);
}

const exactKeys=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const milliseconds=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const interval=(start,end)=>milliseconds(start)&&(end===null||milliseconds(end)&&end>=start);
function validTiming(t,captures) {
 if(t===null)return true;
 if(!t||typeof t!=='object')return false;
 if(t.basis==='capture')return exactKeys(t,['basis','capture','start_ms','end_ms'])&&captures.has(t.capture)&&interval(t.start_ms,t.end_ms);
 if(t.basis==='conversation')return exactKeys(t,['basis','start_ms','end_ms','mapping'])&&interval(t.start_ms,t.end_ms)&&Array.isArray(t.mapping)&&t.mapping.every(m=>
  exactKeys(m,['capture','conversation_start_ms','conversation_end_ms','capture_start_ms','capture_end_ms'])&&captures.has(m.capture)&&
  [m.conversation_start_ms,m.conversation_end_ms,m.capture_start_ms,m.capture_end_ms].every(milliseconds)&&m.conversation_end_ms>=m.conversation_start_ms&&
  m.capture_end_ms-m.capture_start_ms===m.conversation_end_ms-m.conversation_start_ms);
 if(t.basis==='wall-clock') {
  const start=parseConversationInstant(t.start),end=parseConversationInstant(t.end);
  return exactKeys(t,['basis','start','end','mapping'])&&!!start&&(t.end===null||!!end&&compareConversationInstants(end,start)>=0)&&Array.isArray(t.mapping)&&t.mapping.every(m=>
   exactKeys(m,['capture','wall_start','capture_start_ms'])&&captures.has(m.capture)&&!!parseConversationInstant(m.wall_start)&&milliseconds(m.capture_start_ms));
 }
 return false;
}
function turnsFor(record) {
 if(record.header.body_format!=='turns-v1'||blocks(record.diagnostics))return [];
 const section=record.sections.find(s=>s.kind==='transcript');if(!section)return [];
 const lines=physicalLines(section.bytes,section.startLine),starts=[],turns=[],ids=new Set();let fence=null;
 const fail=(code,field='body')=>record.diagnostics.push(diagnostic(code,record.file,field));
 for(let i=1;i<lines.length;i++) {
  const text=lines[i].text;
  if(fence){if(new RegExp(`^ {0,3}${fence.char}{${fence.length},}\\s*$`).test(text))fence=null;continue;}
  const opening=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
  if(opening&&!(opening[1][0]==='`'&&opening[2].includes('`'))){fence={char:opening[1][0],length:opening[1].length};continue;}
  const heading=/^### (t-\d{6,})$/.exec(text);
  if(heading)starts.push({index:i,id:heading[1]});
  else if(/^\s*#{1,6}\s+t-/.test(text))fail('TURN_HEADING_INVALID');
 }
 const preludeEnd=starts[0]?.index??lines.length;
 if(lines.slice(1,preludeEnd).some(l=>l.text.trim()))fail('TURN_GRAMMAR_INVALID');
 const captures=new Map(record.header.sources.map(c=>[c.id,c]));
 for(let i=0;i<starts.length;i++) {
  const {index,id}=starts[i],end=starts[i+1]?.index??lines.length;
  if(ids.has(id))fail('TURN_ID_DUPLICATE');ids.add(id);
  const comment=/^<!-- turn (\{.*\}) -->$/.exec(lines[index+1]?.text??'');
  if(!comment){fail('TURN_METADATA_INVALID');continue;}
  // Reuse the scoped codec's JSON syntax/duplicate/prototype checks; no second JSON parser.
  const parsed=parseConversationHeader(Buffer.from(`---\nextensions: ${comment[1]}\n---\n`));
  const meta=parsed.header?.extensions;
  if(!exactKeys(meta,['speaker','sources','timing','source_gap'])){fail('TURN_METADATA_INVALID');continue;}
  if(meta.speaker!==null&&!record.header.participants.some(p=>p.id===meta.speaker))fail('TURN_SPEAKER_UNKNOWN','speaker');
  const gap=meta.source_gap===null||typeof meta.source_gap==='string'&&!!meta.source_gap.trim();
  if(!gap||!Array.isArray(meta.sources)||!meta.sources.length&&meta.source_gap===null)fail('TURN_SOURCE_INVALID','sources');
  const warnUnknown=field=>record.diagnostics.push(diagnostic('UNKNOWN_FACT',record.file,`turns[${i}].${field}`));
  if(Array.isArray(meta.sources))for(const [sourceIndex,ref] of meta.sources.entries()) {
   if(!exactKeys(ref,['capture','locator','start_ms','end_ms'])){fail('TURN_SOURCE_INVALID','sources');continue;}
   for(const key of ['locator','start_ms','end_ms'])if(ref[key]===null)warnUnknown(`sources[${sourceIndex}].${key}`);
   const capture=captures.get(ref.capture);
   if(!capture||!(ref.locator===null||Number.isInteger(ref.locator)&&ref.locator>=0&&ref.locator<capture.locators.length)||!(ref.start_ms===null&&ref.end_ms===null||interval(ref.start_ms,ref.end_ms)))fail('TURN_SOURCE_INVALID','sources');
  }
  if(!validTiming(meta.timing,captures))fail('TURN_TIMING_INVALID','timing');
  else if(meta.timing!==null){const endField=meta.timing.basis==='wall-clock'?'end':'end_ms';if(meta.timing[endField]===null)warnUnknown(`timing.${endField}`);}
  for(const [missing,code,field] of [[meta.speaker===null,'SPEAKER_UNRESOLVED','speaker'],[meta.timing===null,'TIMING_UNRESOLVED','timing'],[!!meta.source_gap,'TURN_SOURCE_UNRESOLVED','sources']])if(missing)record.diagnostics.push(diagnostic(code,record.file,field));
  const textStart=lines[index+1].end,textEnd=end<lines.length?lines[end].start:section.bytes.length;
  turns.push({id,...meta,text:section.bytes.subarray(textStart,textEnd),startLine:lines[index].line,endLine:lines[end-1].line});
 }
 if(blocks(record.diagnostics))return [];
 const empty=turns.map(turn=>!turn.text.toString('utf8').trim());
 for(let i=0;i<turns.length;i++)if(empty[i])record.diagnostics.push(diagnostic('TURN_EMPTY',record.file,`turns[${i}].text`));
 if(empty.every(Boolean))record.diagnostics.push(diagnostic('TRANSCRIPT_EMPTY',record.file,'body'));
 return turns;
}

function canonicalIntent(bytes,file,layout) {
 if(layout==='canonical'||layout!=='legacy'&&basename(file)==='transcript.md')return true;
 // Inspect only the delimited header, never a quoted header inside transcript speech.
 const text=bytes.toString('utf8'),match=/^(?:\uFEFF)?---\r?\n([\s\S]*?)(?:\r?\n---(?:\r?\n|$)|$)/.exec(text);
 return !!match&&/^(?:schema_version\s*:|kind\s*:\s*["']?conversation(?:-redirect)?["']?\s*$)/m.test(match[1]);
}
export function parseConversation(bytes,{file,layout}) {
 if(!Buffer.isBuffer(bytes)||typeof file!=='string'||!file)throw new TypeError('conversation requires bytes and a file');
 if(layout!==undefined&&!['legacy','canonical'].includes(layout))throw new TypeError('layout must be legacy or canonical');
 let record;
 if(canonicalIntent(bytes,file,layout)) {
  const parsed=parseConversationHeader(bytes);
  record={...emptyRecord(file,bytes,layout??'canonical'),...parsed,bodySha256:hash(parsed.body)};
  if(!parsed.header){if(!parsed.diagnostics.length)record.diagnostics.push(diagnostic('CANONICAL_HEADER_REQUIRED',record.file));return attachGaps(record);}
  if(parsed.header.kind==='conversation-redirect') {
   // Header codec owns syntax. Redirects have their own deliberately minimal schema.
   record.diagnostics=[];
   const h=parsed.header;
   if(h.schema_version!==1||Object.keys(h).sort().join(',')!=='kind,schema_version,to'||typeof h.to!=='string'||!h.to||parsed.body.length!==0)record.diagnostics.push(diagnostic('INVALID_REDIRECT',record.file));
   return attachGaps(record);
  }
  record.id=typeof parsed.header.id==='string'?parsed.header.id:null;
  record.diagnostics=validateConversation(parsed.header,(layout==='canonical'||layout===undefined&&basename(file)==='transcript.md')?{folderId:basename(dirname(file))}:{});
  if(blocks(record.diagnostics))return attachGaps(record);
 } else record=normalizeLegacy(bytes,{file});
 if(record.header) {
  const prefix=bytes.subarray(0,bytes.length-record.body.length);
  const startLine=1+prefix.reduce((n,b)=>n+(b===10?1:0),0);
  record.sections=sectionsFor(record,startLine);
  record.turns=turnsFor(record);
  if(record.header.sources.length===0&&!record.diagnostics.some(d=>d.code==='SOURCE_UNKNOWN'))record.diagnostics.push(diagnostic('SOURCE_UNKNOWN',record.file,'sources'));
  if(record.header.participants.length===0)record.diagnostics.push(diagnostic('PARTICIPANTS_UNKNOWN',record.file,'participants'));
 }
 return attachGaps(record);
}
const inside=(root,file)=>{const rel=relative(resolve(root),resolve(file));return rel===''||(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep));};
function safeRedirectTarget(root,to) {
 if(isAbsolute(to)||to.includes('\\')||to.includes('\0')||to.split('/').some(p=>!p||p==='.'||p==='..'))return null;
 const target=resolve(root,to);if(!inside(root,target))return null;
 // Check existing ancestors too, so a missing leaf below an escaping symlink still refuses.
 let ancestor=target;
 while(true){try{if(!inside(realpathSync(root),realpathSync(ancestor)))return null;break;}catch(e){if(e.code!=='ENOENT'&&e.code!=='ENOTDIR')throw e;const parent=dirname(ancestor);if(parent===ancestor)throw e;ancestor=parent;}}
 return target;
}
export function readConversation(file,{read=readFileSync,root,layout}={}) {
 let current=resolve(file),hops=0;const seen=new Set();
 while(true) {
  if(seen.has(current)){const r=emptyRecord(current);r.diagnostics=[diagnostic('REDIRECT_LOOP',current)];return r;}seen.add(current);
  let record;
  try {
   // Layout is evidence from the caller or the explicit mapped root, never a guessed binding.
   let currentLayout=hops===0?layout:undefined;
   if(currentLayout===undefined&&root) {
    const classified=classifyConversationPath(relative(paths(root).transcripts,current).split(sep).join('/'));
    if(classified!=='excluded')currentLayout=classified;
   }
   record=parseConversation(read(current),{file:current,layout:currentLayout});
  }catch(e){record=emptyRecord(current);record.diagnostics=[diagnostic(e.code==='ENOENT'?'NOT_FOUND':'READ_INCOMPLETE',current)];return record;}
  if(record.header?.kind!=='conversation-redirect') {
   if(hops>0&&(record.layout!=='canonical'||basename(current)!=='transcript.md'))record.diagnostics.push(diagnostic('REDIRECT_TARGET_INVALID',current));
   return record;
  }
  if(record.diagnostics.length)return record;
  if(!root){record.diagnostics.push(diagnostic('REDIRECT_WORKSPACE_REQUIRED',current));return record;}
  if(hops++>=8){record.diagnostics.push(diagnostic('REDIRECT_HOP_LIMIT',current));return record;}
  let target;try{target=safeRedirectTarget(root,record.header.to);}catch{record.diagnostics.push(diagnostic('READ_INCOMPLETE',current));return record;}
  if(!inside(root,current)||!target){record.diagnostics.push(diagnostic('REDIRECT_OUTSIDE_WORKSPACE',current));return record;}
  current=target;
 }
}
export function listConversationDirectory(transcriptsDir) {
 if(typeof transcriptsDir!=='string'||!transcriptsDir)throw new TypeError('explicit transcript directory required');
 const root=resolve(transcriptsDir),records=[],diagnostics=[];
 function visit(dir,rel='') {
  let entries;try{const stat=lstatSync(dir);if(stat.isSymbolicLink()){diagnostics.push(diagnostic('SYMLINK_EXCLUDED',dir));return;}entries=readdirSync(dir).sort();}catch{diagnostics.push(diagnostic('READ_INCOMPLETE',dir));return;}
  for(const name of entries) {
   const file=join(dir,name),p=rel?`${rel}/${name}`:name;let stat;
   try{stat=lstatSync(file);}catch{diagnostics.push(diagnostic('READ_INCOMPLETE',file));continue;}
   if(stat.isSymbolicLink()){diagnostics.push(diagnostic('SYMLINK_EXCLUDED',file));continue;}
   if(p.split('/').some(excludedPart)||name==='annotations.md'||name==='README.md')continue;
   if(stat.isDirectory()){visit(file,p);continue;}
   const layout=classifyConversationPath(p);
   if(stat.isFile()&&layout!=='excluded') {
    let record;try{record=parseConversation(readFileSync(file),{file,layout});}catch{diagnostics.push(diagnostic('READ_INCOMPLETE',file));continue;}
    if(record.header?.kind==='conversation-redirect'){diagnostics.push(...record.diagnostics);continue;}
    record.relativePath=p;records.push(record);diagnostics.push(...record.diagnostics);
   }else if(/\.md$/.test(name))diagnostics.push(diagnostic('UNCLASSIFIED_MARKDOWN',file));
  }
 }
 visit(root);diagnostics.push(...indexConversations(records).diagnostics);return {records,diagnostics};
}
export function listConversations(root) {
 if(typeof root!=='string'||!root)throw new TypeError('explicit workspace root required');
 try{return listConversationDirectory(paths(root).transcripts);}catch{return {records:[],diagnostics:[diagnostic('READ_INCOMPLETE',resolve(root))]};}
}
const aliasesOf=record=>Array.isArray(record.header?.aliases)?record.header.aliases.filter(a=>a&&typeof a.value==='string'):[];
const addIndex=(map,key,record)=>{const values=map.get(key)??[];if(!values.includes(record))values.push(record);map.set(key,values);};
function conversationIndex(records) {
 const byId=new Map(),byAlias=new Map(),folded=new Map(),diagnostics=[],collisions=new Map();
 const collision=(values,code,field)=>{
  if(values.length<2)return;
  for(const record of values) {
   diagnostics.push(diagnostic(code,record.file,field));
   const peers=collisions.get(record)??new Set();
   for(const peer of values)peers.add(peer);
   collisions.set(record,peers);
  }
 };
 for(const record of records) {
  if(typeof record.id==='string'){addIndex(byId,record.id,record);addIndex(folded,foldId(record.id),record);}
  for(const a of aliasesOf(record))if(typeof a.value==='string')addIndex(byAlias,a.kind==='source-id'?`${a.namespace}:${a.value}`:a.value,record);
 }
 for(const values of folded.values())collision(values,'ID_COLLISION','id');
 for(const [key,values] of byAlias){const candidates=[...new Set([...values,...(byId.get(key)??[])])];collision(candidates,'AMBIGUOUS_ALIAS','aliases');}
 const portable=new Map([...folded].map(([key,values])=>[key,[...values]]));
 for(const record of records)for(const a of aliasesOf(record))if(a.kind==='record-id'&&typeof a.value==='string')addIndex(portable,foldId(a.value),record);
 for(const values of portable.values())if(values.some(r=>aliasesOf(r).some(a=>a.kind==='record-id')))collision(values,'AMBIGUOUS_ALIAS','aliases');
 return {byId,byAlias,diagnostics,collisions};
}
export function indexConversations(records) {
 const {byId,byAlias,diagnostics}=conversationIndex(records);return {byId,byAlias,diagnostics};
}
export function resolveConversation(records,idOrAlias,{root}={}) {
 const {byId,byAlias,diagnostics,collisions}=conversationIndex(records),candidates=new Set([...(byId.get(idOrAlias)??[]),...(byAlias.get(idOrAlias)??[])]);
 // Bare vendor-id queries are compatibility lookups, never a preference between namespaces.
 for(const r of records)if(aliasesOf(r).some(a=>a.kind==='source-id'&&a.value===idOrAlias))candidates.add(r);
 const select=candidates=>{
  // Follow the selected records' collision memberships, not the spelling of this query.
  // Set iteration includes newly reached peers, retaining transitive conflicts too.
  for(const candidate of candidates)for(const peer of collisions.get(candidate)??[])candidates.add(peer);
  if(candidates.size>1) {
   const files=new Set([...candidates].map(r=>r.file));
   const blocking=diagnostics.filter(d=>files.has(d.path));
   return {record:null,diagnostics:[...blocking,...[...candidates].map(r=>diagnostic('AMBIGUOUS_ALIAS',r.file,'aliases'))]};
  }
  const record=[...candidates][0];return {record,diagnostics:record.diagnostics};
 };
 if(candidates.size)return select(candidates);
 if(root&&idOrAlias.endsWith('.md')) {
  let target;try{target=safeRedirectTarget(root,idOrAlias);}catch{return {record:null,diagnostics:[diagnostic('READ_INCOMPLETE')]};}
  if(!target)return {record:null,diagnostics:[diagnostic('REDIRECT_OUTSIDE_WORKSPACE')]};
  const record=readConversation(target,{root});
  const indexed=records.filter(r=>r.file===record.file);
  if(indexed.length){const selected=select(new Set(indexed));if(!selected.record)return selected;}
  return {record:record.header?.kind==='conversation'?record:null,diagnostics:record.diagnostics};
 }
 return {record:null,diagnostics:[diagnostic('NOT_FOUND')]};
}
export function conversationSourceRefs(record) {
 if(record.header?.schema_version!==1||record.header.kind!=='conversation'||!Array.isArray(record.header.sources)||blocks(validateConversation(record.header)))return [];
 return record.header.sources.flatMap(c=>(Array.isArray(c.locators)&&c.locators.length?c.locators:[null]).flatMap(l=>(Array.isArray(c.roles)?c.roles:[]).map(role=>({capture:c.id,type:c.type,service:c.service,recordingId:c.recording_id,vendorId:c.vendor_id,role,path:l?.path??null,url:l?.url??null,serviceId:l?.service_id??null,availability:c.availability}))));
}
export const conversationSections=record=>record.sections;
export const conversationTurns=record=>record.turns;

const sharingDecision=(effectiveScope,reason,allowed=false)=>({allowed,effectiveScope,reason});
// Retained restrictions are authoritative after relocation too. Do not reinterpret old
// permissive-looking values, or let a new scope choice erase an unresolved old restriction.
function retainedSharingRestriction(record) {
 const keys=['private','sensitivity','keep','scope','sharing'];
 if(record.diagnostics?.some(d=>d.code==='RESTRICTION_UNRESOLVED')||record.header?.legacy?.unparsed_keys?.some(k=>keys.includes(k)))return 'RESTRICTION_UNRESOLVED';
 let home=false;
 for(const fields of [record.legacyFields,record.header?.legacy?.fields])if(fields)for(const key of keys) {
  if(!Object.hasOwn(fields,key))continue;
  const value=fields[key];
  if(key==='private'&&(value===true||value==='true')||key==='sensitivity'&&['private','confidential','restricted'].includes(value))home=true;
  else if(!(key==='private'&&(value===false||value==='false')))return 'RESTRICTION_UNRESOLVED';
 }
 return home?'SHARING_HOME':null;
}

/** Report the stored boundary only; neither audience nor this result authorizes delivery. */
export function effectiveSharing(record) {
 if(!record||typeof record!=='object')return sharingDecision('home','INVALID_SCHEMA');
 const restriction=retainedSharingRestriction(record);
 if(restriction==='RESTRICTION_UNRESOLVED')return sharingDecision('home',restriction);
 if(blocks(validateConversation(record.header))||blocks(record.diagnostics))return sharingDecision('home','INVALID_SCHEMA');
 if(restriction)return sharingDecision('home',restriction);
 const scope=record.header.keep.scope;
 if(scope==='unknown')return sharingDecision('home','SHARING_UNKNOWN');
 if(scope==='home')return sharingDecision('home','SHARING_HOME');
 return sharingDecision(scope,'DELIVERY_TARGET_REQUIRED');
}

/** Pure boundary gate. Inject fresh group facts; outbound session authorization is separate. */
export function canProjectConversation(record,target,context={}) {
 const boundary=effectiveSharing(record);
 if(boundary.effectiveScope==='home')return boundary;
 const h=record.header,scope=boundary.effectiveScope;
 // Reuse the scoped schema for Evidence and group-path shape, without another parser.
 const checkKeep=keep=>blocks(validateConversation({...h,keep}));
 if(context?.decision!==undefined&&(context.decision===null||checkKeep({scope:'home',group:null,decision:context.decision})))return sharingDecision('home','INVALID_CONTEXT_DECISION');
 if(!target||!['public','group'].includes(target.kind))return sharingDecision(scope,'INVALID_PROJECTION_TARGET');
 if(target.kind==='group'&&(typeof target.group!=='string'||checkKeep({scope:'home',group:target.group,decision:null})))return sharingDecision(scope,'INVALID_PROJECTION_TARGET');
 if(scope==='family'&&(target.kind!=='group'||target.group!==h.keep.group))return sharingDecision(scope,'GROUP_MISMATCH');
 if(target.kind==='group') {
  let group;
  try {group=typeof context?.resolveGroup==='function'?context.resolveGroup(target.group):null;}catch{return sharingDecision('home','GROUP_UNRESOLVED');}
  if(!group||group.exists!==true||group.authorized!==true)return sharingDecision('home','GROUP_UNRESOLVED');
 }
 return sharingDecision(scope,'SHARING_ALLOWED',true);
}

export function conversationCount(root) {
 const {records,diagnostics}=listConversations(root);
 const blocking=blockingDiagnostics(diagnostics);
 if(blocking.length)throw Object.assign(new Error('Conversation count is unavailable because discovery is incomplete or conflicting.'),{code:blocking[0].code,diagnostics:blocking});
 return records.length;
}
