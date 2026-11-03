import test from 'node:test';
import assert from 'node:assert/strict';
import {indexMarketPairs,marketBenchmark,archivedMarketProbability} from '../lib/market-benchmark.mjs';
const at='2026-11-02T19:00Z',game={start:'2026-11-02T20:00Z'};
const over={kind:'Player Prop',league:'NBA',eventID:'e',book:'draftkings',playerID:'p',stat:'points',periodID:'game',line:20.5,observedAt:at,asOf:at,available:true,side:'over',odds:-110};
const under={...over,side:'under'};
const build=rows=>marketBenchmark(over,indexMarketPairs(rows),game,new Date(at));
test('no-vig benchmark preserves both exact prices and is unavailable for an old archive',()=>{
 const m=build([over,under]);
 assert.equal(archivedMarketProbability({quote:over,odds:-110,marketBenchmark:m},game,at),.5);
 assert.equal(archivedMarketProbability({quote:over,odds:-110},game,at),null);
 assert.equal(archivedMarketProbability({quote:over,odds:-110,marketBenchmark:m},game,'2026-11-02T18:59Z'),null);
});
test('paired prices must agree on book, event, athlete, line, period and observation time',()=>{
 for(const patch of [{book:'fanduel'},{eventID:'other'},{playerID:'other'},{line:21.5},{periodID:'1q'},{observedAt:'2026-11-02T18:59Z'},{asOf:'2026-11-02T17:00Z'},{available:false}])assert.equal(build([over,{...under,...patch}]),null);
 assert.equal(build([over,under,{...under,odds:-120}]),null);
});
