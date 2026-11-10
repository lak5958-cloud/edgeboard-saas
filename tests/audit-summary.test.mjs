import test from 'node:test';import assert from 'node:assert/strict';import {summarizeAudits,auditDates} from '../lib/audit-summary.mjs';import {auditSummaryView} from '../public/console/audit-summary-view.mjs';
const row=(outcome,brier,league='NBA',label='LEAN')=>({outcome,brier,probability:.8,league,label,book:'draftkings'});
test('comparisons give equal weight to dates and keep pushes and pending results out of scores',()=>{const r=summarizeAudits([{day:'2026-11-01',results:[row('win',.04),row('win',.04),row('push',null),row('unsettled',null)]},{day:'2026-11-02',results:[row('loss',.64,'NFL','PASS')]}]);assert.equal(r.completedDays,2);assert.equal(r.overall.wins,2);assert.equal(r.overall.losses,1);assert.equal(r.overall.pushes,1);assert.equal(r.overall.pending,1);assert.equal(r.overall.scored,3);assert(Math.abs(r.dayEqualBrier-.34)<1e-9);assert(Math.abs(r.overall.brier-.24)<1e-9);assert.equal(r.byLeague.length,2);assert.equal(r.byDecision.length,2);assert.equal(r.overall.constantHalfBrier,.25);});
test('available dates exclude today from completed slates using Eastern time and show missing comparison data honestly',()=>{const dates=auditDates([{kind:'players',slateDate:'2026-11-03'},{kind:'games',slateDate:'2026-11-01'}],'2026-11-02',new Date('2026-11-04T02:00Z'));assert.deepEqual(dates.map(d=>[d.day,d.completed]),[['2026-11-01',true],['2026-11-02',true],['2026-11-03',false]]);const r=summarizeAudits([{day:'2026-11-02',results:[row('win',.04)]}]);assert.match(auditSummaryView(r),/Multiple completed dates are not available/);assert.equal(summarizeAudits([]).dayEqualBrier,null);assert.match(auditSummaryView(summarizeAudits([])),/0 completed/);});
test('the browser audit pairs model and no-vig scores separately for NBA and NFL',async()=>{
 const {summarizeAudits:browserSummary}=await import('../public/console/audit-summary.mjs');
 const r=browserSummary([{day:'2026-11-09',results:[
  {...row('win',.04),eventID:'a',scoringProbability:.8,marketBrier:.09},
  {...row('win',.09),eventID:'a',scoringProbability:.7},
  {...row('loss',.36,'NFL'),eventID:'b',scoringProbability:.6,marketBrier:.25},
  {...row('push',null,'NFL'),eventID:'c'}
 ]}]);
 assert.deepEqual(r.byLeague.map(s=>[s.group,s.scored,s.scoredGames,s.marketPaired,s.marketPairedActiveBrier,s.marketBrier]),[
  ['NBA',2,1,1,.04,.09],['NFL',1,1,1,.36,.25]
 ]);
 assert.equal(r.leagueBins.NBA[4].n,1);
 assert.equal(r.leagueBins.NFL[3].observed,0);
 assert.match(auditSummaryView(r),/Model Brier on paired lines/);
});
