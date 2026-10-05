import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {posix} from 'node:path';
import {fileURLToPath} from 'node:url';
const digest=(bytes,kind='sha256')=>createHash(kind).update(bytes).digest('hex');
export function verifyPayload(tarball){
 const compressed=readFileSync(tarball),tar=gunzipSync(compressed),members=new Map();
 for(let p=0;p+512<=tar.length;){const h=tar.subarray(p,p+512);if(h.every(b=>b===0))break;
  const string=(start,len)=>h.subarray(start,start+len).toString('utf8').replace(/\0.*$/s,'');
  const name=string(0,100),prefix=string(345,155),path=prefix?prefix+'/'+name:name,size=parseInt(string(124,12).trim()||'0',8),type=string(156,1);
  assert.ok(Number.isSafeInteger(size)&&size>=0);assert.ok(['','0'].includes(type),'Only regular payload files');assert.ok(path.startsWith('package/')&&!path.split('/').includes('..'));assert.ok(!members.has(path),'Duplicate payload member');members.set(path,tar.subarray(p+512,p+512+size));p+=512+Math.ceil(size/512)*512;
 }
 const pkg=JSON.parse(members.get('package/package.json'));
 assert.equal(pkg.name,'@supersuit/transcript-md');assert.equal(pkg.version,JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).version);assert.equal(pkg.license,'SEE LICENSE IN LICENSE');assert.equal(pkg.engines.node,'>=22');assert.equal(pkg.repository.url,'git+https://github.com/SupersuitUp/transcript-md.git');assert.equal(pkg.publishConfig.access,'public');assert.equal(pkg.dependencies,undefined);assert.equal(pkg.scripts?.install,undefined);assert.equal(pkg.scripts?.postinstall,undefined);
 const allowed=/^package\/(?:package\.json|index\.mjs|LICENSE|NOTICE|README\.md|FORMAT\.md|CHANGELOG\.md|lib\/(?:[a-z_-]+\.(?:mjs|py)|frontmatter\/(?:conversation\.mjs|conversation\.schema\.json|yaml\.mjs)))$/;
 for(const [path,bytes]of members){assert.match(path,allowed,'Unexpected public file');const text=bytes.toString('utf8');assert.doesNotMatch(text,/\/Users\/|garysheng|garysheng11|meeting-transcripts\/.+\.wav|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|[A-Z_]+_API_KEY=/,'Private path/credential payload');assert.doesNotMatch(text,/\+\d{10,15}\b/,'Phone-number payload');assert.doesNotMatch(text,/[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,'Email payload');
  if(path.endsWith('.mjs'))for(const m of text.matchAll(/(?:^import[^\n]*?from\s*|\bimport\s*\()\s*['"]([^'"]+)['"]/gm)){const dep=m[1];if(dep.startsWith('.'))assert.ok(members.has(posix.normalize(posix.join(posix.dirname(path),dep))),'Missing physical import: '+dep);else assert.ok(dep.startsWith('node:')||['fs','path','os'].includes(dep),'Unexpected dependency: '+dep);}
 }
 for(const value of [...Object.values(pkg.exports),...Object.values(pkg.bin)])assert.ok(members.has('package/'+value.replace(/^\.\//,'')),'Export/bin absent');
 const originalLicense=readFileSync(new URL('../LICENSE',import.meta.url));assert.deepEqual(members.get('package/LICENSE'),originalLicense);assert.match(members.get('package/NOTICE').toString(),/Copyright © 1991-2026 Unicode/);
 const result={package:pkg.name,version:pkg.version,sha256:digest(compressed),integrity:'sha512-'+createHash('sha512').update(compressed).digest('base64'),license_sha256:digest(originalLicense),files:[...members].map(([path,bytes])=>({path,bytes:bytes.length,sha256:digest(bytes)}))};return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(verifyPayload(process.argv[2]),null,2));
