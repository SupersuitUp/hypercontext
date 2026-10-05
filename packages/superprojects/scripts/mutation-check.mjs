#!/usr/bin/env node
// Deliberately break controls in disposable copies. A mutation must be caught.
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const cases=[
  ['sharing permission','const keep = readContext(record.text).metadata.keep;', 'const keep = "share";'],
  ['parent close','if (active.length) throw new Error(', 'if (false) throw new Error('],
  ['verification date','as_of:date, evidence:', 'as_of:context.metadata.as_of, evidence:'],
];
let caught=0;
for(const [name,before,after] of cases){
  const dir=mkdtempSync(join(tmpdir(),'project-mutation-'));
  try{
    cpSync(join(root,'src'),join(dir,'src'),{recursive:true});
    cpSync(join(root,'test'),join(dir,'test'),{recursive:true});
    const file=join(dir,'src/context.mjs'),text=readFileSync(file,'utf8');
    if(!text.includes(before))throw new Error(`Mutation anchor missing: ${name}`);
    writeFileSync(file,text.replace(before,after));
    const result=spawnSync(process.execPath,['--test',join(dir,'test/context.test.mjs')],{encoding:'utf8'});
    if(result.status===0)throw new Error(`Mutation survived: ${name}`);
    if(!result.stdout.includes('ERR_ASSERTION'))throw new Error(`Mutation failed without an assertion: ${name}\n${result.stderr}`);
    console.log(`caught: ${name}`);caught++;
  }finally{rmSync(dir,{recursive:true,force:true});}
}
console.log(`${caught}/${cases.length} mutations caught`);
