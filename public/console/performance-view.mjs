const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=s=>Number.isFinite(Date.parse(s))?new Date(s).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'Time unavailable';
const metrics=items=>'<div class="healthMetrics">'+items.map(([label,value])=>'<div class="card"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('')+'</div>';
const link=(url,label)=>/^https:\/\//.test(url||'')?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>':'';
export function coverageView(r){
 const s=r.summary;
 return metrics([['Upcoming games',s.games],['Current quotes',s.currentQuotes],['Roster players with a quoted prop',s.quoted+' / '+s.players],['Players with 3 recent workload measurements',s.withWorkload+' / '+s.players]])+
 (r.rows.length?r.rows.map(g=>{
  const gaps=[];
  if(!g.currentQuotes)gaps.push(g.quotes?'Saved prices are stale, closed or past the pregame window.':'This sportsbook has no saved quotes for this scheduled game.');
  if(!g.players.length)gaps.push('Roster identity is unavailable for this matchup.');
  const lacking=g.players.filter(p=>!p.rosterFresh||p.games<5||p.workload.measured<3||!p.injury||p.defenseGames<3);
  return '<article class="card healthGame"><h3>'+esc(g.game)+'</h3><p>'+esc(time(g.start))+' · '+g.props+' current full-game prop quotes · '+g.gameLines+' current game lines</p>'+
  (gaps.length?'<p class="coverageGap">'+gaps.map(esc).join(' ')+'</p>':'<p class="coverageGood">Current sportsbook quotes are available for this matchup.</p>')+
  (r.league==='NFL'?'<details open><summary>Quarterback and weather context</summary>'+g.quarterbacks.map(q=>'<p>'+esc(q.team)+' — '+(q.leaders.length?q.leaders.map(l=>esc(l.date)+' '+esc(l.name)+' ('+l.attempts+' passing attempts'+(l.tied?', tied lead':'')+')').join(', '):'No verified recent passing-attempt leaders.')+(q.change?' A different player led the latest two recorded games. Confirm the current quarterback.':'')+'</p>').join('')+'<p>Attempt leaders describe previous games. The next starter still needs confirmation.</p><p>'+weatherView(g.weather)+'</p><p>Complete snaps, routes and position-specific defensive allowances remain unavailable.</p></details>':'')+
  '<details><summary>Player coverage and missing inputs ('+lacking.length+' players with at least one gap)</summary><ul>'+g.players.map(p=>'<li><strong>'+esc(p.name)+' · '+esc(p.team)+' '+esc(p.position)+'</strong><br>'+(p.quoted?'Current quoted prop available. ':'No current quoted prop. ')+(p.rosterFresh?'Roster checked. ':'Roster source is old or unverified. ')+p.games+' current-team games. '+p.workload.measured+' of '+p.workload.recent+' recent games with '+esc(({minutes:'minutes',passingAttempts:'passing attempts',rushingAttempts:'carries',targets:'targets'})[p.workload.kind])+'. '+p.defenseGames+' earlier opponent-defense games.<br>'+(p.injury?'Matched injury report '+esc(p.injury.status)+', '+esc(time(p.injury.asOf))+' '+link(p.injury.url,'Injury source'):'No fresh matched injury report. Availability is unconfirmed.')+(p.workload.values.length?'<br>'+p.workload.values.map(v=>esc(v.date)+' '+v.value+' '+link(v.url,'Box score')).join(' · '):'')+'</li>').join('')+'</ul></details>'+link(g.scheduleSource,'Schedule source')+'</article>';
 }).join(''):'<section class="card"><h3>No upcoming games are saved for today or tomorrow</h3><p>The schedule or collection may be incomplete. This does not establish that the league has no games.</p></section>')+'<p class="fine">'+esc(r.method)+'</p>';
}
function weatherView(w){
 if(!w)return 'No current verified pregame weather/venue summary is saved.';
 return (w.indoor===true?'Provider lists an indoor venue. ':w.indoor===false?'Provider lists an outdoor venue. ':'Roof status is unavailable. ')+(w.weather?esc(w.weather)+'. ':'Weather description is unavailable. ')+(w.temperature!==null&&w.temperatureUnit?esc(w.temperature)+' '+esc(w.temperatureUnit)+'. ':'')+'Checked '+esc(time(w.asOf))+'. '+link(w.url,'Event source');
}
export function performanceHeadline(audits,summary){
 const rows=audits.flatMap(a=>a.results||[]),s=summary.overall,pct=x=>Number.isFinite(x)?(100*x).toFixed(1)+'%':'Unavailable',fixed=x=>Number.isFinite(x)?x.toFixed(4):'Unavailable',games=new Set(rows.filter(r=>Number.isFinite(r.brier)).map(r=>r.league+'|'+r.eventID)).size;
 return metrics([['Scored selections',s.scored],['Games represented',games],['Average estimated hit chance',pct(s.meanProbability)],['Actual win rate on scored selections',pct(s.scoredObservedWinRate)]])+
 '<p>Current-model Brier error '+fixed(s.brier)+'. Lower error is better. Selections from the same game, different books and alternate lines are correlated.</p>'+
 (s.marketPaired?'<p class="'+(s.marketBrier<s.marketPairedActiveBrier?'coverageGap':'coverageGood')+'">On '+s.marketPaired+' selections with a matching same-book no-vig benchmark, model error was '+fixed(s.marketPairedActiveBrier)+' and market error was '+fixed(s.marketBrier)+'. '+(s.marketBrier<s.marketPairedActiveBrier?'The model trailed that benchmark on this sample.':'The model matched or beat that benchmark on this sample. Further independent slates are needed.')+'</p>':'<p>No paired no-vig benchmark is available for this sample.</p>');
}
