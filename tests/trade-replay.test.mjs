import test from 'node:test';
import assert from 'node:assert/strict';
import {tradeReplayForecast} from '../lib/trade-replay.mjs';
const old=Array.from({length:5},()=>({teamID:'old',seasonYear:2026,value:30}));
const current=[{teamID:'new',seasonYear:2026,value:5},{teamID:'new',seasonYear:2026,value:10}];
test('trade candidate caps old-team influence at two effective appearances',()=>{
 const r=tradeReplayForecast([...old,...current],'new',2026,15.5);
 assert.equal(r.currentOnly,.5/3);
 assert.equal(r.limitedOldTeam,2.5/5);
 assert.equal(tradeReplayForecast([...old,...current.slice(0,1)],'new',2026,15.5),null);
 assert.equal(tradeReplayForecast([...old.map(x=>({...x,seasonYear:2024})),...current],'new',2026,15.5),null);
});
