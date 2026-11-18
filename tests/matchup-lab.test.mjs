import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildMatchupLabData,teamMetric,leagueMetricRanking,matchupPlayerHistory,renderMatchupLab} from '../public/console/matchup-lab.mjs';
const game={league:'NBA',game:'GSW @ BOS',away:'GSW',home:'BOS',eventID:'123',start:'2026-11-18T00:00:00Z'};
const row=(id,team,opponent,date,points,allowed,stats={})=>({league:'NBA',date,gameID:id,team,opponent,seasonType:'regular',seasonYear:2026,source:'https://www.espn.com/nba/boxscore/_/gameId/'+id,points,pointsAllowed:allowed,stats:{points,rebounds:42,assists:26,'3pointersmade':14,...stats},allowed:{points:allowed,rebounds:38,assists:23,'3pointersmade':11}});
const good=[
 row('1','BOS','NYK','2026-11-11',112,100,{'3pointersmade':15}),
 row('1','NYK','BOS','2026-11-11',100,112,{'3pointersmade':9}),
 row('2','BOS','PHI','2026-11-15',120,104,{'3pointersmade':17}),
 row('3','GSW','LAL','2026-11-12',108,114,{'3pointersmade':13}),
 row('4','GSW','SAC','2026-11-16',126,122,{'3pointersmade':19})
];
const input=(rows=good)=>({game,context:{matchupGames:rows}});
test('matchup lab uses pregame sourced current-season data and opponent allowances',()=>{
 const lab=buildMatchupLabData(input());
 assert.equal(lab.season,2026);
 assert.equal(lab.cutoff,'2026-11-18');
 assert.deepEqual(lab.teams.map(t=>t.code),['GS','BOS']);
 assert.equal(lab.teams[0].n,2);assert.equal(lab.teams[1].n,2);
 assert.equal(teamMetric(lab.teams[0],'points').value,117);
 assert.equal(teamMetric(lab.teams[1],'points','defense').value,102);
 assert.equal(teamMetric(lab.teams[1],'3pointersmade').value,16);
 assert.equal(teamMetric(lab.teams[1],'3pointersmade','defense').value,11);
});
test('no future games, playoff records, previous seasons, unsourced rows or conflicts become statistics',()=>{
 const later=row('5','BOS','NYK','2026-11-19',200,0);
 const playoffs={...row('6','BOS','NYK','2026-11-13',180,80),seasonType:'postseason'};
 const lastYear={...row('7','BOS','NYK','2025-11-10',170,80),seasonYear:2025};
 const noSource={...row('8','BOS','NYK','2026-11-14',175,80),source:''};
 const conflict=row('2','BOS','PHI','2026-11-15',99,104);
 const lab=buildMatchupLabData(input([...good,later,playoffs,lastYear,noSource,conflict]));
 assert.equal(lab.teams[1].n,1);
 assert.equal(lab.teams[0].n,2);
 assert.equal(teamMetric(lab.teams[1],'points').value,112);
});
test('incomplete league data never claims full-league ranking or position-specific defense',()=>{
 const lab=buildMatchupLabData(input());
 const result=leagueMetricRanking(lab,{stat:'points',side:'defense'});
 assert.equal(result.complete,false);assert.equal(result.coverage,3);
 const html=renderMatchupLab(lab,{state:{tab:'defense',position:'PG'}});
 assert.match(html,/complete defense-versus-position feed is not connected/i);
 assert.match(html,/Scoring defense · actual points allowed per game/);
 assert.match(html,/Most allowed among tracked teams/);
 assert.doesNotMatch(html,/PG allowed per game/);
 assert.match(html,/Ranked only among 3 teams/);
});
test('offense and defense tabs show sourced category controls and per-team comparison',()=>{
 const lab=buildMatchupLabData(input());
 const offense=renderMatchupLab(lab,{state:{tab:'offense',metric:'3pointersmade'}});
 assert.match(offense,/Made threes/);
 assert.match(offense,/16\.0/);
 assert.match(offense,/2026 season/);
 const defense=renderMatchupLab(lab,{state:{tab:'defense',metric:'assists',position:'All'}});
 assert.match(defense,/team totals/i);
 assert.match(defense,/SG/);
});
test('player log keeps official regular-season games before matchup; threshold evidence is descriptive',()=>{
 const p={league:'NBA',id:'101',subject:'Synthetic Player',team:'BOS',position:'SG'};
 const record={league:'NBA',subject:'Synthetic Player',athleteID:'101',stat:'assists',periodID:'game',games:[
  {gameID:'9',date:'2026-11-10',opponent:'NYK',value:8,seasonType:'regular',url:'https://www.espn.com/nba/boxscore/_/gameId/9'},
  {gameID:'10',date:'2026-11-15',opponent:'PHI',value:11,seasonType:'regular',url:'https://www.espn.com/nba/boxscore/_/gameId/10'},
  {gameID:'11',date:'2026-11-20',opponent:'IND',value:30,seasonType:'regular',url:'https://www.espn.com/nba/boxscore/_/gameId/11'},
  {gameID:'12',date:'2026-11-09',value:31,seasonType:'postseason',url:'https://www.espn.com/nba/boxscore/_/gameId/12'}
 ]};
 const rows=matchupPlayerHistory({game,records:[record],rosters:[p]},{name:'Synthetic Player',stat:'assists'});
 assert.equal(rows.length,2);assert.equal(rows[0].value,11);
 const lab=buildMatchupLabData(input());
 const html=renderMatchupLab(lab,{records:[record],rosters:[p],state:{tab:'players',player:'Synthetic Player',playerStat:'assists'}});
 assert.match(html,/Game-by-game history/);assert.match(html,/Historical thresholds/);assert.match(html,/not model win probabilities/i);
 assert.doesNotMatch(html,/2026-11-20/);
});
test('missing data, unavailable league positions and hostile names have safe UI states',()=>{
 const g={...game,away:'<img src=x onerror=alert(1)>'};
 const html=renderMatchupLab(buildMatchupLabData({game:g,context:{matchupGames:[]}}),{});
 assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/No eligible completed team games/);
 const noGame=renderMatchupLab(buildMatchupLabData({game:null}),{});
 assert.match(noGame,/Choose an NBA or NFL game/);
});
test('the live Research console includes a full-width interactive lab hooked to game selection',()=>{
 const html=readFileSync(new URL('../public/console/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/console/app.mjs',import.meta.url),'utf8');
 assert.match(html,/id="matchupLabContent"/);
 assert.match(html,/id="matchupLabTab"/);
 assert.match(app,/mountMatchupLab/);
 assert.match(app,/matchupLab.update\(\)/);
 assert.match(app,/scrollIntoView/);
});

test('NFL Research exposes sourced receiving game logs without importing future results',()=>{
 const nfl={league:'NFL',game:'NYG @ PHI',away:'NYG',home:'PHI',start:'2026-11-23T00:00:00Z'};
 const profiles=[{league:'NFL',id:'501',subject:'Sample Receiver',team:'PHI',position:'WR'}];
 const records=[{league:'NFL',subject:'Sample Receiver',athleteID:'501',stat:'receiving yards',periodID:'game',games:[
  {gameID:'n1',date:'2026-11-10',seasonType:'regular',value:88,source:'https://www.espn.com/nfl/boxscore/_/gameId/n1'},
  {gameID:'n2',date:'2026-11-24',seasonType:'regular',value:500,source:'https://www.espn.com/nfl/boxscore/_/gameId/n2'}
 ]}];
 const rows=matchupPlayerHistory({game:nfl,records,rosters:profiles},{name:'Sample Receiver',stat:'receivingyards'});
 assert.equal(rows.length,1);assert.equal(rows[0].value,88);
 const html=renderMatchupLab(buildMatchupLabData({game:nfl,context:{teamGames:[]}}),{rosters:profiles,records,state:{tab:'players',player:'Sample Receiver',playerStat:'receivingyards'}});
 assert.match(html,/Receiving yards/);assert.match(html,/Game-by-game history/);assert.doesNotMatch(html,/500/);
});

test('schedule-only opponent scores appear in Defense even without detailed box-score metrics',()=>{
 const schedule=[
  {league:'NBA',date:'2026-11-14',gameID:'812',team:'BOS',opponent:'NYK',seasonType:'regular',seasonYear:2026,source:'https://www.espn.com/nba/game/_/gameId/812',points:112,allowed:103},
  {league:'NBA',date:'2026-11-15',gameID:'813',team:'GSW',opponent:'SAC',seasonType:'regular',seasonYear:2026,source:'https://www.espn.com/nba/game/_/gameId/813',points:109,allowed:117}
 ];
 const lab=buildMatchupLabData({game,context:{teamGames:schedule}});
 assert.equal(teamMetric(lab.teams[0],'points','defense').value,117);
 assert.equal(teamMetric(lab.teams[1],'points','defense').value,103);
 const html=renderMatchupLab(lab,{state:{tab:'defense',metric:'assists',position:'PG'}});
 assert.match(html,/Scoring defense · actual points allowed per game/);
 assert.match(html,/117\.0/);
 assert.match(html,/103\.0/);
 assert.match(html,/Team-wide defensive results remain visible/);
 assert.match(html,/opponent box-score totals/i);
});
test('matched ESPN schedule and detailed box score for same game combine without double counting',()=>{
 const schedule={...good[0],stats:{},allowed:100};
 const details={...good[0],stats:{points:112,assists:23,rebounds:45,'3pointersmade':16},allowed:{points:100,assists:20,rebounds:41,'3pointersmade':10}};
 const lab=buildMatchupLabData({game,context:{matchupGames:[schedule,details]}});
 assert.equal(lab.teams[1].n,1);
 assert.equal(teamMetric(lab.teams[1],'assists','defense').value,20);
 assert.equal(teamMetric(lab.teams[1],'3pointersmade').value,16);
});
test('matchup analysis is above the market explorer and can switch game without scrolling to sidebar',()=>{
 const html=readFileSync(new URL('../public/console/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/console/app.mjs',import.meta.url),'utf8');
 assert.ok(html.indexOf('id="matchupLab"')>0);
 assert.ok(html.indexOf('id="matchupLab"')<html.indexOf('class="workspace"'));
 assert.match(app,/onSelectGame:next=>switchGame\(next\)/);
 const markup=renderMatchupLab(buildMatchupLabData(input()),{games:[game]});
 assert.match(markup,/Choose matchup/);
 assert.match(markup,/data-ml-select="game"/);
 assert.match(markup,/class="mlDetails"><summary>/);
});
