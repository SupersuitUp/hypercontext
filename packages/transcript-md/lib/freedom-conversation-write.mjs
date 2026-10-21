// Guarded synchronous mutations. Exact entry bytes and full protection pre/postimages are
// durable before the first replacement; per-file atomicity is never called a transaction.
import {readFileSync,readdirSync,lstatSync,realpathSync,existsSync,mkdirSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync,unlinkSync,rmdirSync,chmodSync,constants} from 'node:fs';
import {resolve,relative,join,dirname,basename,isAbsolute,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {enclosingWorkspace,paths} from './freedom-workspace.mjs';
import {peopleDir,recordPath} from './freedom-people.mjs';
import {workspaceFile} from './freedom-self.mjs';
import {parseConversationHeader,serializeConversationHeader,validateConversation,blockingDiagnostics,withStandard,stampPlan,standardFinding,STANDARD} from './frontmatter/conversation.mjs';
import {readConversation,parseConversation,listConversationDirectory,indexConversations,canProjectConversation} from './freedom-conversations.mjs';
import {resolveCitation} from './freedom-conversation-citations.mjs';
import {conversationIdCollisionKey} from './freedom-conversation-casefold.mjs';
import {withConversationLock,conversationLockContext} from './freedom-conversation-lock.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
const sha=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const token=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{8,128}$/.test(s);
const text=s=>typeof s==='string'&&!!s.trim();
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const clone=v=>structuredClone(v);
const stable=v=>JSON.stringify(normalize(v));
function normalize(v){return Array.isArray(v)?v.map(normalize):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])):v;}
const equal=(a,b)=>stable(a)===stable(b);
const refuse=(code,extra={})=>{throw Object.assign(new Error(`${code}: Conversation mutation refused.`),{code,...extra});};
// A pre-image that predates `standard` is still a valid input; every writer stamps its output,
// and transaction() refuses to emit a record that does not name its standard.
const errors=blockingDiagnostics;
const inside=(root,path)=>{const r=relative(root,path);return !isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep);};
const relPath=s=>text(s)&&!isAbsolute(s)&&!/[\\\x00-\x1f\x7f]/.test(s)&&!s.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.'));
const fileBytes=path=>{try{const s=lstatSync(path);if(s.isSymbolicLink())refuse('SYMLINK_REFUSED');if(!s.isFile())refuse('FILE_REQUIRED');return readFileSync(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const digest=b=>b===null?null:hash(b);
function noLinks(root,path){
 if(!inside(root,path))refuse('TARGET_MISMATCH');
 let current=root;
 for(const part of ['',...relative(root,path).split(sep).filter(Boolean)]){
  if(part)current=join(current,part);
  try{if(lstatSync(current).isSymbolicLink())refuse('SYMLINK_REFUSED');}catch(e){if(e.code!=='ENOENT')throw e;}
 }
}
function anchor(path){let p=resolve(path);while(!existsSync(p)){const parent=dirname(p);if(parent===p)refuse('TARGET_MISMATCH');p=parent;}return realpathSync(p);}
function contextForFile(file,root){
 if(typeof file!=='string'||!file)refuse('TARGET_MISMATCH');
 const target=resolve(file),workspace=root??enclosingWorkspace(dirname(target));
 if(!workspace)refuse('WORKSPACE_REQUIRED');
 const c=conversationLockContext(workspace),rel=relative(c.transcripts,target).split(sep).join('/');
 if(!/^[^/]+\/transcript\.md$/.test(rel)||!inside(c.transcripts,target))refuse('TARGET_MISMATCH');
 noLinks(anchor(c.transcripts),c.transcripts);noLinks(c.transcripts,target);
 return {...c,file:target,folder:dirname(target)};
}
function recheckContext(c){
 const now=contextForFile(c.file,c.root);
 if(now.transcripts!==c.transcripts||now.gitCommonDir!==c.gitCommonDir||now.root!==c.root)refuse('TARGET_MISMATCH');
}
function validRecord(bytes,file,newRecord=false,allowLegacy=false){
 const record=parseConversation(bytes,{file,layout:'canonical'});
 const bad=errors([...record.diagnostics,...validateConversation(record.header,{folderId:basename(dirname(file)),newRecord})]);
 if(bad.length)refuse(bad[0].code,{diagnostics:bad.map(d=>({...d,path:null}))});
 if(record.header.kind!=='conversation'||!allowLegacy&&record.header.body_format!=='turns-v1')refuse('CANONICAL_TURNS_REQUIRED');
 return record;
}
// Validate only newly asserted identities. Historical pointers are preserved even
// when their record is later unavailable; existence never upgrades identity status.
function proveParticipants(c,h,before=null){
 for(const [i,p] of h.participants.entries()){
  const prior=before?.participants.find(old=>old.id===p.id);
  if(p.person===null||prior?.person===p.person&&(p.status!=='confirmed'||prior.status==='confirmed'))continue;
  try{
   const path=p.person==='self'?workspaceFile(c.root,'self.md'):recordPath(peopleDir(c.root),p.person);
   if(path===null||fileBytes(path)===null)throw new Error('unavailable');
  }catch{refuse('PERSON_REFERENCE_UNRESOLVED',{diagnostics:[{code:'PERSON_REFERENCE_UNRESOLVED',severity:'error',path:null,field:`participants[${i}].person`,message:'New participant reference requires an existing readable record in the referring workspace.'}]});}
 }
}
function evidenceValid(e,h){
 const bad=errors(validateConversation({...h,keep:{scope:'home',group:null,decision:e}}));
 if(!object(e)||bad.length||!text(e.note)||/[\r\n]/.test(e.note))refuse('REVISION_SPEC_INVALID');
}
function evidences(entries,h){if(!Array.isArray(entries)||!entries.length)refuse('REVISION_SPEC_INVALID');entries.forEach(e=>evidenceValid(e,h));}
function validLog(log,h){
 if(!exact(log,['date','text','evidence'])||!text(log.text)||/[\r\n]/.test(log.text))refuse('REVISION_SPEC_INVALID');
 const d=errors(validateConversation({...h,as_of:log.date}));if(d.length||!text(log.date))refuse('REVISION_SPEC_INVALID');evidences(log.evidence,h);
}
function sectionRange(record,name){
 const section=record.sections.find(s=>s.name===name);if(!section)refuse('CANONICAL_SECTIONS_INVALID');
 const start=section.bytes.byteOffset-record.body.byteOffset;
 return {start,end:start+section.bytes.length,bytes:section.bytes};
}
// Creation inserts only derived completeness facts; supplied speech/prose stay exact.
function renderGaps(record){
 const gaps=[...new Set(record.gaps.map(d=>d.code+(d.field?': '+d.field:'')))].sort();
 if(!gaps.length)return record.body;
 let body=record.body;
 for(const name of ['Now','Open questions']){
  const current=parseConversation(serializeConversationHeader(record.header,body),{file:record.file});
  const section=sectionRange(current,name).bytes;
  const addition=Buffer.from('\n<!-- conversation-gaps -->\n'+gaps.map(g=>'- '+(name==='Open questions'?'Resolve ':'')+g).join('\n')+'\n');
  body=replaceSection(current,name,Buffer.concat([section,addition]));
 }
 return body;
}
function replaceSection(record,name,bytes){const r=sectionRange(record,name);return Buffer.concat([record.body.subarray(0,r.start),bytes,record.body.subarray(r.end)]);}
function appendLog(record,line){const s=sectionRange(record,'Log').bytes;const prefix=s.length&&s.at(-1)!==10?Buffer.from('\n'):Buffer.alloc(0);return replaceSection(record,'Log',Buffer.concat([s,prefix,Buffer.from(line+'\n')]));}
const logLine=(id,log,ids,review,state)=>`- ${log.date} - revision ${id}: ${log.text} <!-- revision ${stable({revision_id:id,evidence:log.evidence,turn_ids:ids,prior_review:review,protected_turn_ids:state.protected_turns.map(p=>p.turn_id).sort()})} -->`;
const inputTurn=t=>({id:t.id,speaker:t.speaker,sources:clone(t.sources),timing:clone(t.timing),source_gap:t.source_gap,text:t.text.toString('utf8')});
function renderTranscript(record,turns){
 const original=sectionRange(record,'Transcript').bytes,first=record.turns[0];let prefix=original;
 if(first){const marker=Buffer.from(`### ${first.id}`);const i=original.indexOf(marker);prefix=original.subarray(0,i);}
 const parts=[prefix];
 for(const t of turns){
  if(!exact(t,['id','speaker','sources','timing','source_gap','text'])||!/^t-\d{6,}$/.test(t.id)||typeof t.text!=='string')refuse('REVISION_SPEC_INVALID');
  const meta={speaker:t.speaker,sources:t.sources,timing:t.timing,source_gap:t.source_gap};
  parts.push(Buffer.from(`### ${t.id}\n<!-- turn ${JSON.stringify(meta)} -->\n`),Buffer.from(t.text));
  // A boundary needs a line separator; do not silently add bytes to utterance text.
  if(t.text.length&&!t.text.endsWith('\n'))refuse('TURN_TEXT_BOUNDARY_INVALID');
 }
 return replaceSection(record,'Transcript',Buffer.concat(parts));
}
function retitleBody(record,h,body){
 if(h.title===record.header.title)return body;
 // Section offsets belong to this body, including any same-spec turn changes.
 const current=validRecord(serializeConversationHeader({...h,title:record.header.title},body),record.file);
 const title=current.sections.find(s=>s.kind==='other'&&s.name===record.header.title&&/^ {0,3}#[ \t]+/.test(s.bytes.toString('utf8')));
 if(!title)return body;
 const line=/^([ ]{0,3}#[ \t]+)(.+?)([ \t]+#+)?([ \t]*)(\r?\n|$)/.exec(title.bytes.toString('utf8'));
 if(!line)refuse('TITLE_MISMATCH');
 const offset=title.bytes.byteOffset-current.body.byteOffset;
 const replacement=Buffer.from(line[1]+h.title+(line[3]??'')+line[4]+line[5]);
 return Buffer.concat([body.subarray(0,offset),replacement,body.subarray(offset+Buffer.byteLength(line[0]))]);
}
function semantic(record,t){
 const participant=t.speaker===null?null:record.header.participants.find(p=>p.id===t.speaker)??null;
 const sources=t.sources.map(ref=>{const c=record.header.sources.find(c=>c.id===ref.capture);return {ref,capture:c?{id:c.id,type:c.type,service:c.service,recording_id:c.recording_id,vendor_id:c.vendor_id}:null,locator:ref.locator===null?null:c?.locators[ref.locator]??null};});
 return hash(Buffer.from(stable({turn_id:t.id,text_base64:Buffer.isBuffer(t.text)?t.text.toString('base64'):Buffer.from(t.text).toString('base64'),speaker:t.speaker,participant,sources,timing:t.timing,source_gap:t.source_gap})));
}
function protection(record,c){
 const existing=record.header.extensions.conversation_revision;
 const state=existing?clone(existing):{next_turn_number:Math.max(0,...record.turns.map(t=>Number(t.id.slice(2))))+1,retired_turn_ids:[],protected_turns:[]};
 if(!Number.isSafeInteger(state.next_turn_number)||record.turns.some(t=>Number(t.id.slice(2))>=state.next_turn_number||state.retired_turn_ids.includes(t.id)))refuse('TURN_ALLOCATION_INVALID');
 if(record.header.body_format==='legacy'&&['transcription','attribution'].some(d=>record.header.review[d]==='human-reviewed'))refuse('REVIEW_PROTECTION_UNRESOLVED');
 for(const p of state.protected_turns){const turn=record.turns.find(t=>t.id===p.turn_id);if(p.retired?!!turn||!state.retired_turn_ids.includes(p.turn_id):!turn||semantic(record,turn)!==p.baseline_sha256)refuse('REVIEW_BASELINE_MISMATCH');}
 const dimensions=['transcription','attribution'].filter(d=>record.header.review[d]==='human-reviewed');
 if(dimensions.length){
  const evidence=record.header.review.evidence.filter(e=>e.kind==='operator-decision');if(!evidence.length)refuse('REVIEW_PROTECTION_UNRESOLVED');
  for(const t of record.turns)if(!state.protected_turns.some(p=>p.turn_id===t.id)){
   const baseline=semantic(record,t);
   state.protected_turns.push({turn_id:t.id,baseline_sha256:baseline,reviewed_versions:[{turn_id:t.id,entry_revision:{kind:'sha256',value:record.fileSha256},entry_path:relative(c.transcripts,c.file).split(sep).join('/'),snapshot_sha256:baseline,dimensions,evidence:clone(evidence)}],authorized_changes:[],retired:false});
  }
 }
 return state;
}
function captureIdentity(c){
 if(c.type==='cloud_recording')return stable([c.type,c.service,c.recording_id]);
 if(c.type&&c.vendor_id)return stable([c.type,c.vendor_id]);
 const l=c.locators?.[0];return c.type&&l?stable([c.type,{kind:l.kind,path:l.path,url:l.url,service_id:l.service_id}]):null;
}
function noCaptureCollisions(c,h){
 const listed=listConversationDirectory(c.transcripts);if(errors(listed.diagnostics).length)refuse('READ_INCOMPLETE');
 for(const record of listed.records){
  if(record.file===c.file)continue;
  const ids=[record.id,...record.header.aliases.filter(a=>a.kind==='record-id').map(a=>a.value)];
  if(ids.some(id=>conversationIdCollisionKey(id)===conversationIdCollisionKey(h.id)))refuse('ID_COLLISION');
  for(const capture of h.sources){const key=captureIdentity(capture);const prior=record.header.sources.find(other=>key!==null&&captureIdentity(other)===key);if(prior)refuse('CAPTURE_IDENTITY_COLLISION',{existingId:record.id,captureId:prior.id});}
 }
 const aliasErrors=errors(indexConversations([...listed.records.filter(r=>r.file!==c.file),{id:h.id,file:c.file,header:h}]).diagnostics);if(aliasErrors.length)refuse(aliasErrors[0].code);
 const keys=new Map();for(const capture of h.sources){const key=captureIdentity(capture);if(key&&keys.has(key))refuse('CAPTURE_IDENTITY_COLLISION',{captureId:keys.get(key)});if(key)keys.set(key,capture.id);}
}
function assetsFor(c,h,assets){
 if(!Array.isArray(assets))refuse('ASSET_SPEC_INVALID');const out=[],seen=new Set();
 for(const asset of assets){
  if(!exact(asset,['relativePath','fromPath','sha256'])||!relPath(asset.relativePath)||!sha(asset.sha256)||!text(asset.fromPath))refuse('ASSET_SPEC_INVALID');
  const parts=asset.relativePath.split('/');if(parts.length<3||!['sources','derived'].includes(parts[0])||!h.sources.some(s=>s.id===parts[1]))refuse('ASSET_SPEC_INVALID');
  const to=resolve(c.folder,asset.relativePath);noLinks(c.folder,to);
  const from=resolve(asset.fromPath);noLinks(realpathSync(dirname(from)),from);const bytes=fileBytes(from);
  if(bytes===null||hash(bytes)!==asset.sha256)refuse('ASSET_HASH_MISMATCH');
  if(seen.has(to))refuse('ASSET_PATH_COLLISION');seen.add(to);
  const before=fileBytes(to);if(before!==null&&!before.equals(bytes))refuse('ASSET_PATH_COLLISION');
  out.push({path:to,bytes,from,sha256:asset.sha256});
 }
 for(const cap of h.sources)for(const locator of cap.locators)if(locator.kind==='bundled'){
  if(!relPath(locator.path))refuse('ASSET_SPEC_INVALID');const to=resolve(c.folder,locator.path);noLinks(c.folder,to);
  const supplied=out.find(a=>a.path===to),bytes=supplied?.bytes??fileBytes(to);
  if(bytes===null)refuse('BUNDLED_ASSET_MISSING');
  if(locator.sha256!==null&&hash(bytes)!==locator.sha256||locator.bytes!==null&&bytes.length!==locator.bytes)refuse('ASSET_HASH_MISMATCH');
 }
 return out;
}
function backupProof(c,h,before,options){
 const proof=[];
 for(const cap of h.sources)for(const l of cap.locators)if(l.backup.status==='verified-owned'){
  const prior=before?.header.sources.find(p=>p.id===cap.id)?.locators.find(old=>equal(old,l));if(prior)continue;
  const b=l.backup;let fact;
  try{fact=options.verifyOwnedBackup?.({locator:b.locator,sha256:b.sha256,verified_at:b.verified_at});}catch{refuse('BACKUP_UNPROVEN');}
  if(!exact(fact,['owned','evidence'])||fact.owned!==true||!['operator-decision','machine-check'].includes(fact.evidence?.kind))refuse('BACKUP_UNPROVEN');
  try{evidenceValid(fact.evidence,h);}catch{refuse('BACKUP_UNPROVEN');}
  if(!isAbsolute(b.locator)||l.kind==='service')refuse('BACKUP_UNPROVEN');
  if(l.kind==='external-local'&&!isAbsolute(l.path))refuse('BACKUP_UNPROVEN');
  const bundled=l.kind==='bundled'?options.assets.find(a=>a.path===resolve(c.folder,l.path)):null;
  const originalPath=l.kind==='bundled'?bundled?.from??resolve(c.folder,l.path):l.path;
  let original;try{noLinks(realpathSync(dirname(originalPath)),originalPath);original=fileBytes(originalPath);}catch{refuse('BACKUP_UNPROVEN');}
  let backup;try{noLinks(realpathSync(dirname(b.locator)),b.locator);backup=fileBytes(b.locator);}catch{refuse('BACKUP_UNPROVEN');}
  if(original===null||backup===null||hash(original)!==b.sha256||hash(backup)!==b.sha256)refuse('BACKUP_UNPROVEN');
  const originalStat=lstatSync(originalPath),backupStat=lstatSync(b.locator);
  if(originalStat.dev===backupStat.dev&&originalStat.ino===backupStat.ino)refuse('BACKUP_UNPROVEN');
  proof.push({original_path:originalPath,locator:b.locator,sha256:b.sha256,verified_at:b.verified_at,evidence:clone(fact.evidence)});
 }
 return proof;
}
function syncDir(dir){const fd=openSync(dir,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
function mkdirPinned(c,path){
 noLinks(anchor(path),path);const missing=[];let at=path;while(!existsSync(at)){missing.push(at);at=dirname(at);}
 for(const dir of missing.reverse()){mkdirSync(dir);syncDir(dirname(dir));c?.createdDirectories.push(dir);}
}
function atomic(path,bytes,mode=0o600,expected=undefined){
 const tmp=join(dirname(path),`.conversation-${randomUUID()}.tmp`);let fd;
 try{fd=openSync(tmp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,mode);writeFileSync(fd,bytes);fsyncSync(fd);closeSync(fd);fd=undefined;
  if(hash(readFileSync(tmp))!==hash(bytes))refuse('ASSET_HASH_MISMATCH');if(expected!==undefined&&digest(fileBytes(path))!==expected)refuse('RECOVERY_THIRD_STATE');renameSync(tmp,path);syncDir(dirname(path));
 }finally{if(fd!==undefined)closeSync(fd);try{unlinkSync(tmp);}catch(e){if(e.code!=='ENOENT')throw e;}}
}
function journalPath(c,id){return join(c.journalDir,hash(c.gitCommonDir??c.transcripts)+'-'+id+'.json');}
const journalDigest=j=>hash(Buffer.from(stable({api_version:j.api_version,sequence:j.sequence,revision_id:j.revision_id,kind:j.kind,root:j.root,transcripts:j.transcripts,git_common_dir:j.git_common_dir,file:j.file,spec:j.spec,spec_sha256:j.spec_sha256,operations:j.operations,source_pins:j.source_pins,snapshots:j.snapshots,protection_before:j.protection_before,protection_after:j.protection_after,reviewed_input_base64:j.reviewed_input_base64,created_directories:j.planned_directories,backup_proofs:j.backup_proofs,turn_ids:j.turn_ids,review_before:j.review_before,review_after:j.review_after,appended_log:j.appended_log})));
function saveJournal(j){atomic(j.journal_path,Buffer.from(JSON.stringify(j)+'\n'));chmodSync(j.journal_path,0o600);}
function readJournal(c,id){
 const path=journalPath(c,id),bytes=fileBytes(path);if(bytes===null)return null;let j;try{j=JSON.parse(bytes);}catch{refuse('JOURNAL_INVALID');}
 if(j.api_version!==1||j.revision_id!==id||j.journal_path!==path||j.root!==c.root||j.transcripts!==c.transcripts||j.git_common_dir!==c.gitCommonDir||j.file!==c.file||j.integrity_sha256!==journalDigest(j)||j.spec_sha256!==hash(Buffer.from(stable(j.spec))))refuse('JOURNAL_IDENTITY_MISMATCH');
 if(!Number.isSafeInteger(j.sequence)||j.sequence<1||!['create','annotate','revise'].includes(j.kind)||!['applying','complete','reversed'].includes(j.state)||!Array.isArray(j.operations)||!Array.isArray(j.source_pins)||!Array.isArray(j.snapshots)||!Array.isArray(j.planned_directories)||!Array.isArray(j.createdDirectories)||j.createdDirectories.some(p=>!j.planned_directories.includes(p))||j.planned_directories.some(p=>!inside(c.transcripts,p)))refuse('JOURNAL_INVALID');
 for(const op of [...j.operations,...j.snapshots]){if(!inside(c.folder,op.path)||op.path===c.folder)refuse('JOURNAL_INVALID');noLinks(c.folder,op.path);for(const which of ['before','after'])if(digest(op[which+'_base64']===null?null:Buffer.from(op[which+'_base64'],'base64'))!==op[which+'_sha256'])refuse('JOURNAL_INVALID');}
 return j;
}
function journals(c){
 if(!existsSync(c.journalDir))return [];noLinks(anchor(c.journalDir),c.journalDir);const prefix=hash(c.gitCommonDir??c.transcripts)+'-';const out=[];
 for(const name of readdirSync(c.journalDir).filter(n=>n.startsWith(prefix)&&n.endsWith('.json'))){let raw;try{raw=JSON.parse(fileBytes(join(c.journalDir,name)));}catch{refuse('JOURNAL_INVALID');}if(raw.file===c.file)out.push(readJournal(c,raw.revision_id));}
 return out;
}
function noIncomplete(c,except=null){if(journals(c).some(j=>j.revision_id!==except&&j.state==='applying'))refuse('REVISION_INCOMPLETE');}
const turnIdSet=ids=>Array.isArray(ids)&&ids.every(id=>typeof id==='string'&&/^t-\d{6,}$/.test(id))&&equal(ids,[...new Set(ids)].sort());
function historyReferences(record){
 const refs=[],section=record.sections.find(s=>s.name==='Log');if(!section)return refs;
 let fence=null;
 for(const line of section.bytes.toString('utf8').split(/\r?\n/)){
  if(fence){if(new RegExp(`^ {0,3}${fence.char}{${fence.length},}\\s*$`).test(line))fence=null;continue;}
  // Quoted and indented code bytes are examples, never actual Log evidence.
  if(/^(?: {0,3}>| {4}| {0,3}\t)/.test(line))continue;
  const opening=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if(opening&&!(opening[1][0]==='`'&&opening[2].includes('`'))){fence={char:opening[1][0],length:opening[1].length};continue;}
  const marker=line.indexOf('<!-- revision ');if(marker<0)continue;
  // Ordinary prose/inline-code markers are not structured revision entries.
  // Bare comments and revision-entry candidates still fail closed if malformed.
  // A dated revision label is a candidate regardless of its separator spelling.
  // Inspect only the lead before metadata; its own "revision" is not a label.
  const lead=line.slice(0,marker);
  if(!/^ {0,3}<!-- revision /.test(line)&&!/^ {0,3}(?:[-+*]|\d+[.)])[ \t]+(?:\d{4}-\d{2}-\d{2}[^`]*?revision\b|[^`]*?-[ \t]+revision\b)/.test(lead))continue;
  const entry=/^- (\d{4}-\d{2}-\d{2}) - revision ([A-Za-z0-9_-]{8,128}): (.*?) <!-- revision (\{.*\}) -->[ \t]*$/.exec(line);
  if(!entry)refuse('REVIEW_PROTECTION_UNRESOLVED');
  // The existing scoped codec rejects duplicate/prototype keys and lossy JSON.
  const decoded=parseConversationHeader(Buffer.from('---\nextensions: '+entry[4]+'\n---\n')),ref=decoded.header?.extensions;
  const keys=['revision_id','evidence','turn_ids','prior_review'];if(ref&&Object.hasOwn(ref,'protected_turn_ids'))keys.push('protected_turn_ids');
  // As in turn decoding, the syntax-only envelope omits required core fields;
  // a refused syntax decode has no header, and this object's own shape follows.
  if(!decoded.header||!exact(ref,keys)||ref.revision_id!==entry[2]||!turnIdSet(ref.turn_ids)||Object.hasOwn(ref,'protected_turn_ids')&&!turnIdSet(ref.protected_turn_ids))refuse('REVIEW_PROTECTION_UNRESOLVED');
  const log={date:entry[1],text:entry[3],evidence:ref.evidence};
  try{validLog(log,record.header);if(errors(validateConversation({...record.header,review:ref.prior_review})).length)throw new Error('invalid review');}catch{refuse('REVIEW_PROTECTION_UNRESOLVED');}
  refs.push({ref,log});
 }
 return refs;
}
function historyProtection(record,c){
 const state=record.header.extensions.conversation_revision,local=journals(c);
 const covered=id=>state?.protected_turns.some(p=>p.turn_id===id&&p.reviewed_versions.length>0);
 for(const j of local){
  const historical=j.protection_after?.protected_turns??[];
  if(j.state==='reversed')continue;
  if(historical.some(p=>!state?.protected_turns.some(now=>now.turn_id===p.turn_id&&p.reviewed_versions.every(v=>now.reviewed_versions.some(n=>equal(n,v))))))refuse('REVIEW_PROTECTION_UNRESOLVED');
 }
 for(const {ref,log} of historyReferences(record)){
  if(Object.hasOwn(ref,'protected_turn_ids')){
   if(ref.protected_turn_ids.some(id=>!covered(id)))refuse('REVIEW_PROTECTION_UNRESOLVED');
  }else if(['transcription','attribution'].some(d=>ref.prior_review[d]==='human-reviewed')){
   // Affected ids cannot prove an old complete set: require its owned exact journal.
   const owned=local.find(j=>j.state!=='reversed'&&j.revision_id===ref.revision_id&&equal(j.review_before,ref.prior_review)&&equal(j.turn_ids,ref.turn_ids)&&equal(j.spec.log,log));
   if(!owned)refuse('REVIEW_PROTECTION_UNRESOLVED');
   const entry=owned.operations.find(o=>o.path===c.file);if(!entry?.before_base64)refuse('REVIEW_PROTECTION_UNRESOLVED');
   const prior=validRecord(Buffer.from(entry.before_base64,'base64'),c.file);
   if(prior.turns.some(t=>!covered(t.id)))refuse('REVIEW_PROTECTION_UNRESOLVED');
  }
 }
}
function pinFile(path,before,after){return {path,before_base64:before===null?null:before.toString('base64'),before_sha256:digest(before),after_base64:after===null?null:after.toString('base64'),after_sha256:digest(after),mode:existsSync(path)?lstatSync(path).mode&0o777:0o600};}
function sidecars(c){
 const out=[];const visit=dir=>{if(!existsSync(dir))return;noLinks(c.folder,dir);for(const name of readdirSync(dir)){const path=join(dir,name);noLinks(c.folder,path);if(lstatSync(path).isDirectory())visit(path);else out.push(path);}};
 const ann=join(c.folder,'annotations.md');if(existsSync(ann))out.push(ann);visit(join(c.folder,'derived'));visit(join(c.folder,'sources'));return out;
}
function pinSources(j){for(const pin of j.source_pins){noLinks(realpathSync(dirname(pin.path)),pin.path);const bytes=fileBytes(pin.path);if(digest(bytes)!==pin.sha256)refuse('ASSET_HASH_MISMATCH');}}
function checkStates(c,j){
 recheckContext(c);for(const op of [...j.operations,...j.snapshots]){noLinks(c.folder,op.path);const d=digest(fileBytes(op.path));if(d!==op.before_sha256&&d!==op.after_sha256)refuse('RECOVERY_THIRD_STATE');}
 pinSources(j);
}
function result(j,changed,recovered=null){const entry=j.operations.find(o=>o.path===j.file);return {path:j.file,revision_id:j.revision_id,changed,before_sha256:entry.before_sha256??hash(Buffer.alloc(0)),after_sha256:recovered==='reverse'?(entry.before_sha256??hash(Buffer.alloc(0))):entry.after_sha256,turn_ids:j.turn_ids,journal_path:j.journal_path,recovered};}
function runJournal(c,j,action,afterOperation){
 checkStates(c,j);const ops=action==='reverse'?[...j.operations].reverse():j.operations;
 for(const op of ops){
  checkStates(c,j);noLinks(c.folder,op.path);const d=digest(fileBytes(op.path));if(d!==op.before_sha256&&d!==op.after_sha256)refuse('RECOVERY_THIRD_STATE');
  const which=action==='reverse'?'before':'after';if(d===op[which+'_sha256'])continue;
  const bytes=op[which+'_base64']===null?null:Buffer.from(op[which+'_base64'],'base64');
  if(bytes===null){unlinkSync(op.path);syncDir(dirname(op.path));}else{mkdirPinned(j,dirname(op.path));atomic(op.path,bytes,op.mode,d);}
  j.completed++;saveJournal(j);afterOperation?.(clone(op),clone(j));
 }
 for(const op of [...j.operations,...j.snapshots])if(digest(fileBytes(op.path))!==op[(action==='reverse'?'before':'after')+'_sha256'])refuse('RECOVERY_THIRD_STATE');
 if(action==='reverse')for(const dir of [...j.planned_directories].sort((a,b)=>b.length-a.length)){try{rmdirSync(dir);}catch(e){if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(e.code))throw e;}}
 j.state=action==='reverse'?'reversed':'complete';saveJournal(j);return result(j,true,action);
}
function transaction(c,{id,kind,spec,before,after,writes=[],assets=[],protectionBefore=null,protectionAfter=null,reviewedInput=null,turnIds=[],line=null,proof=[]},afterOperation){
 if(before===null||!before.equals(after)){const h=parseConversationHeader(after).header,finding=h?standardFinding(h.standard):{code:'self-doc:missing'};if(finding)refuse(finding.code);}
 recheckContext(c);noIncomplete(c);const priorJournals=journals(c);const existing=readJournal(c,id);if(existing)refuse('REVISION_ID_COLLISION');
 const operations=[...writes.map(w=>pinFile(w.path,fileBytes(w.path),w.bytes)),pinFile(c.file,before,after)].filter((o,i,a)=>a.findIndex(p=>p.path===o.path)===i);
 const changedPaths=new Set(operations.map(o=>o.path));
 const snapshots=sidecars(c).filter(path=>!changedPaths.has(path)).map(path=>{const b=fileBytes(path);return pinFile(path,b,b);});
 const sequence=Math.max(0,...priorJournals.map(j=>j.sequence))+1;
 const plannedDirectories=new Set();for(const op of operations){let at=dirname(op.path);while(!existsSync(at)){plannedDirectories.add(at);at=dirname(at);}}
 const sourcePins=[...assets.map(a=>({path:a.from,sha256:a.sha256})),...proof.flatMap(p=>[{path:p.original_path,sha256:p.sha256},{path:p.locator,sha256:p.sha256}])];
 const j={api_version:1,sequence,planned_directories:[...plannedDirectories],revision_id:id,kind,root:c.root,transcripts:c.transcripts,git_common_dir:c.gitCommonDir,lock_scope:c.scope,file:c.file,spec:clone(spec),spec_sha256:hash(Buffer.from(stable(spec))),operations,source_pins:sourcePins,snapshots,protection_before:clone(protectionBefore),protection_after:clone(protectionAfter),reviewed_input_base64:reviewedInput?.toString('base64')??null,backup_proofs:proof,turn_ids:turnIds,review_before:before===null?null:parseConversation(before,{file:c.file}).header.review,review_after:parseConversation(after,{file:c.file}).header.review,appended_log:line,state:'applying',completed:0,createdDirectories:[],journal_path:journalPath(c,id)};
 j.integrity_sha256=journalDigest(j);mkdirPinned(null,c.journalDir);saveJournal(j);
 try{if(kind==='create'){mkdirSync(c.folder);j.createdDirectories.push(c.folder);syncDir(dirname(c.folder));saveJournal(j);}
  runJournal(c,j,'resume',afterOperation);return result(j,operations.some(o=>o.before_sha256!==o.after_sha256));}
 catch(e){if(['RECOVERY_THIRD_STATE','TARGET_MISMATCH','SYMLINK_REFUSED'].includes(e.code))throw e;refuse('REVISION_INCOMPLETE',{revisionId:id,journalPath:j.journal_path});}
}
/** The parent Conversation's policy is authoritative for its entry, captures and annotations. */
export function assertConversationProjection(file,{target,resolveGroup,read}={}){
 const record=readConversation(file,read?{read}:{}),decision=canProjectConversation(record,target,{resolveGroup});
 if(!decision.allowed)refuse('PRIVACY_REFUSED',{decision});return decision;
}
export function createConversation(options){
 const {root,spec,pid,by}=options;
 if(!exact(spec,['header','body','assets','annotations'])||typeof spec.body!=='string'||spec.annotations!==null&&typeof spec.annotations!=='string')refuse('CREATE_SPEC_INVALID');
 const c0=conversationLockContext(root);const file=join(c0.transcripts,String(spec.header?.id),'transcript.md');
 let bytes=serializeConversationHeader(withStandard(spec.header),Buffer.from(spec.body));validRecord(bytes,file,true,true);
 const c=contextForFile(file,root);const pre=validRecord(bytes,file,true,true);let state=protection(pre,c);
 if(state.protected_turns.length){const h=clone(pre.header);h.extensions.conversation_revision=state;bytes=serializeConversationHeader(h,pre.body);validRecord(bytes,file,true,true);}
 if(pre.header.body_format==='turns-v1'){const h=clone(pre.header);if(state.protected_turns.length)h.extensions.conversation_revision=state;bytes=serializeConversationHeader(h,renderGaps(pre));validRecord(bytes,file,true);}
 return withConversationLock(c.root,{pid,by},()=>{
  recheckContext(c);noIncomplete(c);const current=fileBytes(file),assets=assetsFor(c,pre.header,spec.assets);
  const proof=backupProof(c,pre.header,current===null?null:validRecord(current,c.file,false,true),{...options,assets});
  if(current!==null){
   const annotation=fileBytes(join(c.folder,'annotations.md'));
   const named=new Set([c.file,...assets.map(a=>a.path),...(spec.annotations===null?[]:[join(c.folder,'annotations.md')])]);
   if(sidecars(c).some(path=>!named.has(path)))refuse('CREATE_COLLISION');
   if(!current.equals(bytes)||digest(annotation)!==digest(spec.annotations===null?null:Buffer.from(spec.annotations))||assets.some(a=>digest(fileBytes(a.path))!==hash(a.bytes)))refuse('CREATE_COLLISION');
   return {path:file,created:false,fileSha256:hash(current)};
  }
  if(existsSync(c.folder))refuse('CREATE_COLLISION');historyProtection(pre,c);proveParticipants(c,pre.header);noCaptureCollisions(c,pre.header);
  const writes=assets.map(a=>({path:a.path,bytes:a.bytes}));if(spec.annotations!==null)writes.push({path:join(c.folder,'annotations.md'),bytes:Buffer.from(spec.annotations)});
  const initialized=state.protected_turns.length>0;
  transaction(c,{id:'create-'+hash(Buffer.from(stable(spec))).slice(0,32),kind:'create',spec,before:null,after:bytes,writes,assets,protectionAfter:initialized?state:null,reviewedInput:initialized?serializeConversationHeader(pre.header,pre.body):null,proof},options.afterOperation);
  return {path:file,created:true,fileSha256:hash(bytes)};
 });
}
function defaultVersionLoader(c){return (_repository,path,revision)=>{
 if(revision.kind!=='sha256')throw new Error('unavailable');
 const bytes=fileBytes(resolve(path));if(bytes!==null&&hash(bytes)===revision.value)return bytes;
 for(const j of journals(c))for(const o of [...j.operations,...j.snapshots])if(o.path===resolve(path))for(const which of ['before','after'])if(o[which+'_sha256']===revision.value&&o[which+'_base64']!==null)return Buffer.from(o[which+'_base64'],'base64');
 for(const j of journals(c))if(j.file===resolve(path)&&j.reviewed_input_base64!==null){const b=Buffer.from(j.reviewed_input_base64,'base64');if(hash(b)===revision.value)return b;}
 throw new Error('unavailable');
 };}
/** Resolve SHA-256 history through this workspace's existing validated native journals.
 * Explicit bounds only; no locks, directory allocation, outputs or mutation. Git history is
 * unsupported by this loader and never falls back to HEAD or the current entry.
 */
export function resolveConversationCitation({file,root,citation}={}) {
 const fail=code=>({text:Buffer.alloc(0),diagnostics:[{code,severity:'error',path:null,field:null,message:'Bounded conversation citation could not be resolved.'}]});
 if(!text(root)||!text(file)||citation?.repository!==null)return fail('CITATION_BOUNDS_INVALID');
 if(typeof citation.path!=='string'||resolve(citation.path)!==resolve(file))return fail('CITATION_PATH_MISMATCH');
 if(citation.revision?.kind!=='sha256')return fail('CITATION_VERSION_UNAVAILABLE');
 let c;try{c=contextForFile(file,root);}catch(e){return fail(e.code||'CITATION_BOUNDS_INVALID');}
 const current=readConversation(c.file);
 if(errors(current.diagnostics).length||current.header?.kind!=='conversation')return fail('CITATION_RECORD_INVALID');
 if(current.id!==citation.record_id)return fail('CITATION_RECORD_MISMATCH');
 return resolveCitation(citation,{readVersion:defaultVersionLoader(c)});
}

export function annotateConversation(options){
 const {file,spec,expectedSha,pid,by}=options,c=contextForFile(file,options.root);
 return withConversationLock(c.root,{pid,by},()=>{
  recheckContext(c);noIncomplete(c);const before=fileBytes(c.file);if(before===null)refuse('NOT_FOUND');if(!sha(expectedSha)||hash(before)!==expectedSha)refuse('STALE_PIN');const record=validRecord(before,c.file);
  const pinned=object(spec)&&Object.hasOwn(spec,'expected_annotations_sha256');
  if(!exact(spec,['markdown','citations','processing','log',...(pinned?['expected_annotations_sha256']:[])])||!text(spec.markdown)||!Array.isArray(spec.citations)||!['processed',null].includes(spec.processing)||pinned&&spec.expected_annotations_sha256!==null&&!sha(spec.expected_annotations_sha256))refuse('ANNOTATE_SPEC_INVALID');validLog(spec.log,record.header);
  const annotations=join(c.folder,'annotations.md'),old=fileBytes(annotations);
  // A historical citation proves old selected words, not the current action
  // snapshot. Validate the independent live pin under the same writer lock,
  // before citation loading, protection initialization or journal creation.
  if(pinned&&digest(old)!==spec.expected_annotations_sha256)refuse('STALE_PIN');
  for(const citation of spec.citations){const resolved=resolveCitation(citation,{readVersion:options.readVersion??defaultVersionLoader(c)});if(errors(resolved.diagnostics).length)refuse(resolved.diagnostics[0].code);}
  historyProtection(record,c);const state=protection(record,c),h=withStandard(clone(record.header));h.extensions.conversation_revision=state;if(spec.processing!==null)h.review.processing=spec.processing;
  const id='annotate-'+hash(Buffer.from(stable({expectedSha,spec}))).slice(0,32),line=logLine(id,spec.log,[],record.header.review,state);
  const body=appendLog(record,line),after=serializeConversationHeader(h,body);validRecord(after,c.file);
  const addition=Buffer.from(`\n## Generated interpretation\n\n${spec.markdown}${spec.markdown.endsWith('\n')?'':'\n'}\n<!-- citations ${stable(spec.citations)} -->\n`);
  const j=transaction(c,{id,kind:'annotate',spec,before,after,writes:[{path:annotations,bytes:Buffer.concat([old??Buffer.alloc(0),addition])}],protectionBefore:record.header.extensions.conversation_revision??null,protectionAfter:state,reviewedInput:record.header.review.transcription==='human-reviewed'||record.header.review.attribution==='human-reviewed'?before:null,line},options.afterOperation);
  return {path:c.file,fileSha256:j.after_sha256};
 });
}

const operationKeys={
 'retitle':['title'],'map-participant':['participant_id','person','status','evidence'],
 'add-participant':['participant'],'add-capture':['capture','assets'],
 'add-capture-locator':['capture_id','locator','asset','evidence'],
 'append-turns':['after_turn_id','turns'],'revise-turns':['changes'],
 'retire-turns':['turn_ids','replacement_turn_ids','evidence']
};
function validRevision(spec,expected,h){
 if(!exact(spec,['schema_version','revision_id','base_sha256','mode','authorization','operations','log'])||spec.schema_version!==1||!token(spec.revision_id)||!sha(spec.base_sha256)||!['routine','deliberate-transcript-revision'].includes(spec.mode)||!Array.isArray(spec.operations)||!spec.operations.length)refuse('REVISION_SPEC_INVALID');
 if(expected!==spec.base_sha256)refuse('STALE_PIN');validLog(spec.log,h);
 for(const op of spec.operations){if(!object(op)||!Object.hasOwn(operationKeys,op.op)||!exact(op,['op',...operationKeys[op.op]]))refuse('REVISION_SPEC_INVALID');}
 if(spec.mode==='routine'&&spec.authorization!==null)refuse('REVISION_AUTHORIZATION_MISMATCH');
 if(spec.mode==='deliberate-transcript-revision'){
  const a=spec.authorization;if(!exact(a,['decision','base_sha256','turn_ids'])||a.decision?.kind!=='operator-decision'||a.base_sha256!==expected||!Array.isArray(a.turn_ids)||a.turn_ids.some(id=>typeof id!=='string'||!/^t-\d{6,}$/.test(id))||!equal(a.turn_ids,[...new Set(a.turn_ids)].sort()))refuse('REVISION_AUTHORIZATION_MISMATCH');
  evidenceValid(a.decision,h);
 }
}
function buildRevision(c,record,spec){
 historyProtection(record,c);const originalState=record.header.extensions.conversation_revision??null;
 const state=protection(record,c),h=withStandard(clone(record.header)),turns=record.turns.map(inputTurn),assets=[],retirements=[],changedIds=new Set(),protectedAffected=new Set();
 let changed=false,transcription=false,attribution=false,processing=false;
 const protectedOriginal=new Map(state.protected_turns.filter(p=>!p.retired).map(p=>[p.turn_id,p]));
 const touchProtected=()=>{
  for(const [id,p] of protectedOriginal){const t=turns.find(t=>t.id===id);if(!t||semantic({header:h},t)!==p.baseline_sha256)protectedAffected.add(id);}
 };
 const find=(list,id,code)=>{const value=list.find(v=>v.id===id);if(!value)refuse(code);return value;};
 for(const op of spec.operations){
  switch(op.op){
   case 'retitle':{
    if(!text(op.title)||/[\r\n]/.test(op.title))refuse('REVISION_SPEC_INVALID');if(h.title!==op.title){h.title=op.title;changed=true;}break;
   }
   case 'map-participant':{
    evidences(op.evidence,h);const p=find(h.participants,op.participant_id,'PARTICIPANT_NOT_FOUND');
    if(!['unknown','proposed','confirmed'].includes(op.status)||op.person!==null&&!text(op.person))refuse('REVISION_SPEC_INVALID');
    if(p.person!==op.person||p.status!==op.status||!equal(p.evidence,op.evidence)){
     const identityChanged=p.person!==op.person||p.status!==op.status;
     p.person=op.person;p.status=op.status;p.evidence=clone(op.evidence);changed=true;processing=true;if(identityChanged)attribution=true;
     for(const t of turns.filter(t=>t.speaker===p.id))changedIds.add(t.id);
    }break;
   }
   case 'add-participant':{
    if(!object(op.participant))refuse('REVISION_SPEC_INVALID');const prior=h.participants.find(p=>p.id===op.participant.id);
    if(prior){if(!equal(prior,op.participant))refuse('PARTICIPANT_ID_COLLISION');}
    else{h.participants.push(clone(op.participant));changed=true;processing=true;}break;
   }
   case 'add-capture':{
    if(!object(op.capture)||!Array.isArray(op.assets))refuse('REVISION_SPEC_INVALID');const prior=h.sources.find(s=>s.id===op.capture.id);
    if(prior){if(!equal(prior,op.capture))refuse('CAPTURE_ID_COLLISION');}
    else{const identity=captureIdentity(op.capture),collision=h.sources.find(s=>identity!==null&&captureIdentity(s)===identity);if(collision)refuse('CAPTURE_IDENTITY_COLLISION',{captureId:collision.id});h.sources.push(clone(op.capture));changed=true;processing=true;}
    assets.push(...op.assets);break;
   }
   case 'add-capture-locator':{
    evidences(op.evidence,h);const cap=find(h.sources,op.capture_id,'CAPTURE_NOT_FOUND');if(!object(op.locator))refuse('REVISION_SPEC_INVALID');
    const path=op.locator.kind==='bundled'?op.locator.path:null;
    if(path&&cap.locators.some(l=>l.kind==='bundled'&&l.path===path&&!equal(l,op.locator)))refuse('ASSET_PATH_COLLISION');
    if(!cap.locators.some(l=>equal(l,op.locator))){cap.locators.push(clone(op.locator));cap.evidence.push(...clone(op.evidence));changed=true;}
    if(op.asset!==null)assets.push(op.asset);break;
   }
   case 'append-turns':{
    if(!Array.isArray(op.turns)||!op.turns.length||op.after_turn_id!==null&&!turns.some(t=>t.id===op.after_turn_id))refuse('REVISION_SPEC_INVALID');
    let position=op.after_turn_id===null?turns.length:turns.findIndex(t=>t.id===op.after_turn_id)+1;
    for(const t of op.turns){
     if(!exact(t,['id','speaker','sources','timing','source_gap','text'])||typeof t.id!=='string'||!/^t-\d{6,}$/.test(t.id)||typeof t.text!=='string')refuse('REVISION_SPEC_INVALID');
     if(state.retired_turn_ids.includes(t.id))refuse('TURN_ID_RETIRED');const prior=turns.find(p=>p.id===t.id);
     if(prior){if(!equal(prior,t))refuse('TURN_ID_COLLISION');continue;}
     const n=Number(t.id.slice(2));if(!Number.isSafeInteger(n)||n<state.next_turn_number)refuse('TURN_ALLOCATION_INVALID');
     state.next_turn_number=n+1;turns.splice(position++,0,clone(t));changedIds.add(t.id);changed=true;transcription=true;attribution=true;processing=true;
    }break;
   }
   case 'revise-turns':{
    if(!Array.isArray(op.changes)||!op.changes.length||new Set(op.changes.map(v=>v.turn_id)).size!==op.changes.length)refuse('REVISION_SPEC_INVALID');
    for(const ch of op.changes){
     if(!exact(ch,['turn_id','before_text_sha256','speaker','sources','timing','source_gap','text','evidence'])||!sha(ch.before_text_sha256)||typeof ch.text!=='string')refuse('REVISION_SPEC_INVALID');evidences(ch.evidence,h);
     const t=find(turns,ch.turn_id,'TURN_NOT_FOUND');if(hash(Buffer.from(t.text))!==ch.before_text_sha256)refuse('STALE_TURN_PIN');
     const input={id:t.id,speaker:ch.speaker,sources:ch.sources,timing:ch.timing,source_gap:ch.source_gap,text:ch.text};
     if(!equal(t,input)){
      if(t.text!==ch.text)transcription=true;if(t.speaker!==ch.speaker||!equal(t.sources,ch.sources)||!equal(t.timing,ch.timing)||t.source_gap!==ch.source_gap)attribution=true;
      Object.assign(t,clone(input));changedIds.add(t.id);changed=true;processing=true;
     }
    }break;
   }
   case 'retire-turns':{
    if(spec.mode!=='deliberate-transcript-revision')refuse('REVIEWED_TRANSCRIPT_REVISION_REQUIRED');evidences(op.evidence,h);
    if(!Array.isArray(op.turn_ids)||!op.turn_ids.length||!Array.isArray(op.replacement_turn_ids)||!op.replacement_turn_ids.length||new Set(op.turn_ids).size!==op.turn_ids.length||new Set(op.replacement_turn_ids).size!==op.replacement_turn_ids.length||op.replacement_turn_ids.some(id=>op.turn_ids.includes(id)))refuse('REVISION_SPEC_INVALID');
    for(const id of op.turn_ids){find(turns,id,'TURN_NOT_FOUND');state.retired_turn_ids.push(id);changedIds.add(id);turns.splice(turns.findIndex(t=>t.id===id),1);}
    retirements.push(clone(op));op.replacement_turn_ids.forEach(id=>changedIds.add(id));changed=true;transcription=true;attribution=true;processing=true;break;
   }
  }
  touchProtected(); // Evaluate before any review downgrade; also catches indirect mapping changes.
 }
 const affected=[...protectedAffected].sort();
 if(affected.length&&spec.mode!=='deliberate-transcript-revision')refuse('REVIEWED_TRANSCRIPT_REVISION_REQUIRED');
 if(spec.mode==='deliberate-transcript-revision'&&!equal(spec.authorization.turn_ids,affected))refuse('REVISION_AUTHORIZATION_MISMATCH');
 if(transcription&&h.review.transcription!=='disputed')h.review.transcription='unreviewed';
 if(attribution&&h.review.attribution!=='disputed')h.review.attribution='unreviewed';if(processing)h.review.processing='unprocessed';
 for(const id of affected){
  const p=state.protected_turns.find(p=>p.turn_id===id),t=turns.find(t=>t.id===id),next=t?semantic({header:h},t):null;
  p.authorized_changes.push({revision_id:spec.revision_id,from_sha256:p.baseline_sha256,to_sha256:next,decision:clone(spec.authorization.decision)});
  if(next===null)p.retired=true;else p.baseline_sha256=next;
 }
 for(const op of retirements)for(const id of op.replacement_turn_ids){
  const t=find(turns,id,'TURN_NOT_FOUND'),origins=op.turn_ids.map(id=>state.protected_turns.find(p=>p.turn_id===id)).filter(Boolean);if(!origins.length)continue;
  const baseline=semantic({header:h},t);let p=state.protected_turns.find(p=>p.turn_id===id);
  if(!p){p={turn_id:id,baseline_sha256:baseline,reviewed_versions:[],authorized_changes:[],retired:false};state.protected_turns.push(p);}
  for(const origin of origins){for(const v of origin.reviewed_versions)if(!p.reviewed_versions.some(old=>equal(old,v)))p.reviewed_versions.push(clone(v));p.authorized_changes.push({revision_id:spec.revision_id,from_sha256:origin.baseline_sha256,to_sha256:baseline,decision:clone(spec.authorization.decision)});}
 }
  const headerErrors=errors(validateConversation(h));if(headerErrors.length)refuse(headerErrors[0].code);
 proveParticipants(c,h,record.header);
 const copied=assetsFor(c,h,assets),proof=backupProof(c,h,record,{...spec._options,assets:copied});
 if(copied.some(a=>digest(fileBytes(a.path))!==a.sha256))changed=true;
 if(!changed)return {after:readFileSync(c.file),assets:copied,state:originalState,originalState,changedIds:[],line:null,proof};
 h.extensions.conversation_revision=state;
 let body=equal(turns,record.turns.map(inputTurn))?record.body:renderTranscript(record,turns);
 body=retitleBody(record,h,body);
 let proposed=validRecord(serializeConversationHeader(h,body),c.file);
 const line=logLine(spec.revision_id,spec.log,[...changedIds].sort(),record.header.review,state);body=appendLog(proposed,line);
 const after=serializeConversationHeader(h,body);proposed=validRecord(after,c.file);noCaptureCollisions(c,h);
 // Reparse the emitted bytes: all semantic baselines must match actual reader slices.
 protection(proposed,c);
 return {after,assets:copied,state,originalState,changedIds:[...changedIds].sort(),line,proof};
}
export function reviseConversation(options){
 const {file,spec,expectedSha,pid,by}=options,c=contextForFile(file,options.root);
 return withConversationLock(c.root,{pid,by},()=>{
  recheckContext(c);const before=fileBytes(c.file);if(before===null)refuse('NOT_FOUND');const record=validRecord(before,c.file);
  validRevision(spec,expectedSha,record.header);
  const prior=readJournal(c,spec.revision_id);
  if(prior){
   if(prior.kind!=='revise'||prior.spec_sha256!==hash(Buffer.from(stable(spec))))refuse('REVISION_ID_COLLISION');
   noIncomplete(c,spec.revision_id);
   if(prior.state==='reversed'||journals(c).some(j=>j.sequence>prior.sequence&&j.state!=='reversed'))refuse('STALE_REVISION_RETRY');
   if(prior.state==='applying')return runJournal(c,prior,'resume',options.afterOperation);
   if([...prior.operations,...prior.snapshots].some(o=>digest(fileBytes(o.path))!==o.after_sha256))refuse('STALE_REVISION_RETRY');
   return result(prior,false);
  }
  noIncomplete(c);if(record.fileSha256!==expectedSha)refuse('STALE_PIN');
  // Capabilities stay outside the serialized canonical spec; no trust flag is accepted.
  const working=clone(spec);Object.defineProperty(working,'_options',{value:options,enumerable:false});
  const built=buildRevision(c,record,working);
  return transaction(c,{id:spec.revision_id,kind:'revise',spec,before,after:built.after,writes:built.assets.map(a=>({path:a.path,bytes:a.bytes})),assets:built.assets,protectionBefore:built.originalState,protectionAfter:built.state,reviewedInput:['transcription','attribution'].some(d=>record.header.review[d]==='human-reviewed')?before:null,turnIds:built.changedIds,line:built.line,proof:built.proof},options.afterOperation);
 });
}
export function recoverConversationRevision(options){
 const {file,revisionId,action,pid,by}=options;if(!token(revisionId)||!['resume','reverse'].includes(action))refuse('RECOVERY_SPEC_INVALID');const c=contextForFile(file,options.root);
 return withConversationLock(c.root,{pid,by},()=>{
  recheckContext(c);const j=readJournal(c,revisionId);if(!j)refuse('NOT_FOUND');noIncomplete(c,revisionId);
  if(j.state==='reversed'&&action==='resume')refuse('STALE_REVISION_RETRY');
  return runJournal(c,j,action,options.afterOperation);
 });
}

/** Backfill `standard` into existing records. Dry run unless `apply`. Only immediate
 * `<id>/transcript.md` entries are considered; flat legacy files have nothing to stamp.
 * The edit is stampPlan's: one inserted or rewritten header line, every other byte kept.
 * It is not journaled (it changes no speech, sections, review or protection state), so it
 * refuses any record whose current bytes another record or annotation cites by SHA-256,
 * any record with an incomplete journal, and any file that changes between read and rename.
 * Applying needs a workspace so the mutation lock and journal checks run. */
export function stampConversationStandards({root,transcriptsDir,apply=false,pid,by}={}){
 if(root!==undefined&&transcriptsDir!==undefined)refuse('INVALID_ARGUMENTS');
 let dir,workspace=null;
 if(root!==undefined){workspace=realpathSync(resolve(root));dir=resolve(paths(workspace).transcripts);}
 else{
  if(typeof transcriptsDir!=='string'||!transcriptsDir)refuse('WORKSPACE_REQUIRED');
  dir=realpathSync(resolve(transcriptsDir));const enclosing=enclosingWorkspace(dir);
  if(enclosing&&existsSync(paths(enclosing).transcripts)&&realpathSync(paths(enclosing).transcripts)===dir)workspace=enclosing;
 }
 if(apply&&!workspace)refuse('WORKSPACE_REQUIRED');
 const scan=(incomplete=new Set())=>{
  const report={changed:[],current:[],skipped:[]},planned=[],cited=new Set();
  if(!existsSync(dir))return {report,planned};
  noLinks(anchor(dir),dir);
  for(const id of readdirSync(dir).sort()){
   if(id.startsWith('.'))continue;
   const folder=join(dir,id),file=join(folder,'transcript.md');
   const folderStat=lstatSync(folder);
   if(folderStat.isSymbolicLink()){report.skipped.push({id,path:folder,reason:'SYMLINK_REFUSED'});continue;}
   if(!folderStat.isDirectory())continue;
   for(const name of ['transcript.md','annotations.md']){
    const path=join(folder,name);let s;try{s=lstatSync(path);}catch{continue;}
    if(s.isFile())for(const token of readFileSync(path,'latin1').match(/[a-f0-9]{64}/g)??[])cited.add(token);
   }
   let s;try{s=lstatSync(file);}catch{continue;}
   if(s.isSymbolicLink()||!s.isFile()){report.skipped.push({id,path:file,reason:'SYMLINK_REFUSED'});continue;}
   const before=readFileSync(file),plan=stampPlan(before);
   if(plan.status==='current'){report.current.push({id,path:file});continue;}
   if(plan.status!=='stamped'){report.skipped.push({id,path:file,reason:plan.reason});continue;}
   planned.push({id,path:file,before,after:plan.output,mode:s.mode&0o777});
  }
  for(const p of planned){
   if(cited.has(hash(p.before)))report.skipped.push({id:p.id,path:p.path,reason:'CITED_VERSION'});
   else if(incomplete.has(p.path))report.skipped.push({id:p.id,path:p.path,reason:'REVISION_INCOMPLETE'});
   else report.changed.push(p);
  }
  return {report,planned};
 };
 const finish=(report,applied,locked)=>({applied,locked,standard:STANDARD,transcripts:dir,changed:report.changed.map(({id,path})=>({id,path})),current:report.current,skipped:report.skipped});
 if(!apply)return finish(scan().report,false,false);
 return withConversationLock(workspace,{pid,by},()=>{
  const c=conversationLockContext(workspace);
  // Read every journal for this repository once; an unreadable one fails the whole run closed.
  const incomplete=new Set();
  if(existsSync(c.journalDir)){
   noLinks(anchor(c.journalDir),c.journalDir);const prefix=hash(c.gitCommonDir??c.transcripts)+'-';
   for(const name of readdirSync(c.journalDir).filter(n=>n.startsWith(prefix)&&n.endsWith('.json'))){
    let j;try{j=JSON.parse(fileBytes(join(c.journalDir,name)));}catch{refuse('JOURNAL_INVALID');}
    if(j?.state!=='complete'&&j?.state!=='reversed')incomplete.add(j?.file);
   }
  }
  const {report}=scan(incomplete),done=[];
  for(const p of report.changed){
   try{noLinks(dir,p.path);atomic(p.path,p.after,p.mode,hash(p.before));done.push(p);}
   catch(e){if(!['RECOVERY_THIRD_STATE','SYMLINK_REFUSED','TARGET_MISMATCH'].includes(e.code))throw e;report.skipped.push({id:p.id,path:p.path,reason:e.code==='RECOVERY_THIRD_STATE'?'STALE_PIN':e.code});}
  }
  report.changed=done;return finish(report,true,true);
 });
}
