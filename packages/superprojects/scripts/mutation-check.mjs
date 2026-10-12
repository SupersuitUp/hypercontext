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
  ['nested discovery','engine.mjs','nesting.test.mjs','for (const nested of rootsOf(dir)) walk(nested, depth + 1);', '{ /* nested roots not walked */ }'],
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
  ['sessions refuse a non-superproject','sessions.mjs','sessions.test.mjs','if (!recordFileOf(dir, names)) throw','if (false) throw'],
  ['sessions skip a repeat','sessions.mjs','sessions.test.mjs','    return { written: false, file, entry: prior };','    {}'],
  ['touched reads nested superprojects','sessions.mjs','sessions.test.mjs','      superprojectDirs(dir, names, out, seen);','      /* nested not walked */'],
  ['legacy record read-through','names.mjs','names.test.mjs','firstExisting(dir, [names.record, names.legacyRecord]);','firstExisting(dir, [names.record]);'],
  ['new record preferred','names.mjs','names.test.mjs','firstExisting(dir, [names.record, names.legacyRecord]);','firstExisting(dir, [names.legacyRecord, names.record]);'],
  ['legacy map read-through','names.mjs','names.test.mjs','firstExisting(dir, [names.map, names.legacyMap]);','firstExisting(dir, [names.map]);'],
  ['symlinked root read once','names.mjs','names.test.mjs','if (!r || seen.has(r)) continue;','if (!r) continue;'],
  ['legacy root by default','names.mjs','names.test.mjs','for (const name of [names.root, names.legacyRoot]) {','for (const name of [names.root]) {'],
  ['both records is an error','engine.mjs','names.test.mjs','if (existsSync(join(dir, current)) && existsSync(join(dir, legacy)))','if (false)'],
  ['scaffold writes the new record','engine.mjs','names.test.mjs','writeFileSync(join(dir, N.record), project);','writeFileSync(join(dir, N.legacyRecord), project);'],
  ['nested subprojects match the kind','frontmatter/kinds.mjs','names.test.mjs','file: /(^|\\/)(super)?projects\\/(done\\/)?[^/]+\\/(SUPER)?PROJECT\\.md$/,','file: /(^|\\/)projects\\/(done\\/)?[^/]+\\/PROJECT\\.md$/,'],
  ['migrate refuses a taken destination','migrate.mjs','migrate.test.mjs','} else if (lexists(join(to, name))) {','} else if (false) {'],
  ['migrate is a dry run until applied','../bin/superprojects.mjs','migrate.test.mjs','if(a.apply&&!refused)applyMigration(plan);','if(!refused)applyMigration(plan);'],
  ['migrate relinks broken links','migrate.mjs','migrate.test.mjs','if (resolve(newDir, decoded) === goal) return null;','return null;'],
  ['migrate leaves code alone','migrate.mjs','migrate.test.mjs','const masked = line.replace(/(`+)[^`]*?\\1/g, (m) => " ".repeat(m.length));','const masked = line;'],
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
