import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {researchHealth} from '../lib/research-health.mjs';
import {nflDefenseRows} from '../lib/nfl-defense.mjs';
import {nflPregame} from '../lib/nfl-pregame.mjs';
import {completeFantasyBoxscores} from '../lib/fantasy-boxscores.mjs';
import {coverageView,performanceHeadline} from '../public/console/performance-view.mjs';
import {summarizeAudits} from '../lib/audit-summary.mjs';
const now=new Date('2026-11-05T17:00Z');
const schedule={league:'NFL',gameID:'x',start:'2026-11-06T01:00Z',home:true,team:'PHI',opponent:'DAL',teamID:'21',opponentID:'6',source:'https://example.com/schedule'};
const profile={league:'NFL',id:'1',currentTeamID:'21',subject:'Quarterback',position:'QB',team:'PHI',asOf:now.toISOString(),url:'https://example.com/roster'};
const data={live:{games:[],quotes:[]},schedule:{games:[schedule]},records:[],rosters:[profile],context:{}};
test('scheduled games missing from the sportsbook feed remain visible with explicit missing data',()=>{
 const r=researchHealth(data,{now});
 assert.equal(r.rows.length,1);
 assert.equal(r.rows[0].currentQuotes,0);
 assert.equal(r.rows[0].players.length,1);
 assert.equal(r.summary.withWorkload,0);
 assert.match(coverageView(r),/no saved quotes/);
 assert.match(coverageView(r),/Availability is unconfirmed/);
});
test('schedule duplicates and provider copies with equivalent timestamps are merged',()=>{
 const live={league:'NFL',eventID:'provider',game:'DAL @ PHI',start:'2026-11-06T01:00:00.000Z',home:'PHI',away:'DAL'};
 const r=researchHealth({...data,schedule:{games:[schedule,{...schedule,home:false,team:'DAL',opponent:'PHI'}]},live:{games:[live],quotes:[]}},{now});
 assert.equal(r.rows.length,1);
 assert.equal(r.rows[0].eventID,'provider');
});
test('wrong-team history and negative or unlabeled workload do not fill coverage',()=>{
 const record={league:'NFL',athleteID:'1',stat:'passingyards',games:[{gameID:'old',teamID:'other',date:'2026-10-20',seasonType:'regular',seasonYear:2026,value:10,opportunities:{passingAttempts:40},source:'https://example.com/old'},{gameID:'current',teamID:'21',date:'2026-10-27',seasonType:'regular',seasonYear:2026,value:10,opportunity:40,source:'https://example.com/current'}]};
 const r=researchHealth({...data,records:[record]},{now});
 assert.equal(r.rows[0].players[0].games,1);
 assert.equal(r.rows[0].players[0].workload.measured,0);
});
test('NFL opponent totals require a complete certified team set',()=>{
 const payload=JSON.parse(fs.readFileSync(new URL('./fixtures/nfl-boxscore.json',import.meta.url)));
 const full=completeFantasyBoxscores(payload,'NFL',now);
 for(const r of full){const team=full.filter(p=>p.teamID===r.teamID);r.teamOffensivePlayers=team.length;r.teamOffensiveDigest=team.map(p=>String(p.athleteID)).sort().join(',');}
 const rows=nflDefenseRows(full,now);
 assert.equal(rows.length,2);
 assert.ok(rows.every(r=>r.allowed.passingyards>=0));
 const dropped=full.filter((r,i)=>i!==0);
 assert.equal(nflDefenseRows(dropped,now).length,1);
 assert.equal(nflDefenseRows(full.map(({teamOffensiveDigest,...r})=>r),now).length,0);
});
test('pregame weather rejects the wrong game, wrong teams and postgame evidence',()=>{
 const payload={header:{id:'x',competitions:[{id:'x',date:schedule.start,competitors:[{team:{id:'21'}},{team:{id:'6'}}],status:{type:{state:'pre'}}}]},gameInfo:{venue:{indoor:false},weather:{temperature:50,displayValue:'Cloudy'}}};
 const r=nflPregame(payload,schedule,now);
 assert.equal(r.indoor,false);
 assert.equal(r.temperatureUnit,null);
 assert.equal(nflPregame(payload,{...schedule,gameID:'wrong'},now),null);
 assert.equal(nflPregame(payload,schedule,new Date('2026-11-06T02:00Z')),null);
 assert.doesNotMatch(coverageView({...researchHealth(data,{now}),rows:[{...researchHealth(data,{now}).rows[0],weather:r}]}),/50 °F/);
});
test('coverage render escapes player input and empty performance never claims accuracy',()=>{
 const r=researchHealth({...data,rosters:[{...profile,subject:'<script>bad</script>'}]},{now});
 assert.ok(!coverageView(r).includes('<script>'));
 const html=performanceHeadline([],summarizeAudits([]));
 assert.match(html,/Unavailable/);
 assert.doesNotMatch(html,/model matched or beat/i);
});

test('injury identity comes from explicit ESPN athlete links and conflicting links are excluded',async()=>{
 const {injuryRows}=await import('../lib/context.mjs');
 const athlete={displayName:'Example Player',links:[{href:'https://www.espn.com/nfl/player/_/id/123/example-player'}],team:{id:'21'}};
 const input={injuries:[{id:'21',injuries:[{status:'Out',date:'2026-11-05T16:00Z',athlete}]}]};
 assert.equal(injuryRows(input,'NFL',now.toISOString())[0].athleteID,'123');
 athlete.links.push({href:'https://www.espn.com/nfl/player/_/id/456/other-player'});
 assert.equal(injuryRows(input,'NFL',now.toISOString()).length,0);
});
test('NBA defense coverage uses the current team-history archive',()=>{
 const nba={...data,live:{games:[{league:'NBA',eventID:'x',home:'BOS',away:'NY',start:'2026-11-06T01:00Z'}],quotes:[]},schedule:{games:[]},rosters:[{...profile,league:'NBA',team:'BOS',currentTeamID:'2'}],context:{teamGames:[{league:'NBA',team:'NY',gameID:'earlier',date:'2026-11-01',seasonYear:2026,source:'https://example.com/box'}]}};
 const r=researchHealth(nba,{league:'NBA',now});
 assert.equal(r.rows[0].players[0].defenseGames,1);
});
