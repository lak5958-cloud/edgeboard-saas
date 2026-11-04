import {belongsToGame,quoteProfile} from './rosters.mjs';
import {contextReadback} from './context.mjs';

const source=url=>/^https:\/\//.test(url||'');
function dated(value,cutoff){
 const at=Date.parse(value);
 return Number.isFinite(at)&&at<=cutoff;
}

export function freezePregameContext(q,game,context,now){
 const start=Date.parse(game?.start),cutoff=now.getTime();
 if(!q.eventID||q.eventID!==game?.eventID||q.league!==game.league||!Number.isFinite(start)||cutoff>=start||!dated(q.asOf,cutoff))return null;
 const profile=quoteProfile(q,game,context.rosters||[]);
 const roster=profile?.id&&profile.currentTeamID&&belongsToGame(profile,game)&&source(profile.url)&&dated(profile.asOf,cutoff)?profile:null;
 const teammates=new Set(roster?.currentTeamID?(context.rosters||[]).filter(p=>p.id&&p.league===q.league&&String(p.currentTeamID)===String(roster.currentTeamID)&&belongsToGame(p,game)&&source(p.url)&&dated(p.asOf,cutoff)).map(p=>String(p.id)):[]);
 const reports=new Map();
 for(const row of context.injuries||[]){
  const id=String(row.athleteID||'');
  if(row.league!==q.league||!teammates.has(id)||!source(row.url)||!dated(row.fetchedAt,cutoff)||row.reportedAt&&!dated(row.reportedAt,cutoff))continue;
  if(row.teamID&&String(row.teamID)!==String(roster.currentTeamID))continue;
  const previous=reports.get(id);
  if(!previous||Date.parse(row.fetchedAt)>Date.parse(previous.fetchedAt))reports.set(id,row);
 }
 const injury=row=>row?{athleteID:String(row.athleteID),subject:row.subject||null,status:row.status,reportedAt:row.reportedAt||null,fetchedAt:row.fetchedAt,url:row.url,fresh:cutoff-Date.parse(row.fetchedAt)<=7200000}:null;
 const candidates=(context.lineups||[]).filter(row=>roster&&row.league===q.league&&row.eventID===q.eventID&&String(row.athleteID)===String(roster.id)&&String(row.teamID)===String(roster.currentTeamID)&&['starter','bench','inactive'].includes(row.role)&&row.confirmed===true&&source(row.url)&&dated(row.asOf,cutoff));
 candidates.sort((a,b)=>Date.parse(b.asOf)-Date.parse(a.asOf));
 const latest=candidates[0];
 const lineup=latest&&!candidates.some(row=>Date.parse(row.asOf)===Date.parse(latest.asOf)&&row.role!==latest.role)?{role:latest.role,asOf:latest.asOf,url:latest.url}:null;
 const measurements=roster?contextReadback(q,context,now,game).measurements:[];
 return {version:1,eventID:q.eventID,book:q.book,quoteAsOf:q.asOf,capturedAt:now.toISOString(),athleteID:roster?String(roster.id):null,
  roster:roster?{teamID:String(roster.currentTeamID),team:roster.team,asOf:roster.asOf,url:roster.url}:null,
  availability:roster?injury(reports.get(String(roster.id))):null,
  teammateReports:[...reports.values()].filter(row=>String(row.athleteID)!==String(roster?.id)).map(injury),
  lineup,measurements};
}
