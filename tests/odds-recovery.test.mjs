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

test('shared odds budget blocks pagination without publishing a partial board',async()=>{
 const {budgetedOddsRefresh}=await import('../lib/refresh.mjs');
 const reservations=[];
 let requests=0;
 const r=await budgetedOddsRefresh('test',async()=>{requests++;return {data:[event],nextCursor:'second'};},async(scope,max)=>{reservations.push([scope,max]);return reservations.length<3;},{SPORTSGAMEODDS_DAILY_REFRESH_CAP:'50',SPORTSGAMEODDS_DAILY_REQUEST_CAP:'7'});
 assert.equal(requests,1);
 assert.deepEqual(reservations,[['pull',50],['request',7],['request',7]]);
 assert.equal(r.code,'daily-budget');
 assert.equal(r.board,undefined);
});
test('refresh cap and malformed budget configuration prevent a provider call',async()=>{
 const {budgetedOddsRefresh}=await import('../lib/refresh.mjs');
 const get=()=>assert.fail('provider call was made');
 assert.equal((await budgetedOddsRefresh('test',get,async()=>false,{SPORTSGAMEODDS_DAILY_REFRESH_CAP:'3'})).code,'daily-budget');
 assert.equal((await budgetedOddsRefresh('test',get,async()=>true,{SPORTSGAMEODDS_DAILY_REQUEST_CAP:'bad'})).code,'budget-config');
});
test('Eastern schedule prevents off-hours pulls and reserves one shared hourly slot',async()=>{
 const {budgetedOddsRefresh}=await import('../lib/refresh.mjs');
 const env={SPORTSGAMEODDS_REFRESH_HOURS_ET:'17,19'};
 const reserve=async(scope,max,window)=>{assert.deepEqual([scope,max,window],['slot',1,3600]);return false;};
 const get=()=>assert.fail('provider call was made');
 assert.equal((await budgetedOddsRefresh('test',get,()=>assert.fail('reserved outside window'),env,new Date('2026-11-04T20:00Z'))).code,'scheduled-odds');
 assert.equal((await budgetedOddsRefresh('test',get,reserve,env,new Date('2026-11-04T22:00Z'))).code,'scheduled-odds');
});

test('owner pulls can run off-hours within the shared budget and Eastern slate',async()=>{
 const {budgetedOddsRefresh,easternSlateEnd}=await import('../lib/refresh.mjs');
 const now=new Date('2026-11-04T20:00Z'),slateEnd=easternSlateEnd(now),reservations=[];
 assert.equal(slateEnd.toISOString(),'2026-11-05T05:00:00.000Z');
 assert.equal(easternSlateEnd(new Date('2026-10-31T23:00Z')).toISOString(),'2026-11-01T04:00:00.000Z');
 const get=async url=>{
  const u=new URL(url);
  if(u.pathname.endsWith('/usage'))return {data:{rateLimits:{'per-month':{'current-entities':2490,'max-entities':2500}}}};
  assert.equal(u.searchParams.get('startsAfter'),now.toISOString());
  assert.equal(u.searchParams.get('startsBefore'),slateEnd.toISOString());
  return {data:[event]};
 };
 const env={SPORTSGAMEODDS_REFRESH_HOURS_ET:'17,18,19,20,21,22',SPORTSGAMEODDS_DAILY_REFRESH_CAP:'8',SPORTSGAMEODDS_DAILY_REQUEST_CAP:'20'};
 const reserve=async scope=>{reservations.push(scope);return true;};
 assert.equal((await budgetedOddsRefresh('test',get,reserve,env,now,{manual:true,slateEnd})).status,'ok');
 assert.deepEqual(reservations,['slot','manual','pull','request']);
 const automatic=new Date('2026-11-04T22:00Z');
 assert.equal((await budgetedOddsRefresh('test',get,reserve,env,automatic,{slateEnd})).code,'monthly-budget');
});
