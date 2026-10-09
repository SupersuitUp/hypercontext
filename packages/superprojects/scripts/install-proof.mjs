#!/usr/bin/env node
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync,readdirSync,existsSync,readlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const dir=mkdtempSync(join(tmpdir(),'project-install-proof-'));
function run(command,args,expected=0,cwd=dir){
  const result=spawnSync(command,args,{cwd,encoding:'utf8'});
  assert.equal(result.status,expected,`${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
try{
  const [pack]=JSON.parse(run('npm',['pack','--json','--pack-destination',dir],0,root));
  for(const file of pack.files){
    assert.ok(/^(src\/|bin\/|README\.md$|CHANGELOG\.md$|LICENSE$|package\.json$)/.test(file.path),`Unexpected package payload: ${file.path}`);
    const text=readFileSync(join(root,file.path),'utf8');
    assert.doesNotMatch(text,/\/Users\/[^/]+\/|[\w.+-]+@(?:gmail|hyperagentlabs)\.com/i,`Personal path/address in ${file.path}`);
  }
  writeFileSync(join(dir,'package.json'),JSON.stringify({private:true,type:'module'}));
  run('npm',['install','--ignore-scripts','--no-audit','--no-fund',join(dir,pack.filename)]);
  const bin=join(dir,'node_modules','.bin','superprojects');
  assert.match(run(bin,['--help']),/scaffold/);
  assert.equal(existsSync(join(dir,'node_modules','.bin','agentic-projects')),false,'the former command name is gone');
  run(bin,['scaffold','--root','demo/superprojects','--slug','guide','--name','Guide','--owner','alex','--goal','Deliver a reviewed guide','--date','2026-10-04','--summary','Guide prepared for review','--read-when','Resuming the guide','--keep','home','--audience','self','--actor','alex','--next-action','Alex reviews the guide']);
  const project='demo/superprojects/2026-10-04-guide';
  assert.deepEqual(readdirSync(join(dir,project)).sort(),['ATOMIC-ACTION-MAP.md','STATE.md','SUPERPROJECT.md']);
  assert.equal(JSON.parse(run(bin,['list','--root','demo/superprojects','--json'])).projects.length,1);
  const state=`${project}/STATE.md`;
  assert.equal(JSON.parse(run(bin,['read','--file',state,'--json'])).metadata.as_of,'2026-10-04');
  assert.equal(JSON.parse(run(bin,['query','--root','demo/superprojects','--kind','project','--where','status=active','--json'])).rows.length,1);
  run(bin,['verify','--file',state,'--date','2026-10-04','--by','alex','--source','SUPERPROJECT.md','--origin','human','--write']);
  assert.equal(JSON.parse(run(bin,['close-check','--root','demo/superprojects','--slug','2026-10-04-guide','--json'])).canClose,true);
  assert.ok(JSON.parse(run(bin,['lint','--root','demo/superprojects','--json'],1)).findings.length);
  assert.ok(JSON.parse(run(bin,['map','lint','--project',project,'--json'],1)).findings.some(f=>f.code==='plan:target:missing'));
  assert.equal(JSON.parse(run(bin,['map','status','--project',project,'--date','2026-10-04','--json'])).verdict,'no-deadline');
  assert.equal(run(bin,['plan','status','--project',project,'--date','2026-10-04']),run(bin,['map','status','--project',project,'--date','2026-10-04']),'plan is an alias of map');
  // A tree written before 0.5.0 still reads, and migrate converts it.
  const old=join(dir,'demo','projects','2026-09-01-letters');
  mkdirSync(old,{recursive:true});
  writeFileSync(join(old,'PROJECT.md'),'---\nkind: finite\nstatus: active\ngoal: Mail the letters\nrepo: here\nowner: alex\n---\n# Letters\n\nSee [the guide](../../superprojects/2026-10-04-guide/SUPERPROJECT.md) and [the map](PLAN.md).\n');
  writeFileSync(join(old,'STATE.md'),'---\nlast_worked: 2026-10-04\nphase: drafting\n---\n# State\n\n## Next action\n\nAlex signs the letters.\n');
  writeFileSync(join(old,'PLAN.md'),'---\nplan_version: "1"\nbaseline: 2026-10-04\n---\n# Plan\n\n## Steps\n\n### s01 Alex signs\n- actor: alex\n- effort: 1h (estimate, alex, 2026-10-04)\n\n### m1 Letters out\n- kind: milestone\n- after: s01\n- target: 2026-10-20 (provisional)\n');
  assert.equal(JSON.parse(run(bin,['map','status','--project','demo/projects/2026-09-01-letters','--date','2026-10-04','--json'])).verdict,'on-track','the old names read');
  assert.match(run(bin,['migrate','--root','demo/projects']),/Dry run/);
  assert.ok(existsSync(join(old,'PROJECT.md')),'a dry run changes nothing');
  assert.equal(JSON.parse(run(bin,['migrate','--root','demo/projects','--apply','--json'])).applied,true);
  assert.deepEqual(readdirSync(join(dir,'demo','superprojects','2026-09-01-letters')).sort(),['ATOMIC-ACTION-MAP.md','STATE.md','SUPERPROJECT.md']);
  assert.equal(readlinkSync(join(dir,'demo','projects')),'superprojects');
  assert.match(readFileSync(join(dir,'demo','superprojects','2026-09-01-letters','SUPERPROJECT.md'),'utf8'),/\[the map\]\(ATOMIC-ACTION-MAP\.md\)/);
  assert.equal(JSON.parse(run(bin,['list','--root','demo/superprojects','--json'])).projects.length,2);
  writeFileSync(join(dir,'permitted-record.md'),'---\ncontext_version: "1"\nid: shared-note\nsummary: Explicitly permitted note\nread_when: Reading the note\nas_of: 2026-10-04\nkeep: share\naudience: readers\n---\n# Note\n\nAn approved synthetic record.\n');
  assert.equal(JSON.parse(run(bin,['export','--file','permitted-record.md','--to','share','--json'])).records.length,1);
  run(process.execPath,['--input-type=module','-e',"import { createProjectEngine, validateContext, planStatus, NAMES, recordFileOf, renderActionMapMd, planMigration } from '@supersuit/superprojects'; if (!createProjectEngine().resumability || typeof validateContext !== 'function' || typeof planStatus !== 'function' || NAMES.record !== 'SUPERPROJECT.md' || typeof recordFileOf !== 'function' || typeof renderActionMapMd !== 'function' || typeof planMigration !== 'function') process.exit(1)"]);
  console.log(`Installed ${pack.filename} outside source checkout; documented CLI/library commands pass; ${pack.files.length} payload files audited`);
}finally{rmSync(dir,{recursive:true,force:true});}
