import {statsFromESPNRow,extractPlayerBoxscores} from './stats-parser.mjs';
import {eventSeason,seasonYear} from './seasons.mjs';
import {normalizeStat} from './insights.mjs';
const fields={passing:['passingyards','passingtd','passinginterceptions'],rushing:['rushingyards','rushingtd'],receiving:['receivingyards','receivingtd','receptions'],fumbles:['fumbleslost']};
const canonical={passingtouchdowns:'passingtd',rushingtouchdowns:'rushingtd',receivingtouchdowns:'receivingtd'};
function parsed(section,values){const raw=statsFromESPNRow({league:'NFL',category:section.name,names:section.names||[],labels:section.labels||[],keys:section.keys||[],values});const out={};for(const [key,value] of Object.entries(raw)){const k=normalizeStat(key);out[canonical[k]||k]=value;}if(section.name==='fumbles'){const sets=[section.keys,section.labels,section.names].filter(Array.isArray);const i=sets.map(a=>a.findIndex(k=>/^(fumbleslost|lost)$/i.test(String(k).replace(/[^a-z]/gi,'')))).find(i=>i>=0);if(i!==undefined&&values[i]!==null&&values[i]!==''&&/^\d+$/.test(String(values[i])))out.fumbleslost=Number(values[i]);}return out;}
/** Missing categories become zeros only after every scored team column reconciles
 * to the published totals. A truncated/missing category never certifies zeros. */
export function completeFantasyBoxscores(payload,league,now=new Date()){
 const c=payload.header?.competitions?.[0],id=String(payload.header?.id||c?.id||'');
 if(!c?.status?.type?.completed||eventSeason({},payload)!=='regular'||!id||!Number.isFinite(Date.parse(c.date))||Date.parse(c.date)>=now.getTime())return [];
 const date=c.date.slice(0,10),source=`https://www.espn.com/${league.toLowerCase()}/boxscore/_/gameId/${id}`,rows=[];
 for(const team of payload.boxscore?.players||[]){
  const teamID=String(team.team?.id||''),opponent=(c.competitors||[]).find(x=>String(x.team?.id)!==teamID)?.team;
  if(!teamID||!opponent?.id)continue;
  const common={league,gameID:id,date,start:c.date,teamID,team:team.team.abbreviation,opponentID:String(opponent.id),opponent:opponent.abbreviation,seasonType:'regular',seasonYear:seasonYear(league,date),source,observedAt:now.toISOString()};
  if(league==='NBA'){
   for(const p of extractPlayerBoxscores(payload,league,date,source).filter(p=>p.team===team.team.abbreviation)){
    const stats=Object.fromEntries(Object.entries(p.stats).map(([k,v])=>[normalizeStat(k),v]));
    if(!(stats.minutes>0)||!['points','rebounds','assists','steals','blocks','turnovers'].every(k=>Number.isFinite(stats[k])))continue;
    rows.push({...common,player:p.player,athleteID:p.athleteId,stats,verifiedComplete:true,zeroPolicy:'Explicit complete played box-score row'});
   }continue;
  }
  if(league!=='NFL')continue;
  const categories=new Map(),players=new Map();
  for(const [name,required] of Object.entries(fields)){
   const sections=(team.statistics||[]).filter(s=>s.name===name);if(sections.length!==1)continue;const section=sections[0],totals=parsed(section,section.totals||[]),athletes=section.athletes;
   if(!Array.isArray(athletes)||!required.every(k=>Number.isFinite(totals[k])))continue;
   const values=new Map();let valid=true;
   for(const a of athletes){const pid=String(a.athlete?.id||'');if(!pid||a.didNotPlay===true||!Array.isArray(a.stats)||values.has(pid)){valid=false;break;}const stats=parsed(section,a.stats);if(!required.every(k=>Number.isFinite(stats[k]))){valid=false;break;}values.set(pid,stats);}
   const sums=Object.fromEntries(required.map(k=>[k,[...values.values()].reduce((s,v)=>s+v[k],0)]));
   // ESPN team passing yards can be net of sacks while athlete yards are gross.
   const sackIndex=(section.labels||[]).findIndex(k=>String(k).toUpperCase()==='SACKS'),sack=/^\d+-(\d+)$/.exec(String(section.totals?.[sackIndex]||''));
   if(name==='passing'&&sack&&sums.passingyards===totals.passingyards+Number(sack[1]))totals.passingyards+=Number(sack[1]);
   if(!valid||!required.every(k=>Math.abs(sums[k]-totals[k])<1e-8))continue;
   categories.set(name,{values,totals});
   if(name!=='fumbles')for(const a of athletes){const pid=String(a.athlete.id);players.set(pid,a.athlete.displayName||a.athlete.fullName);}
  }
  if(categories.size!==Object.keys(fields).length)continue;
  for(const [pid,player] of players){if(!player)continue;const stats={},zeroCategories=[];
   for(const [name,required] of Object.entries(fields)){const category=categories.get(name),row=category.values.get(pid);if(!row)zeroCategories.push(name);for(const key of required)stats[key]=row?row[key]:0;Object.assign(stats,row||{});}
   rows.push({...common,athleteID:pid,player,stats,verifiedComplete:true,zeroCategories,zeroPolicy:'Absent athlete category in complete team table; all scored columns reconcile to source team totals. DNP and roster-only players are excluded.'});
  }
 }
 return rows;
}
