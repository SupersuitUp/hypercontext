#!/usr/bin/env node
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
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
  const bin=join(dir,'node_modules','.bin','agentic-projects');
  assert.match(run(bin,['--help']),/scaffold/);
  run(bin,['scaffold','--root','demo/projects','--slug','guide','--name','Guide','--owner','alex','--goal','Deliver a reviewed guide','--date','2026-10-04','--summary','Guide prepared for review','--read-when','Resuming the guide','--keep','home','--audience','self','--actor','alex','--next-action','Alex reviews the guide']);
  assert.equal(JSON.parse(run(bin,['list','--root','demo/projects','--json'])).projects.length,1);
  const state='demo/projects/2026-10-04-guide/STATE.md';
  assert.equal(JSON.parse(run(bin,['read','--file',state,'--json'])).metadata.as_of,'2026-10-04');
  assert.equal(JSON.parse(run(bin,['query','--root','demo/projects','--kind','project','--where','status=active','--json'])).rows.length,1);
  run(bin,['verify','--file',state,'--date','2026-10-04','--by','alex','--source','PROJECT.md','--origin','human','--write']);
  assert.equal(JSON.parse(run(bin,['close-check','--root','demo/projects','--slug','2026-10-04-guide','--json'])).canClose,true);
  assert.ok(JSON.parse(run(bin,['lint','--root','demo/projects','--json'],1)).findings.length);
  writeFileSync(join(dir,'permitted-record.md'),'---\ncontext_version: "1"\nid: shared-note\nsummary: Explicitly permitted note\nread_when: Reading the note\nas_of: 2026-10-04\nkeep: share\naudience: readers\n---\n# Note\n\nAn approved synthetic record.\n');
  assert.equal(JSON.parse(run(bin,['export','--file','permitted-record.md','--to','share','--json'])).records.length,1);
  run(process.execPath,['--input-type=module','-e',"import { createProjectEngine, validateContext } from '@supersuit/agentic-projects'; if (!createProjectEngine().resumability || typeof validateContext !== 'function') process.exit(1)"]);
  console.log(`Installed ${pack.filename} outside source checkout; documented CLI/library commands pass; ${pack.files.length} payload files audited`);
}finally{rmSync(dir,{recursive:true,force:true});}
