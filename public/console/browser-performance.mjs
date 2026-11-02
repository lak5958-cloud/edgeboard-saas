import {pairedNoVig,oppositeQuote} from './market-math.mjs';import {quotePeriod,teamTotalEntity} from './markets.mjs';import {nameKey} from './insights.mjs';
const peerKey=q=>JSON.stringify([q.league,q.eventID,q.game,q.book,q.player,q.kind,q.stat,quotePeriod(q),typeof (q.kind==='Moneyline'?0:q.line),q.kind==='Moneyline'?0:q.line,q.kind==='Team Total'?teamTotalEntity(q):'',q.side]);
// Exact peer groups retain source order and all original freshness/pairing checks.
export function noVigIndex(quotes){
 const groups=new Map();for(const q of quotes){const key=peerKey(q);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(q);}
 return (q,now=new Date())=>pairedNoVig(q,groups.get(peerKey(oppositeQuote(q)||q))||[],now);
}
export function evidenceIndex(records){const index=new Map();for(const s of records){const key=s.league+'|'+nameKey(s.subject);if(!index.has(key))index.set(key,[]);index.get(key).push(s);}return q=>index.get(q?.league+'|'+nameKey(q?.player))||[];}
// Concurrent callers share one read/render cycle; the next caller can retry errors.
export function singleFlight(task){let pending=null;return (...args)=>{if(pending)return pending;pending=Promise.resolve().then(()=>task(...args)).finally(()=>{pending=null;});return pending;};}
