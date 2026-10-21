import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {guard,spawnSync,probe} from '../tests/helpers/native.mjs';
import {verifyPayload} from './verify-payload.mjs';
guard();
const repo=fileURLToPath(new URL('../',import.meta.url)),owned=mkdtempSync(join(process.env.TRANSCRIPT_MD_OWNED,'candidate-')),pack=join(owned,'pack'),consumer=join(owned,'consumer');mkdirSync(pack);mkdirSync(consumer);
const user=join(owned,'user.npmrc'),global=join(owned,'global.npmrc');writeFileSync(user,'');writeFileSync(global,'');
const flags=['--userconfig',user,'--globalconfig',global,'--cache',join(owned,'npm-cache'),'--ignore-scripts','--no-audit','--no-fund'];
function npm(args,cwd=owned){const r=spawnSync(process.execPath,[process.env.TRANSCRIPT_MD_NPM_CLI,...args,...flags],{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(r.stderr,'','Unexpected npm stderr');return r;}
const packed=process.env.TRANSCRIPT_MD_TARBALL?JSON.parse(readFileSync(process.env.TRANSCRIPT_MD_PACK_RECEIPT,'utf8')):JSON.parse(npm(['pack',repo,'--json','--pack-destination',pack]).stdout);assert.equal(packed.length,1);const tarball=process.env.TRANSCRIPT_MD_TARBALL||join(pack,packed[0].filename);const audit=probe(verifyPayload,[tarball]);assert.equal(audit.integrity,packed[0].integrity);writeFileSync(join(owned,'payload-audit.json'),JSON.stringify(audit,null,2)+'\n');
writeFileSync(join(consumer,'package.json'),JSON.stringify({name:'anonymous-transcript-consumer',version:'1.0.0',private:true,type:'module'}));npm(['install',tarball,'--offline'],consumer);
const label=process.env.TRANSCRIPT_MD_LABEL+'-installed';
const tested=spawnSync(process.execPath,[join(repo,'scripts/run-tests.mjs'),'--installed',consumer],{cwd:owned,encoding:'utf8',env:{...process.env,TRANSCRIPT_MD_LABEL:label,TRANSCRIPT_MD_OWNED:owned}});process.stdout.write(tested.stdout);process.stderr.write(tested.stderr);assert.equal(tested.status,0,tested.stderr);
const result={tarball,consumer,audit_path:join(owned,'payload-audit.json'),integrity:audit.integrity,sha256:audit.sha256,files:audit.files.length,installed_status:tested.status};writeFileSync(join(process.env.TRANSCRIPT_MD_EVIDENCE,process.env.TRANSCRIPT_MD_LABEL+'-candidate.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
