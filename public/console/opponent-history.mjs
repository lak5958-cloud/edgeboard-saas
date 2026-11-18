import {teamCode,belongsToGame} from './rosters.mjs';
import {normalizeStat,nameKey} from './insights.mjs';

// Uses only sourced box-score records already included in the authenticated research snapshot.
// Same franchise != same lineup. A game with unknown team does not become "current team".
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const datePart=v=>String(v||'').slice(0,10);
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s));
const sourceUrl=v=>{try{const u=new URL(String(v));return u.protocol==='https:'?u.href:null;}catch{return null;}};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const avg=rows=>rows.length?rows.reduce((s,r)=>s+r.value,0)/rows.length:null;
const format=v=>Number.isFinite(v)?v.toFixed(1):'—';

function groupForGame(raw,profile,league){
 const nowId=String(profile.currentTeamID||'');
 const playedId=String(raw.teamID||'');
 const nowCode=teamCode(profile.team,league);
 const playedCode=raw.team?teamCode(raw.team,league):'';
 const idMatch=nowId&&playedId?nowId===playedId:null;
 const codeMatch=nowCode&&playedCode?nowCode===playedCode:null;
 // A disagreement is evidence of stale/conflicting roster metadata, not permission to guess.
 if(idMatch!==null&&codeMatch!==null&&idMatch!==codeMatch)return 'unknown';
 if(idMatch!==null)return idMatch?'current':'former';
 if(codeMatch!==null)return codeMatch?'current':'former';
 return 'unknown';
}

/** Return explicitly grouped, point-in-time head-to-head game results. */
export function opponentHistoryForPlayer({game,records=[],rosters=[]},selection){
 const blank=(reason='')=>({opponent:'',currentTeam:'',name:selection?.name||'',stat:selection?.stat||'',rows:[],groups:{current:[],former:[],unknown:[]},reason});
 if(!game||!selection?.name||!selection?.stat||!['NBA','NFL'].includes(game.league))return blank('Choose a player and statistic.');
 const cutoff=datePart(game.start);
 if(!validDate(cutoff))return blank('Matchup start date is unavailable.');
 const matches=rosters.filter(p=>p.league===game.league&&belongsToGame(p,game)&&nameKey(p.subject)===nameKey(selection.name));
 const athleteIDs=new Set(matches.map(p=>String(p.id||'')).filter(Boolean));
 if(!matches.length||athleteIDs.size>1)return blank('Current roster identity is unavailable or ambiguous.');
 const profile=matches[0];
 const currentTeam=teamCode(profile.team,game.league);
 const home=teamCode(game.home,game.league),away=teamCode(game.away,game.league);
 if(currentTeam!==home&&currentTeam!==away)return blank('Could not match the player to either team in this game.');
 const opponent=currentTeam===home?away:home;
 const opposingIds=new Set(rosters.filter(p=>p.league===game.league&&teamCode(p.team,game.league)===opponent).map(p=>String(p.currentTeamID||'')).filter(Boolean));
 const opposingId=opposingIds.size===1?[...opposingIds][0]:null;
 const stat=normalizeStat(selection.stat);
 const games=new Map();
 for(const record of records){
  if(record.league!==game.league||nameKey(record.subject)!==nameKey(selection.name)||normalizeStat(record.stat)!==stat||String(record.periodID||'game').toLowerCase()!=='game')continue;
  const id=String(record.athleteID||record.profile?.id||'');
  if(athleteIDs.size&&id&&!athleteIDs.has(id))continue;
  for(const raw of record.games||[]){
   const date=datePart(raw.date||raw.start);
   if(!validDate(date)||date>=cutoff||raw.seasonType!=='regular'||!finite(raw.value))continue;
   if(raw.athleteID&&athleteIDs.size&&!athleteIDs.has(String(raw.athleteID)))continue;
   const url=sourceUrl(raw.source||raw.url||record.url);
   if(!url)continue;
   const rawOpponent=raw.opponent?teamCode(raw.opponent,game.league):'';
   const rawOpponentId=String(raw.opponentID||'');
   // Require exact opposing franchise, never a generic "vs all teams" average.
   if(rawOpponent&&rawOpponent!==opponent)continue;
   if(opposingId&&rawOpponentId&&rawOpponentId!==opposingId)continue;
   if(!rawOpponent&&!(opposingId&&rawOpponentId===opposingId))continue;
   const key=String(raw.gameID||date+'|'+rawOpponentId+'|'+rawOpponent);
   const row={gameID:key,date,value:Number(raw.value),source:url,team:raw.team||'',teamID:raw.teamID||'',
    opponent,seasonYear:raw.seasonYear||null,group:groupForGame(raw,profile,game.league)};
   if(!games.has(key))games.set(key,row);
   else {
    const previous=games.get(key);
    if(previous.conflict)continue;
    // Different stat, date, or team for one game means reject the game entirely.
    if(previous.value!==row.value||previous.date!==row.date||previous.group!==row.group){
     games.set(key,{conflict:true});continue;
    }
    // Retain more informative team/season metadata when the sourced result agrees.
    if(!previous.team&&row.team)games.set(key,row);
   }
  }
 }
 const rows=[...games.values()].filter(r=>!r.conflict).sort((a,b)=>b.date.localeCompare(a.date)||b.gameID.localeCompare(a.gameID));
 const groups={current:[],former:[],unknown:[]};
 for(const r of rows)groups[r.group].push(r);
 return {opponent,currentTeam,name:profile.subject,stat:selection.stat,rows,groups,
  reason:rows.length?'':'No sourced regular-season games against this opponent are available in the loaded player-history archive.'};
}
const title={current:'With current franchise',former:'With previous teams',unknown:'Team at the time unverified'};
const displayGroup=r=>title[r.group]||title.unknown;
export function renderOpponentHistory(history,{scope='all',label=''}={}){
 const pools=history.groups||{current:[],former:[],unknown:[]},valid=['all','current','former','unknown'],chosen=valid.includes(scope)?scope:'all';
 const selected=chosen==='all'?history.rows||[]:pools[chosen]||[];
 const cards=['current','former','unknown'].map(g=>'<div class="mlOpponentCard"><span>'+title[g]+'</span><strong>'+format(avg(pools[g]||[]))+'</strong><small>'+((pools[g]||[]).length)+' game'+((pools[g]||[]).length===1?'':'s')+'</small></div>').join('');
 const controls=valid.map(g=>'<button type="button" data-ml-opponent-scope="'+g+'" aria-pressed="'+(chosen===g)+'" class="mlChip '+(chosen===g?'active':'')+'">'+(g==='all'?'All ('+(history.rows||[]).length+')':g==='current'?'Current franchise ('+pools.current.length+')':g==='former'?'Former teams ('+pools.former.length+')':'Unverified ('+pools.unknown.length+')')+'</button>').join('');
 const table=selected.length?'<div class="mlTableScroll"><table class="mlTable"><thead><tr><th>Date</th><th>Team played for</th><th>Opponent</th><th>'+esc(label||history.stat||'Result')+'</th><th>Context</th></tr></thead><tbody>'+
  selected.slice(0,30).map(r=>'<tr><td><a href="'+esc(r.source)+'" target="_blank" rel="noopener noreferrer">'+esc(r.date)+' ↗</a></td><td>'+esc(r.team||'Unverified')+'</td><td>'+esc(r.opponent)+'</td><td><strong>'+r.value+'</strong></td><td>'+esc(displayGroup(r))+'</td></tr>').join('')+'</tbody></table></div>':
  '<p class="mlEmpty">'+esc(history.reason||'No sourced games in this category.')+'</p>';
 const note=history.opponent?'These are sourced games specifically against '+esc(history.opponent)+'. "Current franchise" means the player represented '+esc(history.currentTeam)+' at the time, NOT that the current lineup or role was identical. Historical games with unknown team attribution stay separate.':'Opponent identity could not be verified.';
 return '<section class="mlOpponentHistory" aria-label="Historical games against upcoming opponent"><div class="mlOpponentHeading"><div><span class="mlMini">OPPONENT HISTORY</span><h3>Against '+esc(history.opponent||'upcoming opponent')+'</h3></div><span class="mlHistoryCoverage">'+(history.rows||[]).length+' verified matchup game'+((history.rows||[]).length===1?'':'s')+'</span></div><p class="mlSmall">'+note+'</p><div class="mlOpponentCards">'+cards+'</div><div class="mlChips" role="group" aria-label="Filter matchup history by team at the time">'+controls+'</div>'+table+
  '<p class="mlSmall">Averages are descriptive, not projected hit rates. Only sourced games loaded in this Research snapshot are counted; earlier games may not be in the archive. Unknown-team games never count toward current or former franchise averages.</p></section>';
}
