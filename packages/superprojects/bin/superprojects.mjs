#!/usr/bin/env node
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve,dirname,basename} from 'node:path';
import {createProjectEngine,readContext,validateContext,contextGraph,verifyContext,exportContext,assertCanClose,assertSafeConfig,validDate,parsePlan,lintPlan,planStatus,schedulePlan,proposeBlocks} from '../src/index.mjs';

const HELP=`superprojects <command> [options]
(also installed as agentic-projects, the former name, for one release)

scaffold     Create a dated project and state; requires explicit context
list         Read open projects, including malformed-record findings
read         Read a record (--file)
lint         Check project headers, resumability and context (--root)
query        Query project or state metadata (--root --kind [--where key=value])
verify       Set a verification date from attributed evidence (--file)
export       Check an explicit permitted bundle (--file repeated --to home|share)
close-check  Refuse closing a parent with unfinished descendants (--root --slug)
nest-plan    List the subprojects sitting beside their parent and where each belongs
             inside it (--root). Read-only: the product moves folders and relinks.
plan         The superproject plan map (--project <dir>): lint, status, schedule, blocks.
             status: --date --deadline --scenario --all-scenarios
             blocks: --actor <slug> --free <slots.json>; proposes, never books

Common: --root <projects-directory> --file <record> --json --help
Scaffold: --slug --name --owner --goal --date YYYY-MM-DD --summary
          --read-when --keep keep|home|share --audience --actor --next-action
          Optional: --kind finite|ongoing --cadence --parent --deliverable --phase
                    --repo --source-of-truth --dependency
                    --no-plan (a finite project is otherwise born with PLAN.md)
Verify: --date --by --source --origin human|agent|capture [--rev|--snapshot]
        Emits updated Markdown; --write replaces the named record.
Export: --allow-external explicitly permits external HTTP(S) references.
Exits: 0 success, 1 findings/refusal, 2 invalid usage. No command sends records.
`;
class Usage extends Error {}
const VALUE_OPTIONS=new Set(['root','file','slug','name','owner','goal','date','summary','read-when','keep','audience','actor','next-action','kind','cadence','parent','deliverable','phase','repo','source-of-truth','dependency','by','source','origin','rev','snapshot','to','where','project','deadline','scenario','free']);
const FLAG_OPTIONS=new Set(['json','write','help','allow-external','all-scenarios','no-plan']);
function parse(args){
  const values={}; let command;
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if(!arg.startsWith('--')){if(command==='plan'&&!values.sub){values.sub=arg;continue;}if(command)throw new Usage(`Unexpected argument: ${arg}`);command=arg;continue;}
    const key=arg.slice(2);
    if(FLAG_OPTIONS.has(key)){values[key]=true;continue;}
    if(!VALUE_OPTIONS.has(key))throw new Usage(`Unknown option: ${arg}`);
    if(!args[i+1]||args[i+1].startsWith('--'))throw new Usage(`Missing value: ${arg}`);
    const value=args[++i];
    if(key==='file') (values.files ||= []).push(value);
    else if(key==='where') (values.where ||= []).push(value);
    else {if(key in values)throw new Usage(`Repeated option: ${arg}`); values[key]=value;}
  }
  assertSafeConfig(values);return {command,values};
}
const requireKeys=(a,keys)=>{for(const k of keys)if(!a[k])throw new Usage(`Required: --${k}`);};
const onlyFile=a=>{if(a.files?.length!==1)throw new Usage('Exactly one --file is required');return resolve(a.files[0]);};
const emit=(value,json)=>console.log(json?JSON.stringify(value,null,2):typeof value==='string'?value:JSON.stringify(value,null,2));
const paths=a=>{requireKeys(a,['root']);const root=resolve(a.root);return {root:dirname(root),projects:root,projectsRoots:[root]};};
function main(args){
  const {command,values:a}=parse(args);
  if(a.help||!command){console.log(HELP);return 0;}
  const allowed=['scaffold','list','read','lint','query','verify','export','close-check','nest-plan','plan'];
  if(!allowed.includes(command))throw new Usage(`Unknown command: ${command}`);
  if(a.write&&command!=='verify')throw new Usage('--write is only supported by verify');
  const engine=createProjectEngine();
  if(command==='scaffold'){
    requireKeys(a,['root','slug','name','owner','goal','date','summary','read-when','keep','audience','actor','next-action']);
    if(!validDate(a.date))throw new Usage('--date must be a real calendar date');
    if(!/^[a-z0-9][a-z0-9-]*$/.test(a.slug))throw new Usage('--slug must be kebab-case');
    if(a.kind&&!['finite','ongoing'].includes(a.kind))throw new Usage('--kind must be finite or ongoing');
    const folder=/^\d{4}-\d{2}-\d{2}-/.test(a.slug)?a.slug:`${a.date}-${a.slug}`;
    const context={context_version:'1',id:folder,summary:a.summary,read_when:a['read-when'],as_of:a.date,keep:a.keep,audience:a.audience,next_actor:a.actor,...(a.dependency?{dependency:a.dependency}:{})};
    const spec={root:resolve(a.root),slug:a.slug,today:a.date,name:a.name,owner:{name:a.owner,slug:a.owner},goal:a.goal,kind:a.kind||'finite',deliverable:a.deliverable||a.goal,repo:a.repo||'here',sourceOfTruth:a['source-of-truth']||null,phase:a.phase||'not started',nextAction:a['next-action'],cadence:a.cadence||null,parent:a.parent||null,plan:!a['no-plan'],goodLooksLike:a.goal,failure:'The declared goal is not delivered.',bareNames:[a.owner],context,stateContext:{...context,id:`${folder}:state`}};
    const preview=engine.renderProjectMd(spec);
    const problems=validateContext(preview).filter(f=>f.level==='error');
    if(problems.length)throw new Error(problems.map(f=>f.message).join('; '));
    const created=engine.scaffoldProject(spec);emit(created,a.json);return 0;
  }
  if(command==='read'){
    const file=onlyFile(a),text=readFileSync(file,'utf8');emit(a.json?{file,...readContext(text)}:text,a.json);return 0;
  }
  if(command==='verify'){
    requireKeys(a,['date','by','source','origin']);const file=onlyFile(a);
    const text=verifyContext(readFileSync(file,'utf8'),{date:a.date,by:a.by,source:a.source,origin:a.origin,rev:a.rev,snapshot:a.snapshot});
    const findings=validateContext(text,{file}).filter(f=>f.level==='error');
    if(findings.length)throw new Error(findings.map(f=>f.message).join('; '));
    if(a.write)writeFileSync(file,text);
    emit(a.json?{file,written:!!a.write,text}:text,a.json);return 0;
  }
  if(command==='export'){
    requireKeys(a,['to']);if(!a.files?.length)throw new Usage('At least one --file is required');
    const records=a.files.map(file=>({path:resolve(file),text:readFileSync(file,'utf8')}));
    emit({records:exportContext(records,{to:a.to,allowExternal:!!a['allow-external']})},a.json);return 0;
  }
  if(command==='plan'){
    requireKeys(a,['project']);const dir=resolve(a.project),file=join(dir,'PLAN.md');
    if(!existsSync(file))throw new Error(`${dir} has no PLAN.md`);
    const plan=parsePlan(readFileSync(file,'utf8'));
    const header=readContext(readFileSync(join(dir,'PROJECT.md'),'utf8')).metadata??{};
    const team=[header.owner,...[].concat(header.co_leads??[],header.operators??[],header.contributors??[])].filter(Boolean);
    const today=a.date||new Date().toLocaleDateString('en-CA');
    if(!validDate(today))throw new Usage('--date must be a real calendar date');
    const deadline=a.deadline||(validDate(String(header.deadline))?String(header.deadline):null);
    if(a.sub==='lint'){const findings=lintPlan(plan,{team,kind:String(header.kind||'finite')});emit({findings},a.json);return findings.length?1:0;}
    if(a.sub==='status'){const r=planStatus(plan,{today,deadline,team,owner:header.owner||null,scenario:a.scenario||null,allScenarios:!!a['all-scenarios']});emit(a.json?r:r.line,a.json);return r.verdict==='behind'?1:0;}
    if(a.sub==='schedule'){emit(schedulePlan(plan,{today,scenario:a.scenario||null}),true);return 0;}
    if(a.sub==='blocks'){requireKeys(a,['actor','free']);emit(proposeBlocks(plan,{today,actor:a.actor,scenario:a.scenario||null,freeSlots:JSON.parse(readFileSync(a.free,'utf8'))}),true);return 0;}
    throw new Usage('plan needs one of: lint, status, schedule, blocks');
  }
  const P=paths(a);
  if(command==='list'){
    const projects=engine.openProjects({paths:P});emit({projects,snoozed:projects.snoozed,problems:projects.problems},a.json);return projects.problems.length?1:0;
  }
  if(command==='query'){
    const kind=a.kind||'project';if(!['project','state'].includes(kind))throw new Usage('--kind must be project or state');
    const where=Object.fromEntries((a.where||[]).map(raw=>{const i=raw.indexOf('=');if(i<1)throw new Usage('--where must be key=value');return [raw.slice(0,i),raw.slice(i+1)];}));
    const result=engine.query(kind,{paths:P,where,workspace:P.root});emit(result,a.json);return result.problems.length?1:0;
  }
  if(command==='close-check'){
    requireKeys(a,['slug']);const result=engine.query('project',{paths:P,workspace:P.root});
    if(result.problems.length)throw new Error('Unreadable projects prevent a safe parent-close check');
    // A subproject inside its parent's folder is that parent's child even before its header says so.
    const projects=result.rows.map(r=>{const up=engine.enclosingProjectDir(r.dir);return {slug:r.slug,...(up&&!r.data.parent?{parent:basename(up)}:{}),...r.data};});const parent=projects.find(p=>p.slug===a.slug);
    if(!parent)throw new Error(`Project not found: ${a.slug}`);
    assertCanClose(parent,projects);emit({canClose:true,slug:a.slug},a.json);return 0;
  }
  if(command==='nest-plan'){
    const plan=engine.nestingPlan(P.projects);
    emit(a.json?plan:[...plan.moves.map(m=>`move ${m.from} -> ${m.to}`),...plan.skipped.map(s=>`skip ${s.from}: ${s.why}`)].join('\n')||'Every subproject already sits inside its parent.',a.json);
    return 0;
  }
  const findings=engine.lintRoot(P.projects),records=[];
  for(const dir of engine.projectDirs(P.projects)){
    const project=join(dir,'PROJECT.md'),state=join(dir,'STATE.md');
    for(const file of [project,state]){try{const text=readFileSync(file,'utf8');records.push({path:file,text});findings.push(...validateContext(text,{file}).map(f=>({...f,file})));}catch(error){findings.push({level:'error',code:'unreadable-record',message:error.message,file});}}
    try{findings.push(...engine.resumability(readFileSync(state,'utf8'),{projectText:readFileSync(project,'utf8'),today:a.date}).map(message=>({level:'error',code:'state-integrity',message,file:state})));}catch{/* unreadable file already reported */}
  }
  findings.push(...contextGraph(records).findings);
  emit({findings},a.json);return findings.some(f=>f.level!=='ok')?1:0;
}
try{process.exitCode=main(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=error instanceof Usage?2:1;}
