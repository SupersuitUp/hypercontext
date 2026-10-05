import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {guard,probe} from './helpers/native.mjs';
import {createConversation} from '../index.mjs';
import {header,emptyBody} from './helpers/conversation-fixture.mjs';
test('missing and stale physical readiness refuse the real writer before record allocation',()=>{
 guard();const root=mkdtempSync(join(process.env.TRANSCRIPT_MD_OWNED,'readiness-')),pin=join(root,'input'),inspection=join(root,'inspection.json'),original=process.env.TRANSCRIPT_MD_INSPECTION;
 const options={root,spec:{header:header(),body:emptyBody,assets:[],annotations:null},pid:process.pid,by:'readiness-test'};
 try{
  process.env.TRANSCRIPT_MD_INSPECTION=join(root,'absent.json');assert.throws(()=>probe(createConversation,[options]),/INSPECTION_MISSING/);assert.equal(existsSync(join(root,'meeting-transcripts')),false);
  writeFileSync(pin,'original');const i=JSON.parse(readFileSync(original));i.physical[pin]=createHash('sha256').update('original').digest('hex');writeFileSync(inspection,JSON.stringify(i));writeFileSync(pin,'changed');process.env.TRANSCRIPT_MD_INSPECTION=inspection;
  assert.throws(()=>probe(createConversation,[options]),/INSPECTION_STALE/);assert.equal(existsSync(join(root,'meeting-transcripts')),false);
 }finally{process.env.TRANSCRIPT_MD_INSPECTION=original;}
});
