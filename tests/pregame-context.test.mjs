import test from 'node:test';
import assert from 'node:assert/strict';
import {freezePregameContext} from '../lib/pregame-context.mjs';
const now=new Date('2026-11-04T22:00Z'),asOf='2026-11-04T21:50Z',url='https://example.org/source';
const game={league:'NBA',eventID:'g',home:'BOS',away:'NY',start:'2026-11-05T00:00Z'};
const quote={league:'NBA',eventID:'g',book:'draftkings',asOf,player:'Example Player'};
const roster=(id,subject,team='BOS',teamID='bos')=>({id,subject,league:'NBA',team,currentTeamID:teamID,asOf,url});
const report=(id,extra={})=>({athleteID:id,league:'NBA',teamID:'bos',fetchedAt:asOf,status:'Questionable',url,...extra});
const lineup={league:'NBA',eventID:'g',athleteID:'1',teamID:'bos',asOf,url,role:'starter',confirmed:true};
test('freezes exact-event roster, injury and confirmed lineup evidence without future or opposing-team rows',()=>{
 const c=freezePregameContext(quote,game,{
  rosters:[roster('1','Example Player'),roster('2','Teammate'),roster('3','Opponent','NY','ny')],
  injuries:[report('1'),report('1',{reportedAt:'2026-11-05T01:00Z',status:'Out'}),report('2',{status:'Out'}),report('3',{teamID:'ny'})],
  lineups:[lineup,{...lineup,eventID:'other',role:'inactive'},{...lineup,asOf:'2026-11-05T01:00Z',role:'inactive'}]
 },now);
 assert.equal(c.quoteAsOf,quote.asOf);
 assert.equal(c.book,quote.book);
 assert.equal(c.availability.status,'Questionable');
 assert.deepEqual(c.teammateReports.map(r=>r.athleteID),['2']);
 assert.equal(c.lineup.role,'starter');
});
test('missing or conflicting lineup is unknown and a postgame capture is rejected',()=>{
 const context={rosters:[roster('1','Example Player')],lineups:[lineup,{...lineup,role:'bench'}]};
 assert.equal(freezePregameContext(quote,game,context,now).lineup,null);
 assert.equal(freezePregameContext(quote,game,{},now).availability,null);
 assert.equal(freezePregameContext(quote,game,context,new Date(game.start)),null);
});
