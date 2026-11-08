import test from 'node:test';
import assert from 'node:assert/strict';
import {hitChance,rankDailyPicks} from '../public/pick-ranking.mjs';
import {picksResults,pickCard} from '../public/picks-view.mjs';
import {picksPage} from '../public/views.mjs';

const pick=(player,p,net,label='LEAN',checks=[])=>({player,experimentalProbability:p,experimentalNet:net,label,checks,book:'draftkings',stat:'points',side:'over',line:10.5,odds:-150,sample:30,currentGames:8,breakEven:.6});
const blocked=[{id:'bound',status:'fail',label:'Historical check'}];
const report={book:'draftkings',picks:[pick('Lean',.68,.2)],watchlist:[pick('Higher estimate',.82,.1,'PASS',blocked),pick('Two missing',.73,.3,'PASS',[...blocked,{id:'replay',status:'unknown'}]),pick('Unavailable',null,.4,'PASS',blocked)],counts:{},excluded:{}};
test('a high-probability Pass can rank first without changing its decision, price or input arrays',()=>{
 const before=structuredClone(report),rows=rankDailyPicks(report);
 assert.deepEqual(rows.map(r=>r.pick.player),['Higher estimate','Two missing','Lean','Unavailable']);
 assert.equal(rows[0].watch,true);assert.equal(rows[0].pick.label,'PASS');assert.equal(rows[0].pick.odds,-150);
 assert.deepEqual(report,before);
 const html=picksResults(report);assert(html.indexOf('Higher estimate')<html.indexOf('<h3>Lean</h3>'));
 assert.match(html,/PASS · Watchlist · 1 check remaining/);assert.match(html,/A high estimated hit chance does not clear these checks/);
});
test('probability, value and research sorting represent different choices',()=>{
 assert.equal(rankDailyPicks(report,{sort:'research'})[0].pick.player,'Lean');
 assert.equal(rankDailyPicks(report,{sort:'value'})[0].pick.player,'Unavailable');
 assert.equal(rankDailyPicks(report,{sort:'probability'})[0].pick.player,'Higher estimate');
 const tied={picks:[pick('Lean',.8,.1)],watchlist:[pick('Pass',.8,.1,'PASS',blocked)]};
 assert.equal(rankDailyPicks(tied)[0].watch,false);
});
test('one-check and percentage filters retain only matching selections; missing probabilities are never invented',()=>{
 assert.deepEqual(rankDailyPicks(report,{status:'one-check',minimum:'0.7'}).map(r=>r.pick.player),['Higher estimate']);
 assert.equal(rankDailyPicks(report,{status:'leans',minimum:'0.7'}).length,0);
 assert.equal(rankDailyPicks(report,{status:'watchlist',minimum:'0.8'}).length,1);
 for(const p of [undefined,null,NaN,Infinity,-.1,1.01,'0.9'])assert.equal(hitChance({experimentalProbability:p}),null);
 for(const p of [0,1])assert.equal(hitChance({experimentalProbability:p}),p);
 assert.match(pickCard(pick('Missing probability',null,.1)),/Unavailable<\/strong>/);
 assert.match(picksResults(report,{status:'leans',minimum:'0.8'}),/No selections match these filters/);
});
test('the page explains that ordering is not an upgrade, and empty feeds explain the owner refresh path',()=>{
 const html=picksPage('NFL');for(const id of ['pickSort','pickMinimum','pickStatus'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/Watchlist selections remain Pass/);
 const empty=picksResults({book:'fanduel',picks:[],watchlist:[],counts:{},excluded:{},coverage:0,oddsStatus:{status:'limited',message:'Scheduled hours only.'}});
 assert.match(empty,/Scheduled hours only/);assert.match(empty,/owner can request a fresh board from Research/);
 assert(!empty.includes('70.0%'));assert.match(empty,/No picks or hit estimates are invented/);
});
