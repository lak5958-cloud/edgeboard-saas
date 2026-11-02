import {marketKey} from './markets.mjs';
export const quoteLineKey=q=>marketKey(q)+'|'+Number(q.line);
export function preferQuote(incoming,current){
 if(!current)return true;const a=Date.parse(incoming.asOf),b=Date.parse(current.asOf);
 if(Number.isFinite(a)&&!Number.isFinite(b))return true;if(!Number.isFinite(a)&&Number.isFinite(b))return false;
 if(a!==b&&Number.isFinite(a)&&Number.isFinite(b))return a>b;
 if((incoming.available===true)!==(current.available===true))return incoming.available===true;
 return current.alt===true&&incoming.alt!==true;
}
export function latestQuotes(quotes){const map=new Map();for(const q of quotes){const key=quoteLineKey(q);if(preferQuote(q,map.get(key)))map.set(key,q);}return [...map.values()];}
