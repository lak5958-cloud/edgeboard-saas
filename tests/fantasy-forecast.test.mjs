import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareFantasyForecast,gradeFantasyForecasts} from '../lib/fantasy-forecast.mjs';

const captured='2026-11-06T18:00:00Z';
const player={id:'2',name:'Example',team:'A',available:true,sample:5,perAppearance:20,recent3:24,weights:{points:1,receptions:0}};
const trade={league:'NBA',format:'half',give:[player],receive:[],generatedAt:captured,recommendation:'Keep',advice:{lineupDelta:-2,basis:'Equal slots'}};
const prepared=prepareFantasyForecast(trade);
const saved={forecast_key:prepared.key,captured_at:captured,forecast:prepared.forecast};
const game=(gameID,start,points,team='A')=>({gameID,league:'NBA',athleteID:'2',team,start,observedAt:new Date(Date.parse(start)+10800000).toISOString(),
 verifiedComplete:true,seasonType:'regular',source:'https://example.com/'+gameID,stats:{points}});

test('same scoring evidence retries share a key and a changed estimate needs a new comparison',()=>{
 assert.equal(prepareFantasyForecast({...trade,generatedAt:'2026-11-06T18:10Z'}).key,prepared.key);
 assert.notEqual(prepareFantasyForecast({...trade,give:[{...player,recent3:25}]}).key,prepared.key);
 assert.equal(prepareFantasyForecast({...trade,give:[{...player,available:false}]}),null);
});

test('grade only the first three verified post-save appearances with frozen scoring weights',()=>{
 const logs=[game('old','2026-11-06T17:00Z',99),game('one','2026-11-06T20:00Z',24),
  game('two','2026-11-08T20:00Z',18,'B'),game('three','2026-11-10T20:00Z',20),game('four','2026-11-12T20:00Z',40)];
 const [result]=gradeFantasyForecasts([saved],logs,new Date('2026-11-13T18:00Z'));
 const [p]=result.players;
 assert.equal(p.status,'Complete');
 assert.deepEqual(p.games.map(g=>g.gameID),['one','two','three']);
 assert.equal(p.baselineError,2);
 assert.equal(p.recentBlendError,8/3);
});

test('conflicting results and later verified games cannot silently complete a forecast',()=>{
 const logs=[game('one','2026-11-07T20:00Z',24),game('one','2026-11-07T20:00Z',27),
  game('two','2026-11-08T20:00Z',18),game('future','2026-11-11T20:00Z',20)];
 const [result]=gradeFantasyForecasts([saved],logs,new Date('2026-11-10T18:00Z'));
 assert.equal(result.players[0].status,'Conflicting result');
 assert.equal(result.players[0].games.length,1);
});
