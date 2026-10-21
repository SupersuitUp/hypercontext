import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,appendFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {recordSession,readSessions,sessionsOf,touchedBy,touchedSuperprojects,SESSIONS_FILE,NAMES} from '../src/index.mjs';

const bin=fileURLToPath(new URL('../bin/superprojects.mjs',import.meta.url));
const cli=(...args)=>spawnSync(process.execPath,[bin,...args],{encoding:'utf8'});
const project=(root,slug,record='SUPERPROJECT.md')=>{const d=join(root,slug);mkdirSync(d,{recursive:true});writeFileSync(join(d,record),'# x\n');writeFileSync(join(d,'STATE.md'),'# s\n');return d;};
const tmp=()=>mkdtempSync(join(tmpdir(),'sp-sessions-'));

test('the sessions file is named once, beside the other names',()=>{
  assert.equal(SESSIONS_FILE,'sessions.jsonl');
  assert.equal(NAMES.sessions,'sessions.jsonl');
});

test('a checkpoint appends one line naming the session, and reads back grouped by session',()=>{
  const root=tmp();
  try{
    const d=project(root,'2026-10-12-demo');
    assert.equal(recordSession(d,{id:'aaa-111',at:'2026-10-12T10:00:00.000Z',landed:'first draft'}).written,true);
    assert.equal(recordSession(d,{id:'bbb-222',at:'2026-10-12T11:00:00.000Z',harness:'codex'}).written,true);
    assert.equal(recordSession(d,{id:'aaa-111',at:'2026-10-12T12:00:00.000Z',landed:'shipped'}).written,true);
    const lines=readFileSync(join(d,SESSIONS_FILE),'utf8').trim().split('\n');
    assert.equal(lines.length,3);
    assert.deepEqual(JSON.parse(lines[0]),{id:'aaa-111',at:'2026-10-12T10:00:00.000Z',landed:'first draft'});
    const g=sessionsOf(d);
    assert.deepEqual(g.map(s=>s.id),['aaa-111','bbb-222'],'latest checkpoint first');
    assert.deepEqual(g[0],{id:'aaa-111',first:'2026-10-12T10:00:00.000Z',last:'2026-10-12T12:00:00.000Z',checkpoints:2,landed:['first draft','shipped'],harness:null});
    assert.equal(g[1].harness,'codex');
    assert.equal(touchedBy(d,'bbb-222'),true);
    assert.equal(touchedBy(d,'ccc-333'),false);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('the same session saving again with nothing new is not a second line',()=>{
  const root=tmp();
  try{
    const d=project(root,'demo');
    recordSession(d,{id:'aaa-111',at:'2026-10-12T10:00:00.000Z',landed:'x'});
    const again=recordSession(d,{id:'aaa-111',at:'2026-10-12T10:05:00.000Z',landed:'x'});
    assert.equal(again.written,false);
    assert.equal(readFileSync(join(d,SESSIONS_FILE),'utf8').trim().split('\n').length,1);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('refuses a folder that is not a superproject and an id that is not one',()=>{
  const root=tmp();
  try{
    const bare=join(root,'bare');mkdirSync(bare);
    assert.throws(()=>recordSession(bare,{id:'aaa-111'}),/not a superproject/);
    const legacy=project(root,'old','PROJECT.md');
    assert.equal(recordSession(legacy,{id:'aaa-111'}).written,true,'a legacy record still counts');
    for(const id of ['', 'has space', 'line\nbreak', 'x'.repeat(200), null]) assert.throws(()=>recordSession(legacy,{id}),/session id/);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('a damaged line is reported and skipped, never fatal',()=>{
  const root=tmp();
  try{
    const d=project(root,'demo');
    recordSession(d,{id:'aaa-111',at:'2026-10-12T10:00:00.000Z'});
    appendFileSync(join(d,SESSIONS_FILE),'{not json\n{"at":"2026-10-12T10:00:00.000Z"}\n');
    const r=readSessions(d);
    assert.equal(r.entries.length,1);
    assert.deepEqual(r.malformed,[2,3]);
    assert.deepEqual(readSessions(join(root,'none')),{entries:[],malformed:[]});
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('every superproject one session touched, nested ones and the legacy root included',()=>{
  const ws=tmp();
  try{
    const a=project(join(ws,'superprojects'),'a');
    const child=project(join(a,'superprojects'),'child');
    const old=project(join(ws,'projects'),'old','PROJECT.md');
    project(join(ws,'superprojects'),'untouched');
    recordSession(a,{id:'me-1'});recordSession(child,{id:'me-1'});recordSession(old,{id:'me-1'});recordSession(old,{id:'peer-2'});
    assert.deepEqual(touchedSuperprojects(ws,'me-1').map(p=>p.dir).sort(),[a,child,old].sort());
    assert.deepEqual(touchedSuperprojects(ws,'peer-2').map(p=>p.dir),[old]);
  }finally{rmSync(ws,{recursive:true,force:true});}
});

test('CLI: session records, sessions lists, touched answers for a workspace',()=>{
  const ws=tmp();
  try{
    const d=project(join(ws,'superprojects'),'demo');
    const w=cli('session','--project',d,'--id','aaa-111','--landed','release cut','--json');
    assert.equal(w.status,0,w.stderr);
    assert.equal(JSON.parse(w.stdout).written,true);
    const l=cli('sessions','--project',d,'--json');
    assert.equal(l.status,0,l.stderr);
    assert.deepEqual(JSON.parse(l.stdout).sessions.map(s=>s.id),['aaa-111']);
    const t=cli('touched','--workspace',ws,'--id','aaa-111','--json');
    assert.equal(t.status,0,t.stderr);
    assert.deepEqual(JSON.parse(t.stdout).superprojects.map(p=>p.slug),['demo']);
    assert.equal(cli('session','--project',d).status,2,'--id is required');
    assert.equal(cli('session','--project',join(ws,'nope'),'--id','aaa-111').status,1);
  }finally{rmSync(ws,{recursive:true,force:true});}
});
