import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateAgreement,filterPerformance} from '../public/console/performance-filters.mjs';
import {nextAuditTask} from '../lib/published-audit.mjs';

test('tracking filters use the original label, the original exact price and saved candidates',()=>{
 const candidate={pWin:.60,pLoss:.36,pPush:.04};
 const lean={label:'LEAN',scoringProbability:.63,quotedPriceProbability:.60,researchCandidates:{models:[candidate]}};
 const missing={...lean,researchCandidates:null};
 const pass={...lean,label:'PASS'};
 const audits=[{results:[lean,missing,pass]}];
 assert.deepEqual(candidateAgreement(lean),{status:'all',agreeing:1,total:1});
 assert.deepEqual(filterPerformance(audits,{decision:'LEAN',agreement:'all',minimum:.63})[0].results,[lean]);
 assert.deepEqual(filterPerformance(audits,{decision:'TAKE'})[0].results,[]);
 assert.deepEqual(filterPerformance(audits,{agreement:'unavailable'})[0].results,[missing]);
 assert.deepEqual(filterPerformance(audits,{minimum:.64})[0].results,[]);
});

test('scheduled grading prioritizes ungraded completed slates and revisits recent outcomes',()=>{
 const now=new Date('2026-11-11T17:00:00Z');
 const dates=[{day:'2026-11-09',snapshots:4,completed:true},{day:'2026-11-10',snapshots:0,gameSnapshots:3,completed:true},{day:'2026-11-11',snapshots:8,completed:false}];
 const first=nextAuditTask(dates,{},now);
 assert.equal(first.scope,'games');
 assert.equal(first.day,'2026-11-10');
 const progress={[first.file]:{archiveCount:3,checkedAt:'2026-11-11T16:00:00Z'}};
 const next=nextAuditTask(dates,progress,now);
 assert.equal(next.scope,'shortlist');
 assert.equal(next.day,'2026-11-09');
});

test('fixed holdout counts only reserved dates and excludes precomputed candidates from earlier rows',async()=>{
 const {modelLab}=await import('../public/console/model-lab.mjs');
 const row=(id,day)=>({league:'NBA',eventID:id,stat:'assists',book:'draftkings',athleteID:id,side:'over',line:1.5,
  outcome:'win',scoringProbability:.65,brier:.1225,frozenAt:day+'T20:00:00Z',
  researchCandidates:{models:[{id:'poisson-count-v1',pWin:.6,pPush:0,pLoss:.4}]}});
 const days=['2026-11-09','2026-11-10'];
 const audits=days.map((day,i)=>({day,results:[row(String(i),day)]}));
 const r=modelLab(audits,{holdoutFrom:days[1]});
 assert.equal(r.holdoutDates,1);
 assert.equal(r.holdoutGames,1);
 assert.equal(r.variants.find(variant=>variant.id==='poisson-count-v1').selections,1);
 assert.equal(r.variants.find(variant=>variant.id==='calibration').selections,0);
});
