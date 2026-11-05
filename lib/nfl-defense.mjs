// Complete reconciled offensive team boxes can describe the opponent's allowances.
const fields={passingyards:'passingyards',rushingyards:'rushingyards',receivingyards:'receivingyards',receptions:'receptions',passingtd:'passingtouchdowns',rushingtd:'rushingtouchdowns',receivingtd:'receivingtouchdowns'};
export function nflDefenseRows(logs,now=new Date()){
 const teams=new Map();
 for(const r of logs||[]){
  if(r.league!=='NFL'||r.verifiedComplete!==true||r.seasonType!=='regular'||!r.gameID||!r.athleteID||!r.teamID||!r.opponentID||!/^https:\/\//.test(r.source||'')||!Number.isFinite(Date.parse(r.start||r.date))||Date.parse(r.start||r.date)>=now.getTime())continue;
  const key=r.gameID+'|'+r.teamID;if(!teams.has(key))teams.set(key,[]);
  teams.get(key).push(r);
 }
 const result=[];
 for(const rows of teams.values()){
  const first=rows[0],players=new Map();let conflict=false;
  for(const row of rows){
   const old=players.get(row.athleteID);
   if(row.date!==first.date||row.opponentID!==first.opponentID||old&&JSON.stringify(old.stats)!==JSON.stringify(row.stats))conflict=true;
   players.set(row.athleteID,row);
  }
  const digest=[...players.keys()].map(String).sort().join(',');
  if(conflict||rows.some(r=>r.teamOffensivePlayers!==players.size||r.teamOffensiveDigest!==digest))continue;
  const unique=[...players.values()],allowed={};
  for(const [field,stat] of Object.entries(fields)){
   if(unique.every(r=>typeof r.stats?.[field]==='number'&&Number.isFinite(r.stats[field])&&r.stats[field]>=0))allowed[stat]=unique.reduce((sum,r)=>sum+r.stats[field],0);
  }
  if(!Object.keys(allowed).length)continue;
  result.push({league:'NFL',gameID:first.gameID,date:first.date,seasonType:'regular',seasonYear:first.seasonYear,teamID:first.opponentID,team:first.opponent,opponentID:first.teamID,opponent:first.team,allowed,source:first.source,players:players.size,method:'Allowance totals from reconciled complete opponent offensive box scores. Team-level totals, without position-specific adjustment.'});
 }
 return result;
}
