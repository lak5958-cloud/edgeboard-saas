import {seasonYear} from './seasons.mjs';
import {teamCode,belongsToGame} from './rosters.mjs';
import {normalizeStat,nameKey} from './insights.mjs';
import {opponentHistoryForPlayer,renderOpponentHistory} from './opponent-history.mjs';

// No new provider calls. Each number is derived from dated, sourced, completed-game records.
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const average=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const fmt=(n,d=1)=>Number.isFinite(n)?Number(n).toFixed(d):'—';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeLink=u=>{try{const v=new URL(u);return v.protocol==='https:'?v.href:null;}catch{return null;}};
const dateOnly=x=>String(x||'').slice(0,10);
const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x));
const normStat=(object,key)=>{if(!object||typeof object!=='object')return null;for(const [k,v] of Object.entries(object))if(normalizeStat(k)===normalizeStat(key)&&finite(v))return Number(v);return null;};
const metrics={
 NBA:[{key:'points',label:'Points',unit:'PPG'},{key:'3pointersmade',label:'Made threes',unit:'3PM/G'},{key:'3pointersattempted',label:'Three-point attempts',unit:'3PA/G'},{key:'3pointpct',label:'Three-point %',unit:'%'},{key:'rebounds',label:'Rebounds',unit:'RPG'},{key:'assists',label:'Assists',unit:'APG'},{key:'turnovers',label:'Turnovers',unit:'TOV/G'},{key:'steals',label:'Steals',unit:'STL/G'},{key:'blocks',label:'Blocks',unit:'BLK/G'},{key:'pace',label:'Estimated pace',unit:'poss./48'}],
 NFL:[{key:'points',label:'Points',unit:'PPG'}]
};
function actualTeamRow(raw,league,cutoff,year){
 if(raw?.league&&raw.league!==league)return null;
 const date=dateOnly(raw?.date),code=teamCode(raw?.team,league),id=String(raw?.gameID||''),link=safeLink(raw?.source);
 if(raw?.seasonType!=='regular'||!validDate(date)||date>=cutoff||Number(raw?.seasonYear)!==year||!id||!code||!link||!finite(raw?.points)||!finite(raw?.pointsAllowed??(finite(raw?.allowed)?raw.allowed:null)))return null;
 const allowed=Number(raw.pointsAllowed??raw.allowed),points=Number(raw.points),stats=raw.stats||{},given=typeof raw.allowed==='object'?raw.allowed:{};
 return {league,date,gameID:id,team:code,opponent:teamCode(raw.opponent,league),source:link,points,pointsAllowed:allowed,home:raw.home===true,
  rebounds:normStat(stats,'rebounds'),assists:normStat(stats,'assists'),threes:normStat(stats,'3pointersmade'),threeAttempts:normStat(stats,'3pointersattempted'),turnovers:normStat(stats,'turnovers'),steals:normStat(stats,'steals'),blocks:normStat(stats,'blocks'),
  reboundsAllowed:normStat(given,'rebounds'),assistsAllowed:normStat(given,'assists'),threesAllowed:normStat(given,'3pointersmade'),threeAttemptsAllowed:normStat(given,'3pointersattempted'),turnoversAllowed:normStat(given,'turnovers'),stealsAllowed:normStat(given,'steals'),blocksAllowed:normStat(given,'blocks'),
  pace:finite(raw.pace)?Number(raw.pace):null};
}
function sourcedTeamGames(rows,league,cutoff,year){
 const byId=new Map();
 for(const raw of rows||[]){const r=actualTeamRow(raw,league,cutoff,year);if(!r)continue;
  const key=r.team+'|'+r.gameID,prior=byId.get(key);
  if(!prior)byId.set(key,r);
  else if(prior.points!==r.points||prior.pointsAllowed!==r.pointsAllowed||prior.opponent!==r.opponent)byId.set(key,{conflict:true});
  else byId.set(key,{...prior,...Object.fromEntries(['rebounds','assists','threes','threeAttempts','turnovers','steals','blocks','reboundsAllowed','assistsAllowed','threesAllowed','threeAttemptsAllowed','turnoversAllowed','stealsAllowed','blocksAllowed','pace'].map(k=>[k,Number.isFinite(prior[k])?prior[k]:r[k]]))});
 }
 const valid=[...byId.values()].filter(x=>!x.conflict);
 // If a schedule refresh dropped the opponent's detailed allowed totals,
 // derive them only from the verified OTHER team's sourced offensive box score.
 for(const r of valid){
  const opponent=byId.get(r.opponent+'|'+r.gameID);
  if(!opponent||opponent.conflict||opponent.opponent!==r.team||opponent.date!==r.date||
     r.pointsAllowed!==opponent.points||opponent.pointsAllowed!==r.points)continue;
  for(const [allowed,offense] of [['reboundsAllowed','rebounds'],['assistsAllowed','assists'],['threesAllowed','threes'],
   ['threeAttemptsAllowed','threeAttempts'],['turnoversAllowed','turnovers'],['stealsAllowed','steals'],['blocksAllowed','blocks']]){
   if(!Number.isFinite(r[allowed])&&Number.isFinite(opponent[offense]))r[allowed]=opponent[offense];
  }
 }
 for(const r of valid){
  r.threesPctAllowed=Number.isFinite(r.threesAllowed)&&Number.isFinite(r.threeAttemptsAllowed)&&r.threeAttemptsAllowed>0?
   100*r.threesAllowed/r.threeAttemptsAllowed:null;
  r.threesPct=Number.isFinite(r.threes)&&Number.isFinite(r.threeAttempts)&&r.threeAttempts>0?
   100*r.threes/r.threeAttempts:null;
 }
 return valid.sort((a,b)=>b.date.localeCompare(a.date)||b.gameID.localeCompare(a.gameID));
}
const field=(m,side)=>side==='defense'?({points:'pointsAllowed',rebounds:'reboundsAllowed',assists:'assistsAllowed','3pointersmade':'threesAllowed','3pointersattempted':'threeAttemptsAllowed','3pointpct':'threesPctAllowed',turnovers:'turnoversAllowed',steals:'stealsAllowed',blocks:'blocksAllowed',pace:'pace'}[m]):({points:'points',rebounds:'rebounds',assists:'assists','3pointersmade':'threes','3pointersattempted':'threeAttempts','3pointpct':'threesPct',turnovers:'turnovers',steals:'steals',blocks:'blocks',pace:'pace'}[m]);
export function buildMatchupLabData({game,context={}}={}){
 if(!game||!['NBA','NFL'].includes(game.league))return {game:null,teams:[],allTeams:[],season:null,cutoff:null,metrics:[]};
 const cutoff=dateOnly(game.start),year=seasonYear(game.league,cutoff);
 if(!validDate(cutoff)||!Number.isFinite(year))return {game,teams:[],allTeams:[],season:year,cutoff,metrics:metrics[game.league]||[]};
 const all=context.matchupGames?.length?context.matchupGames:context.teamGames||[];
 const history=sourcedTeamGames(all,game.league,cutoff,year),codes=[teamCode(game.away,game.league),teamCode(game.home,game.league)];
 const groups=new Map();
 for(const row of history){if(!groups.has(row.team))groups.set(row.team,[]);groups.get(row.team).push(row);}
 const allTeams=[...groups].map(([code,rows])=>({code,rows,n:rows.length,latest:rows[0]?.date||null}));
 const teams=codes.map((code,i)=>({code,label:i===0?'Away':'Home',rows:groups.get(code)||[],n:groups.get(code)?.length||0,latest:groups.get(code)?.[0]?.date||null}));
 return {game,teams,allTeams,season:year,cutoff,metrics:metrics[game.league],games:history.length,tracked:allTeams.length};
}
export function teamMetric(team,stat='points',side='offense',window='all'){
 const rows=window==='last5'?team.rows.slice(0,5):window==='last10'?team.rows.slice(0,10):team.rows;
 const key=field(stat,side),values=rows.map(r=>r[key]).filter(Number.isFinite);
 return {value:average(values),n:values.length,latest:rows[0]?.date||null};
}
export function leagueMetricRanking(lab,{stat='points',side='offense',window='all'}={}){
 const entries=lab.allTeams.map(t=>({...t,...teamMetric(t,stat,side,window)})).filter(t=>t.n>=1&&Number.isFinite(t.value)).sort((a,b)=>side==='defense'?b.value-a.value:a.value-b.value||a.code.localeCompare(b.code));
 const complete=lab.game?.league==='NBA'?entries.length===30&&entries.every(t=>t.n>=3):entries.length===32&&entries.every(t=>t.n>=3);
 return {entries,complete,coverage:entries.length,required:lab.game?.league==='NBA'?30:32};
}
export function matchupPlayerHistory({game,records=[],rosters=[]},selection){
 if(!game||!selection?.name||!selection?.stat)return [];
 const cutoff=dateOnly(game.start),name=nameKey(selection.name),metric=normalizeStat(selection.stat);
 const athletes=rosters.filter(p=>p.league===game.league&&belongsToGame(p,game)&&nameKey(p.subject)===name),ids=new Set(athletes.map(a=>String(a.id)).filter(Boolean));
 if(athletes.length>1&&ids.size!==1)return [];
 const games=new Map();
 for(const record of records){
  if(record.league!==game.league||nameKey(record.subject)!==name||normalizeStat(record.stat)!==metric||String(record.periodID||'game').toLowerCase()!=='game')continue;
  if(ids.size&&record.athleteID&&(!ids.has(String(record.athleteID))))continue;
  for(const raw of record.games||[]){
   const date=dateOnly(raw.date),url=safeLink(raw.source||raw.url||record.url);
   if(!validDate(date)||date>=cutoff||raw.seasonType!=='regular'||!url||!finite(raw.value))continue;
   const id=String(raw.gameID||date+'|'+String(raw.opponent||'')),value=Number(raw.value),prior=games.get(id);
   if(!prior)games.set(id,{date,id,value,source:url,opponent:raw.opponent||'',seasonYear:raw.seasonYear,team:raw.team||'',minutes:finite(raw.minutes)?Number(raw.minutes):null});
   else if(prior.value!==value)games.set(id,{conflict:true});
  }
 }
 return [...games.values()].filter(g=>!g.conflict).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)).slice(0,30);
}
const nbaPlayerStats=[{key:'points',label:'Points'},{key:'rebounds',label:'Rebounds'},{key:'assists',label:'Assists'},{key:'3pointersmade',label:'Made threes'}];
const nflPlayerStats=[{key:'passingyards',label:'Passing yards'},{key:'rushingyards',label:'Rushing yards'},{key:'receivingyards',label:'Receiving yards'},{key:'receptions',label:'Receptions'},{key:'passingtouchdowns',label:'Passing touchdowns'},{key:'rushingtouchdowns',label:'Rushing touchdowns'},{key:'receivingtouchdowns',label:'Receiving touchdowns'}];
const button=(name,value,chosen,fieldName)=>`<button type="button" class="mlChip ${chosen===value?'active':''}" data-ml-${fieldName}="${esc(value)}" aria-pressed="${chosen===value}">${esc(name)}</button>`;
const sourceRow=r=>r.source?`<a href="${esc(r.source)}" target="_blank" rel="noopener noreferrer" aria-label="Box score for ${esc(r.date)}">${esc(r.date)} ↗</a>`:esc(r.date);
function bars(items,{max=null,unit='PPG'}={}){
 const top=max||Math.max(1,...items.map(i=>i.value||0));
 return `<div class="mlBars">${items.map((r,i)=>`<div class="mlBarRow"><div class="mlBarMeta"><span>${esc(r.label)}</span><strong>${fmt(r.value)} <small>${esc(unit)}</small></strong></div><div class="mlTrack"><div class="mlFill ${i===1?'mlFillAlt':''}" style="width:${Math.min(100,Math.max(0,(r.value||0)*100/top)).toFixed(1)}%"></div></div><small>${r.n} sourced game${r.n===1?'':'s'}</small></div>`).join('')}</div>`;
}
const noHistory=msg=>`<div class="mlEmpty">${esc(msg)}</div>`;
function overview(lab,window){
 const items=lab.teams.map(t=>({label:t.code,value:teamMetric(t,'points','offense',window).value,n:teamMetric(t,'points','offense',window).n}));
 const matchupNotes=lab.teams.map((t,i)=>{const defense=lab.teams[1-i],attack=teamMetric(t,'points','offense',window),allowed=teamMetric(defense,'points','defense',window);return attack.n&&allowed.n?`<li><strong>${esc(t.code)} offense:</strong> ${fmt(attack.value)} scored per game across ${attack.n} sourced games; ${esc(defense.code)} defense: ${fmt(allowed.value)} allowed across ${allowed.n} games. These are separate historical samples, not a projected score.</li>`:null;}).filter(Boolean).join('');
 return `<p class="mlIntro">A side-by-side snapshot built from sourced, completed regular-season games <strong>before</strong> this matchup. No opponent-adjusted prediction or inferred player position is added.</p><div class="mlTeamGrid">${lab.teams.map(t=>{const p=teamMetric(t,'points','offense',window),a=teamMetric(t,'points','defense',window),r=teamMetric(t,'rebounds','offense',window),three=teamMetric(t,'3pointersmade','offense',window);return `<article class="mlTeam"><div class="mlMini">${esc(t.label)} team</div><h3>${esc(t.code)}</h3><strong class="mlHeroNumber">${fmt(p.value)}</strong><span>Points scored/game · ${p.n} games</span><dl><div><dt>Points allowed</dt><dd>${fmt(a.value)}</dd></div>${lab.game.league==='NBA'?`<div><dt>Rebounds</dt><dd>${fmt(r.value)}</dd></div><div><dt>Made threes</dt><dd>${fmt(three.value)}</dd></div>`:''}</dl></article>`}).join('')}</div>${items.some(i=>Number.isFinite(i.value))?bars(items,{unit:'PPG'}):noHistory('No eligible completed team games were found for the selected matchup.')}${matchupNotes?`<section class="mlNotes"><h3>What stands out</h3><ul>${matchupNotes}</ul></section>`:''}<details class="mlDetails"><summary>Recent completed team games and original sources</summary>${lab.teams.map(t=>`<h4>${esc(t.code)} · ${t.rows.length} sourced games in the archive</h4>${teamLog(t.rows.slice(0,10))}`).join('')}</details>`;
}
function teamLog(rows){
 return rows.length?`<div class="mlTableScroll"><table class="mlTable"><thead><tr><th>Date</th><th>Opponent</th><th>Scored</th><th>Allowed</th><th>Result</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${sourceRow(r)}</td><td>${esc(r.opponent||'—')}</td><td>${fmt(r.points,0)}</td><td>${fmt(r.pointsAllowed,0)}</td><td>${r.points>r.pointsAllowed?'W':r.points<r.pointsAllowed?'L':'T'}</td></tr>`).join('')}</tbody></table></div>`:noHistory('No verified game-by-game team history is available.');
}
function rankings(lab,state,side){
 const metric=lab.metrics.find(x=>x.key===state.metric)||lab.metrics[0],key=metric?.key||'points',ranking=leagueMetricRanking(lab,{stat:key,side,window:state.window});
 const unit=metric?.unit||'per game',defense=side==='defense',showPositions=defense&&lab.game.league==='NBA';
 const baseline=defense?`<section class="mlBaseline"><strong>Scoring defense · actual points allowed per game</strong>${bars(lab.teams.map(t=>({label:t.code,...teamMetric(t,'points','defense',state.window)})),{unit:'PPG allowed'})}<p class="mlSmall">Verified completed-game final scores are shown here even when detailed opponent rebounds, assists, or three-point box scores have not been collected.</p></section>`:'';
 return `<p class="mlIntro">${defense?'Opponent team totals allowed per game':'Team production per game'} for <strong>${esc(metric?.label||'Points')}</strong>. ${showPositions?'These are TEAM totals, not PG/SG/SF/PF/C allowances.':''} ${ranking.complete?'All '+ranking.required+' teams meet minimum coverage.':'Ranked only among '+ranking.coverage+' teams with eligible saved data; incomplete league coverage.'}</p>${baseline}<div class="mlChips" role="group" aria-label="Choose statistical category">${lab.metrics.map(m=>button(m.label,m.key,key,'metric')).join('')}</div>${showPositions?`<div class="mlPosition"><strong>Defense vs. position</strong><div class="mlChips" role="group" aria-label="Choose position">${['All','PG','SG','SF','PF','C'].map(p=>button(p,p,state.position,'position')).join('')}</div>${state.position!=='All'?'<p class="mlSmall">A complete defense-versus-position feed is not connected for '+esc(state.position)+'. Team-wide defensive results remain visible below and must not be confused with '+esc(state.position)+'-only allowances.</p>':'<p class="mlSmall">All positions: verified full-team opponent totals. Individual-position rankings require a complete licensed feed.</p>'}</div>`:''}
 <div class="mlTeamGrid">${lab.teams.map(t=>{const m=teamMetric(t,key,side,state.window);return `<div class="mlTeam"><span class="mlMini">${esc(t.label)} · ${esc(t.code)}</span><strong class="mlHeroNumber">${fmt(m.value)}</strong><span>${esc(unit)} · ${m.n} sourced games</span></div>`}).join('')}</div><div class="mlRanking"><h3>${defense?'Most allowed among tracked teams':'Top scoring teams in saved sample'}</h3><p class="mlSmall">Larger totals appear first; these values are descriptive, not standalone betting recommendations.</p>${ranking.entries.length?`<div class="mlTableScroll"><table class="mlTable"><thead><tr><th>Position</th><th>Team</th><th>${esc(unit)}</th><th>Games</th></tr></thead><tbody>${ranking.entries.slice(0,10).map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.code)}</td><td><strong>${fmt(r.value)}</strong></td><td>${r.n}</td></tr>`).join('')}</tbody></table></div>`:noHistory('No sourced opponent box-score totals are available for this category. Actual points allowed remain shown in the defensive baseline above.')}</div>${bars(lab.teams.map(t=>({label:t.code,...teamMetric(t,key,side,state.window)})),{unit})}
 `;
}
function playerSection(lab,records,rosters,state){
 const playerStats=lab.game.league==='NBA'?nbaPlayerStats:nflPlayerStats;
 const profiles=rosters.filter(p=>p.league===lab.game.league&&belongsToGame(p,lab.game)),names=[...new Set(profiles.map(p=>p.subject).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 const name=names.includes(state.player)?state.player:names[0],stat=playerStats.some(s=>s.key===state.playerStat)?state.playerStat:playerStats[0].key;
 if(!name)return noHistory('No identifiable matchup player profiles were included with this saved Research snapshot.');
 const rows=matchupPlayerHistory({game:lab.game,records,rosters},{name,stat}),recent=rows.slice(0,10),values=rows.map(r=>r.value),avg=average(values);
 const h2h=opponentHistoryForPlayer({game:lab.game,records,rosters},{name,stat});
 const anchors=values.length?Array.from(new Set([Math.max(0,Math.floor(avg||0)-2),Math.max(0,Math.floor(avg||0)-1),Math.floor(avg||0),Math.floor(avg||0)+1,Math.floor(avg||0)+2])).sort((a,b)=>a-b):[];
 return `<div class="mlPlayerControls"><label>Player<select data-ml-select="player">${names.map(n=>`<option value="${esc(n)}" ${n===name?'selected':''}>${esc(n)}</option>`).join('')}</select></label><label>Statistic<select data-ml-select="playerStat">${playerStats.map(s=>`<option value="${s.key}" ${s.key===stat?'selected':''}>${esc(s.label)}</option>`).join('')}</select></label></div>${renderOpponentHistory(h2h,{scope:state.opponentScope,label:playerStats.find(p=>p.key===stat)?.label||stat})}<div class="mlTeamGrid"><div class="mlTeam"><span class="mlMini">${esc(name)} · archived performance</span><strong class="mlHeroNumber">${fmt(avg)}</strong><span>Average over ${rows.length} verified regular-season games</span></div><div class="mlTeam"><span class="mlMini">Most recent saved game</span><strong class="mlHeroNumber">${rows.length?fmt(rows[0].value,0):'—'}</strong><span>${rows[0]?esc(rows[0].date)+' vs '+esc(rows[0].opponent||'opponent'):'No eligible records'}</span></div></div>${rows.length?`<h3>Historical thresholds · descriptive only</h3><div class="mlThresholds">${anchors.map(n=>{const hits=rows.filter(r=>r.value>=n).length,portion=100*hits/rows.length;return `<div class="mlThreshold"><span>${n}+ ${esc(playerStats.find(p=>p.key===stat)?.label||stat)}</span><div class="mlTrack"><div class="mlFill" style="width:${portion.toFixed(1)}%"></div></div><strong>${hits}/${rows.length} (${portion.toFixed(0)}%)</strong></div>`}).join('')}</div><h3>Game-by-game history</h3><div class="mlTableScroll"><table class="mlTable"><thead><tr><th>Date</th><th>Opponent</th><th>${esc(playerStats.find(p=>p.key===stat)?.label||stat)}</th><th>Season</th></tr></thead><tbody>${recent.map(r=>`<tr><td>${sourceRow(r)}</td><td>${esc(r.opponent||'—')}</td><td><strong>${fmt(r.value,0)}</strong></td><td>${esc(r.seasonYear||'—')}</td></tr>`).join('')}</tbody></table></div><p class="mlSmall">Thresholds count games at or above the number shown. They are NOT model win probabilities and may span seasons; only sourced regular-season games dated before the matchup are included.</p>`:noHistory('No validated '+(playerStats.find(p=>p.key===stat)?.label||stat)+' game logs are available for '+name+'. The site will not invent results.')}`;
}
function matchupPicker(game,games){const available=(games||[]).filter(g=>!game||g.league===game.league);return available.length?`<label class="mlGamePicker">Choose matchup <select data-ml-select="game" aria-label="Choose matchup for statistical analysis">${available.map(g=>`<option value="${esc(g.eventID||g.game)}" ${String(g.eventID||g.game)===String(game?.eventID||game?.game)?'selected':''}>${esc(g.game)} · ${esc(String(g.start||'').slice(0,10))}</option>`).join('')}</select></label>`:'';}
export function renderMatchupLab(lab,{records=[],rosters=[],games=[],state={}}={}){
 if(!lab?.game)return `<div class="mlEmpty">Choose an NBA or NFL game to explore team statistics. ${matchupPicker(null,games)}</div>`;
 const s={tab:'overview',metric:'points',window:'last10',position:'All',player:'',playerStat:'points',opponentScope:'all',...state},validTabs=['overview','offense','defense','players'],tab=validTabs.includes(s.tab)?s.tab:'overview';
 const body=tab==='overview'?overview(lab,s.window):tab==='players'?playerSection(lab,records,rosters,s):rankings(lab,s,tab);
 return `<div class="mlHeader"><div><p class="eyebrow">RESEARCH / MATCHUP INTELLIGENCE</p><h2>${esc(lab.game.away)} <span>at</span> ${esc(lab.game.home)}</h2><p class="mlSmall">${esc(lab.game.league)} · ${esc(String(lab.season||'unknown'))} season · games before ${esc(lab.cutoff||'matchup date')} · ${lab.tracked||0} teams in source archive</p></div><span class="mlProvenance">Source-backed · no new odds calls</span></div>${matchupPicker(lab.game,games)}<nav class="mlTabs" aria-label="Matchup statistics sections">${[['overview','Overview'],['offense','Offense'],['defense','Defense'],['players','Player history']].map(([id,name])=>button(name,id,tab,'tab')).join('')}</nav><div class="mlToolbar"><label>Sample period<select data-ml-select="window"><option value="last5" ${s.window==='last5'?'selected':''}>Last 5 available games</option><option value="last10" ${s.window==='last10'?'selected':''}>Last 10 available games</option><option value="all" ${s.window==='all'?'selected':''}>All saved current-season games</option></select></label><span class="mlSmall">Current regular season only. Larger values in defense mean more allowed, not better defense.</span></div><div class="mlBody" role="region" aria-label="${esc(tab)} statistical comparison">${body}</div><footer class="mlFooter">Statistics describe recorded completed games; player histories and team histories have separate coverage. Missing categories are labeled rather than substituted. No estimated matchup edge, profit, or exact player-position defense ranking is implied.</footer>`;
}
export function mountMatchupLab(root,getInput,{onSelectGame}={}){
 const state={tab:'overview',metric:'points',window:'last10',position:'All',player:'',playerStat:'points',opponentScope:'all'};let current='';
 function update(){
  const input=getInput(),game=input.game,key=[game?.league,game?.eventID||game?.game].join('|');
  if(current!==key){current=key;state.player='';state.metric='points';state.position='All';state.opponentScope='all';}
  root.innerHTML=renderMatchupLab(buildMatchupLabData(input),{records:input.records,rosters:input.rosters,games:input.games||[],state});
 }
 root.addEventListener('click',event=>{
  const opponentButton=event.target.closest('[data-ml-opponent-scope]');
  if(opponentButton&&root.contains(opponentButton)){state.opponentScope=opponentButton.dataset.mlOpponentScope;update();return;}
  const button=event.target.closest('[data-ml-tab],[data-ml-metric],[data-ml-position]');
  if(!button||!root.contains(button))return;
  for(const name of ['tab','metric','position'])if(button.dataset['ml'+name[0].toUpperCase()+name.slice(1)]!==undefined){state[name]=button.dataset['ml'+name[0].toUpperCase()+name.slice(1)];update();break;}
 });
 root.addEventListener('change',event=>{
  const field=event.target?.dataset?.mlSelect;
  if(field==='game'){const input=getInput(),target=(input.games||[]).find(g=>String(g.eventID||g.game)===event.target.value&&(!input.game||g.league===input.game.league));if(target&&onSelectGame)onSelectGame(target.game);return;}
  if(!['window','player','playerStat'].includes(field))return;
  if(field==='player'||field==='playerStat')state.opponentScope='all';
  state[field]=event.target.value;update();
 });
 update();return {update};
}
