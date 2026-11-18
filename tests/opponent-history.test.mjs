import test from 'node:test';
import assert from 'node:assert/strict';
import {opponentHistoryForPlayer,renderOpponentHistory} from '../public/console/opponent-history.mjs';
import {buildMatchupLabData,renderMatchupLab} from '../public/console/matchup-lab.mjs';
const game={league:'NBA',away:'GSW',home:'BOS',game:'GSW @ BOS',eventID:'test1',start:'2026-11-20T00:00:00Z'};
const roster=[
 {league:'NBA',subject:'Sample Guard',id:'1001',team:'BOS',currentTeamID:'2',position:'PG'},
 {league:'NBA',subject:'Opponent Forward',id:'1002',team:'GSW',currentTeamID:'9',position:'SF'}
];
const stat=(id,date,value,team,teamID,opponent='GSW',opponentID='9',extra={})=>({
 gameID:id,date,value,team,teamID,opponent,opponentID,seasonYear:Number(date.slice(0,4)),seasonType:'regular',
 source:'https://www.espn.com/nba/boxscore/_/gameId/'+id,...extra
});
const record=(games,player='Sample Guard',athleteID='1001')=>({
 league:'NBA',subject:player,athleteID,stat:'assists',periodID:'game',games
});
const history=rows=>opponentHistoryForPlayer({game,rosters:roster,records:rows},{name:'Sample Guard',stat:'assists'});
test('separates games against the next opponent by franchise represented at game time',()=>{
 const h=history([record([
  stat('1','2026-11-05',9,'BOS','2'),
  stat('2','2025-11-05',12,'LAL','13'),
  stat('3','2024-11-05',7,'BOS','2'),
  stat('4','2023-11-05',5,'',''),
  stat('5','2026-11-07',99,'BOS','2','NYK','8'),
  stat('6','2026-11-24',999,'BOS','2')
 ])]);
 assert.equal(h.opponent,'GS');
 assert.deepEqual(h.groups.current.map(x=>x.value),[9,7]);
 assert.deepEqual(h.groups.former.map(x=>x.value),[12]);
 assert.deepEqual(h.groups.unknown.map(x=>x.value),[5]);
 assert.equal(h.rows.length,4);
 const html=renderOpponentHistory(h);
 assert.match(html,/Against GS/);
 assert.match(html,/With current franchise/);
 assert.match(html,/With previous teams/);
 assert.match(html,/Team at the time unverified/);
 assert.match(html,/same lineup or role was identical/i);
 assert.match(html,/12\.0/);
 assert.doesNotMatch(html,/999/);
 assert.doesNotMatch(html,/99<\/strong>/);
});
test('a recorded opponent team ID must match when both sides have authoritative IDs',()=>{
 const h=history([record([
  stat('1','2026-11-08',10,'BOS','2','GSW','wrong-id'),
  stat('2','2026-11-09',8,'BOS','2','GSW','9'),
  stat('3','2026-11-10',11,'BOS','2','NYK','9'),
  stat('4','2026-11-11',12,'BOS','2','NYK','8')
 ])]);
 assert.equal(h.rows.length,1);
 assert.equal(h.rows[0].value,8);
});
test('contradictory team ID and team code remain unverified, never mislabeled as current team',()=>{
 const h=history([record([stat('c','2026-11-11',11,'LAL','2')])]);
 assert.equal(h.rows.length,1);
 assert.equal(h.groups.current.length,0);
 assert.equal(h.groups.former.length,0);
 assert.equal(h.groups.unknown.length,1);
});
test('rejects duplicate disagreement, invalid source, absent identity, and future game leakage',()=>{
 const a=stat('dup','2026-11-02',8,'BOS','2');
 const b=stat('dup','2026-11-02',18,'BOS','2');
 const h=history([record([
  a,b,
  stat('future','2026-11-21',60,'BOS','2'),
  stat('playoff','2026-11-01',45,'BOS','2','GSW','9',{seasonType:'playoffs'}),
  stat('no-source','2026-11-02',44,'BOS','2','GSW','9',{source:'http://bad.example'}),
  stat('wrong-player','2026-11-03',77,'BOS','2','GSW','9',{athleteID:'0000'})
 ])]);
 assert.equal(h.rows.length,0);
 const noMatch=opponentHistoryForPlayer({game,rosters:[...roster,{...roster[0],id:'another'}],records:[record([stat('a','2026-11-01',8,'BOS','2')])]}, {name:'Sample Guard',stat:'assists'});
 assert.match(noMatch.reason,/ambiguous/);
});
test('only current franchise results appear when filtering current; former team rows remain separate',()=>{
 const h=history([record([stat('1','2026-11-03',10,'BOS','2'),stat('2','2025-11-03',2,'LAL','13')])]);
 const former=renderOpponentHistory(h,{scope:'former',label:'Assists'});
 assert.match(former,/Former teams \(1\)/);
 assert.match(former,/2025-11-03/);
 assert.doesNotMatch(former,/2026-11-03/);
 const current=renderOpponentHistory(h,{scope:'current',label:'Assists'});
 assert.match(current,/2026-11-03/);
 assert.doesNotMatch(current,/2025-11-03/);
});
test('no opponent games are displayed as unavailable rather than estimated or inferred',()=>{
 const h=history([record([stat('2','2026-11-09',18,'BOS','2','NYK','8')])]);
 assert.equal(h.rows.length,0);
 assert.match(renderOpponentHistory(h),/No sourced regular-season games against this opponent/);
 assert.doesNotMatch(renderOpponentHistory(h),/100%/);
});
test('malicious player names and external data are escaped in the rendered section',()=>{
 const h=history([record([stat('1','2026-11-03',10,'BOS','2')])]);
 h.opponent='<script>alert(1)</script>';
 h.name='<img src=x onerror=alert(1)>';
 const html=renderOpponentHistory(h,{label:'<img src=x onerror=alert(1)>'});
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;img/);
});
test('the existing player history tab includes a scoped current/franchise/previous matchup section',()=>{
 const lab=buildMatchupLabData({game,context:{teamGames:[]}});
 const html=renderMatchupLab(lab,{records:[record([stat('1','2026-11-04',8,'BOS','2')])],rosters:roster,state:{tab:'players',player:'Sample Guard',playerStat:'assists',opponentScope:'all'}});
 assert.match(html,/OPPONENT HISTORY/);
 assert.match(html,/Against GS/);
 assert.match(html,/data-ml-opponent-scope="current"/);
 assert.match(html,/data-ml-opponent-scope="former"/);
 assert.match(html,/Game-by-game history/);
});
