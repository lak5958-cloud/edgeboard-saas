import {quotePeriod} from './markets.mjs';import {quoteStatus,implied} from './insights.mjs';import {latestQuotes} from './quote-selection.mjs';
export function compareBooks(q,quotes,game,now=new Date()){
 if(!q)return [];
 return latestQuotes(quotes.filter(x=>['draftkings','fanduel'].includes(x.book)&&x.league===q.league&&x.eventID===q.eventID&&x.kind===q.kind&&x.player===q.player&&x.stat===q.stat&&quotePeriod(x)===quotePeriod(q)&&x.side===q.side&&(x.line??null)===(q.line??null))).map(x=>({...x,current:quoteStatus(x,game,now).ok,breakEven:implied(x.odds)})).sort((a,b)=>Number(b.current)-Number(a.current)||b.odds-a.odds);
}
