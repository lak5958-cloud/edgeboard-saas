import {quoteStatus,implied,nameKey} from './insights.mjs';
import {quotePeriod} from './markets.mjs';
import {quoteProfile,belongsToGame} from './rosters.mjs';
import {latestQuotes} from './quote-selection.mjs';
import {normalizeSeasonGame} from './seasons.mjs';

const eastern=d=>new Date(d).toLocaleDateString('en-CA',{timeZone:'America/New_York'});
export function slateReadiness(data,now=new Date()){
 const today=eastern(now),tomorrow=new Date(Date.parse(today+'T12:00Z')+86400000).toISOString().slice(0,10);
 const games=(data.live.games||[]).filter(g=>['NBA','NFL'].includes(g.league)&&Number.isFinite(Date.parse(g.start))&&Date.parse(g.start)>now.getTime()&&[today,tomorrow].includes(eastern(g.start)));
 const keys=new Map(games.map(g=>[g.eventID,g]));
 const grouped=new Map();
 for(const q of latestQuotes((data.live.quotes||[]).filter(q=>keys.has(q.eventID)&&['draftkings','fanduel'].includes(q.book)))){
  const key=q.eventID+'|'+q.book;
  if(!grouped.has(key))grouped.set(key,[]);
  grouped.get(key).push(q);
 }
 const history=new Map();
 for(const r of data.records||[]){
  const id=r.athleteID||r.profile?.id;
  if(!id||(r.periodID||'game')!=='game')continue;
  const key=r.league+'|'+id;
  let cutoff=history.get(key);
  for(const raw of r.games||[]){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(raw.date||'')||cutoff&&raw.date>=cutoff||!Number.isFinite(raw.value)||!raw.gameID||!/^https:\/\//.test(raw.source||raw.url||r.url||''))continue;
   if(normalizeSeasonGame(raw).seasonType==='regular'){
    cutoff=raw.date;
    history.set(key,cutoff);
   }
  }
 }
 const rows=[];
 for(const g of games)for(const book of ['draftkings','fanduel']){
  const quotes=grouped.get(g.eventID+'|'+book)||[];
  const current=quotes.filter(q=>q.league===g.league&&quotePeriod(q)==='game'&&implied(q.odds)!==null&&quoteStatus(q,g,now).ok);
  const props=current.filter(q=>q.kind==='Player Prop'&&q.player&&['over','under'].includes(q.side)&&Number.isFinite(q.line));
  const players=new Map(props.map(q=>[q.playerID||nameKey(q.player),q]));
  let rosterMatches=0,playersWithHistory=0;
  for(const q of players.values()){
   const profile=quoteProfile(q,g,data.rosters||[]),asOf=Date.parse(profile?.asOf);
   if(!profile?.id||!belongsToGame(profile,g)||!Number.isFinite(asOf)||asOf>now.getTime()||now-asOf>48*3600000||!/^https:\/\//.test(profile.url||''))continue;
   rosterMatches++;
   const prior=history.get(q.league+'|'+profile.id);
   if(prior&&prior<q.asOf.slice(0,10))playersWithHistory++;
  }
  rows.push({day:eastern(g.start),league:g.league,book,game:g.displayName||g.game,start:g.start,listed:quotes.length,props:props.length,gameLines:current.filter(q=>['Moneyline','Spread','Total','Team Total'].includes(q.kind)).length,players:players.size,rosterMatches,playersWithHistory});
 }
 return {checkedAt:now.toISOString(),today,tomorrow,rows};
}
