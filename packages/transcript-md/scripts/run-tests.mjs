// Prospective physical readiness for native tests, exact tarball and installed consumer probes.
import {readdirSync,lstatSync,realpathSync,readlinkSync,readFileSync,writeFileSync,mkdirSync,mkdtempSync,existsSync,symlinkSync} from 'node:fs';
import {join,dirname,resolve,delimiter} from 'node:path';
import {tmpdir,homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const repo=fileURLToPath(new URL('../',import.meta.url)),argv=process.argv.slice(2),mode=argv[0];
const physical={},symlinks={},directories={},absent=[],hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const seen=new Set();
function pin(p,skip=[]){p=resolve(p);if(seen.has(p))return;seen.add(p);const s=lstatSync(p);if(s.isSymbolicLink()){symlinks[p]=readlinkSync(p);pin(realpathSync(p),skip);}else if(s.isDirectory()){const entries=readdirSync(p).filter(n=>!skip.includes(n)).sort();directories[p]={entries,skip};for(const n of entries)pin(join(p,n),skip);}else if(s.isFile())physical[p]=hash(p);}
function optional(p){if(existsSync(p))pin(p);else absent.push(p);}
pin(repo,['.git','node_modules']);
function executable(name){if(name.startsWith('/')){pin(name);return realpathSync(name);}for(const d of process.env.PATH.split(delimiter)){const p=join(d,name);try{if(lstatSync(p).isFile()||lstatSync(p).isSymbolicLink()){pin(p);return realpathSync(p);}}catch{}}throw Error('RUNTIME_MISSING: '+name);}
const node=realpathSync(process.execPath);pin(node);
let pythonName=process.env.PYTHON??'python3',gitName='git';
if(process.platform==='darwin'){
 const selected='/var/db/xcode_select_link';symlinks[selected]=readlinkSync(selected);
 const developer=realpathSync(selected);if(!process.env.PYTHON)pythonName=join(developer,'usr/bin/python3');gitName=join(developer,'usr/bin/git');
}
const python=executable(pythonName),git=executable(gitName),ps=executable('ps');
const gitExec=spawnSync(git,['--exec-path'],{encoding:'utf8'});if(gitExec.status!==0)throw Error('GIT_EXEC_INSPECTION_FAILED');pin(gitExec.stdout.trim());
const templates=spawnSync(git,['config','--path','--get','init.templateDir'],{encoding:'utf8'});if(templates.status===0)pin(resolve(templates.stdout.trim()));else if(templates.status!==1)throw Error('GIT_TEMPLATE_INSPECTION_FAILED');
if(process.env.GIT_TEMPLATE_DIR)pin(resolve(process.env.GIT_TEMPLATE_DIR));
for(const p of ['/etc/gitconfig','/usr/share/git-core/templates'])optional(p);
const pythonPrefix=resolve(dirname(python),'..');
if(process.platform==='darwin')pin(pythonPrefix);else{
 const stdlib=join(pythonPrefix,'lib',`python${/python(\d+\.\d+)/.exec(python)?.[1]??'3.9'}`);pin(stdlib,['site-packages']);
 for(const name of readdirSync(join(pythonPrefix,'lib')))if(/^libpython.*\.so/.test(name))pin(join(pythonPrefix,'lib',name));
 // Freeze selected ELF interpreter and shared object dependencies before product execution.
 const binaries=Object.keys(physical).filter(p=>readFileSync(p).subarray(0,4).equals(Buffer.from([0x7f,0x45,0x4c,0x46])));
 for(const binary of binaries){const r=spawnSync('/usr/bin/ldd',[binary],{encoding:'utf8'});if(r.status!==0&&!String(r.stderr).includes('not a dynamic executable'))throw Error('ELF_INSPECTION_FAILED: '+binary);for(const path of (r.stdout??'').match(/\/[A-Za-z0-9_./+-]+/g)??[])if(existsSync(path))pin(path);}
}
// Only file identities are retained; no account/config values are printed.
optional(join(homedir(),'.gitconfig'));optional(join(homedir(),'.config/git/config'));
const origins=spawnSync(git,['config','--list','--show-origin','--name-only'],{encoding:'utf8'});if(origins.status!==0)throw Error('GIT_CONFIG_INSPECTION_FAILED');for(const line of origins.stdout.split('\n')){const m=/^file:(.+?)\t/.exec(line);if(m)optional(resolve(m[1]));}
const hooks=spawnSync(git,['config','--path','--get','core.hooksPath'],{encoding:'utf8'});if(hooks.status===0)pin(resolve(hooks.stdout.trim()));else if(hooks.status!==1)throw Error('HOOK_INSPECTION_FAILED');
if(process.platform==='darwin'){
 const prefix=resolve(dirname(git),'..');for(const p of [join(prefix,'libexec/git-core'),join(prefix,'share/git-core/templates')])optional(p);
}
let npm=null;
let installedRoot=null;
if(mode==='--candidate'){npm=executable('npm');pin(resolve(dirname(npm),'..'));if(argv[1])pin(realpathSync(argv[1]));if(argv[2])pin(realpathSync(argv[2]));}
if(mode==='--installed'){
 const consumer=realpathSync(argv[1]);pin(join(consumer,'node_modules'),['.git']);pin(join(consumer,'package.json'));pin(join(consumer,'package-lock.json'));
 installedRoot=mkdtempSync(join(consumer,'smoke-run-'));symlinkSync(join(consumer,'node_modules'),join(installedRoot,'node_modules'),'dir');pin(join(installedRoot,'node_modules'));
 const readme=readFileSync(join(consumer,'node_modules/@supersuit/transcript-md/README.md'),'utf8'),examples=[...readme.matchAll(/```(js|python)\n([\s\S]*?)```/g)];if(examples.length!==2)throw Error('README_EXAMPLES_INVALID');
 for(const [language,name]of [['js','example.mjs'],['python','example.py']]){const path=join(installedRoot,name);writeFileSync(path,examples.find(m=>m[1]===language)[2]);pin(path);}
}
const owned=process.env.TRANSCRIPT_MD_OWNED??mkdtempSync(join(tmpdir(),'transcript-md-test-'));mkdirSync(owned,{recursive:true});
const evidence=process.env.TRANSCRIPT_MD_EVIDENCE??mkdtempSync(join(tmpdir(),'transcript-md-evidence-'));mkdirSync(evidence,{recursive:true});
const label=process.env.TRANSCRIPT_MD_LABEL??String(Date.now()),inspection=join(evidence,label+'-inspection.json'),events=join(evidence,label+'-events.jsonl');
const platform={platform:process.platform,arch:process.arch,basis:'ELF loader/shared images physically pinned'};
if(process.platform==='darwin'){
 const build=spawnSync('/usr/bin/sw_vers',['-buildVersion'],{encoding:'utf8'}),seal=spawnSync('/usr/bin/csrutil',['authenticated-root','status'],{encoding:'utf8'});
 if(build.status!==0||seal.status!==0||!seal.stdout.includes('enabled'))throw Error('PLATFORM_IDENTITY_UNVERIFIED');
 platform.basis='Apple authenticated-root system images; physical Xcode framework and Git closure pinned';platform.build=build.stdout.trim();platform.authenticatedRoot=seal.stdout.trim();
}
writeFileSync(inspection,JSON.stringify({ready:true,physical,symlinks,directories,absent,runtimes:{node,python,git,ps,npm},platform},null,2)+'\n',{flag:'wx'});writeFileSync(events,'',{flag:'wx'});
for(const [p,h]of Object.entries(physical))if(hash(p)!==h)throw Error('INSPECTION_STALE: '+p);
for(const p of absent)if(existsSync(p))throw Error('INSPECTION_STALE_ABSENCE: '+p);
const env={...process.env,TRANSCRIPT_MD_OWNED:owned,TRANSCRIPT_MD_INSPECTION:inspection,TRANSCRIPT_MD_EVENTS:events,TRANSCRIPT_MD_EVIDENCE:evidence,TRANSCRIPT_MD_LABEL:label,TRANSCRIPT_MD_NPM_CLI:npm??'',TRANSCRIPT_MD_TARBALL:argv[1]??'',TRANSCRIPT_MD_PACK_RECEIPT:argv[2]??'',PYTHON:python,TMPDIR:owned,TMP:owned,TEMP:owned,PATH:[dirname(node),dirname(python),dirname(git),process.env.PATH].join(delimiter)};
for(const k of Object.keys(env))if(['GIT_DIR','GIT_WORK_TREE','GIT_COMMON_DIR','GIT_INDEX_FILE','GIT_PREFIX','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES'].includes(k)||k.startsWith('FREEDOM_')||['CLAUDE_PLUGIN_ROOT','CLAUDE_CONFIG_DIR','NEXT_STEP_WORKSPACE'].includes(k))delete env[k];
let args;
if(mode==='--candidate')args=[join(repo,'scripts/candidate.mjs')];else if(mode==='--installed')args=[join(repo,'scripts/installed-smoke.mjs'),installedRoot];else args=['--test','--test-concurrency=1',...(argv.length?argv:readdirSync(join(repo,'tests')).filter(n=>n.endsWith('.test.mjs')).map(n=>join(repo,'tests',n)))];
const r=spawnSync(node,args,{cwd:repo,env,encoding:'utf8',maxBuffer:64*1024*1024});
writeFileSync(join(evidence,label+'-request.json'),JSON.stringify({argv:[node,...args],cwd:repo,inspection,status:r.status,signal:r.signal,error:r.error?.code??null},null,2)+'\n',{flag:'wx'});writeFileSync(join(evidence,label+'-stdout'),r.stdout??'',{flag:'wx'});writeFileSync(join(evidence,label+'-stderr'),r.stderr??'',{flag:'wx'});process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');process.exitCode=r.status??1;
