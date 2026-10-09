#!/usr/bin/env node
// Deliberately break controls in disposable copies. A mutation must be caught.
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const cases=[
  ['sharing permission','context.mjs','context.test.mjs','const keep = readContext(record.text).metadata.keep;', 'const keep = "share";'],
  ['parent close','context.mjs','context.test.mjs','if (active.length) throw new Error(', 'if (false) throw new Error('],
  ['verification date','context.mjs','context.test.mjs','as_of:date, evidence:', 'as_of:context.metadata.as_of, evidence:'],
  ['frontmatter precedence','frontmatter/index.mjs','codec.test.mjs','const merged = { ...labels, ...(data ?? {}) };','const merged = { ...(data ?? {}), ...labels };'],
  ['one owner','engine.mjs','engine.test.mjs','if (owners.length !== 1)', 'if (false)'],
  ['no clobber','engine.mjs','engine.test.mjs','if (taken)', 'if (false)'],
  ['nested discovery','engine.mjs','nesting.test.mjs','if (depth < MAX_NESTING) walk(', 'if (false) walk('],
  ['subproject inside parent','engine.mjs','nesting.test.mjs','dir = join(pd, NESTED_ROOT, folder);', '/* scaffolded beside the parent */'],
  ['parent location lint','engine.mjs','nesting.test.mjs','} else if (physical && parentSlug !== basename(physical)) {', '} else if (false) {'],
  ['nesting plan parents first','engine.mjs','nesting.test.mjs','moves.sort((a, b) => depth(a.to) - depth(b.to) || (a.to < b.to ? -1 : 1));', 'moves.sort((a, b) => depth(b.to) - depth(a.to));'],
  ['lint graph','../bin/superprojects.mjs','cli.test.mjs','findings.push(...contextGraph(records).findings);','/* graph check deliberately removed */'],
  ['reference definitions','context.mjs','context.test.mjs','links.push(...[...body.matchAll(/\\]:[ \\t\\r\\n]*(?:<([^>]+)>|([^ \\t\\r\\n]+))/g)].map(m=>m[1]||m[2]));','/* reference definition check deliberately removed */'],
  ['ambiguous destinations','context.mjs','context.test.mjs',"throw new Error('Unsupported Markdown destination syntax; use a plain or percent-encoded path');","{}"],
  ['plan lint reads both header shapes','engine.mjs','engine.test.mjs','const d = facts(src) ?? {};','const d = split(src).data ?? {};'],
  ['gate refuses the agent','plan.mjs','plan.test.mjs',"if (s.kind === 'gate' && s.actors.some(isAgent))","if (false)"],
  ['behind on negative slack','plan.mjs','plan.test.mjs','verdict = overdueOnPath.length || slackDays < 0 ?','verdict = overdueOnPath.length ?'],
  ['targets are not-before','plan.mjs','plan.test.mjs','Math.max(earliest, target ? dayOf(target) : earliest)','earliest'],
  ['weekly hours bind','plan.mjs','plan.test.mjs','const take = Math.min(caps[a.slug] - (used.get(key) ?? 0), left);','const take = left;'],
];
let caught=0;
for(const [name,source,suite,before,after] of cases){
  const dir=mkdtempSync(join(tmpdir(),'project-mutation-'));
  try{
    cpSync(join(root,'src'),join(dir,'src'),{recursive:true});
    cpSync(join(root,'test'),join(dir,'test'),{recursive:true});
    cpSync(join(root,'bin'),join(dir,'bin'),{recursive:true});
    const file=join(dir,'src',source),text=readFileSync(file,'utf8');
    if(!text.includes(before))throw new Error(`Mutation anchor missing: ${name}`);
    writeFileSync(file,text.replace(before,after));
    const result=spawnSync(process.execPath,['--test',join(dir,'test',suite)],{encoding:'utf8'});
    if(result.status===0)throw new Error(`Mutation survived: ${name}`);
    if(!result.stdout.includes('ERR_ASSERTION'))throw new Error(`Mutation failed without an assertion: ${name}\n${result.stderr}`);
    console.log(`caught: ${name}`);caught++;
  }finally{rmSync(dir,{recursive:true,force:true});}
}
console.log(`${caught}/${cases.length} mutations caught`);
