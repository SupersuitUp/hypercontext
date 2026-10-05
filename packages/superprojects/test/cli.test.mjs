import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const bin=fileURLToPath(new URL('../bin/agentic-projects.mjs',import.meta.url));
const cli=(...args)=>spawnSync(process.execPath,[bin,...args],{encoding:'utf8'});
test('CLI help and usage exits',()=>{
  assert.match(cli('--help').stdout,/scaffold.*list/s);
  assert.equal(cli('unknown').status,2);
  assert.equal(cli('read').status,2);
  assert.equal(cli('list','--typo').status,2);
});
test('documented commands work in an external directory',()=>{
  const dir=mkdtempSync(join(tmpdir(),'project-cli-')),root=join(dir,'projects');
  try {
    const created=cli('scaffold','--root',root,'--slug','demo','--name','Demo','--owner','alex','--goal','Deliver a reviewed guide','--date','2026-10-04','--summary','Guide ready for review','--read-when','Resuming the guide','--keep','home','--audience','self','--actor','alex','--next-action','Alex reviews the guide');
    assert.equal(created.status,0,created.stderr);
    const project=join(root,'2026-10-04-demo','PROJECT.md'),state=join(root,'2026-10-04-demo','STATE.md');
    assert.equal(JSON.parse(cli('list','--root',root,'--json').stdout).projects.length,1);
    assert.equal(JSON.parse(cli('query','--root',root,'--kind','project','--json').stdout).rows.length,1);
    assert.match(cli('read','--file',project).stdout,/Guide ready for review/);
    const lint=cli('lint','--root',root,'--json');
    assert.ok([0,1].includes(lint.status),lint.stderr);
    assert.ok(JSON.parse(lint.stdout).findings);
    const before=readFileSync(state,'utf8');
    const verify=cli('verify','--file',state,'--date','2026-10-04','--by','alex','--source','PROJECT.md','--origin','human','--write');
    assert.equal(verify.status,0,verify.stderr);
    assert.notEqual(readFileSync(state,'utf8'),before);
    assert.equal(cli('export','--file',project,'--to','share','--json').status,1);
    assert.equal(cli('scaffold','--root',root,'--slug','another','--owner','alex').status,2);
    assert.equal(cli('close-check','--root',root,'--slug','2026-10-04-demo','--json').status,0);
    const shared=readFileSync(project,'utf8').replace(/keep: home/,'keep: share')+'\n[Private source](private.md)\n';
    writeFileSync(project,shared);
    assert.equal(cli('export','--file',project,'--to','share','--json').status,1,'private source links require an explicitly permitted bundle');
  } finally {rmSync(dir,{recursive:true,force:true});}
});
