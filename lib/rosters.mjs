import {sameName} from './insights.mjs';
const ALIASES={SAS:'SA',NYK:'NY',GSW:'GS',NOP:'NO',UTA:'UTAH',PHX:'PHO',BRK:'BKN'};
export const teamCode=(x,league=null)=>{const code=String(x||'').toUpperCase();return league==='NFL'?({WAS:'WSH',JAC:'JAX',LA:'LAR'}[code]||code):(ALIASES[code]||code);};
export function belongsToGame(p,g){if(!g||p.league!==g.league)return false;return [g.home,g.away].some(x=>teamCode(x,p.league)===teamCode(p.team,p.league)||String(x).toLowerCase()===String(p.teamName||'').toLowerCase());}
export function rosterOptions(game,profiles,quotes,search=''){
 // NFL market browsing shows only players with an actual offered priced line.
 // Do not infer offensive participation or delete roster/history data. NBA research choices stay available.
 if(game?.league==='NFL')quotes=quotes.filter(q=>q.available===true&&q.line!==null&&q.line!==undefined&&q.line!==''&&Number.isFinite(Number(q.line))&&q.odds!==null&&q.odds!==undefined&&q.odds!==''&&Number.isFinite(Number(q.odds))&&Math.abs(Number(q.odds))>=100);
 const pp=profiles.filter(p=>belongsToGame(p,game));const list=pp.map(p=>({value:p.subject,profile:p,quoted:quotes.some(q=>q.kind==='Player Prop'&&sameName(q.player,p.subject))}));
 for(const q of quotes.filter(q=>q.kind==='Player Prop'))if(!list.some(p=>sameName(p.value,q.player)))list.push({value:q.player,profile:null,quoted:true});
 const term=search.toLowerCase(),statSearch=(game?.league==='NFL'?['passing','rushing','receiving','receptions','targets','yards','touchdowns','tackles','sacks']:['points','rebounds','assists','steals','blocks','turnovers','threes']).some(s=>s.includes(term)&&term.length>=3)||quotes.some(q=>`${q.stat||''} ${q.marketName||''}`.toLowerCase().includes(term));
 return list.filter(p=>(game?.league!=='NFL'||p.quoted)&&(!search||statSearch||`${p.value} ${p.profile?.team||''}`.toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>a.value.localeCompare(b.value)).map(p=>({...p,label:`${p.value}${p.profile?' · '+p.profile.team:''}${p.quoted?'':' · research only (no quote)'}`}));
}
export function playersForBoard(live,profiles,league='NBA'){
 const names=[];for(const q of (live.quotes||[]).filter(q=>q.league===league&&q.kind==='Player Prop')){const canonical=profiles.find(p=>p.league===league&&sameName(p.subject,q.player))?.subject||q.player;if(!names.some(n=>sameName(n,canonical)))names.push(canonical);}
 for(const p of profiles.filter(p=>p.league===league))if((live.games||[]).some(g=>belongsToGame(p,g))&&!names.some(n=>sameName(n,p.subject)))names.push(p.subject);
 return [...new Set(names)];
}

// Resolve within the quoted matchup before using a name. Suffix-stripping alone
// must not join different athletes (for example a namesake on another team).
export function quoteProfile(q,game,profiles=[]){const candidates=profiles.filter(p=>p.league===q.league&&sameName(p.subject,q.player)),local=game?candidates.filter(p=>belongsToGame(p,game)):[],pool=local.length?local:candidates,full=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,''),exact=pool.filter(p=>full(p.subject)===full(q.player)),matches=exact.length?exact:pool,ids=new Set(matches.map(p=>String(p.id||p.subject)+'|'+String(p.currentTeamID)));return ids.size===1?matches[0]:null;}
export function identityRecords(records,profile,profiles=[]){if(!profile)return records;const ambiguous=new Set(profiles.filter(p=>p.league===profile.league&&sameName(p.subject,profile.subject)).map(p=>String(p.id||p.subject))).size>1;return records.filter(r=>{const id=r.athleteID||r.profile?.id;return id&&profile.id?String(id)===String(profile.id):!ambiguous;});}
