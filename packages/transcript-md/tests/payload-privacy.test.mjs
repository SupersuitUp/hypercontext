import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {verifyPayload} from '../scripts/verify-payload.mjs';
import {guard,probe} from './helpers/native.mjs';

// Real public members, archived as anonymous test inputs. No npm pack replay.
function archive(yaml){
 guard();const names=['package.json','index.mjs','LICENSE','NOTICE','README.md','FORMAT.md','CHANGELOG.md'];
 const {files}=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));
 assert.ok(files.includes('lib/'));
 const collect=url=>{for(const entry of readdirSync(url,{withFileTypes:true}))entry.isDirectory()?collect(new URL(entry.name+'/',url)):names.push(fileURLToPath(new URL(entry.name,url)).slice(fileURLToPath(new URL('../',import.meta.url)).length));};
 collect(new URL('../lib/',import.meta.url));
 const parts=[];
 for(const name of names){const bytes=name==='lib/frontmatter/yaml.mjs'?Buffer.from(yaml):readFileSync(new URL('../'+name,import.meta.url)),h=Buffer.alloc(512);h.write('package/'+name,0,100);h.write('0000644\0',100);h.write('0000000\0',108);h.write('0000000\0',116);h.write(bytes.length.toString(8).padStart(11,'0')+'\0',124);h.write('00000000000\0',136);h.fill(32,148,156);h.write('0',156);h.write('ustar\0',257);h.write('00',263);const sum=h.reduce((a,b)=>a+b,0);h.write(sum.toString(8).padStart(6,'0')+'\0 ',148);parts.push(h,bytes,Buffer.alloc((512-bytes.length%512)%512));}
 parts.push(Buffer.alloc(1024));const path=join(mkdtempSync(join(process.env.TRANSCRIPT_MD_OWNED,'payload-privacy-')),'fixture.tgz');writeFileSync(path,gzipSync(Buffer.concat(parts)));return path;
}
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
test('payload audit rejects the inherited private-source phone comment',()=>{
 const yaml=readFileSync(new URL('../lib/frontmatter/yaml.mjs',import.meta.url),'utf8');
 // Before correction this is the real inherited member; retain its original bytes in RED.
 const rejected=archive(yaml.includes('"example"   # a note')?yaml.replace('"example"   # a note','"+19999999999"   # a note'):yaml);
 assert.throws(()=>probe(verifyPayload,[rejected]),/Phone-number payload/);
});
test('payload audit accepts a generic quoted-string comment',()=>{
 const yaml=readFileSync(new URL('../lib/frontmatter/yaml.mjs',import.meta.url),'utf8').replace(/\+\d{10,15}/g,'example');
 assert.equal(probe(verifyPayload,[archive(yaml)]).files.length,25);
});
