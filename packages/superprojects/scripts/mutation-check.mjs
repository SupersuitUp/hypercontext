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
  ['no clobber','engine.mjs','engine.test.mjs','if (existsSync(dir))', 'if (false)'],
];
let caught=0;
for(const [name,source,suite,before,after] of cases){
  const dir=mkdtempSync(join(tmpdir(),'project-mutation-'));
  try{
    cpSync(join(root,'src'),join(dir,'src'),{recursive:true});
    cpSync(join(root,'test'),join(dir,'test'),{recursive:true});
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
