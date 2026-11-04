import {marketType} from './markets.mjs';
import {teamCode} from './rosters.mjs';
const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
export function normalizeEvents(events,observedAt=new Date().toISOString()){
 const games=[],quotes=[];
 for(const e of events){const league=e.leagueID;if(!['NBA','NFL'].includes(league)||!e.eventID||!Number.isFinite(Date.parse(e.status?.startsAt)))continue;
  const code=t=>teamCode(t?.names?.short||t?.abbreviation||t?.teamID?.split('_')[0],league),home=code(e.teams?.home),away=code(e.teams?.away);if(!home||!away)continue;
  const game={league,eventID:e.eventID,game:away+' @ '+home,displayName:(e.teams?.away?.names?.long||away)+' @ '+(e.teams?.home?.names?.long||home),home,away,start:e.status.startsAt,status:e.status.cancelled?'Cancelled':e.status.ended?'Final':e.status.started?'Live':'Upcoming',started:e.status.started===true,ended:e.status.ended===true};games.push(game);
  for(const [id,m] of Object.entries(e.odds||{})){
   const parts=id.split('-');if(parts.length<5)continue;const side=m.sideID||parts.at(-1),betTypeID=m.betTypeID||parts.at(-2),periodID=m.periodID||parts.at(-3),statEntityID=m.statEntityID||parts.at(-4),stat=m.statID||parts.slice(0,-4).join('-');const kind=marketType({betTypeID,statEntityID});if(kind==='Other Market')continue;
   const player=kind==='Player Prop'?(e.players?.[statEntityID]?.name||e.players?.[statEntityID]?.names?.long||e.players?.[statEntityID]?.displayName):kind==='Team Total'?(statEntityID==='home'?home:away):game.game;if(!player||typeof player!=='string')continue;
   for(const [book,b] of Object.entries(m.byBookmaker||{}))for(const [i,x] of [b,...(Array.isArray(b.altLines)?b.altLines:[])].entries()){
    const line=betTypeID==='ml'||betTypeID==='ml3way'?null:betTypeID==='sp'?x.spread:x.overUnder;
    if(!finite(x.odds)||Math.abs(Number(x.odds))<100||(!['ml','ml3way'].includes(betTypeID)&&!finite(line)))continue;
    const updated=x.lastUpdatedAt||b.lastUpdatedAt||m.lastUpdatedAt;
    // Retrieval time verifies an offered response, never rewrites the provider update time.
    const asOf=updated&&Number.isFinite(Date.parse(updated))?updated:observedAt;
    quotes.push({league,eventID:e.eventID,game:game.game,kind,player,playerID:kind==='Player Prop'?statEntityID:null,stat,statEntityID,periodID,betTypeID,side,line:line===null?null:Number(line),odds:Number(x.odds),book,asOf,observedAt,providerUpdatedAt:updated||null,timestampBasis:updated?'provider-update':'provider-response',available:x.available===true&&b.available===true&&!e.status.started&&!e.status.ended&&!e.status.cancelled&&!m.started&&!m.ended&&!m.cancelled,alt:i>0,oddID:id,deeplink:x.deeplink||b.deeplink||null,marketName:m.marketName||null,source:'https://sportsgameodds.com/'});
   }
  }
 }
 return {games,quotes,generatedAt:observedAt,source:'SportsGameOdds v2',complete:true};
}
export async function fetchOdds(key,{get,now=new Date(),maxPages=12,includeAlts=true,deadline=Infinity}={}){
 if(!key)return {status:'missing-key',message:'SportsGameOdds is not configured; earlier board retained.'};
 const events=[];let cursor=null;const seen=new Set();
 for(let page=0;page<maxPages;page++){
  if(Date.now()>=deadline)throw Object.assign(Error('Odds request budget elapsed.'),{code:'odds-timeout'});
  const u=new URL('https://api.sportsgameodds.com/v2/events/');u.searchParams.set('leagueID','NBA,NFL');u.searchParams.set('oddsAvailable','true');u.searchParams.set('includeAltLines',String(includeAlts));u.searchParams.set('bookmakerID','draftkings,fanduel');u.searchParams.set('limit','10');u.searchParams.set('startsAfter',new Date(now.getTime()-3600000).toISOString());u.searchParams.set('startsBefore',new Date(now.getTime()+2*86400000).toISOString());if(cursor)u.searchParams.set('cursor',cursor);
  const p=await get(u.href,{'x-api-key':key});if(p.success===false||!Array.isArray(p.data))throw Error('Odds response schema was not recognized. Earlier board retained.');events.push(...p.data);cursor=p.nextCursor;
  if(!cursor)return {status:'ok',board:normalizeEvents(events,now.toISOString()),pages:page+1};if(seen.has(cursor))throw Object.assign(Error('Odds pagination repeated.'),{code:'odds-pagination'});seen.add(cursor);
 }
 throw Object.assign(Error('Odds pagination is incomplete.'),{code:'odds-pagination'});
}
