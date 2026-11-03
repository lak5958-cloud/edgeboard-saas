import {quotePeriod} from './markets.mjs';import {quoteStatus,implied} from './insights.mjs';import {latestQuotes} from './quote-selection.mjs';
export function compareBooks(q,quotes,game,now=new Date()){
 if(!q)return [];
 const selectedBreakEven=implied(q.odds);
 return latestQuotes(quotes.filter(x=>['draftkings','fanduel'].includes(x.book)&&x.league===q.league&&x.eventID===q.eventID&&x.kind===q.kind&&x.player===q.player&&x.stat===q.stat&&quotePeriod(x)===quotePeriod(q)&&x.side===q.side&&(x.line??null)===(q.line??null))).map(x=>{const breakEven=implied(x.odds);return {...x,current:quoteStatus(x,game,now).ok,breakEven,breakEvenChange:breakEven===null||selectedBreakEven===null?null:100*(breakEven-selectedBreakEven)};}).sort((a,b)=>Number(b.current)-Number(a.current)||b.odds-a.odds);
}
