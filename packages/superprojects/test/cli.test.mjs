import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const bin=fileURLToPath(new URL('../bin/superprojects.mjs',import.meta.url));
const cli=(...args)=>spawnSync(process.execPath,[bin,...args],{encoding:'utf8'});
test('CLI help and usage exits',()=>{
  assert.match(cli('--help').stdout,/scaffold.*list/s);
  assert.equal(cli('unknown').status,2);
  assert.equal(cli('read').status,2);
  assert.equal(cli('list','--typo').status,2);
});
test('documented commands work in an external directory',()=>{
  const dir=mkdtempSync(join(tmpdir(),'project-cli-')),root=join(dir,'superprojects');
  try {
    const created=cli('scaffold','--root',root,'--slug','demo','--name','Demo','--owner','alex','--goal','Deliver a reviewed guide','--date','2026-10-04','--summary','Guide ready for review','--read-when','Resuming the guide','--keep','home','--audience','self','--actor','alex','--next-action','Alex reviews the guide');
    assert.equal(created.status,0,created.stderr);
    const project=join(root,'2026-10-04-demo','SUPERPROJECT.md'),state=join(root,'2026-10-04-demo','STATE.md');
    assert.equal(JSON.parse(cli('list','--root',root,'--json').stdout).projects.length,1);
    assert.equal(JSON.parse(cli('query','--root',root,'--kind','project','--json').stdout).rows.length,1);
    assert.match(cli('read','--file',project).stdout,/Guide ready for review/);
    const lint=cli('lint','--root',root,'--json');
    assert.ok([0,1].includes(lint.status),lint.stderr);
    assert.ok(JSON.parse(lint.stdout).findings);
    const before=readFileSync(state,'utf8');
    const verify=cli('verify','--file',state,'--date','2026-10-04','--by','alex','--source','SUPERPROJECT.md','--origin','human','--write');
    assert.equal(verify.status,0,verify.stderr);
    assert.notEqual(readFileSync(state,'utf8'),before);
    assert.equal(cli('export','--file',project,'--to','share','--json').status,1);
    assert.equal(cli('scaffold','--root',root,'--slug','another','--owner','alex').status,2);
    assert.equal(cli('close-check','--root',root,'--slug','2026-10-04-demo','--json').status,0);
    const shared=readFileSync(project,'utf8').replace(/keep: home/,'keep: share')+'\n[Private source](private.md)\n';
    writeFileSync(project,shared);
    assert.equal(cli('export','--file',project,'--to','share','--json').status,1,'private source links require an explicitly permitted bundle');
    const duplicate=readFileSync(state,'utf8').replace(/id: [^\n]+/,'id: 2026-10-04-demo');
    writeFileSync(state,duplicate);
    const graphFindings=JSON.parse(cli('lint','--root',root,'--json').stdout).findings;
    assert.ok(graphFindings.some(f=>f.code==='duplicate-id'),'lint checks the full identity graph');
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('subprojects scaffold inside their parent, close-check sees them, nest-plan reports flat ones',()=>{
  const dir=mkdtempSync(join(tmpdir(),'project-cli-')),root=join(dir,'superprojects');
  const base=['--name','Demo','--owner','alex','--goal','Deliver a reviewed guide','--date','2026-10-04','--summary','Guide ready for review','--read-when','Resuming the guide','--keep','home','--audience','self','--actor','alex','--next-action','Alex reviews the guide'];
  try {
    assert.equal(cli('scaffold','--root',root,'--slug','parent',...base).status,0);
    const child=cli('scaffold','--root',root,'--slug','child','--parent','2026-10-04-parent',...base,'--json');
    assert.equal(child.status,0,child.stderr);
    assert.equal(JSON.parse(child.stdout).dir,join(root,'2026-10-04-parent','superprojects','2026-10-04-child'));
    assert.equal(cli('close-check','--root',root,'--slug','2026-10-04-parent','--json').status,1,'an open subproject blocks closing its parent');
    const plan=JSON.parse(cli('nest-plan','--root',root,'--json').stdout);
    assert.deepEqual(plan.moves,[]);
    assert.match(cli('nest-plan','--root',root).stdout,/already sits inside/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('plan commands read a scaffolded project', () => {
  const dir = mkdtempSync(join(tmpdir(), 'project-plan-cli-')), root = join(dir, 'superprojects');
  try {
    const made = cli('scaffold','--root',root,'--slug','guide','--name','Guide','--owner','alex','--goal','Deliver a reviewed guide','--date','2026-10-04','--summary','Guide ready for review','--read-when','Resuming the guide','--keep','home','--audience','self','--actor','alex','--next-action','Alex reviews the guide','--json');
    assert.equal(made.status, 0, made.stderr);
    const project = join(root, '2026-10-04-guide');
    const lint = cli('plan','lint','--project',project,'--json');
    assert.equal(lint.status, 1, 'the skeleton has an undated milestone');
    assert.ok(JSON.parse(lint.stdout).findings.some((f) => f.code === 'plan:target:missing'));
    const st = JSON.parse(cli('plan','status','--project',project,'--date','2026-10-04','--json').stdout);
    assert.equal(st.verdict, 'no-deadline');
    const free = join(dir, 'free.json');
    writeFileSync(free, JSON.stringify([{ start: '2026-10-05T14:00:00Z', end: '2026-10-05T16:00:00Z' }]));
    const blocks = JSON.parse(cli('plan','blocks','--project',project,'--date','2026-10-04','--actor','alex','--free',free,'--json').stdout);
    assert.ok(Array.isArray(blocks.proposals));
    assert.equal(cli('plan','nope','--project',project).status, 2);
    const bare = cli('scaffold','--root',root,'--slug','bare','--name','Bare','--owner','alex','--goal','A goal','--date','2026-10-04','--summary','s','--read-when','r','--keep','home','--audience','self','--actor','alex','--next-action','n','--no-plan');
    assert.equal(bare.status, 0, bare.stderr);
    assert.equal(existsSync(join(root, '2026-10-04-bare', 'ATOMIC-ACTION-MAP.md')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('map is the command and plan is an alias that answers identically', () => {
  const dir = mkdtempSync(join(tmpdir(), 'project-map-cli-')), root = join(dir, 'superprojects');
  try {
    const made = cli('scaffold','--root',root,'--slug','guide','--name','Guide','--owner','alex','--goal','Deliver a reviewed guide','--date','2026-10-04','--summary','Guide ready for review','--read-when','Resuming the guide','--keep','home','--audience','self','--actor','alex','--next-action','Alex reviews the guide','--json');
    assert.equal(made.status, 0, made.stderr);
    const project = join(root, '2026-10-04-guide');
    assert.equal(existsSync(join(project, 'ATOMIC-ACTION-MAP.md')), true);
    for (const sub of [['lint','--json'],['status','--date','2026-10-04'],['status','--date','2026-10-04','--json'],['schedule','--date','2026-10-04']]) {
      const viaMap = cli('map', sub[0], '--project', project, ...sub.slice(1));
      const viaPlan = cli('plan', sub[0], '--project', project, ...sub.slice(1));
      assert.equal(viaMap.status, viaPlan.status, sub.join(' '));
      assert.equal(viaMap.stdout, viaPlan.stdout, sub.join(' '));
      assert.ok(viaMap.stdout.length > 0, sub.join(' '));
    }
    assert.equal(cli('map','nope','--project',project).status, 2);
    const bare = cli('scaffold','--root',root,'--slug','bare','--name','Bare','--owner','alex','--goal','A goal','--date','2026-10-04','--summary','s','--read-when','r','--keep','home','--audience','self','--actor','alex','--next-action','n','--no-map');
    assert.equal(bare.status, 0, bare.stderr);
    const missing = cli('map','status','--project',join(root,'2026-10-04-bare'));
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /has no ATOMIC-ACTION-MAP\.md/);
    assert.equal(cli('list','--root',root,'--apply').status, 2, '--apply belongs to migrate alone');
    assert.match(cli('--help').stdout, /^map +The atomic action map/m);
    assert.doesNotMatch(cli('--help').stdout, /agentic-projects/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
