import test from 'node:test';
import assert from 'node:assert/strict';
import {summaryTeams} from '../lib/matchups.mjs';
import {mergeTeamScheduleRow} from '../lib/team-history-merge.mjs';
import {buildMatchupLabData,teamMetric,renderMatchupLab} from '../public/console/matchup-lab.mjs';

const makeSummary=({orlandoThrees='13-34',bostonThrees='20-56',season=2,completed=true}={})=>({
 header:{id:'401909994',season:{type:season},competitions:[{id:'401909994',date:'2026-11-16T23:00:00Z',
  status:{type:{completed}},competitors:[
   {team:{id:'19',abbreviation:'ORL'},score:'115',homeAway:'away'},
   {team:{id:'2',abbreviation:'BOS'},score:'105',homeAway:'home'}
  ]}]},
 boxscore:{teams:[
  {team:{abbreviation:'ORL'},statistics:[
   {name:'threePointFieldGoalsMade-threePointFieldGoalsAttempted',displayValue:orlandoThrees},
   {name:'totalRebounds',displayValue:'46'},{name:'assists',displayValue:'31'},
   {name:'turnovers',displayValue:'13'},{name:'steals',displayValue:'8'},
   {name:'blocks',displayValue:'4'},{name:'fieldGoalsMade-fieldGoalsAttempted',displayValue:'41-82'},
   {name:'freeThrowsMade-freeThrowsAttempted',displayValue:'20-25'},
   {name:'offensiveRebounds',displayValue:'10'}]},
  {team:{abbreviation:'BOS'},statistics:[
   {name:'threePointFieldGoalsMade-threePointFieldGoalsAttempted',displayValue:bostonThrees},
   {name:'totalRebounds',displayValue:'40'},{name:'assists',displayValue:'24'},
   {name:'turnovers',displayValue:'11'},{name:'steals',displayValue:'9'},
   {name:'blocks',displayValue:'2'},{name:'fieldGoalsMade-fieldGoalsAttempted',displayValue:'38-90'},
   {name:'freeThrowsMade-freeThrowsAttempted',displayValue:'9-17'},
   {name:'offensiveRebounds',displayValue:'9'}]}
 ]}
});
const matchup={league:'NBA',game:'ORL @ BOS',away:'ORL',home:'BOS',start:'2026-11-19T23:00:00Z',eventID:'later'};

test('extracts team totals from completed ESPN team boxscore without depending on full player participation',()=>{
 const rows=summaryTeams(makeSummary());
 assert.equal(rows.length,2);
 const orl=rows.find(r=>r.team==='ORL'),bos=rows.find(r=>r.team==='BOS');
 assert.equal(orl.stats['3pointersmade'],13);
 assert.equal(orl.stats['3pointersattempted'],34);
 assert.equal(orl.stats.rebounds,46);
 assert.equal(orl.stats.assists,31);
 assert.equal(orl.allowed['3pointersmade'],20);
 assert.equal(orl.allowed['3pointersattempted'],56);
 assert.equal(orl.allowed.rebounds,40);
 assert.equal(orl.allowed.assists,24);
 assert.equal(orl.pointsAllowed,105);
 assert.equal(bos.allowed['3pointersmade'],13);
 assert.equal(bos.allowed['3pointersattempted'],34);
 assert.equal(bos.stats['3pointersmade'],20);
 assert.equal(bos.stats['3pointersattempted'],56);
 assert.ok(bos.possessions>0);
});
test('rejects impossible shooting statistics and nonfinal or nonregular-season games',()=>{
 assert.equal(summaryTeams(makeSummary({orlandoThrees:'50-20'})).length,0);
 assert.equal(summaryTeams(makeSummary({bostonThrees:'45-50'})).length,0);
 assert.equal(summaryTeams(makeSummary({season:3})).length,0);
 assert.equal(summaryTeams(makeSummary({completed:false})).length,0);
});
test('schedule refresh retains detailed opponent stats after matching scores',()=>{
 const rich=summaryTeams(makeSummary()).find(r=>r.team==='BOS');
 const schedule={league:'NBA',gameID:rich.gameID,teamID:rich.teamID,team:rich.team,date:rich.date,
  points:105,allowed:115,source:'https://www.espn.com/nba/game/_/gameId/401909994'};
 const updated=mergeTeamScheduleRow(rich,schedule,'2026-11-18T00:00:00Z');
 assert.equal(updated.pointsAllowed,115);
 assert.equal(updated.allowed['3pointersmade'],13);
 assert.equal(updated.allowed['3pointersattempted'],34);
 assert.equal(updated.stats['3pointersmade'],20);
 assert.ok(updated.source.includes('boxscore'));
 const corrected=mergeTeamScheduleRow(rich,{...schedule,allowed:120},'2026-11-18T00:00:00Z');
 assert.equal(corrected.pointsAllowed,120);
 assert.equal(corrected.allowed,120);
 assert.equal(corrected.stats,undefined);
});
test('Defense tab shows sourced allowed 3PM, attempts, percentage, boards, assists and turnovers',()=>{
 const rows=summaryTeams(makeSummary());
 const lab=buildMatchupLabData({game:matchup,context:{matchupGames:rows}});
 const bos=lab.teams.find(t=>t.code==='BOS');
 assert.equal(teamMetric(bos,'3pointersmade','defense').value,13);
 assert.equal(teamMetric(bos,'3pointersattempted','defense').value,34);
 assert.ok(Math.abs(teamMetric(bos,'3pointpct','defense').value-100*13/34)<0.01);
 assert.equal(teamMetric(bos,'assists','defense').value,31);
 assert.equal(teamMetric(bos,'rebounds','defense').value,46);
 assert.equal(teamMetric(bos,'turnovers','defense').value,13);
 const html=renderMatchupLab(lab,{state:{tab:'defense',metric:'3pointersmade'}});
 for(const name of ['Opponent 3PM','Opponent 3PA','Opponent 3P%','Opponent rebounds','Opponent assists','Opponent turnovers','See every sourced defensive game'])assert.ok(html.includes(name),name);
 assert.match(html,/13\.0/);
 assert.match(html,/34\.0/);
});
test('lost allowed object is recovered only from consistent opposing-team games',()=>{
 const original=summaryTeams(makeSummary());
 const asSchedule=original.map(r=>({...r,allowed:r.pointsAllowed}));
 const lab=buildMatchupLabData({game:matchup,context:{matchupGames:asSchedule}});
 const bos=lab.teams.find(t=>t.code==='BOS');
 assert.equal(teamMetric(bos,'3pointersmade','defense').value,13);
 assert.equal(teamMetric(bos,'assists','defense').value,31);
 const mismatch=asSchedule.map(r=>({...r}));
 mismatch.find(r=>r.team==='ORL').points=100;
 const bad=buildMatchupLabData({game:matchup,context:{matchupGames:mismatch}});
 assert.equal(teamMetric(bad.teams.find(t=>t.code==='BOS'),'3pointersmade','defense').value,null);
});
test('partial stat coverage stays missing, never inferred from zeros',()=>{
 const team={...summaryTeams(makeSummary()).find(r=>r.team==='BOS')};
 team.allowed={points:115};
 const lab=buildMatchupLabData({game:matchup,context:{matchupGames:[team]}});
 const stats=teamMetric(lab.teams.find(t=>t.code==='BOS'),'3pointersmade','defense');
 assert.equal(stats.value,null);assert.equal(stats.n,0);
 assert.match(renderMatchupLab(lab,{state:{tab:'defense',metric:'3pointersmade'}}),/0 games/);
});
