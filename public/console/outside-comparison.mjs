import {sameName,sameStat,quoteStatus,analyzeSelection} from './insights.mjs';import {quotePeriod} from './markets.mjs';import {latestQuotes} from './quote-selection.mjs';
const day=d=>new Date(d).toLocaleDateString('en-CA',{timeZone:'America/New_York'}),pct=x=>(100*x).toFixed(1)+'%';
export function outsideComparison(pick,{quotes=[],games=[],records=[],context={},book='draftkings',now=new Date(),analyze=analyzeSelection}={}){
 const sourceDay=pick.slateDate||(Number.isFinite(Date.parse(pick.published_utc))?day(pick.published_utc):null);
 if(!sourceDay)return {label:'Cannot compare',reason:'The source does not identify a dated slate.'};
 if(sourceDay!==day(now))return {label:'Archived source pick',reason:`Published for ${sourceDay}. It is not a recommendation for today’s game.`};
 if(pick.periodID!=='game')return {label:'Cannot compare',reason:'The source period is missing or unsupported. No full-game forecast was substituted.'};
 const game=games.find(g=>g.league===pick.league&&g.game===pick.game&&day(g.start)===sourceDay);
 const candidates=latestQuotes(quotes.filter(q=>q.league===pick.league&&game&&q.eventID===game.eventID&&q.kind==='Player Prop'&&sameName(q.player,pick.subject)&&sameStat(q.stat,pick.market)&&q.side===pick.side&&Number(q.line)===Number(pick.line)&&quotePeriod(q)==='game'&&['draftkings','fanduel'].includes(q.book)&&quoteStatus(q,game,now).ok));
 const q=candidates.find(q=>q.book===book)||candidates[0];if(!q)return {label:'No exact current line',reason:'No current DraftKings or FanDuel price matches this dated player, side, line and period. A nearby alternate line is a different bet.'};
 const a=analyze(q,{game,records,context,now}),p=a.model?.pWin,odds=(q.odds>0?'+':'')+q.odds,price=`${q.book==='fanduel'?'FanDuel':'DraftKings'} ${odds}`,estimate=Number.isFinite(p)?` Experimental estimated hit chance: ${pct(p)}.`:'';
 if(a.model?.status!=='experimental')return {label:'Not enough evidence',reason:'No supported independent forecast is available for this exact line.',quote:q};
 const label=a.decision?.label==='LEAN'?'Agrees at this price':Number.isFinite(a.model?.expectedValue)&&a.model.expectedValue<0?'Disagrees at this price':'Pass — not an endorsement';
 return {label,reason:`${price}: EdgeBoard ${a.decision?.label||'PASS'}.${estimate} ${label.startsWith('Disagrees')?'The estimated return does not justify this price; that does not automatically recommend the opposite side.':label.startsWith('Pass')?'One or more evidence or qualification checks remain unmet.':'The exact selection clears the current research screen.'} ${pick.reported_odds?'The analyst’s original price may differ.':'The source price was not verified; this verdict applies only to the current price shown.'}`,quote:q};
}
