// Market identity is (statistic, subject, period, bet type, side), not just statistic.
// Reference: https://sportsgameodds.com/docs/data-types/odds and /periods.
const PERIODS={game:'Full game (incl. OT)',reg:'Regulation only','1h':'1st half','2h':'2nd half','1q':'1st quarter','2q':'2nd quarter','3q':'3rd quarter','4q':'4th quarter','1qx3':'First 3 quarters',ot:'Overtime'};
const STATS={
 points:'Points',rebounds:'Rebounds',assists:'Assists',blocks:'Blocks',steals:'Steals',turnovers:'Turnovers',
 'points+rebounds':'Points + rebounds','points+assists':'Points + assists','rebounds+assists':'Rebounds + assists',
 'points+rebounds+assists':'Points + rebounds + assists',threePointersMade:'Made threes',threes:'Made threes',
 threePointers:'Made threes',threePointers_made:'Made threes',fieldGoals_made:'Field goals made',
 passing_yards:'Passing yards',rushing_yards:'Rushing yards',receiving_yards:'Receiving yards',
 receiving_receptions:'Receptions',receiving_targets:'Targets',passing_touchdowns:'Passing TDs',
 rushing_touchdowns:'Rushing TDs',receiving_touchdowns:'Receiving TDs',touchdowns:'Touchdowns',
 passing_attempts:'Pass attempts',passing_completions:'Pass completions',rushing_attempts:'Rush attempts',
 'passing+rushing_yards':'Passing + rushing yards','rushing+receiving_yards':'Rushing + receiving yards',
 defense_sacks:'Sacks',defense_tackles:'Tackles',defense_combinedTackles:'Combined tackles',
 defense_interceptions:'Defensive interceptions',yards:'Total yards (not passing/rushing/receiving)'
};
function tidy(id){return String(id||'').replace(/[_-]/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\s+/g,' ').trim();}
export function statLabel(id,league='NBA'){
 const raw=String(id||'');
 if(raw==='yards')return league==='NFL'?'Total yards (provider generic)':'Yards (provider generic)';
 const exact=STATS[raw]||STATS[raw.toLowerCase()];
 if(exact)return exact;
 if(!raw)return 'Statistic not supplied';
 return tidy(raw).replace(/\b\w/g,c=>c.toUpperCase());
}
export function periodLabel(id){return PERIODS[String(id||'').toLowerCase()]|| (id&&id!=='unknown'?`Other period (${id})`:'Period not specified');}
export function periodFromOddId(oddID){
 const pieces=String(oddID||'').split('-');
 if(pieces.length<5)return null;
 const period=pieces.at(-3),betType=pieces.at(-2),side=pieces.at(-1);
 if(!['ml','sp','ou','yn','eo','ml3way'].includes(betType))return null;
 if(!['home','away','over','under','yes','no','even','odd','draw'].includes(side))return null;
 return {periodID:period,betTypeID:betType,sideID:side};
}
export function parsePeriod(m={},oddKey=''){
 const explicit=String(m.periodID||m.period||'').toLowerCase();
 if(explicit)return explicit;
 const parsed=periodFromOddId(m.oddID||oddKey);
 if(parsed?.periodID)return parsed.periodID;
 const name=String(m.marketName||m.name||'').toLowerCase();
 for(const [re,p] of [[/\b(1st|first)\s*(quarter|qtr|q)\b/,'1q'],[/\b(2nd|second)\s*(quarter|qtr|q)\b/,'2q'],[/\b(3rd|third)\s*(quarter|qtr|q)\b/,'3q'],[/\b(4th|fourth)\s*(quarter|qtr|q)\b/,'4q'],[/\b(1st|first)\s*half\b/,'1h'],[/\b(2nd|second)\s*half\b/,'2h'],[/\bfull\s*game\b/,'game']])if(re.test(name))return p;
 return 'unknown'; // Do not silently claim full game.
}
export function marketType(m={}){
 const type=String(m.betTypeID||'').toLowerCase();
 const entity=String(m.statEntityID||'').toLowerCase();
 if(type==='sp')return 'Spread';
 if(type==='ml'||type==='ml3way')return 'Moneyline';
 if(type==='ou'&&entity==='all')return 'Total';
 if(type==='ou'&&(entity==='home'||entity==='away'))return 'Team Total';
 if(entity&&!['all','home','away'].includes(entity))return 'Player Prop';
 return 'Other Market';
}
export function quotePeriod(q={}){return String(q.periodID||periodFromOddId(q.oddID)?.periodID||parsePeriod(q,q.oddID)).toLowerCase();}
export function marketDescription(q={}){
 const p=periodLabel(quotePeriod(q)),s=statLabel(q.stat,q.league);
 const kind=q.kind||'Market';
 if(kind==='Moneyline')return `${['points','score'].includes(String(q.stat||'').toLowerCase())?'Moneyline':s+' moneyline'} · ${p}`;
 if(kind==='Spread')return `${['points','score'].includes(String(q.stat||'').toLowerCase())?'Spread':s+' spread'} · ${p}`;
 if(kind==='Total')return `Game total ${s.toLowerCase()} · ${p}`;
 if(kind==='Team Total')return `Team total ${s.toLowerCase()} · ${p}`;
 return `${s} · ${p}`;
}
export function marketKey(q={}){
 return [q.league,q.eventID||q.game,q.kind,q.kind==='Team Total'?(teamTotalEntity(q)||q.oddID||'unverified-entity'):q.playerID||q.player,q.stat,quotePeriod(q),q.betTypeID||'',q.side,q.book].join('§');
}
export function matchingLadder(q={},other={}){return marketKey(q)===marketKey(other);}

export function teamTotalEntity(q){const id=String(q.statEntityID||String(q.oddID||'').split('-').at(-4)||'').toLowerCase();return ['home','away'].includes(id)?id:null;}
