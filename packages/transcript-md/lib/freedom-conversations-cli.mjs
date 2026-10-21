#!/usr/bin/env node
// Keep informational commands ahead of imports: even schema/config IO is unnecessary there.
const commands=['list','read','validate','sources','resolve','cite','seek','create','annotate','revise','recover','stamp-standard'];
const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--help') {
 console.log('Conversation records\n\nlist [--workspace DIR | --transcripts-dir DIR] [--include-sections] [--json]\nread FILE [--workspace DIR] [--include-body] [--json]\nvalidate FILE [--workspace DIR] [--json]\nsources FILE [--workspace DIR] [--json]\nresolve ID [--workspace DIR] [--json]\ncite FILE --turn ID [--turn ID] [--workspace DIR] [--json]\nseek FILE --turn ID [--capture ID] [--workspace DIR] [--json]\ncreate --workspace DIR --spec FILE [--json]\nannotate FILE --spec FILE --expected-sha SHA [--workspace DIR] [--json]\nrevise FILE --spec FILE --expected-sha SHA [--workspace DIR] [--json]\nrecover FILE --revision-id ID --action resume|reverse [--workspace DIR] [--json]\nstamp-standard [--workspace DIR | --transcripts-dir DIR] [--apply] [--json]\n--capabilities --json');
} else if(args.length===2&&args.includes('--capabilities')&&args.includes('--json')) {
 console.log(JSON.stringify({api_version:1,schema_versions:[1],commands,revision:null}));
} else {
 const json=args.includes('--json');
 const diagnostic=code=>({code,severity:'error',path:null,field:null,message:'Conversation command could not complete; check arguments and record diagnostics.'});
 const conflict=code=>['LOCKED','STALE_PIN','STALE_TURN_PIN','STALE_REVISION_RETRY','RECOVERY_THIRD_STATE','REVISION_INCOMPLETE','REVISION_ID_COLLISION'].includes(code)||code.endsWith('_COLLISION');
 // A record that is not self-documenting (self-doc:missing, self-doc:version) is an error only
 // where it is the question asked: `validate` refuses on it; readers report it and keep their exit code.
 const selfDoc=code=>code==='self-doc:missing'||code==='self-doc:version';
 const exitFor=(all,strict=false)=>{const diagnostics=strict?all:all.filter(d=>!selfDoc(d.code));return diagnostics.some(d=>d.code==='PRIVACY_REFUSED')?4:diagnostics.some(d=>conflict(d.code))?3:diagnostics.some(d=>['ID_COLLISION','AMBIGUOUS_ALIAS'].includes(d.code))?3:diagnostics.some(d=>d.severity==='error'&&d.code!=='NOT_FOUND')?2:diagnostics.some(d=>d.code==='NOT_FOUND')?1:0;};
 try {
  const command=args[0],options={},positionals=[];
  if(!commands.includes(command))throw new Error('INVALID_ARGUMENTS');
  for(let i=1;i<args.length;i++) {
   const arg=args[i];
   if(arg==='--turn') {
    if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('INVALID_ARGUMENTS');(options[arg]??=[]).push(args[++i]);
   } else if(['--workspace','--transcripts-dir','--capture','--spec','--expected-sha','--revision-id','--action'].includes(arg)) {
    if(Object.hasOwn(options,arg)||!args[i+1]||args[i+1].startsWith('--'))throw new Error('INVALID_ARGUMENTS');options[arg]=args[++i];
   } else if(['--json','--include-body','--include-sections','--apply'].includes(arg)) {
    if(Object.hasOwn(options,arg))throw new Error('INVALID_ARGUMENTS');options[arg]=true;
   } else if(arg.startsWith('--'))throw new Error('INVALID_ARGUMENTS');
   else positionals.push(arg);
  }
  if(options['--workspace']&&options['--transcripts-dir']||options['--transcripts-dir']&&!['list','stamp-standard'].includes(command)||options['--apply']&&command!=='stamp-standard'||options['--include-body']&&command!=='read'||options['--include-sections']&&command!=='list'||positionals.length!==(['list','create','stamp-standard'].includes(command)?0:1))throw new Error('INVALID_ARGUMENTS');
  if(options['--turn']&&!['cite','seek'].includes(command)||options['--capture']&&command!=='seek'||['cite','seek'].includes(command)&&!options['--turn']?.length||command==='seek'&&options['--turn'].length!==1)throw new Error('INVALID_ARGUMENTS');
  const mutations=['create','annotate','revise','recover'];
  if(options['--spec']&&!['create','annotate','revise'].includes(command)||options['--expected-sha']&&!['annotate','revise'].includes(command)||options['--revision-id']&&command!=='recover'||options['--action']&&command!=='recover')throw new Error('INVALID_ARGUMENTS');
  if(command==='stamp-standard') {
   const writer=await import('./freedom-conversation-write.mjs');
   const result=writer.stampConversationStandards({...(options['--transcripts-dir']?{transcriptsDir:options['--transcripts-dir']}:{root:options['--workspace']??process.cwd()}),apply:!!options['--apply'],pid:process.pid,by:'conversation-cli'});
   if(json)console.log(JSON.stringify({api_version:1,...result}));
   else {
    const verb=result.applied?'stamped':'would stamp';
    for(const r of result.changed)console.log(`${verb}\t${r.path}`);
    for(const r of result.skipped)console.error(`skipped: ${r.reason}\t${r.path}`);
    console.log(`${result.changed.length} ${verb}, ${result.current.length} current, ${result.skipped.length} skipped${result.applied?'':' (dry run; --apply writes)'}`);
   }
  }else if(mutations.includes(command)) {
   if(['create','annotate','revise'].includes(command)&&!options['--spec']||['annotate','revise'].includes(command)&&!options['--expected-sha']||command==='recover'&&(!options['--revision-id']||!['resume','reverse'].includes(options['--action'])))throw new Error('INVALID_ARGUMENTS');
   const writer=await import('./freedom-conversation-write.mjs');
   const {readFileSync}=await import('node:fs');
   const {resolveTrackedRoot}=await import('./freedom-workspace.mjs');
   const root=options['--workspace']?resolveTrackedRoot(options['--workspace']):command==='create'?resolveTrackedRoot(process.cwd()):undefined;
   let spec;if(options['--spec'])try{spec=JSON.parse(readFileSync(options['--spec'],'utf8'));}catch{throw new Error('INVALID_ARGUMENTS');}
   const common={pid:process.pid,by:'conversation-cli',root};
   const result=command==='create'?writer.createConversation({...common,spec}):command==='annotate'?writer.annotateConversation({...common,file:positionals[0],spec,expectedSha:options['--expected-sha']}):command==='revise'?writer.reviseConversation({...common,file:positionals[0],spec,expectedSha:options['--expected-sha']}):writer.recoverConversationRevision({...common,file:positionals[0],revisionId:options['--revision-id'],action:options['--action']});
   console.log(JSON.stringify({api_version:1,...result}));
  }else {
  const door=await import('./freedom-conversations.mjs');
  const {resolveTrackedRoot}=await import('./freedom-workspace.mjs');
  let root;const workspace=()=>root??=(resolveTrackedRoot(options['--workspace']??process.cwd()));
  let records=[],diagnostics=[];
  if(command==='list')({records,diagnostics}=options['--transcripts-dir']?door.listConversationDirectory(options['--transcripts-dir']):door.listConversations(workspace()));
  else if(command==='resolve') {
   const listed=door.listConversations(workspace()),result=door.resolveConversation(listed.records,positionals[0],{root});
   records=result.record?[result.record]:[];diagnostics=[...listed.diagnostics,...result.diagnostics];
  }else {
   let record=door.readConversation(positionals[0],options['--workspace']?{root:workspace()}:{});
   if(record.diagnostics.some(d=>d.code==='REDIRECT_WORKSPACE_REQUIRED'))record=door.readConversation(positionals[0],{root:workspace()});
   records=[record];diagnostics=record.diagnostics;
  }
  diagnostics=[...new Map(diagnostics.map(d=>[JSON.stringify(d),d])).values()];
  const metadata=record=>{
   const h=record.header?.schema_version===1?record.header:{};
   const data={id:h.id??null,path:record.file,file:record.file,relativePath:record.relativePath,layout:record.layout,date:h.date??null,title:h.title??null,participants:h.participants??[],sources:h.sources??[],review:h.review??null,body_format:h.body_format??null,aliases:h.aliases??[],fileSha256:record.fileSha256,bodySha256:record.bodySha256,gaps:record.gaps,diagnostics:record.diagnostics};
   if(command==='sources')data.sources=door.conversationSourceRefs(record);
   if(options['--include-body']&&!record.diagnostics.some(d=>d.code==='INVALID_UTF8'))Object.assign(data,{header:h,legacyFields:record.legacyFields,body:record.body.toString('utf8'),rawHeader:record.rawHeader?.toString('utf8')??null,turns:record.turns.map(t=>({...t,text:t.text.toString('utf8')}))});
   if(options['--include-body']||options['--include-sections'])data.sections=record.sections.map(s=>({...s,bytes:s.bytes.toString('utf8')}));
   return data;
  };
  let output={api_version:1,records:records.map(metadata),diagnostics};
  if(['cite','seek'].includes(command)&&!diagnostics.some(d=>d.severity==='error'&&!selfDoc(d.code))) {
   const citations=await import('./freedom-conversation-citations.mjs');
   if(command==='cite')output=citations.citeConversation(records[0],{turnIds:options['--turn']});
   else {
    output=citations.seekConversation(records[0],{turnId:options['--turn'][0],captureId:options['--capture']});
    diagnostics=output.gaps;
   }
  }
  if(json)console.log(JSON.stringify(output));
  else {
   if(command==='cite'&&output.selector||command==='seek'&&output.candidates)console.log(JSON.stringify(output));
   for(const r of output.records??[])console.log(`${r.id??'(invalid)'}\t${r.path}`);
   for(const d of diagnostics)console.error(`${d.severity}: ${d.code}`);
  }
  process.exitCode=command==='seek'&&output.candidates?.length===0?1:exitFor(diagnostics,command==='validate');
  }
 }catch(e) {
  let code=e.code&&/^[A-Z][A-Z0-9_]+$/.test(e.code)?e.code:e.message==='INVALID_ARGUMENTS'?'INVALID_ARGUMENTS':'READ_INCOMPLETE';
  // validate is the standard's check: everything it reports is a listed code, so a system error
  // (ENOENT, EACCES, ...) is reported as READ_INCOMPLETE rather than leaking an errno.
  if(args[0]==='validate'){const {DIAGNOSTIC_CODES}=await import('./frontmatter/conversation.mjs');if(!Object.hasOwn(DIAGNOSTIC_CODES,code))code='READ_INCOMPLETE';}
  const d=diagnostic(code);
  if(json)console.log(JSON.stringify({api_version:1,records:[],diagnostics:[d]}));else console.error(`${d.severity}: ${d.code}`);
  process.exitCode=exitFor([d]);
 }
}
