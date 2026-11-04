import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshOdds} from '../lib/refresh.mjs';
const event={leagueID:'NBA',eventID:'game',status:{startsAt:'2026-11-05T00:00Z'},teams:{home:{abbreviation:'BOS'},away:{abbreviation:'NY'}},players:{athlete:{name:'Example Player'}},odds:{'points-athlete-game-ou-over':{byBookmaker:{draftkings:{odds:-110,overUnder:15.5,available:true}}}}};
test('a failed alternate request falls back to a complete standard board with original timestamps',async()=>{
 const requests=[],updated='2026-11-04T14:00Z';
 event.odds['points-athlete-game-ou-over'].byBookmaker.draftkings.lastUpdatedAt=updated;
 const result=await refreshOdds('test',async url=>{
  const alt=new URL(url).searchParams.get('includeAltLines');requests.push(alt);
  if(alt==='true')throw Object.assign(Error('raw private provider detail'),{providerStatus:503});
  return {data:[event]};
 });
 assert.deepEqual(requests,['true','false']);
 assert.equal(result.status,'limited');
 assert.equal(result.board.quotes[0].asOf,updated);
 assert.equal(result.board.quotes[0].alt,false);
});
test('rate limits are reported without retry or leaking the provider response',async()=>{
 let calls=0;
 const result=await refreshOdds('test',async()=>{calls++;throw Object.assign(Error('private detail'),{providerStatus:429});});
 assert.equal(calls,1);
 assert.equal(result.code,'http-429');
 assert.equal(result.board,undefined);
 assert.doesNotMatch(result.message,/private detail/);
});
