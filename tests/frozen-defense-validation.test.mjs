import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeFrozenDefense, frozenDefenseView} from '../public/console/defense-validation.mjs';

const row=({day='2026-11-06',game='g1',player='p1',book='draftkings',line=2.5,stat='3-pointers made',side='over',ratio=1.25,winning=true,prob=.65,createdAt='2026-11-06T15:00:00Z',frozenAt='2026-11-06T16:00:00Z',observedAt='2026-11-07T03:00:00Z'}={})=>({
 league:'NBA',eventID:game,athleteID:player,book,line,stat,side,odds:-120,day,
 frozenAt,outcomeObservedAt:observedAt,source:'https://www.espn.com/nba/boxscore/_/gameId/'+game,
 outcome:winning?'win':'loss',scoringProbability:prob,brier:(prob-Number(winning))**2,
 quotedPriceBrier:(.545-Number(winning))**2,
 researchCandidates:{version:'opportunity-context-count-v1',createdAt,features:{
  defenseAllowed:{ratio,mean:20*ratio,baseline:20,games:6,unit:'team total per game'}
 }}
});
const audit=(day,results)=>({day,results});
test('never rehydrates features from completed matches; absent archived defense is not used',()=>{
 const r=row(),missing={...r,eventID:'g2',researchCandidates:{version:'v',features:{}}};
 const lab=analyzeFrozenDefense([audit(r.day,[r,missing])]);
 assert.equal(lab.eligible,1);
 assert.equal(lab.excluded.noArchivedOpponentFeature,1);
 assert.equal(lab.groups.find(g=>g.stat==='three'&&g.side==='over').buckets.higher.selections,1);
 const html=frozenDefenseView([audit(r.day,[missing])]);
 assert.match(html,/No qualifying archived defensive-context selections/);
 assert.doesNotMatch(html,/100\.0%/);
});
test('deduplicate multiple books and lines within one game by weighting games equally',()=>{
 const a=row({game:'g1',winning:true,ratio:1.23,prob:.8});
 const b=row({game:'g1',book:'fanduel',winning:true,ratio:1.20,prob:.6});
 const c=row({game:'g2',player:'p2',winning:false,ratio:1.11,prob:.7});
 const results=analyzeFrozenDefense([audit('2026-11-06',[a,b,c])]);
 const high=results.groups.find(g=>g.stat==='three'&&g.side==='over').buckets.higher;
 assert.equal(high.selections,3);
 assert.equal(high.games,2);
 assert.equal(high.wins,2);
 assert.equal(high.observed,.5);
 assert.ok(Math.abs(high.predicted-.7)<1e-12); // game1 .7, game2 .7
});
test('fixed high/typical/low allowance bins, assist/three and over/under are separated',()=>{
 const inputs=[
 row({game:'a',ratio:1.10,stat:'assists',winning:true}),
 row({game:'b',ratio:.90,stat:'assists',side:'under',winning:false}),
 row({game:'c',ratio:1.09,stat:'assists',winning:true}),
 row({game:'d',ratio:.89,stat:'3-pointers made',winning:true})
 ];
 const lab=analyzeFrozenDefense([audit('2026-11-06',inputs)]);
 const assistOver=lab.groups.find(g=>g.stat==='assists'&&g.side==='over');
 assert.equal(assistOver.buckets.higher.selections,1);
 assert.equal(assistOver.buckets.typical.selections,1);
 const assistUnder=lab.groups.find(g=>g.stat==='assists'&&g.side==='under');
 assert.equal(assistUnder.buckets.lower.selections,1);
 const threeOver=lab.groups.find(g=>g.stat==='three'&&g.side==='over');
 assert.equal(threeOver.buckets.lower.selections,1);
});
test('future-verified or postfreeze candidate data are excluded, as are unverified outcomes',()=>{
 const original=row();
 const late={...original,eventID:'g2',researchCandidates:{...original.researchCandidates,createdAt:'2026-11-07T17:00:00Z'}};
 const early={...original,eventID:'g3',outcomeObservedAt:'2026-11-06T12:00:00Z'};
 const noSource={...original,eventID:'g4',source:''};
 const unsettled={...original,eventID:'g5',outcome:'unsettled',brier:null};
 const lab=analyzeFrozenDefense([audit(original.day,[original,late,early,noSource,unsettled])]);
 assert.equal(lab.eligible,1);
 assert.equal(lab.excluded.noArchivedOpponentFeature,1);
 assert.equal(lab.excluded.noVerifiedFreeze,2);
 assert.equal(lab.excluded.notSettled,1);
});
test('earliest exact frozen selection is used and conflicting archived settlements excluded',()=>{
 const original=row(),late={...original,frozenAt:'2026-11-06T17:00:00Z'};
 const a=analyzeFrozenDefense([audit('2026-11-06',[original,late])]);
 assert.equal(a.eligible,1);
 const conflict={...original,outcome:'loss',brier:.65**2};
 const b=analyzeFrozenDefense([audit('2026-11-06',[original,conflict])]);
 assert.equal(b.eligible,0);
 assert.equal(b.excluded.conflictingDuplicate,1);
});
test('holdout is a strict date filter and no high/low comparison is claimed for tiny sample',()=>{
 const old=row({day:'2026-11-06'}),recent=row({day:'2026-11-08',game:'g2',player:'p2',frozenAt:'2026-11-08T16:00:00Z',createdAt:'2026-11-08T15:00:00Z',observedAt:'2026-11-09T03:00:00Z',ratio:.7,winning:false});
 const lab=analyzeFrozenDefense([audit('2026-11-06',[old]),audit('2026-11-08',[recent])],{holdoutFrom:'2026-11-08'});
 assert.equal(lab.eligible,2);
 assert.equal(lab.holdoutEligible,1);
 const group=lab.groups.find(g=>g.stat==='three'&&g.side==='over');
 assert.equal(group.buckets.higher.selections,0);
 assert.equal(group.buckets.lower.selections,1);
 assert.equal(group.contrast,null);
 assert.match(frozenDefenseView([audit('2026-11-08',[recent])],{holdoutFrom:'2026-11-08'}),/Insufficient distinct games/);
});
test('defensive association report renders HTML safely and cannot silently change predictions',()=>{
 const a=row(),html=frozenDefenseView([audit(a.day,[a])]),malicious={...a,stat:'<script>alert(1)</script>'};
 assert.match(html,/Do permissive defenses actually help our archived picks/);
 assert.match(html,/Original model estimated/);
 assert.match(html,/not updated defensive rankings/i);
 const report=analyzeFrozenDefense([audit(a.day,[malicious])]);
 assert.equal(report.eligible,0);
 const live=readFileSync(new URL('../public/console/performance.mjs',import.meta.url),'utf8');
 const shell=readFileSync(new URL('../public/console/performance.html',import.meta.url),'utf8');
 assert.match(live,/frozenDefenseView/);
 assert.match(shell,/id="defenseContextLab"/);
});
