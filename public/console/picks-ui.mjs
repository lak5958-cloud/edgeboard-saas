import {decisionReadback,renderDecisionChecks} from './decision-ui.mjs';
import {statLabel,quotePeriod} from './markets.mjs';import {quoteIdentity} from './picks.mjs';import {nameKey} from './insights.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=x=>Number.isFinite(x)?(100*x).toFixed(1)+'%':'—';const odds=x=>`${x>0?'+':''}${x}`;
const href=x=>{try{const u=new URL(x);return ['https:','http:'].includes(u.protocol)?esc(u.href):null;}catch{return null;}};
const time=x=>new Date(x).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
export function renderPickCard(item,index){
 const q=item.quote,a=item.analysis,m=a.model,s=a.sample,settled=m.pWin+m.pLoss,conditional=settled>0?m.pWin/settled:null,lean=a.decision.label==='LEAN';
 const risks=[];if((m.season?.currentN??s.current.n)<5)risks.push(`Only ${m.season?.currentN??s.current.n} current-team appearances; this is an early-season research candidate.`);
 if(!a.context?.availability)risks.push('No matched current injury listing; availability is not confirmed.');
 if(m.season?.roleChange)risks.push('An observed minutes change limits use of last season.');
 if(m.season?.otherTeam)risks.push(`${m.season.otherTeam} old-team prior outcomes were excluded from the model.`);
 risks.push('Probabilities and expected return are experimental; opponent/lineup effects are not fully fitted.');
 const sources=[...(s.rows||[]).slice(0,2).map(g=>({label:`Box score ${g.date}`,url:g.source})),...(a.context?.sources||[]).slice(0,2)];
 const sourceHTML=[...new Map(sources.map(x=>[x.url,x])).values()].map(x=>{const u=href(x.url);return u?`<a href="${u}" target="_blank" rel="noopener noreferrer">${esc(x.label)} ↗</a>`:''}).join(' · ');
 return `<article class="pickCard ${lean?'pickLean':'pickWatch'}"><div class="pickTop"><span class="eyebrow">${lean?'EXPERIMENTAL LEAN':'WATCHLIST · PASS'}</span><span class="mini">${esc(q.book)} · ${esc(time(q.asOf))}</span></div><h3>${esc(q.player)} · ${esc(q.side.toUpperCase())} ${esc(q.line)} ${esc(statLabel(q.stat,q.league))}</h3><p class="pickPrice">${esc(odds(q.odds))}<span>${q.alt?'Alternate':'Standard'} · full game</span></p><p><b>Why this decision?</b> ${esc(decisionReadback(a.decision,a.breakEven,m.interval?.[0]))}</p><div class="pickNumbers"><div><span>MODEL WIN / PUSH</span><strong>${pct(m.pWin)} / ${pct(m.pPush)}</strong></div><div><span>NON-PUSH MODEL / REQUIRED</span><strong>${pct(conditional)} / ${pct(a.breakEven)}</strong></div><div><span>MODEL NET / 1 UNIT</span><strong>${m.expectedValue>=0?'+':''}${m.expectedValue.toFixed(3)}</strong></div></div><section class="pickVisualComparison" aria-label="Model versus required odds threshold"><div class="pickVisualLabel"><span>Model estimated non-push win chance</span><strong>${pct(conditional)}</strong></div><div class="pickMeter" role="img" aria-label="Experimental win estimate ${pct(conditional)}"><span style="width:${Number.isFinite(conditional)?(Math.max(0,Math.min(1,conditional))*100).toFixed(1):'0'}%"></span></div><div class="pickVisualLabel"><span>Break-even chance required by price</span><strong>${pct(a.breakEven)}</strong></div><div class="pickMeter pickMeterRequired" role="img" aria-label="Required break-even win chance ${pct(a.breakEven)}"><span style="width:${Number.isFinite(a.breakEven)?(Math.max(0,Math.min(1,a.breakEven))*100).toFixed(1):'0'}%"></span></div><small class="pickVisualNote">These are comparison markers, not independently verified probabilities or proof of profit. A Pass stays a Pass.</small></section><p><b>Recorded support:</b> ${s.hits}/${s.n} at this threshold; last 5 ${s.last5.hits}/${s.last5.n}, last 10 ${s.last10.hits}/${s.last10.n}. Historical mean ${s.mean.toFixed(1)}, SD ${s.sd?.toFixed(1)??'unavailable'}. ${s.current.n} current-season and ${s.previous.n} prior-season appearances; last 5/10 may span seasons.</p><p><b>Model inputs:</b> ${m.season?.currentN??s.current.n} current-team games; ${m.season?.priorN??s.previous.n} prior games used. ${m.season?`Current-season weight ${pct(m.season.currentWeight)}.`:''} Chronological replay: ${m.backtest.n} tests; current-season tests ${m.backtest.currentSeasonN??'not separated'}.</p>${renderDecisionChecks(a.decision,{compact:true})}<details><summary>Reason, risks and sources</summary><p>${esc(a.decision.reason)}</p><ul>${risks.map(r=>`<li>${esc(r)}</li>`).join('')}</ul><p>${sourceHTML||'No additional source links available.'}</p></details><button type="button" class="btn subtle" data-open-pick="${index}">Open full Evidence Readback →</button></article>`;
}
export function mountGamePicks({getInput,onOpenQuote,onViewChange=()=>{}}){
 const $=id=>document.getElementById(id);let active=false,worker=null,serial=0,key='',report=null,items=[],timer=null;
 const stop=()=>{if(worker)worker.terminate();worker=null;serial++;clearTimeout(timer);};
 function views(){
  $('marketBrowser').classList.toggle('hidden',active);$('bestPicksPanel').classList.toggle('hidden',!active);$('selectionReadback').classList.toggle('hidden',active);$('state').classList.toggle('hidden',active);
  $('bestPicksTab').classList.toggle('active',active);$('bestPicksTab').setAttribute('aria-pressed',String(active));
  if(active)document.querySelectorAll('[data-kind]').forEach(b=>b.classList.remove('active'));
  onViewChange(active);
 }
 function screenedRows(result){
  const raw=[...result.recommendations,...result.watchlist],min=Number($('picksMinimum').value||0),low=Number($('picksOddsMin').value),high=Number($('picksOddsMax').value),sort=$('picksSort').value;
  if(!Number.isFinite(low)||!Number.isFinite(high)||low>high)return {rows:[],error:'Enter a valid odds range with the minimum not exceeding the maximum.'};
  const rows=raw.filter(item=>{
   const q=item.quote,m=item.analysis.model,win=m.pWin;
   return Number.isFinite(q.odds)&&q.odds>=low&&q.odds<=high&&Number.isFinite(win)&&win>=min;
  });
  const score=x=>sort==='value'?x.analysis.model.expectedValue:sort==='probability'?x.analysis.model.pWin:null;
  if(sort!=='research')rows.sort((a,b)=>score(b)-score(a)||Number(b.analysis.decision.label==='LEAN')-Number(a.analysis.decision.label==='LEAN'));
  return {rows,error:null};
 }
 function render(result){
  report=result;
  const {rows,error}=screenedRows(result);items=rows;
  const c=result.counts;
  const label=error||`${rows.length} results match the filters from ${(result.recommendations||[]).length+(result.watchlist||[]).length} screened candidates. ${result.message}`;
  $('picksStatus').textContent=label;
  $('picksCoverage').textContent=`${c.gameQuotes} stored quotes seen · ${c.scanned} checked · ${c.modeled} model forecasts · ${c.shortlisted} research candidates. Only supported, currently quoted lines enter the screener; negative-value lines are Pass, and each game is capped at 80 results.`;
  $('picksExclusions').textContent=Object.entries(result.excluded||{}).filter(([,n])=>n).map(([k,n])=>`${k}: ${n}`).join(' · ')||'No exclusions.';
  $('picksResults').innerHTML=rows.length?rows.map((x,i)=>renderPickCard(x,i)).join(''):'<div class="empty">No research candidates matched these filters. This does not mean no 80% lines exist across all bookmakers. Reduce the threshold, widen the odds range or select another game.</div>';
  $('picksResults').querySelectorAll('[data-open-pick]').forEach(b=>b.onclick=()=>{const item=items[Number(b.dataset.openPick)];if(item)onOpenQuote(item.quote,item.id);});
 }
 async function scan(force=false){
  if(!active)return;
  const input=getInput(),scope=$('picksScope').value,allGames=(input.games||[]).filter(g=>g.league===input.game?.league);
  const available=scope==='slate'?allGames:[input.game].filter(Boolean);
  const books=[...new Set((input.quotes||[]).filter(q=>q.league===input.game?.league).map(q=>q.book))].sort();
  const previous=$('picksBook').value||'draftkings';$('picksBook').replaceChildren();
  for(const book of [...new Set(['draftkings',...books,'all'])])$('picksBook').append(new Option(book==='all'?'All returned books':book==='draftkings'?'DraftKings':book,book));
  $('picksBook').value=previous;if(!$('picksBook').value)$('picksBook').value='draftkings';
  const now=new Date().toISOString(),book=$('picksBook').value,includeAlts=$('picksAlts').checked;
  const next=JSON.stringify([scope,input.game?.league,input.game?.eventID||input.game?.game,input.revision,book,includeAlts,$('picksPriceBand').value,$('picksMinimum').value,$('picksOddsMin').value,$('picksOddsMax').value,now.slice(0,16)]);
  if(!force&&next===key){if(report)render(report);return;}key=next;stop();const id=serial;
  $('picksStatus').textContent=`Scanning ${available.length} saved game(s) without requesting new odds…`;
  $('picksCoverage').textContent='Reviewing existing published player histories and exact prices.';$('picksResults').replaceChildren();
  const {scanGamePicks}=await import('./picks.mjs');
  const scopedQuotes=(input.quotes||[]).filter(q=>q.league===input.game?.league);
  const playerNames=new Set(scopedQuotes.map(q=>nameKey(q.player)));
  const records=(input.records||[]).filter(s=>s.league===input.game?.league&&playerNames.has(nameKey(s.subject)));
  const reports=[];
  try{
   for(let i=0;i<available.length;i++){
    if(id!==serial||!active)return;
    $('picksStatus').textContent=`Reviewing saved game ${i+1} of ${available.length}…`;
    reports.push(await scanGamePicks({...input,game:available[i],quotes:scopedQuotes,records,book,includeAlts,priceBand:$('picksPriceBand').value,limit:80,screener:true,minimumModelWin:Number($('picksMinimum').value||0),oddsMin:Number($('picksOddsMin').value),oddsMax:Number($('picksOddsMax').value),now}));
   }
   if(id!==serial||!active)return;
   const sum=key=>reports.reduce((total,r)=>total+(r.counts?.[key]||0),0);
   const counts={gameQuotes:sum('gameQuotes'),scanned:sum('scanned'),modeled:sum('modeled'),shortlisted:sum('shortlisted')};
   const excluded={};for(const r of reports)for(const [k,v] of Object.entries(r.excluded||{}))excluded[k]=(excluded[k]||0)+v;
   render({recommendations:reports.flatMap(r=>r.recommendations),watchlist:reports.flatMap(r=>r.watchlist),counts,excluded,message:`Reviewed ${reports.length} saved games. One research shortlist per game; unsupported or insufficient-data lines may not appear.`});
  }catch(e){if(id===serial&&active){$('picksStatus').textContent='The saved research scan failed: '+e.message;key='';}}
 }
 $('bestPicksTab').onclick=()=>{active=true;views();void scan(true);};$('rescanPicks').onclick=()=>void scan(true);
 for(const id of ['picksBook','picksPriceBand','picksAlts','picksScope'])$(id).addEventListener('change',()=>void scan(true));
 // Probability and odds bounds affect which markets enter the scan, so widening
 // them must rescan the saved quotes. Sorting alone can reuse the current report.
 for(const id of ['picksMinimum','picksOddsMin','picksOddsMax'])$(id).addEventListener('change',()=>void scan(true));
 $('picksSort').addEventListener('change',()=>{if(report)render(report);});
 return {close(){active=false;stop();key='';views();},update(){views();if(active){clearTimeout(timer);timer=setTimeout(()=>void scan(),120);}},get active(){return active;}};
}
