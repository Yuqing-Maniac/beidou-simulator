import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {TutorialChapter} from '../src/tutorial-types.ts';
const chapters=JSON.parse(readFileSync(new URL('../src/tutorial-data.json',import.meta.url),'utf8')) as TutorialChapter[];
test('detailed tutorial has complete chapters, expected results and matching offline narration',()=>{
 assert.equal(chapters.length,24);assert.equal(new Set(chapters.map(c=>c.id)).size,24);
 const manifest=JSON.parse(readFileSync(new URL('../public/tutorial/audio/manifest.json',import.meta.url),'utf8'));
 assert.equal(manifest.length,chapters.length);
 for(const chapter of chapters){
  assert.match(chapter.id,/^[a-z-]+$/);assert.ok(chapter.narration.length>=80);assert.ok(chapter.steps.length>=3);assert.ok(chapter.tips.length>=2);
  for(const step of chapter.steps){assert.ok(step.action.length>10&&step.expect.length>10&&step.target);}
  const entry=manifest.find((x:{id:string})=>x.id===chapter.id);assert.ok(entry,chapter.id);
  assert.equal(entry.textSha256,createHash('sha256').update(chapter.narration).digest('hex'),chapter.id+' audio text is stale');
  assert.equal(entry.file,chapter.id+'.mp3');assert.ok(entry.duration>5&&entry.duration<120);
  const file=new URL('../public/tutorial/audio/'+entry.file,import.meta.url);assert.ok(existsSync(file));assert.ok(statSync(file).size>1000);assert.equal(entry.audioSha256,createHash('sha256').update(readFileSync(file)).digest('hex'));
 }
});
test('downloadable manual includes every chapter and its actual spoken transcript',()=>{
 const manual=readFileSync(new URL('../docs/tutorial.txt',import.meta.url),'utf8');assert.ok(manual.length>12000);
 for(const chapter of chapters){assert.ok(manual.includes(chapter.title));assert.ok(manual.includes(chapter.narration));for(const step of chapter.steps)assert.ok(manual.includes(step.expect));}
});
