import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateForecasts,poissonForecast,archivedCandidates,replayCandidates} from '../lib/research-candidates.mjs';
import {modelLab} from '../public/console/model-lab.mjs';
const q={eventID:'event',league:'NBA',playerID:'player',book:'draftkings',stat:'assists',side:'over',line:4.5,asOf:'2026-11-04T22:00:00Z'};
const game={eventID:'event',league:'NBA',home:'BOS',away:'NY',start:'2026-11-05T00:00:00Z'};
const now=new Date('2026-11-04T23:00:00Z');
const rows=Array.from({length:12},(_,i)=>({date:'2026-10-'+String(i+10).padStart(2,'0'),teamID:'2',seasonYear:2026,seasonType:'regular',gameID:String(i),minutes:30,value:5,source:'https://example.com/'+i}));
const sample={profile:{id:'1',currentTeamID:'2',team:'BOS'},currentYear:2026,rows};
test('workload candidates use only earlier same-team measured games and normalized probability mass',()=>{
 const a=candidateForecasts(q,sample,game,{},now);
 const contaminated={...sample,rows:[...rows,{...rows[0],gameID:'future',date:'2026-11-05',value:999},{...rows[0],teamID:'old',gameID:'old',value:999}]};
 assert.deepEqual(candidateForecasts(q,contaminated,game,{},now),a);
 assert.equal(a.workload.projection,30);
 assert.equal(a.workload.trainingGames,12);
 for(const m of a.models)assert.ok(Math.abs(m.pWin+m.pPush+m.pLoss-1)<1e-8);
});
test('missing exposure and longest-play markets never fabricate scaled outcomes',()=>{
 const missing=candidateForecasts(q,{...sample,rows:rows.map(({minutes,...r})=>r)},game,{},now);
 assert.equal(missing.workload,null);
 assert.ok(!missing.models.some(m=>m.id==='workload-resample-v1'));
 const longest=candidateForecasts({...q,stat:'receiving_longest_reception',league:'NFL'},{...sample,rows:rows.map(r=>({...r,opportunities:{targets:6}}))},{...game,league:'NFL'},{},now);
 assert.equal(longest.models.length,0);
 assert.equal(longest.workload.kind,'targets');
});
test('count distribution handles zero, integer pushes and complementary alternate thresholds',()=>{
 const over=poissonForecast(3,{line:3,side:'over'}),under=poissonForecast(3,{line:3,side:'under'});
 assert.ok(Math.abs(over.pWin+under.pWin+over.pPush-1)<1e-9);
 assert.equal(poissonForecast(0,{line:.5,side:'over'}).pWin,0);
 assert.ok(poissonForecast(3,{line:5.5,side:'over'}).pWin<poissonForecast(3,{line:3.5,side:'over'}).pWin);
});
test('candidate archive rejects a revised line, athlete or postgame calculation',()=>{
 const researchCandidates=candidateForecasts(q,sample,game,{},now),p={quote:q,asOf:q.asOf,researchCandidates};
 assert.ok(archivedCandidates(p,now.toISOString(),Date.parse(game.start),'1'));
 assert.equal(archivedCandidates({...p,quote:{...q,line:5.5}},now.toISOString(),Date.parse(game.start),'1'),null);
 assert.equal(archivedCandidates(p,now.toISOString(),Date.parse(game.start),'9'),null);
 assert.equal(archivedCandidates({...p,researchCandidates:{...researchCandidates,createdAt:game.start}},game.start,Date.parse(game.start),'1'),null);
});
test('same-day and final-game opponent data cannot enter pregame defense features',()=>{
 const defenses=Array.from({length:12},(_,i)=>({league:'NBA',seasonType:'regular',seasonYear:2026,gameID:String(i),teamID:i<4?'NY':'other',team:i<4?'NY':'BKN',date:'2026-10-20',allowed:{assists:25},defensiveRating:110,pace:100,source:'https://example.com/'+i}));
 const context={matchups:{games:defenses}},a=candidateForecasts(q,sample,game,context,now);
 assert.equal(a.features.defenseAllowed.ratio,1);
 const b=candidateForecasts(q,sample,game,{matchups:{games:[...defenses,{...defenses[0],gameID:'late',date:'2026-11-04',allowed:{assists:1000}}]}},now);
 assert.deepEqual(a.features,b.features);
});
test('replay tests use earlier history and do not change when a later outcome changes',()=>{
 const before=replayCandidates(q,sample),after=replayCandidates(q,{...sample,rows:[...rows,{...rows[0],date:'2026-12-01',gameID:'later',value:200}]});
 assert.ok(before.models.every(m=>after.models.find(x=>x.id===m.id).n>=m.n));
 assert.ok(before.tests>0);
});
function audit(){
 const results=[];
 for(let day=1;day<=7;day++)for(let game=0;game<8;game++)for(let player=0;player<4;player++){
  const date='2026-10-'+String(day).padStart(2,'0'),win=(game+player)%2===0;
  results.push({day:date,league:'NBA',eventID:day+'-'+game,athleteID:String(player),book:'draftkings',stat:'assists',side:'over',line:4.5,odds:-110,outcome:win?'win':'loss',scoringProbability:.8,brier:win?.04:.64,frozenAt:date+'T20:00:00Z',outcomeObservedAt:date+'T23:00:00Z'});
 }
 return results.map(r=>({day:r.day,results:[r]}));
}
test('model lab deduplicates snapshots and trains only on outcomes verified before a later test date',()=>{
 const rows=audit(),a=modelLab(rows),dup=modelLab([...rows,...rows]);
 assert.equal(a.selections,224);
 assert.deepEqual(a,dup);
 const v=a.variants.find(v=>v.id==='calibration');
 assert.ok(v.selections>0);
 const unavailable=modelLab(rows.map(a=>({...a,results:a.results.map(r=>({...r,outcomeObservedAt:'2027-01-01T00:00Z'}))})));
 assert.equal(unavailable.variants.find(v=>v.id==='calibration').selections,0);
});
test('changing later outcomes cannot change already-tested earlier calibration dates',()=>{
 const rows=audit(),before=modelLab(rows),changed=modelLab(rows.map(a=>a.day==='2026-10-07'?{...a,results:a.results.map(r=>({...r,outcome:r.outcome==='win'?'loss':'win'}))}:a));
 assert.deepEqual(before.variants.find(v=>v.id==='calibration').byDate.filter(d=>d.day<'2026-10-07'),changed.variants.find(v=>v.id==='calibration').byDate.filter(d=>d.day<'2026-10-07'));
});
test('duplicate selections with conflicting settlements are excluded',()=>{
 const rows=audit(),first=rows[0];
 const lab=modelLab([...rows,{...first,results:first.results.map(r=>({...r,outcome:'loss'}))}]);
 assert.equal(lab.conflicts,1);
 assert.equal(lab.selections,223);
});
