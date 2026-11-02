import {nameKey} from './insights.mjs';
// A current roster can change a profile, never the team attached to an old game.
export function withCurrentProfiles(records,rosters){
 const ids=new Map(),names=new Map();for(const p of rosters){for(const [map,key] of [[ids,p.league+'|'+p.id],[names,p.league+'|'+nameKey(p.subject)]]){if(!map.has(key))map.set(key,[]);map.get(key).push(p);}}
 return records.map(r=>{const id=r.athleteID||r.profile?.id;const candidates=id?ids.get(r.league+'|'+id):names.get(r.league+'|'+nameKey(r.subject));const identities=new Set((candidates||[]).map(p=>p.id+'|'+p.currentTeamID));return {...r,profile:identities.size===1?candidates[0]:null};});
}
