import test from 'node:test';import assert from 'node:assert/strict';
import {requestJson} from '../public/request.mjs';import {createRefreshTask} from '../public/refresh-view.mjs';
import {publicGameMarkets} from '../lib/game-markets.mjs';
test('a stalled read times out and aborts without retrying the request',async()=>{
 let calls=0,signal;const fetcher=async(_url,options)=>{calls++;signal=options.signal;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'}))));};
 await assert.rejects(requestJson('/api/example',{timeoutMs:5,fetcher}),{name:'TimeoutError'});assert.equal(calls,1);assert.equal(signal.aborted,true);
});
test('navigation aborts remain distinct from timeouts and HTTP errors keep status',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(requestJson('/api/example',{signal:controller.signal,fetcher:async(_url,{signal})=>{signal.throwIfAborted();}}),{name:'AbortError'});
 await assert.rejects(requestJson('/api/example',{fetcher:async()=>({ok:false,status:409,json:async()=>({error:'Snapshot changed'})})}),{status:409,message:'Snapshot changed'});
});
test('background polls cannot overlap, and a failed poll does not block later updates',async()=>{
 let release,calls=0;const run=createRefreshTask(async()=>{calls++;if(calls===1)await new Promise(r=>release=r);if(calls===2)throw Error('offline');});
 const first=run();assert.equal(await run(),false);release();assert.equal(await first,true);await assert.rejects(run(),/offline/);assert.equal(await run(),true);assert.equal(calls,3);
});
test('game-market pages allow returning to earlier lines without dropping or duplicating entries',()=>{
 const now=new Date('2026-11-03T19:00Z'),game={league:'NFL',eventID:'one',game:'A @ B',start:'2026-11-03T23:00Z'},entries=Array.from({length:61},(_,i)=>({game,quote:{league:'NFL',eventID:'one',book:'draftkings',kind:'Spread',periodID:'game',stat:'points',side:'home',line:i+.5,odds:-110,available:true,asOf:now.toISOString()}}));
 const live={games:[game]},report={entries,complete:true};let cursor='0',lines=[];
 do{const page=publicGameMarkets(report,live,{league:'NFL',kind:'Spread',cursor},now);assert.equal(page.offset,Number(cursor));assert.equal(page.previous,Number(cursor)?String(Number(cursor)-25):null);lines.push(...page.entries.map(p=>p.quote.line));cursor=page.next;}while(cursor);
 assert.equal(lines.length,61);assert.equal(new Set(lines).size,61);
 const back=publicGameMarkets(report,live,{league:'NFL',kind:'Spread',cursor:'25'},now);assert.equal(back.previous,'0');assert.equal(back.entries.length,25);
});
