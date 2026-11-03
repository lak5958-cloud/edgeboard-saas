import {tradeReplayForecast} from './trade-replay.mjs';
import {belongsToGame} from './rosters.mjs';

export const TRADE_VERSION='nba-two-old-team-games-v1';
export function tradeShadow(q,game,sample,model,profile,now) {
 const rosterTime=Date.parse(profile?.asOf),team=profile?.currentTeamID;
 if(q.league!=='NBA'||!Number.isFinite(q.line)||Math.abs(q.line%1)!==.5||!['over','under'].includes(q.side))return null;
 if(!profile?.id||!team||!belongsToGame(profile,game)||!/^https:\/\//.test(profile.url||'')||!Number.isFinite(rosterTime)||rosterTime>now.getTime()||now-rosterTime>48*3600000)return null;
 const date=q.asOf.slice(0,10);
 const past=(sample?.rows||[]).filter(r=>String(r.athleteID)===String(profile.id)&&r.date<date&&r.seasonType==='regular'&&r.teamID&&Number.isFinite(r.value)&&/^https:\/\//.test(r.source||'')).sort((a,b)=>a.date.localeCompare(b.date));
 if(String(past.at(-1)?.teamID)!==String(team)||past.filter(r=>r.seasonYear===sample.currentYear&&String(r.teamID)===String(team)).length>5)return null;
 const result=tradeReplayForecast(past,team,sample.currentYear,q.line);
 if(!result)return null;
 const sided=p=>q.side==='over'?p:1-p;
 const active=model?.status==='experimental'&&Number.isFinite(model.pWin)&&model.pPush===0?model.pWin:null;
 return {version:TRADE_VERSION,createdAt:now.toISOString(),limited:sided(result.limitedOldTeam),currentOnly:sided(result.currentOnly),active,currentN:result.currentN,oldN:result.oldN,roster:{id:String(profile.id),team:profile.team,teamID:String(team),asOf:profile.asOf,url:profile.url}};
}
