import {quotePeriod,teamTotalEntity} from './markets.mjs';import {implied} from './insights.mjs';
export function oppositeQuote(q){
 if(['over','under'].includes(q.side))return {...q,side:q.side==='over'?'under':'over'};
 if(['Moneyline','Spread'].includes(q.kind)&&['home','away'].includes(q.side)&&q.betTypeID!=='ml3way'&&!String(q.oddID||'').includes('-ml3way-'))return {...q,side:q.side==='home'?'away':'home',line:q.kind==='Spread'?-Number(q.line):q.line};
 return null;
}
export function pairedNoVig(q,quotes,now=new Date()){
 const a=implied(q.odds),opposite=oppositeQuote(q);if(a===null||q.available!==true||!opposite)return null;
 if(q.kind==='Team Total'&&!teamTotalEntity(q))return null;
 const age=t=>(now-Date.parse(t))/60000;if(!Number.isFinite(age(q.asOf))||age(q.asOf)<-2||age(q.asOf)>75)return null;
 const peer=quotes.find(p=>p!==q&&p.league===q.league&&p.eventID===q.eventID&&p.game===q.game&&p.book===q.book&&p.player===q.player&&p.kind===q.kind&&p.stat===q.stat&&quotePeriod(p)===quotePeriod(q)&&(q.kind==='Moneyline'||p.line===opposite.line)&&p.side===opposite.side&&(q.kind!=='Team Total'||teamTotalEntity(p)===teamTotalEntity(q))&&p.available===true&&Math.abs(Date.parse(p.asOf)-Date.parse(q.asOf))<=120000&&age(p.asOf)>=-2&&age(p.asOf)<=75);
 const b=peer?implied(peer.odds):null;return b===null?null:a/(a+b);
}
