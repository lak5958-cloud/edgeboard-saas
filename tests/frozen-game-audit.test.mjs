import test from 'node:test';
import assert from 'node:assert/strict';
import {auditFrozenGames} from '../lib/frozen-game-audit.mjs';
const start='2026-11-03T00:00Z',savedAt='2026-11-02T21:00Z',now=new Date('2026-11-04T18:00Z'),game={eventID:'e',league:'NBA',home:'CLE',away:'OKC',start};
const rows=[{team:'CLE',opponent:'OKC',venue:'home',points:105,allowed:100},{team:'OKC',opponent:'CLE',venue:'away',points:100,allowed:105}].map(r=>({...r,league:'NBA',gameID:'g',date:'2026-11-03',seasonType:'regular',seasonYear:2026,source:'https://example.org/score'}));
const entry=(kind,side,line,statEntityID)=>({game,probability:.6,push:.1,quote:{league:'NBA',eventID:'e',book:'draftkings',stat:'points',periodID:'game',asOf:savedAt,kind,side,line,statEntityID,odds:-110}});
const audit=(entries,teamRows=rows,at=savedAt)=>auditFrozenGames([{report:{entries},savedAt:at,path:'fixture'}],teamRows,{day:'2026-11-02',now});
test('exact game markets grade spread sign, pushes, moneyline, total and team total independently',()=>{
 const r=audit([entry('Spread','home',-5),entry('Spread','away',4.5),entry('Moneyline','home',null),entry('Total','under',205.5),entry('Team Total','over',99.5,'away')]);
 assert.deepEqual(r.results.map(x=>[x.outcome,x.actual]),[['push',5],['loss',-5],['win',5],['win',205],['win',100]]);
 assert.equal(r.scored,4);
 assert.equal(r.results[0].brier,null);
 assert.equal(r.results[2].scoringProbability,.6/.9);
});
test('missing, reversed and contradictory fixtures stay pending and postgame forecasts are excluded',()=>{
 const e=entry('Moneyline','home',null);
 assert.equal(audit([e],rows.slice(0,1)).unsettled,1);
 assert.equal(audit([e],rows.map(r=>({...r,venue:r.venue==='home'?'away':'home'}))).unsettled,1);
 assert.equal(audit([e],[...rows,{...rows[0],points:102}]).unsettled,1);
 assert.equal(audit([e],rows,start).excluded.notPregame,1);
});

test('the streaming audit preserves earliest valid snapshots even when reports arrive out of order',async()=>{
 const {createFrozenGameAudit}=await import('../lib/frozen-game-audit.mjs');
 const instance=createFrozenGameAudit({day:'2026-11-02',now});
 const market=entry('Moneyline','home',null);
 instance.add({report:{entries:[{...market,probability:.8}]},savedAt:'2026-11-02T22:00Z',path:'newer'});
 instance.add({report:{entries:[market]},savedAt,path:'older'});
 const result=instance.finish(rows);
 assert.equal(result.scored,1);
 assert.equal(result.results[0].probability,.6);
 assert.equal(result.results[0].archivePath,'older');
});

test('a final on the current UTC date can settle an earlier Eastern slate',()=>{
 const market=entry('Moneyline','home',null);
 const checkedAt=new Date('2026-11-03T04:00Z');
 const report={report:{entries:[market]},savedAt,path:'fixture'};
 assert.equal(auditFrozenGames([report],rows,{day:'2026-11-02',now:checkedAt}).scored,1);
 const future=rows.map(row=>({...row,observedAt:'2026-11-03T05:00Z'}));
 assert.equal(auditFrozenGames([report],future,{day:'2026-11-02',now:checkedAt}).unsettled,1);
});

test('game-market no-vig comparison pairs the exact opposite line from the same book and observation',()=>{
 const q=(side,line,odds,book='draftkings')=>{
  const row=entry('Spread',side,line);
  return {...row,quote:{...row.quote,book,odds,observedAt:savedAt,available:true}};
 };
 const home=q('home',-4.5,-120);
 const away=q('away',4.5,110);
 assert.equal(audit([home,q('away',5.5,110)]).results[0].marketProbability,null);
 assert.equal(audit([home,q('away',4.5,110,'fanduel')]).results[0].marketProbability,null);
 const {results}=audit([home,away]);
 assert(Math.abs(results[0].marketProbability+results[1].marketProbability-1)<1e-10);
 assert(Number.isFinite(results[0].marketBrier));
});
