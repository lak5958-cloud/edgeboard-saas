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
