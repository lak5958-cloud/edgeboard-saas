import {implied} from './insights.mjs';
import {quotePeriod} from './markets.mjs';

function pairKey(q) {
 return JSON.stringify([q.league,q.eventID,q.book,q.playerID,q.stat,quotePeriod(q),q.line,q.observedAt]);
}

export function indexMarketPairs(quotes) {
 const index=new Map();
 for(const q of quotes) {
  if(q.kind!=='Player Prop'||!q.playerID||!q.eventID||q.available!==true||!['over','under'].includes(q.side)||!Number.isFinite(q.line)||!Number.isFinite(Date.parse(q.observedAt))) continue;
  const key=pairKey(q);
  if(!index.has(key)) index.set(key,{over:[],under:[]});
  index.get(key)[q.side].push(q);
 }
 return index;
}

export function marketBenchmark(q,index,game,now) {
 const pair=index.get(pairKey(q));
 if(!pair) return null;
 const observed=Date.parse(q.observedAt),start=Date.parse(game?.start);
 if(!Number.isFinite(start)||observed>=start||observed>now.getTime()) return null;
 const prices={};
 for(const side of ['over','under']) {
  const rows=pair[side];
  if(!rows.length||new Set(rows.map(x=>x.odds)).size!==1) return null;
  if(rows.some(x=>!Number.isFinite(Date.parse(x.asOf))||Date.parse(x.asOf)>observed||observed-Date.parse(x.asOf)>75*60000)) return null;
  prices[side]=rows[0].odds;
 }
 if(prices[q.side]!==q.odds||implied(prices.over)===null||implied(prices.under)===null) return null;
 return {version:'same-book-proportional-v1',key:pairKey(q),observedAt:q.observedAt,...prices};
}

export function archivedMarketProbability(p,game,savedAt) {
 const m=p.marketBenchmark,q=p.quote;
 if(!q||m?.version!=='same-book-proportional-v1'||m.key!==pairKey(q)||m.observedAt!==q.observedAt||m[q.side]!==p.odds) return null;
 const at=Date.parse(m.observedAt);
 if(!Number.isFinite(at)||at>Date.parse(savedAt)||at>=Date.parse(game?.start)) return null;
 const over=implied(m.over),under=implied(m.under);
 if(over===null||under===null||!['over','under'].includes(q.side)) return null;
 return (q.side==='over'?over:under)/(over+under);
}
