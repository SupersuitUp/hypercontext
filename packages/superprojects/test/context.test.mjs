import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readContext, validateContext, contextGraph, exportContext, verifyContext, assertCanClose, assertSafeConfig } from '../src/context.mjs';

const text = (extra = {}, body = '# Current picture\n\nOne concrete next action.\n') => {
  const data = {context_version:'1', id:'project-alpha', summary:'A documented outcome', read_when:'Resuming this project', as_of:'2026-10-04', keep:'share', audience:'self', ...extra};
  return `---\n${Object.entries(data).map(([k,v])=>`${k}: ${JSON.stringify(v)}`).join('\n')}\n---\n${body}`;
};
test('strict contract validates actual calendar dates and all required fields', () => {
  assert.deepEqual(validateContext(text()), []);
  assert.ok(validateContext(text({as_of:'2026-02-30'})).some(f=>f.code==='invalid-date'));
  assert.ok(validateContext(text({summary:''})).some(f=>f.code==='missing-context'));
  assert.ok(validateContext(text({context_version:'2'})).some(f=>f.code==='unsupported-context'));
  assert.ok(validateContext('---\nid: broken\n').some(f=>f.level==='error'));
  assert.ok(validateContext(text({as_of:'2026-10-05'}),{asOf:'2026-10-04'}).some(f=>f.code==='future-context'));
});
test('legacy record remains readable and warns without inventing fields', () => {
  const old='---\nlast_worked: 2026-10-04\n---\n# State\n';
  assert.equal(readContext(old).metadata.as_of, undefined);
  assert.ok(validateContext(old).every(f=>f.level==='warn'));
});
test('verification requires explicit attributed evidence and preserves work date/body', () => {
  const old=text({last_worked:'2026-10-01',as_of:'2026-10-01'}, '# State\n\nOriginal raw capture.\n');
  assert.throws(()=>verifyContext(old, {date:'2026-10-04'}), /attributed evidence/);
  const next=verifyContext(old, {date:'2026-10-04',by:'owner',source:'source.md',origin:'human',rev:'abc123'});
  const parsed=readContext(next);
  assert.equal(parsed.metadata.last_worked,'2026-10-01');
  assert.equal(parsed.metadata.as_of,'2026-10-04');
  assert.equal(parsed.body,readContext(old).body);
  assert.equal(parsed.evidence[0].by,'owner');
  assert.throws(()=>verifyContext(old, {date:'2026-02-30',by:'owner',source:'source.md',origin:'human'}),/date/);
});
test('evidence rejects invented attribution and malformed JSON; drift requests recheck', () => {
  const evidence=[{type:'claim',date:'2026-10-01',by:'owner',origin:'human',source:'source.md',rev:'abc'}];
  assert.ok(validateContext(text({evidence:JSON.stringify(evidence)}), {file:'/tmp/project/STATE.md',exists:()=>true,revisionOf:()=>'def'}).some(f=>f.code==='evidence-drift'&&f.level==='warn'));
  assert.ok(validateContext(text({evidence:'not-json'})).some(f=>f.code==='invalid-evidence'));
  assert.ok(validateContext(text({evidence:JSON.stringify([{...evidence[0],by:''}])})).some(f=>f.code==='missing-attribution'));
  assert.ok(validateContext(text({evidence:JSON.stringify(evidence)}), {file:'/tmp/project/STATE.md',exists:()=>false}).some(f=>f.code==='missing-source'));
  assert.ok(validateContext(text({evidence:JSON.stringify(evidence)}), {file:'/tmp/project/STATE.md',exists:()=>true}).some(f=>f.code==='unverifiable-evidence'));
});
test('graph derives backlinks, rejects duplicate identities and missing relationships', () => {
  const records=[{path:'/p/a.md',text:text({relations:JSON.stringify([{type:'depends-on',target:'project-beta'}])})},{path:'/p/b.md',text:text({id:'project-beta'})}];
  const g=contextGraph(records);
  assert.deepEqual(g.backlinks['project-beta'],[{from:'project-alpha',type:'depends-on'}]);
  assert.equal(g.findings.length,0);
  assert.ok(contextGraph([...records,{path:'/p/c.md',text:text()}]).findings.some(f=>f.code==='duplicate-id'));
  assert.ok(contextGraph(records.slice(0,1)).findings.some(f=>f.code==='missing-target'));
});
test('export requires declared permission and closes private relationship/source leaks', () => {
  const shared={path:'/p/a.md',text:text()};
  assert.deepEqual(exportContext([shared],{to:'share'}),[shared]);
  assert.throws(()=>exportContext([{path:'/p/a.md',text:text({keep:'home'})}],{to:'share'}),/permission/);
  assert.throws(()=>exportContext([{path:'/p/a.md',text:'# Legacy'}],{to:'share'}),/permission/);
  assert.throws(()=>exportContext([{path:'/p/a.md',text:text({}, '[Private source](private.md)')}],{to:'share'}),/outside.*bundle/);
  assert.throws(()=>exportContext([{path:'/p/a.md',text:text({relations:JSON.stringify([{type:'depends-on',target:'private'}])})}],{to:'share'}),/missing.*target/);
  assert.throws(()=>exportContext([{path:'/p/a.md',text:text({evidence:JSON.stringify([{type:'claim',date:'2026-10-04',by:'owner',origin:'human',source:'private.md',rev:'abc'}])})}],{to:'share'}),/outside.*bundle/);
});
test('sharing refuses autolinks, raw HTML, multiline images and nested labels',()=>{
  for(const body of ['<https://example.invalid/private-token>','https://example.invalid/raw','![image](\nprivate.png\n)','[a [nested] label](private.md)','<a href="private.md">private</a>','<img srcset="private.png 1x, other.png 2x">']){
    assert.throws(()=>exportContext([{path:'/p/a.md',text:text({},body)}],{to:'share'}),/External source|outside.*bundle|Raw HTML/);
  }
  const records=[{path:'/p/a.md',text:text({},'[a [nested] label](b.md)')},{path:'/p/b.md',text:text({id:'project-beta'})}];
  assert.equal(exportContext(records,{to:'share'}).length,2);
  assert.throws(()=>exportContext([{path:'/p/a.md',text:text({source_of_truth:'https://example.invalid/private-repository'})}],{to:'share'}),/External source/);
});
test('parent closure refuses active descendants including done-folder children', () => {
  const parent={slug:'parent',status:'active'};
  assert.throws(()=>assertCanClose(parent,[{slug:'child',parent:'parent',status:'active',dir:'/p/done/child'}]),/child/);
  assert.throws(()=>assertCanClose(parent,[{slug:'child',parent:'parent',status:'done'},{slug:'grandchild',parent:'child',status:'active'}]),/grandchild/);
  assert.equal(assertCanClose(parent,[{slug:'child',parent:'parent',status:'done'}]),true);
  assert.throws(()=>assertCanClose(parent,[{slug:'child',parent:['parent'],status:'active'}]),/Invalid parent/);
  assert.throws(()=>assertCanClose(parent,[{slug:'child',parent:'parent',status:['done']}]),/Invalid project status/);
});
test('configuration refuses secrets recursively', () => {
  assert.throws(()=>assertSafeConfig({adapter:{apiKey:'literal'}}),/configuration/);
  assert.deepEqual(assertSafeConfig({root:'/p',owner:'alex'}),{root:'/p',owner:'alex'});
});
