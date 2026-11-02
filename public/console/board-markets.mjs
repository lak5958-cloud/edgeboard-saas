// Repair legacy board classifications using explicit provider market identity.
// Prices, timestamps, availability and offered thresholds are never interpolated.
import {periodFromOddId,teamTotalEntity} from './markets.mjs';
export function normalizeBoardMarkets(data){
 const games=new Map((data.games||[]).map(g=>[g.league+'|'+g.game,g]));
 return {...data,quotes:(data.quotes||[]).map(raw=>{
  const q={...raw},parsed=periodFromOddId(q.oddID),parts=String(q.oddID||'').split('-'),entity=String(q.statEntityID||(parsed?parts.at(-4):'')||'').toLowerCase(),type=String(q.betTypeID||parsed?.betTypeID||'').toLowerCase();
  if(parsed){q.betTypeID=type;q.periodID=q.periodID||parsed.periodID;q.side=q.side||parsed.sideID;}
  if(type==='sp')q.kind='Spread';else if(type==='ml'||type==='ml3way')q.kind='Moneyline';else if(type==='ou'&&entity==='all')q.kind='Total';else if(type==='ou'&&['home','away'].includes(entity))q.kind='Team Total';
  if(q.kind==='Team Total'){const g=games.get(q.league+'|'+q.game),teamEntity=teamTotalEntity({...q,statEntityID:entity});if(teamEntity){q.statEntityID=teamEntity;if(g)q.player=teamEntity==='home'?g.home:g.away;}}
  return q;
 })};
}
