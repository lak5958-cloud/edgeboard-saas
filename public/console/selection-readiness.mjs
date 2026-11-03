import {readOpportunity,opportunityKind} from './opportunity.mjs';
export function readinessSnapshot(q,a,profile=a?.sample?.profile){
 const s=a?.model?.season||{},sample=a?.sample,teamID=s.teamID||profile?.currentTeamID;
 const rows=(sample?.rows||[]).filter(r=>r.seasonYear===sample.currentYear&&teamID&&String(r.teamID)===String(teamID)).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,q.league==='NBA'?5:3);
 const measured=rows.filter(r=>q.league==='NBA'?(typeof r.minutes==='number'||typeof r.minutes==='string'&&r.minutes.trim()!=='')&&Number.isFinite(Number(r.minutes))&&Number(r.minutes)>0:readOpportunity(r,q.stat)!==null);
 return {athleteID:profile?.id||null,rosterTeam:profile?.teamName||profile?.team||null,rosterAsOf:profile?.asOf||null,rosterSource:profile?.url||null,injury:a?.context?.availability||null,workload:{kind:q.league==='NBA'?'minutes':opportunityKind(q.stat),recentN:measured.length,required:q.league==='NBA'?2:3,window:q.league==='NBA'?5:3,latestDate:measured[0]?.date||null,source:measured[0]?.source||null}};
}
