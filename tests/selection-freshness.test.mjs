import test from 'node:test';
import assert from 'node:assert/strict';
import {freshnessRows,freshnessView} from '../public/selection-freshness.mjs';
import {readinessSnapshot} from '../lib/selection-readiness.mjs';
const now=new Date('2026-11-03T18:00Z'),q={league:'NFL',kind:'Player Prop',stat:'receiving_yards',period:'full',available:true,asOf:now.toISOString()},game={start:'2026-11-04T00:00Z'},profile={id:'7',currentTeamID:'1',team:'A',asOf:now.toISOString(),url:'https://example.org/roster'};
test('stored source timestamps age without refreshing themselves',()=>{
 const snapshot={athleteID:'7',rosterTeam:'A',rosterAsOf:now.toISOString(),injury:{status:'Active',fetchedAt:now.toISOString(),reportedAt:now.toISOString()}};
 const before=JSON.stringify(snapshot),fresh=freshnessRows(snapshot,q,game,now),later=freshnessRows(snapshot,q,game,new Date('2026-11-03T21:00Z'));
 assert.equal(fresh[0].status,'Current');assert.equal(later[0].status,'Needs refresh');assert.equal(fresh[2].status,'Recently checked');assert.equal(later[2].status,'Stale or undated');assert.equal(later[1].status,'Stale listing');assert.equal(JSON.stringify(snapshot),before);
});
test('old unavailable reports remain blocked; missing reports never claim health',()=>{
 const rows=freshnessRows({injury:{status:'Out',blocked:true,fetchedAt:'2026-11-01T12:00Z'}},q,game,now);
 assert.equal(rows[1].tone,'blocked');assert.match(rows[1].detail,/age does not establish recovery/);
 const missing=freshnessRows({},q,game,now);assert.equal(missing[1].status,'Not confirmed');assert.equal(missing[2].status,'Unverified');assert.equal(missing[3].status,'Incomplete');
});
test('future dates and questionable status require confirmation',()=>{
 const row=injury=>freshnessRows({injury},q,game,now)[1];
 assert.equal(row({status:'Questionable',fetchedAt:now.toISOString()}).status,'Needs confirmation');
 assert.equal(row({status:'Active',fetchedAt:'2026-11-03T19:00Z'}).status,'Stale listing');
 assert.equal(row({status:'Active',fetchedAt:now.toISOString(),reportedAt:'2026-11-04T18:00Z'}).status,'Check report date');
});
test('workload coverage excludes old teams, prior years and unlabeled counts; measured zero counts',()=>{
 const row=(date,patch={})=>({date,seasonYear:2026,teamID:'1',opportunities:{targets:0},source:'https://example.org/game/'+date,...patch});
 const sample={currentYear:2026,profile,rows:[row('2026-10-01'),row('2026-10-03'),row('2026-10-02'),row('2026-10-04',{teamID:'2'}),row('2025-10-04',{seasonYear:2025}),row('2026-10-05',{opportunities:{},opportunity:99})]};
 const r=readinessSnapshot(q,{sample});assert.equal(r.workload.recentN,2);assert.equal(r.workload.latestDate,'2026-10-03');assert.match(r.workload.source,/2026-10-03/);assert.equal(r.rosterAsOf,profile.asOf);assert.equal(freshnessRows(r,q,game,now)[3].status,'Incomplete');
});
test('NBA coverage uses only the last five current-team games and retains original source',()=>{
 const rows=Array.from({length:7},(_,i)=>({date:`2026-10-${10+i}`,seasonYear:2026,teamID:'1',minutes:i<4?30:null,source:'https://example.org/game'}));
 const r=readinessSnapshot({...q,league:'NBA'},{sample:{currentYear:2026,profile,rows}});
 assert.equal(r.workload.recentN,2);assert.equal(r.workload.latestDate,'2026-10-13');assert.equal(r.workload.source,'https://example.org/game');
});
test('source markup escapes user content and refuses executable URLs; team markets omit player checks',()=>{
 const html=freshnessView({rosterTeam:'<script>alert(1)</script>',rosterSource:'javascript:alert(1)',athleteID:'7',injury:{status:'<img>',url:'https://example.org/" onclick="bad'}},{quote:q,game,now});
 assert(!html.includes('<script>'));assert(!html.includes('href="javascript:'));assert(html.includes('&lt;img&gt;'));assert(!html.includes('" onclick="bad'));
 assert.equal(freshnessRows({}, {...q,kind:'Moneyline'},game,now).length,1);
 assert.equal(freshnessRows({},q,{start:'2026-11-03T17:00Z'},now)[0].status,'Needs refresh');
});
