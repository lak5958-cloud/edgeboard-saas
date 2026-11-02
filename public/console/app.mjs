import {createWorkspaceReader} from './workspace-loader.mjs';
import {normalizeBoardMarkets} from './board-markets.mjs';
import {noVigIndex,evidenceIndex,singleFlight} from './browser-performance.mjs';
import {mountEvaluation} from './evaluation-ui.mjs';
import {renderDecisionChecks,renderValidationProgress} from './decision-ui.mjs';
import {mountGamePicks} from './picks-ui.mjs';import {quoteIdentity} from './picks.mjs';import {findBoardMarket} from './market-finder.mjs';import {latestQuotes} from './quote-selection.mjs';
import {contextReadback} from './context.mjs';import {observedContext} from './matchups.mjs';
import {rosterOptions,belongsToGame} from './rosters.mjs';
import {pairedNoVig} from './market-math.mjs';
import {statLabel,periodLabel,quotePeriod,marketDescription,marketKey,matchingLadder,teamTotalEntity} from './markets.mjs';
import {analyzeSelection,quoteStatus,implied,sameStat,sameName,lineLadder,matchingOutside,evidenceCoverage,sampleSummary} from './insights.mjs';
let data={games:[],quotes:[],mode:'SCHEDULE_ONLY'},notes=[],experts=[],evidence=[],statSync={},playerHistory={},rosters=[],context={},modelReport={};
let playerRecordsFor=()=>[];const recordsFor=q=>q?.kind==='Player Prop'?playerRecordsFor(q):[];
let historicalReport={},historicalLoadError='';
let evaluationLoadError='';
let dataRevision=0,picksPreviouslyActive=false,preserveSelection=false,workspaceVersion=null,workspaceKey='',workspaceBusy=false,loadSerial=0;
let evidenceLoadError="", refreshRunning=false,ownerAllowed=false;
let league='NBA',game='',kindWanted='Player Prop',subject='',stat='',period='',side='',book='draftkings',selectedLine=null,focusPanel='research',activeQuotes=[];
const $=s=>document.getElementById(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[x]));
const uniq=a=>[...new Set(a.filter(x=>x!==undefined&&x!==null))].sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true}));
const pct=n=>n===null||n===undefined||!Number.isFinite(Number(n))?'—':(Number(n)*100).toFixed(1)+'%';
const safeHref=v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)?esc(u.href):null}catch{return null}};
const odds=o=>o===null||o===undefined||!Number.isFinite(Number(o))?'—':(Number(o)>0?'+':'')+Number(o);
const dt=s=>{const d=new Date(s);return Number.isNaN(d.getTime())?'Unknown':d.toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});};
const gameCode=g=>g?.game||'';
const marketLabel=q=>q.kind==='Moneyline'?`${q.side.toUpperCase()} MONEYLINE`:q.kind==='Spread'?`${q.side.toUpperCase()} ${Number(q.line)>0?'+':''}${q.line}`:`${q.side.toUpperCase()} ${q.line}`;
const selectedGame=()=>data.games.find(g=>g.league===league&&g.game===game);
function parseCsv(input){let row=[],field='',quoted=false,rows=[];for(let i=0;i<input.length;i++){const c=input[i];if(c==='"'){if(quoted&&input[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&input[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field='';}else field+=c;}if(field||row.length){row.push(field);rows.push(row);}return rows.length?rows.slice(1).map(r=>Object.fromEntries(rows[0].map((h,i)=>[h,r[i]||'']))):[];}
function selectValues(id,values,preferred){const el=$(id);el.replaceChildren();if(!values.length){if(preserveSelection&&preferred){el.append(new Option(preferred+' · no longer quoted',preferred));el.value=preferred;return preferred;}el.append(new Option('Not available',''));return '';}for(const v of values)el.append(new Option(v,v));if(preserveSelection&&preferred&&!values.includes(preferred)){el.append(new Option(preferred+' · no longer quoted',preferred));el.value=preferred;return preferred;}const choose=values.includes(preferred)?preferred:values[0];el.value=choose;return choose;}
function dataset(){return Array.isArray(data.quotes)?data.quotes:[];}
function gamesInLeague(){return data.games.filter(g=>g.league===league);}
function gameQuotes(){return dataset().filter(q=>q.league===league&&q.game===game);}
function hasCurrent(q){const target=data.games.find(g=>g.league===q.league&&g.game===q.game);return quoteStatus(q,target,new Date(),75).ok;}
const expectedServerVersion='1.12.1';
const evaluationView=mountEvaluation({getReport:()=>({report:historicalReport,error:historicalLoadError}),onComplete:()=>load()});
const picksView=mountGamePicks({getInput:()=>({game:selectedGame(),quotes:dataset(),records:evidence,context,research:notes,experts,revision:dataRevision}),onOpenQuote:openBoardQuote,onViewChange:onPicksViewChange});
async function responseJson(response,endpoint){
 const body=await response.text();const contentType=String(response.headers.get('content-type')||'').toLowerCase();
 if(!contentType.includes('application/json')){
  if(response.status===404||/^not found$/i.test(body.trim()))throw Error(`The research service could not find ${endpoint}. Reload the page to use the latest version.`);
  throw Error(`${endpoint}: HTTP ${response.status}; expected JSON, received ${contentType||'plain text'}. The last complete view is retained.`);
 }
 let obj;try{obj=JSON.parse(body)}catch{throw Error(`${endpoint}: unreadable JSON from the research service (HTTP ${response.status}).`)}
 if(!response.ok)throw Error(obj?.error||`${endpoint}: HTTP ${response.status}`);
 return obj;
}
async function fetchJson(url){
 if(url==='/data/live-data.json'||/^\/data\/evidence(?:\.auto|\.players)?\.json$/.test(url)){const rows=[];let cursor='0',board=null;do{const r=await fetch(url+'?cursor='+cursor+'&t='+Date.now(),{cache:'no-store'});const page=await responseJson(r,url);const items=url==='/data/live-data.json'?page.quotes:page;if(!Array.isArray(items))throw Error('Invalid research page.');rows.push(...items);if(url==='/data/live-data.json'&&!board)board=page;cursor=r.headers.get('X-Next-Cursor');}while(cursor);return board?{...board,quotes:rows}:rows;}
 const r=await fetch(url+'?t='+Date.now(),{cache:'no-store'});return responseJson(r,url);
}
async function verifyRefreshServer(){const h=await fetchJson('/api/health');if(h.version!==expectedServerVersion||h.refreshSupported!==true)throw Error('The deployed research service is not compatible with this view. Reload the page before requesting a refresh.');return h;}

async function optionalJson(file,empty=[]){try{return await fetchJson(file)}catch(err){if(file==='/data/evidence.auto.json')evidenceLoadError=err.message;if(file==='/api/model-report-summary')evaluationLoadError=err.message;if(file==='/data/historical-report.json')historicalLoadError=err.message;return empty}}
const readWorkspace=createWorkspaceReader(async(url,{signal})=>{const r=await fetch(url,{cache:'no-store',signal});let result;try{result=await r.json()}catch{throw Error('The research service returned an unreadable response. Your previous view is retained.');}if(!r.ok)throw Object.assign(Error(result.error||'Research could not load.'),{status:r.status});return result;});
async function load(force=false){const id=++loadSerial,key=league+'|'+game,keepSelection=workspaceKey===key&&!!workspaceVersion;workspaceBusy=true;$('syncStatus').textContent='Checking published data…';
 try{const result=await readWorkspace({league,game,force:!!force,knownVersion:keepSelection?workspaceVersion:null});if(!result||id!==loadSerial)return false;
  if(result.unchanged){if(picksView.active)picksView.update();else showQuote();const fresh=dataset().filter(q=>q.league===league&&q.book==='draftkings'&&hasCurrent(q));$('dataIntegrity').textContent=fresh.length?`${fresh.length} verified DraftKings quotes`:'No current DraftKings prices';$('freshState').textContent=fresh.length?'Price and timestamp checked · models not calibrated':'Missing, stale, closed or started; wait for current prices';$('syncStatus').textContent='Up to date · checked '+new Date().toLocaleTimeString();return true;}
  const d=result.board;if(!Array.isArray(d.games)||!Array.isArray(d.quotes)||!Array.isArray(result.records))throw Error('The research snapshot is incomplete.');
  d.quotes=normalizeBoardMarkets(d).quotes;const lookup=noVigIndex(d.quotes);for(const q of d.quotes)q.noVigProb=lookup(q);
  // Publish all browser state together only after both paged collections agree on the version.
  data=d;game=result.scope.game||'';dataRevision++;notes=result.notes||[];experts=result.experts||[];evidence=result.records;playerRecordsFor=evidenceIndex(evidence);playerHistory=result.playerHistory||{};rosters=result.rosters||[];statSync=result.statSync||{};context={...result.context,rosters};historicalReport=result.historicalReport||{};modelReport=result.modelReport||{};evidenceLoadError='';evaluationLoadError='';historicalLoadError='';workspaceVersion=result.version;workspaceKey=league+'|'+game;
  preserveSelection=keepSelection;try{evaluationView.render();$('picksValidation').innerHTML=renderValidationProgress(modelReport,evaluationLoadError);render();}finally{preserveSelection=false;}
  $('syncStatus').textContent='Live updates on · loaded '+new Date().toLocaleTimeString();$('refreshFeedback').textContent=`Latest published data loaded. ${evidence.length} stat series for this matchup; other games load when selected. Next change check within 60 seconds.`;return true;
 }catch(err){if(id!==loadSerial)return false;$('syncStatus').textContent='Update failed · previous data retained';$('warn').classList.remove('ok');$('warn').textContent=(err.status===401||err.status===403?'Your Research session needs sign-in. Open the Account page and sign in again. ':`Update could not load: ${err.message}. `)+'The last complete view remains visible; check quote timestamps.';return false;}
 finally{if(id===loadSerial)workspaceBusy=false;}
}

function switchLeague(next){league=next;game='';subject='';stat='';period='';side='';book='draftkings';selectedLine=null;$('gameSearch').value='';$('marketSearch').value='';void load(true);}
function switchGame(next){game=next;subject='';stat='';period='';side='';book='draftkings';selectedLine=null;$('marketSearch').value='';void load(true);}
function render(){
 const gs=gamesInLeague();if(!gs.some(x=>x.game===game))game=gs[0]?.game||'';
 for(const l of ['nba','nfl'])$(l).classList.toggle('active',l.toUpperCase()===league);
 $('leagueName').textContent=league;$('leagueTitle').textContent=league+' matchups';
 const live=data.mode==='LIVE_PROVIDER',todayQs=dataset().filter(q=>q.league===league),dq=todayQs.filter(q=>q.book==='draftkings'),fresh=dq.filter(hasCurrent);
 $('mode').textContent=live?'PROVIDER SNAPSHOT':'SCHEDULE ONLY';$('updated').textContent='Saved '+dt(data.generatedAt);$('statusDot').style.background=fresh.length?'#48d7ad':'#e8b56f';
 $('gamesTotal').textContent=gs.length;$('marketsTotal').textContent=dq.length;$('altsTotal').textContent=dq.filter(q=>q.alt&&hasCurrent(q)).length;
 $('dataIntegrity').textContent=fresh.length?`${fresh.length} verified DraftKings quotes`:'No verified DraftKings prices';$('freshState').textContent=fresh.length?'Price and timestamp checked · models not calibrated':'Missing, stale or unavailable until refreshed';
 $('warn').textContent=data.message||(live?'Saved provider data: check each quote timestamp and availability.':'No published live quotes are available. The server checks the provider on its scheduled refresh.');$('warn').classList.toggle('ok',live&&fresh.length>0);
 renderGames();refreshSelectors();renderMarket();picksView.update();
}
function renderGames(){
 const term=$('gameSearch').value.trim().toLowerCase(),gs=gamesInLeague().filter(g=>(g.game+' '+(g.home||'')+' '+(g.away||'')).toLowerCase().includes(term));
 $('shownGames').textContent=`${gs.length}/${gamesInLeague().length}`;
 $('games').innerHTML=gs.length?gs.map(g=>{
  const n=g.quoteCounts?.draftkings?.current??dataset().filter(q=>q.league===league&&q.game===g.game&&q.book==='draftkings'&&hasCurrent(q)).length;
  const s=g.game.split(' @ ');return `<button class="game ${g.game===game?'active':''}" data-game="${esc(g.game)}"><div class="gameTitle"><span>${esc(s[0]||g.away)} <span style="color:#8996a1">@</span> ${esc(s[1]||g.home)}</span><strong>${n?n+' DK':'—'}</strong></div><div class="gameMeta"><span>${esc(dt(g.start))}</span><span>${esc(g.status||'Scheduled')}</span></div></button>`;}).join(''):'<div class="empty">No games match this search.</div>';
 $('games').querySelectorAll('.game').forEach(b=>b.addEventListener('click',()=>switchGame(b.dataset.game)));
 const g=selectedGame();$('matchup').textContent=g?.game||'Choose a game';$('matchMeta').textContent=g?`${dt(g.start)} · ${g.status||'Scheduled'}`:'No games returned';
}
function filteredQuotes(){let qs=gameQuotes();const term=$('marketSearch').value.trim().toLowerCase();
 // Searches players + stat labels, while retaining the existing market category selection.
 if(term)qs=qs.filter(q=>[q.player,q.stat,q.marketName,q.kind].join(' ').toLowerCase().includes(term));
 const kindOptions=uniq(qs.map(q=>q.kind));if(['NBA','NFL'].includes(league)&&rosters.some(p=>belongsToGame(p,selectedGame()))&&!kindOptions.includes('Player Prop'))kindOptions.unshift('Player Prop');const chosenKind=kindWanted||kindOptions[0]||'Player Prop';if(!kindOptions.includes(chosenKind))kindOptions.push(chosenKind);
 return {qs,kindOptions,chosenKind};
}
function refreshSelectors(){
 const {qs,kindOptions,chosenKind}=filteredQuotes();
 kindWanted=chosenKind;selectValues('kind',kindWanted==='Player Prop'&&!kindOptions.includes('Player Prop')?['Player Prop',...kindOptions]:kindOptions,kindWanted);
 const filtered=qs.filter(q=>q.kind===kindWanted);
 if(kindWanted==='Player Prop'&&['NBA','NFL'].includes(league)){const options=rosterOptions(selectedGame(),rosters,gameQuotes(),$('marketSearch').value.trim());subject=selectOptions('player',options,options.find(p=>sameName(p.value,subject))?.value||subject||options.find(p=>p.quoted)?.value);}else subject=selectValues('player',uniq(filtered.map(q=>q.player)),subject);
 const byPerson=filtered.filter(q=>kindWanted==='Player Prop'?sameName(q.player,subject):q.player===subject);
 const stats=uniq(byPerson.map(q=>q.stat));if(!stats.length&&kindWanted==='Player Prop'&&subject)stats.push(...uniq([...(league==='NFL'?['passing_yards','rushing_yards','receiving_yards','receiving_receptions','receiving_longestReception']:['points','rebounds','assists','points+rebounds','points+assists','points+rebounds+assists','threePointersMade']),...evidence.filter(e=>e.league===league&&sameName(e.subject,subject)).map(e=>e.stat)]));
 const statOptions=stats.map(id=>({value:id,label:statLabel(id,league)}));
 stat=selectOptions('stat',statOptions,stat||[...playerRecordsFor({league,player:subject})].sort((a,b)=>(b.games?.length||0)-(a.games?.length||0))[0]?.stat);
 const periods=uniq(byPerson.filter(q=>q.stat===stat).map(q=>quotePeriod(q)));if(!periods.length&&kindWanted==='Player Prop'&&subject)periods.push('game');
 // Prefer full-game props unless user explicitly chose a different period.
 period=selectOptions('period',periods.map(id=>({value:id,label:periodLabel(id)})),period||'game');
 const candidates=byPerson.filter(q=>q.stat===stat&&quotePeriod(q)===period);
 side=selectOptions('side',uniq(candidates.map(q=>q.side)).map(id=>({value:id,label:id==='over'?'Over':id==='under'?'Under':id==='home'?'Home team':id==='away'?'Away team':id.toUpperCase()})),side);
 const books=uniq(candidates.filter(q=>q.side===side).map(q=>q.book));
 book=selectOptions('book',books.map(id=>({value:id,label:id==='draftkings'?'DraftKings':id==='fanduel'?'FanDuel':id==='betmgm'?'BetMGM':id})),books.includes(book)?book:books.includes('draftkings')?'draftkings':books[0]);
 const found=periods.includes('game');
 const segText=periods.length?periods.map(periodLabel).join(' · '):'No offered periods';
 const note=$('marketCoverageNote');
 if(note){
  note.textContent=kindWanted==='Player Prop'&&subject&&stat
   ? `${statLabel(stat,league)} · offered segments: ${segText}.${!found?' Full-game market not returned; quarter/half quotes are separate bets.':''}`
   : `Available market segments: ${segText}.`;
  note.classList.toggle('caution',kindWanted==='Player Prop'&&!found);
 }
 $('stat').title=statLabel(stat,league);
 $('period').title=periodLabel(period);
 $('kind').title=kindWanted;
 for(const b of document.querySelectorAll('[data-kind]'))b.classList.toggle('active',b.dataset.kind===kindWanted);
}
function selectOptions(id,items,preferred){
 const el=$(id);el.replaceChildren();if(!items.length){if(preserveSelection&&preferred){el.append(new Option(preferred+' · no longer quoted',preferred));el.value=preferred;return preferred;}el.append(new Option('Not available',''));return ''}
 for(const item of items)el.append(new Option(item.label,item.value));
 if(preserveSelection&&preferred&&!items.some(x=>x.value===preferred)){el.append(new Option(preferred+' · no longer quoted',preferred));el.value=preferred;return preferred;}const choose=items.some(x=>x.value===preferred)?preferred:items[0].value;el.value=choose;return choose;
}
function selectedQuotes(){return gameQuotes().filter(q=>q.kind===kindWanted&&(kindWanted==='Player Prop'?sameName(q.player,subject):q.player===subject)&&q.stat===stat&&quotePeriod(q)===period&&q.side===side&&q.book===book).sort((a,b)=>Number(a.line)-Number(b.line));}
function distinctLines(qs){return latestQuotes(qs).sort((a,b)=>Number(a.line)-Number(b.line));}
function standard(qs){return qs.find(q=>!q.alt)||qs[Math.floor(qs.length/2)]||null;}
function renderMarket(){activeQuotes=distinctLines(selectedQuotes());const main=standard(activeQuotes);
 if(selectedLine===null||(!preserveSelection&&!activeQuotes.some(q=>String(q.line)===String(selectedLine))))selectedLine=main?.line??null;
 const i=activeQuotes.findIndex(q=>String(q.line)===String(selectedLine));$('slider').max=String(Math.max(0,activeQuotes.length-1));$('slider').value=String(Math.max(0,i));$('slider').disabled=activeQuotes.length<2;
 $('prevAlt').disabled=i<=0;$('nextAlt').disabled=i<0||i>=activeQuotes.length-1;
 $('minline').textContent=kindWanted==='Moneyline'?'Win the game':activeQuotes.length?activeQuotes[0].line:'—';$('maxline').textContent=activeQuotes.length?activeQuotes[activeQuotes.length-1].line:'—';$('altCount').textContent=kindWanted==='Moneyline'?'Exact offered moneyline price':activeQuotes.length?`${activeQuotes.length} distinct quoted thresholds`:'No market thresholds available';
 $('lineTiles').innerHTML=activeQuotes.length>1?activeQuotes.map((q,idx)=>`<button data-index="${idx}" class="${i===idx?'active':''}">${esc(q.kind==='Spread'&&Number(q.line)>0?'+':'')}${esc(q.line)}<span>${esc(odds(q.odds))}</span></button>`).join(''):'';
 $('lineTiles').querySelectorAll('button').forEach(b=>b.onclick=()=>selectIndex(Number(b.dataset.index)));
 showQuote();
}
function selectIndex(index){const q=activeQuotes[index];if(!q)return;selectedLine=q.line;$('slider').value=String(index);renderMarket();}
function showQuote(){const q=activeQuotes.find(x=>String(x.line)===String(selectedLine));const g=selectedGame(),baseline=standard(activeQuotes);
 if(!q&&kindWanted==='Player Prop'&&subject){showResearchOnly();return;}
 $('bookName').textContent=book||'—';$('price').textContent=q?odds(q.odds):'—';$('selectedLine').textContent=q?marketLabel(q):'—';$('currentLine').textContent=q?`${q.player==='GAME'?g?.game:q.player} · ${marketDescription(q)}`:`No ${kindWanted.toLowerCase()} quote returned for this game`;
 $('marketLabel').textContent=q?`${q.alt?'ALTERNATE':'STANDARD'} · ${String(q.kind).toUpperCase()} · ${periodLabel(quotePeriod(q)).toUpperCase()} · ${String(q.book).toUpperCase()}`:'Awaiting SportsGameOdds quotes';
 const an=q?analyzeSelection(q,{game:g,records:recordsFor(q),research:notes,experts,context,baseline}):null;
 $('state').textContent=an?.state.label||'NO DATA';$('state').classList.toggle('open',!!an?.state.ok);
 $('implied').textContent=an?pct(an.breakEven):'—';$('novig').textContent=q&&hasCurrent(q)&&Number.isFinite(Number(q.noVigProb))&&q.noVigProb!==null?pct(q.noVigProb):'—';
 $('observed').textContent=an?.sample?`${an.sample.hits}/${an.sample.n}`:'—';$('sampleMeta').textContent=an?.sample?`${an.sample.n} verified regular-season games · current ${an.sample.current.n}; prior ${an.sample.previous.n}`:'No audited regular-season logs';
 $('guidance').textContent=an?`${an.decision.label} ${q.side} ${q.kind==='Moneyline'?'moneyline':q.line} at ${odds(q.odds)}. ${an.decision.blockers?.length?an.decision.blockers.length+' unmet or unverified Lean requirements; see Evidence Readback.':an.decision.reason}`:'No actual sportsbook price is available for this selection. Published quotes update automatically; a missing market is not replaced with a different bet.';$('guidance').classList.toggle('ok',!!an?.state.ok);
 $('evidenceGrade').textContent=an?`${an.evidenceScore}/10`:'—/10';$('readbackSelection').textContent=q?`${q.player==='GAME'?g.game:q.player} · ${marketDescription(q)} · ${marketLabel(q)}`:'No market selected';$('readbackDate').textContent=q?dt(q.asOf):'—';
 list('reasons',an?.why||['No live quote yet. Use the verified provider quote and a dated stat sample before analyzing a threshold.']);
 list('risks',an?.risks||['The sportsbook, player status, matchup and model inputs have not been verified.']);
 list('observations',an?.observations?.length?an.observations:['No independent probability forecast is available for this selection. Evidence is descriptive unless separately validated.']);
 $('lastFive').textContent=an?.sample?`${an.sample.last5.hits}/${an.sample.last5.n}`:'—';$('lastTen').textContent=an?.sample?`${an.sample.last10.hits}/${an.sample.last10.n}`:'—';
 $('histMean').textContent=an?.sample?an.sample.mean.toFixed(1):'—';$('histSd').textContent=an?.sample?.sd!=null?an.sample.sd.toFixed(1):'—';$('histRange').textContent=an?.sample?`${an.sample.selection?.unit?an.sample.selection.unit+' · ':''}Range ${an.sample.min}–${an.sample.max}`:'Sourced game logs needed';
 $('trend').innerHTML=an?.sample?an.sample.rows.slice(0,10).map(r=>{const h=(r.settlement===0?null:r.settlement===1?true:r.settlement===-1?false:r.value===Number(q.line)?null:q.side==='over'?r.value>q.line:r.value<q.line);return `<div class="${h===null?'push':h?'hit':'miss'}" title="${esc(r.date||'date unknown')} · ${esc(r.opponent||'opponent unknown')} · ${esc(r.seasonYear)} regular season">${esc(r.value)}<small>${esc((r.date||'last').slice(5)||'—')} · ${esc(r.seasonYear)}</small></div>`}).join(''):'<div class="micro">No game outcomes with verified regular-season tags. Refresh statistical history.</div>';
 const coverage=q?.kind==='Player Prop'?evidenceCoverage(q,evidence,evidenceLoadError):null;
 $('coverageStatus').textContent=coverage?`Stats loaded: ${coverage.totalSeries} series · selected player: ${coverage.playerSeries} · exact market: ${coverage.exactSeries} · dated games: ${coverage.gameCount}. ${coverage.message.replace(/Run Update-Stats\.ps1.*$/,'Scheduled server collection retries missing verified games. Check the next published update.')}`:'Choose a player and statistic to check imported game-log coverage.';
 if(q?.kind==='Player Prop'&&['NBA','NFL'].includes(q?.league)){const ps=playerHistory.players?.[q.league+'|'+q.player]||(q.league==='NBA'?playerHistory.players?.[q.player]:null);$('coverageStatus').textContent+=ps?` Player feed: ${ps.status}; current ${ps.currentGames??'unknown'}, prior ${ps.priorGames??'unknown'} appearances; checked ${ps.checkedAt}.`:' History is scoped to this matchup and updates with new published snapshots.';}
 if(q&&q.kind!=='Player Prop')$('coverageStatus').textContent=an?.sample?`Team history: ${an.sample.n} sourced outcomes, ${an.sample.current.n} current and ${an.sample.previous.n} prior. Metric: ${an.sample.selection.unit}.`:'No verified team sample is available for this market. Scheduled server collection retains older evidence and retries missing games.';
 if(statSync?.status==='error')$('coverageStatus').textContent+=` Importer status: ${statSync.message||'failed'}.`;
 const ladder=q?lineLadder(q,activeQuotes,recordsFor(q),q.kind==='Player Prop'?null:{game:g,games:context.teamGames}):[];
 $('lineLadder').innerHTML=ladder.length?`<table><thead><tr><th>LINE</th><th>PRICE</th><th>BREAK EVEN</th><th>RECENT HITS</th></tr></thead><tbody>${ladder.map(x=>`<tr class="${String(x.line)===String(q.line)?'selected':''}"><td>${esc(q.side.toUpperCase())} ${esc(x.line)}</td><td>${esc(odds(x.odds))}</td><td>${esc(pct(x.breakEven))}</td><td>${x.hits===null?'—':`${x.hits}/${x.n}`}</td></tr>`).join('')}</tbody></table>`:'<div class="micro">No priced alternate-line ladder for this selection.</div>';
 $('verdict').textContent=an?.verdict||'MY DECISION: PASS. No current verified selection exists.';
 $('decisionBadge').textContent=an?.decision?.label||'PASS';
 $('decisionBadge').className=(an?.decision?.take===true?'take':'pass');
 $('decisionEvidence').textContent=an?.decision?.blockers?.length?`${an.decision.blockers.length} Lean requirements unmet or unverified. See checks below.`:an?.decision?.reason||'No current verified selection';
 $('decisionChecks').innerHTML=renderDecisionChecks(an?.decision);
 $('validationProgress').innerHTML=renderValidationProgress(modelReport,evaluationLoadError);
 schedulePlayerHistory(q);renderDesk(q,an);$('prevAlt').disabled=!q||activeQuotes.indexOf(q)===0;$('nextAlt').disabled=!q||activeQuotes.indexOf(q)===activeQuotes.length-1;
}
function list(id,items){$(id).replaceChildren();for(const val of items){const li=document.createElement('li');li.textContent=val;$(id).append(li);}}
function sourceCard(n){const url=safeHref(n.url);return `<article class="sourceItem"><div class="sourceMeta">${esc(n.date||'Date not supplied')} · ${esc(n.channel||'Sourced research')}</div><h4>${esc(n.subject||'Game')} · ${esc(n.market||'context')}</h4><p>${esc(n.summary||'')}</p>${n.factor?`<div class="fact"><b>Context / risk:</b> ${esc(n.factor)}</div>`:''}<p class="sourceMeta">${esc(n.verification||'User-supplied or article summary; original not independently audited')}</p>${url?`<a target="_blank" rel="noopener noreferrer" href="${url}">Original source ↗</a>`:''}</article>`;}
function researchOverview(q,an){if(q?.researchOnly){const sample=an?.sample;return `<article class="sourceItem"><h4>${esc(q.player)} · roster research</h4><p>No matching sportsbook line or price has been returned.</p><p>${sample?`${sample.n} sourced appearances; ${sample.current.n} current and ${sample.previous.n} prior. Mean ${sample.mean.toFixed(1)}.`:'History is being collected or remains unavailable.'}</p>${(an.context?.sources||[]).map(c=>{const u=safeHref(c.url);return u?`<p><a href="${u}" target="_blank" rel="noopener noreferrer">${esc(c.label)} ↗</a></p>`:''}).join('')}${sample?sample.rows.slice(0,10).map(g=>{const u=safeHref(g.source);return u?`<p>${esc(g.date)}: ${esc(g.value)} <a href="${u}" target="_blank" rel="noopener noreferrer">Box score ↗</a></p>`:''}).join(''):''}</article>`;}if(!q)return `<div class="empty">Choose a player or game above. Research and outside picks track your selection and do not silently substitute unrelated players.</div>`;
 let r=`<article class="sourceItem highlight"><div class="sourceMeta">LIVE SELECTION INTELLIGENCE · ${esc(q.book)}</div><h4>${esc(q.player)} · ${esc(marketDescription(q))} · ${esc(q.side)} ${esc(q.line)}</h4>`;
 r+=`<p>Current ${esc(odds(q.odds))} → break-even ${esc(pct(an?.breakEven))}. ${esc(an?.direction||'Standard threshold')}. ${esc(an?.state?.label||'Not verified')}.</p>`;
 if(an?.sample){r+=`<div class="fact"><b>Recorded performance:</b> Last 5 ${an.sample.last5.hits}/${an.sample.last5.n}; last 10 ${an.sample.last10.hits}/${an.sample.last10.n}; mean ${an.sample.mean.toFixed(1)}; ${an.sample.n} verified regular-season games (${an.sample.current.n} current, ${an.sample.previous.n} prior).</div>`;
 r+=`<p class="sourceDetails">Game logs (newest first): ${an.sample.rows.slice(0,10).map(x=>`${esc(x.date||'undated')}: ${esc(x.value)} [${esc(x.seasonYear)}]${x.opponent?' vs '+esc(x.opponent):''}`).join(' · ')}</p>`;
 const sourceUrl=safeHref(an.sample.evidence.url);if(sourceUrl)r+=`<a href="${sourceUrl}" rel="noopener noreferrer" target="_blank">Game-stat source ↗</a>`;
 }
 else r+=`<p class="auditTag">No eligible sourced game-log sample is linked. Exact hit rate, usage and minutes are not verified. Add a sourced note or update game logs.</p>`;
 const quoteSource=safeHref(q.deeplink);if(quoteSource)r+=`<p><a href="${quoteSource}" target="_blank" rel="noopener noreferrer">Exact bookmaker quote ↗</a> · snapshot ${esc(q.asOf)}</p>`;
 if(an?.sample?.profile){const p=an.sample.profile,u=safeHref(p.url);r+=`<p>Roster identity: ${esc(p.teamName||p.team)} · checked ${esc(p.asOf)}${u?` · <a href="${u}" target="_blank" rel="noopener noreferrer">Roster source ↗</a>`:''}. No prior log does not by itself prove rookie status.</p>`;}
 if(an?.model?.status==='experimental'){
 const m=an.model;r+=`<div class="fact"><b>Experimental distribution model</b><br>Win ${pct(m.pWin)} · Push ${pct(m.pPush)} · Loss ${pct(m.pLoss)}. ${m.n} training outcomes.<br>Historical sampling interval ${pct(m.interval[0])}–${pct(m.interval[1])}; this does not cover all forecast uncertainty.<br>Chronological replay: ${m.backtest.n} tests, Brier ${m.backtest.brier?.toFixed(4)??'unavailable'}, log loss ${m.backtest.logLoss?.toFixed(4)??'unavailable'}. Current threshold replay, not historical-price ROI.</div>`;
 r+=`<table><thead><tr><th>Predicted win bin</th><th>Tests</th><th>Mean prediction</th><th>Observed wins</th></tr></thead><tbody>${m.backtest.bins.map(b=>`<tr><td>${pct(b.from)}–${pct(b.to)}</td><td>${b.n}</td><td>${b.n?pct(b.predicted):'—'}</td><td>${b.n?pct(b.observed):'—'}</td></tr>`).join('')}</tbody></table>`;
 }
 const policy=modelReport.policyComparison?.markets?.find(m=>sameName(m.player,q.player)&&sameStat(m.stat,q.stat)&&Number(m.line)===Number(q.line)&&m.book===q.book);
 if(policy){r+=`<details><summary>Prior-weight comparison (experimental)</summary><table><thead><tr><th>Prior strength</th><th>Current tests</th><th>Current Brier</th><th>Holdout tests / Brier</th></tr></thead><tbody>${policy.candidates.map(c=>`<tr><td>${c.priorStrength}</td><td>${c.currentTests}</td><td>${c.currentBrier?.toFixed(4)??'—'}</td><td>${c.holdoutTests} / ${c.holdoutBrier?.toFixed(4)??'—'}</td></tr>`).join('')}</tbody></table><p>${esc(policy.reason)} Configured prior strength remains ${policy.activePriorStrength}; eligibility/role guards may use zero.</p></details>`;}
 if(modelReport?.n)r+=`<p>Archived-price replay (${esc(modelReport.generatedAt)}): ${esc(modelReport.n)} evaluations across ${esc(modelReport.independentEvents)} events; hypothetical policy bets ${esc(modelReport.selected)}. Model remains experimental. See data/model-report.json for full results and limitations.</p>`;
 else r+=`<p>No settled archived-price evaluations are available in the loaded report. See Frozen pregame evaluation below the final decision for pending counts or report-loading errors. No verified betting edge is claimed.</p>`;
 if(an?.context?.sources?.length)r+=an.context.sources.map(s=>{const u=safeHref(s.url);return u?`<p><a href="${u}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a></p>`:''}).join('');
 if(an?.sample)r+=`<details><summary>Statistical evidence citations (${an.sample.rows.length} games)</summary>${an.sample.rows.map(g=>{const u=safeHref(g.source||an.sample.evidence.url);return `<p>${esc(g.date)} · ${esc(g.value)} ${u?`<a href="${u}" target="_blank" rel="noopener noreferrer">Box score ↗</a>`:'Source unavailable'}</p>`}).join('')}</details>`;
 if(q&&q.kind!=='Player Prop')$('coverageStatus').textContent=an?.sample?`Team history: ${an.sample.n} sourced outcomes, ${an.sample.current.n} current and ${an.sample.previous.n} prior. Metric: ${an.sample.selection.unit}.`:'No verified team sample is available for this market. Scheduled server collection retains older evidence and retries missing games.';
 if(statSync?.status==='error')r+=`<p class="auditTag">Stats enrichment warning: ${esc(statSync.message||'Unknown error')}</p>`;
 r+=`<p class="sourceMeta">Changing the slider updates this exact price, threshold, hit count, and outside-pick alignment. Historical outcomes are descriptive, not calibrated predictions.</p></article>`;
 return r;
}
function pickCard(e,q){const isSame=q&&sameName(e.subject,q.player)&&sameStat(e.market,q.stat)&&String(e.periodID||'unknown')===quotePeriod(q), sameSide=isSame&&e.side?.toLowerCase()===q.side?.toLowerCase();
 const exact=sameSide&&Number(e.line)===Number(q.line),alignment=exact?'EXACT LINE · SAME SIDE':sameSide?'SAME DIRECTION · OTHER LINE':isSame?'OTHER SIDE':'OTHER PLAYER / MARKET';
 const reported=e.reported_odds||'not reported',href=safeHref(e.source_url),audited=String(e.track_record_audited||'No').toLowerCase()==='yes';
 return `<article class="sourceItem ${exact?'highlight':''}"><div class="sourceMeta">${esc(e.channel||'Publication')} · ${esc((e.published_utc||e.saved_utc||'Date unspecified').slice(0,16))}</div><h4>${esc(e.source||'Unattributed')} — ${esc(e.subject)} ${esc(e.market)}</h4><div class="sourceDetails">${esc((e.side||'').toUpperCase())} ${esc(e.line)} · ${esc(reported)} <span>(${esc(e.game||'')} · ${esc(periodLabel(e.periodID||'unknown'))})</span></div><p class="auditTag ${exact?'match':''}">${esc(alignment)}</p><div class="pickReason">${esc(e.reasoning||e.notes||'No quantitative justification supplied. This is a quoted opinion, not a verified model.')}</div><p class="sourceMeta">${audited?'Track record marked audited by submitter; review proof':'No independently audited win rate / ROI'} · ${esc(e.verification||'Original claim not independently audited')}</p>${href?`<a target="_blank" rel="noopener noreferrer" href="${href}">Original post / article ↗</a>`:''}<div class="sourceActions"><button data-jump-event="${esc(e.eventID||'')}" data-jump-league="${esc(e.league)}" data-jump-book="${esc(e.book||e.sportsbook||'')}" data-jump-pick="${esc(e.subject)}" data-jump-game="${esc(e.game)}" data-jump-stat="${esc(e.market)}" data-jump-side="${esc(e.side)}" data-jump-period="${esc(e.periodID||'')}" data-jump-line="${esc(e.line)}">Find this market in board</button><div class="findFeedback" role="status" aria-live="polite"></div></div></article>`;}
function renderDesk(q,an){
 const scope=$('deskScope').value,term=$('deskSearch').value.trim().toLowerCase(),inGame=n=>n.game===game||n.subject===game||q&&sameName(n.subject,q.player);
 const noteScope=n=>n.league===league&&(scope==='league'||scope==='game'&&inGame(n)||scope==='selection'&&(n.subject===game||q&&sameName(n.subject,q.player)));
 const pickScope=e=>e.league===league&&(scope==='league'||scope==='game'&&e.game===game||scope==='selection'&&(e.game===game&&(!q||sameName(e.subject,q.player)||q.player==='GAME')));
 const matchTerm=n=>!term||Object.values(n).join(' ').toLowerCase().includes(term);
 const relevant=notes.filter(n=>noteScope(n)&&matchTerm(n));
 $('research').innerHTML=researchOverview(q,an)+ (relevant.length?relevant.map(sourceCard).join(''):`<div class="empty">No matching sourced research note for this ${esc(scope)}. Linked notes appear here when available. Change the scope to inspect other players; unrelated notes are not substituted as evidence.</div>`);
 const outside=experts.filter(e=>pickScope(e)&&matchTerm(e)).sort((a,b)=>String(b.published_utc||b.saved_utc||'').localeCompare(String(a.published_utc||a.saved_utc||'')));
 const exact=outside.filter(e=>q&&sameName(e.subject,q.player)&&sameStat(e.market,q.stat)&&e.side?.toLowerCase()===q.side?.toLowerCase()&&String(e.periodID||'unknown')===quotePeriod(q)&&Number(e.line)===Number(q.line)).length;
 $('experts').innerHTML=`<div class="noticeInline">${outside.length} sourced opinions in view · ${exact} match this exact line. Posts are attributed opinions; no automatic confidence boost. Private Discord, Instagram, and X posts require a link or user-submitted record.</div>`+(outside.length?outside.map(e=>pickCard(e,q)).join(''):'<div class="empty">No outside picks meet the current scope/search. Select the entire league to inspect other published source notes.</div>');
 $('experts').querySelectorAll('[data-jump-pick]').forEach(btn=>btn.onclick=async()=>{
  const pick={eventID:btn.dataset.jumpEvent,league:btn.dataset.jumpLeague,game:btn.dataset.jumpGame,subject:btn.dataset.jumpPick,market:btn.dataset.jumpStat,side:btn.dataset.jumpSide,periodID:btn.dataset.jumpPeriod,line:btn.dataset.jumpLine,book:btn.dataset.jumpBook};const g=data.games.find(g=>g.league===pick.league&&(pick.eventID?g.eventID===pick.eventID:g.game===pick.game));if(g&&(g.league!==league||g.game!==game)){league=g.league;game=g.game;subject='';stat='';period='';side='';selectedLine=null;if(!await load(true))return;}
  const result=findBoardMarket(pick,{quotes:dataset(),games:data.games,preferredBook:book||'draftkings'});
  const target=btn.isConnected?btn.parentElement.querySelector('.findFeedback'):$('marketJumpStatus');target.classList.remove('hidden');target.replaceChildren();const message=document.createElement('p');message.textContent=result.message;target.append(message);
  if(result.status==='matched'){openBoardQuote(result.quote,quoteIdentity(result.quote),result.message);return;}
  for(const candidate of result.alternatives){const choice=document.createElement('button');choice.type='button';choice.className='findChoice';choice.textContent=`Inspect ${candidate.game} · ${candidate.kind} · ${periodLabel(quotePeriod(candidate))} · ${candidate.side} ${candidate.line} · ${odds(candidate.odds)} · ${candidate.book}${hasCurrent(candidate)?'':' · stale/closed'}`;choice.onclick=()=>openBoardQuote(candidate,quoteIdentity(candidate),'Opened the explicitly selected alternative. It is not assumed to be the same bet as the source post.');target.append(choice);}
 });

 const peers=q?dataset().filter(x=>x.league===q.league&&x.eventID===q.eventID&&x.kind===q.kind&&x.player===q.player&&x.stat===q.stat&&quotePeriod(x)===quotePeriod(q)&&x.side===q.side&&Number(x.line)===Number(q.line)).sort((a,b)=>Number(b.odds)-Number(a.odds)):[];
 $('comparison').innerHTML=peers.length?`<p class="micro">Exact event, player, side and threshold. Other sportsbook quotes are for price comparison, not calibrated predictions.</p>`+peers.map(x=>`<div class="bookRow"><span>${esc(x.book)} ${hasCurrent(x)?'· current':'· stale/closed'}</span><strong>${esc(odds(x.odds))}</strong></div>`).join(''):'<div class="empty">No matched threshold across the included books.</div>';
 for(const name of ['research','experts','comparison'])$(name).classList.toggle('hidden',focusPanel!==name);
 $('inputPanel').classList.toggle('hidden',focusPanel!=='experts');$('notePanel').classList.toggle('hidden',focusPanel!=='research');
 for(const [id,panel] of [['researchTab','research'],['expertTab','experts'],['booksTab','comparison']])$(id).classList.toggle('active',panel===focusPanel);
}
function refreshMessage(message,isError=false,busy=false){
 const el=$('refreshFeedback');el.textContent=message;el.classList.toggle('error',isError);el.classList.toggle('busy',busy);
 $('reload').disabled=busy||!ownerAllowed;$('reload').querySelector('span').textContent=busy?'Updating…':'Refresh live data';
}
async function pollRefresh(){
 let done=false;
 for(let i=0;i<270;i++){
  await new Promise(resolve=>setTimeout(resolve,10000));
  try{const state=await fetchJson('/api/refresh-status');
   if(state.running){refreshMessage(`Refresh in progress since ${dt(state.startedAt)}. Updating sportsbook odds and historical player statistics…`,false,true);continue;}
   done=true;const loaded=await load();
   if(loaded===false){refreshMessage('Refresh finished, but one or more saved files could not be loaded. See the warning on the page.',true,false);break;}
   if(state.ok)refreshMessage(`Refresh completed ${dt(state.finishedAt)}. ${state.summary||'Latest published files loaded.'}`,false,false);
   else refreshMessage(`Refresh stopped: ${state.message||'Unknown error'}. Existing data was preserved.`,true,false);
   break;
  }catch(err){refreshMessage(`Cannot read refresh status: ${err.message}`,true,false);done=true;break;}
 }
 if(!done)refreshMessage('Refresh is still pending. Check Owner controls on the Account page. Your published data is retained.',true,false);
 refreshRunning=false;
}
$('reloadSaved').addEventListener('click',async()=>{refreshMessage('Reading saved market and game-log files…');const loaded=await load(true);if(!loaded){refreshMessage('Saved snapshot reload failed. Read the page warning for the exact file problem.',true,false);return;}refreshMessage(`Saved snapshot reloaded at ${new Date().toLocaleTimeString()}. ${evidence.length} stat series loaded. ${evidenceLoadError?'Game-log warning: '+evidenceLoadError:'No provider request was made.'}`);});
$('reload').addEventListener('click',async()=>{
 if(refreshRunning)return;
 refreshRunning=true;refreshMessage('Queuing a server refresh. You can keep browsing…',false,true);
 try{
  await verifyRefreshServer();
  const r=await fetch('/api/refresh',{method:'POST',headers:{'X-EdgeBoard-Action':'refresh'}});
  await responseJson(r,'/api/refresh');
  await pollRefresh();
 }catch(err){refreshRunning=false;refreshMessage(`Refresh could not start: ${err.message}. Check your server and try again.`,true,false)}
});
$('gameSearch').addEventListener('input',renderGames);
let marketSearchTimer;
$('marketSearch').addEventListener('input',()=>{clearTimeout(marketSearchTimer);marketSearchTimer=setTimeout(()=>{subject='';stat='';period='';side='';selectedLine=null;refreshSelectors();renderMarket();},150);});
for(const id of ['nba','nfl'])$(id).addEventListener('click',()=>switchLeague(id.toUpperCase()));
for(const b of document.querySelectorAll('[data-kind]'))b.addEventListener('click',()=>{picksView.close();kindWanted=b.dataset.kind;subject='';stat='';period='';side='';selectedLine=null;$('marketSearch').value='';refreshSelectors();renderMarket();});
for(const id of ['player','kind','stat','period','side','book'])$(id).addEventListener('change',()=>{
 if(id==='kind'){kindWanted=$('kind').value;subject='';stat='';period='';side='';}
 if(id==='player'){subject=$('player').value;stat='';period='';side='';}
 if(id==='stat'){stat=$('stat').value;period='';side='';}
 if(id==='period'){period=$('period').value;side='';}
 if(id==='side')side=$('side').value;if(id==='book')book=$('book').value;
 selectedLine=null;refreshSelectors();renderMarket();
});
$('slider').addEventListener('input',e=>selectIndex(Number(e.target.value)));
$('prevAlt').addEventListener('click',()=>selectIndex(Number($('slider').value)-1));$('nextAlt').addEventListener('click',()=>selectIndex(Number($('slider').value)+1));
for(const [id,panel] of [['researchTab','research'],['expertTab','experts'],['booksTab','comparison']])$(id).addEventListener('click',()=>{focusPanel=panel;if(picksView.active&&panel==='research'){renderPicksDesk();return;}const q=activeQuotes.find(q=>String(q.line)===String(selectedLine));if(!q&&kindWanted==='Player Prop'&&subject){showResearchOnly();return;}renderDesk(q,q?analyzeSelection(q,{game:selectedGame(),records:recordsFor(q),research:notes,experts,context,baseline:standard(activeQuotes)}):null);});
for(const id of ['deskScope','deskSearch'])$(id).addEventListener(id==='deskScope'?'change':'input',()=>{const q=activeQuotes.find(x=>String(x.line)===String(selectedLine));if(!q&&kindWanted==='Player Prop'&&subject){showResearchOnly();return;}renderDesk(q,q?analyzeSelection(q,{game:selectedGame(),records:recordsFor(q),research:notes,experts,context,baseline:standard(activeQuotes)}):null);});
$('togglePickForm').onclick=()=>{const f=$('outsideForm');const was=f.classList.contains('hidden');f.classList.toggle('hidden');if(was){f.elements.subject.value=subject&&subject!=='GAME'?subject:'GAME';f.elements.market.value=stat||'';if(f.elements.periodID)f.elements.periodID.value=period||'unknown';f.elements.side.value=side||'over';f.elements.line.value=selectedLine??'';}};
$('toggleNoteForm').onclick=()=>{const f=$('noteForm');const was=f.classList.contains('hidden');f.classList.toggle('hidden');if(was){f.elements.subject.value=subject||game;f.elements.market.value=stat||'';}};
async function saveEntry(endpoint,obj,statusId){const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(obj)});const result=await r.json();if(!r.ok)throw Error(result.error||`HTTP ${r.status}`);$(statusId).textContent='Saved. Updating source list…';await load();}
$('outsideForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.target,o=Object.fromEntries(new FormData(form));o.league=league;o.game=game;o.periodID=o.periodID||period||'unknown';o.published_utc=o.published_utc?o.published_utc+'T12:00:00Z':new Date().toISOString();try{await saveEntry('/api/outside-picks',o,'pickSaveState');form.reset();$('outsideForm').classList.add('hidden');}catch(err){$('pickSaveState').textContent=err.message;}});
$('noteForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.target,o=Object.fromEntries(new FormData(form));o.league=league;o.game=game;o.periodID=period||'unknown';o.date=new Date().toISOString().slice(0,10);o.channel='User-referenced research';try{await saveEntry('/api/research-notes',o,'noteSaveState');form.reset();$('noteForm').classList.add('hidden');}catch(err){$('noteSaveState').textContent=err.message;}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!workspaceBusy)void load();});
void load();setInterval(()=>{if(!document.hidden&&!refreshRunning&&!workspaceBusy)void load();},60000);

function schedulePlayerHistory(q){/* Player histories are loaded by matchup from the published server snapshot. */}

function showResearchOnly(){
 const selection={league,player:subject,stat,periodID:period||'game',kind:'Player Prop',side:'over',researchOnly:true,asOf:new Date().toISOString()};
 const sample=sampleSummary(selection,recordsFor(selection)),factors=contextReadback(selection,context,new Date(),selectedGame()),observed=observedContext(selection,sample,recordsFor(selection),context,selectedGame()),title=`${subject} · ${statLabel(stat,league)} · roster research`;
 for(const id of ['price','selectedLine','implied','novig','lastFive','lastTen'])$(id).textContent='—';
 $('bookName').textContent=`No ${kindWanted.toLowerCase()} quote returned for this game`;$('currentLine').textContent=title;$('marketLabel').textContent='RESEARCH ONLY · NO SPORTSBOOK PRICE';$('state').textContent='NO QUOTE';$('state').classList.remove('open');
 $('observed').textContent=sample?`${sample.n} games`:'—';$('sampleMeta').textContent=sample?`${sample.current.n} current; ${sample.previous.n} prior appearances`:'History loading or unavailable';
 const message=selectedLine!==null?`PASS — the selected ${side} ${selectedLine} at ${book} is no longer quoted. Choose an available line explicitly; no replacement was selected.`:'MY DECISION: PASS — no actual sportsbook quote was returned for this player/statistic. Roster membership and game history do not establish a bettable market.';
 $('guidance').textContent=message;$('guidance').classList.remove('ok');$('verdict').textContent=message;$('decisionBadge').textContent='PASS';$('decisionBadge').className='pass';$('decisionEvidence').textContent='Exact line and price unavailable';$('decisionChecks').innerHTML='<p>No quoted market: price and Lean checks cannot be evaluated.</p>';$('validationProgress').innerHTML=renderValidationProgress(modelReport,evaluationLoadError);
 $('readbackSelection').textContent=title;$('readbackDate').textContent=dt(selection.asOf);$('evidenceGrade').textContent='—/10';
 $('histMean').textContent=sample?sample.mean.toFixed(1):'—';$('histSd').textContent=sample?.sd!=null?sample.sd.toFixed(1):'—';$('histRange').textContent=sample?`Range ${sample.min}–${sample.max}`:'No sourced outcomes yet';
 $('trend').innerHTML=sample?sample.rows.slice(0,10).map(r=>`<div>${esc(r.value)}<small>${esc(r.date)}</small></div>`).join(''):'<div class="micro">Collecting or awaiting sourced regular-season outcomes.</div>';
 list('reasons',[...(sample?[`Observed ${sample.n} appearances: ${sample.current.n} this season, ${sample.previous.n} prior. Mean ${sample.mean.toFixed(1)}. No hit rate is calculated without an exact threshold.`]:['Current roster identity is selectable even when the odds provider returns no props.']),...factors.why,...observed.why]);
 list('risks',['The published provider snapshot contains no matching exact quote. This may reflect bookmaker availability, coverage limits or provider data; the dashboard cannot determine which from absence alone.',...factors.risks,...observed.risks]);
 list('observations',['No line, price, probability edge or betting recommendation has been manufactured.']);
 $('coverageStatus').textContent=evidenceCoverage(selection,evidence,evidenceLoadError).message;$('marketCoverageNote').textContent='Roster research: no quoted market. A real provider quote is required before a priced prediction.';
 $('lineLadder').innerHTML='<div class="micro">No quoted alternate lines for this player/statistic.</div>';
 schedulePlayerHistory(selection);renderDesk(selection,{sample,context:{sources:[...factors.sources,...observed.sources]},researchOnly:true,sourceNotes:[],relatedExperts:[]});
}

function openBoardQuote(source,expectedId,message='Opened ranked candidate at its exact saved line, book and price. Refresh before relying on the quote.'){
 const q=dataset().find(x=>quoteIdentity(x)===(expectedId||quoteIdentity(source))),g=q&&data.games.find(g=>g.league===q.league&&(g.eventID&&q.eventID?g.eventID===q.eventID:g.game===q.game));
 if(!q||!g){const text='The saved board changed or this fixture is no longer loaded. Rescan or refresh; no different line was substituted.';$('picksStatus').textContent=text;$('marketJumpStatus').textContent=text;$('marketJumpStatus').classList.remove('hidden');return false;}
 picksView.close();league=q.league;game=g.game;kindWanted=q.kind;subject=q.player;stat=q.stat;period=quotePeriod(q);side=q.side;book=q.book;selectedLine=q.line;focusPanel='research';$('deskScope').value='selection';$('marketSearch').value='';$('gameSearch').value='';render();
 $('marketJumpStatus').textContent=message;$('marketJumpStatus').classList.remove('hidden');requestAnimationFrame(()=>$('selectionReadback').scrollIntoView({behavior:'smooth',block:'start'}));return true;
}
function onPicksViewChange(active){if(active){if(!picksPreviouslyActive){focusPanel='research';$('deskScope').value='game';}if(focusPanel==='research')renderPicksDesk();}picksPreviouslyActive=active;}
function renderPicksDesk(){
 const g=selectedGame();$('research').innerHTML=`<article class="sourceItem"><div class="sourceMeta">GAME SHORTLIST</div><h4>${esc(g?.game||'Select a game')}</h4><p>The scanner evaluates the saved game board, independent of the player currently selected in the market explorer.</p><p>Each candidate carries numerical support, risks and source links. Use Open full Evidence Readback to inspect its exact line and price and populate this desk.</p><p>Leans are experimental. Watchlist cards remain Pass. Current injuries, roster history and unmodeled lineup effects still require review.</p></article>`;
 for(const id of ['research','experts','comparison'])$(id).classList.toggle('hidden',id!=='research');$('notePanel').classList.add('hidden');$('inputPanel').classList.add('hidden');for(const id of ['researchTab','expertTab','booksTab'])$(id).classList.toggle('active',id==='researchTab');
}

void fetchJson('/api/session').then(access=>{ownerAllowed=access.owner===true;$('reload').disabled=!ownerAllowed;}).catch(()=>{});
