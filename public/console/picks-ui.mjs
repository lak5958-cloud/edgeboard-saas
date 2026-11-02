import {renderDecisionChecks} from './decision-ui.mjs';
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
 return `<article class="pickCard ${lean?'pickLean':'pickWatch'}"><div class="pickTop"><span class="eyebrow">${lean?'EXPERIMENTAL LEAN':'WATCHLIST · PASS'}</span><span class="mini">${esc(q.book)} · ${esc(time(q.asOf))}</span></div><h3>${esc(q.player)} · ${esc(q.side.toUpperCase())} ${esc(q.line)} ${esc(statLabel(q.stat,q.league))}</h3><p class="pickPrice">${esc(odds(q.odds))}<span>${q.alt?'Alternate':'Standard'} · full game</span></p><div class="pickNumbers"><div><span>MODEL WIN / PUSH</span><strong>${pct(m.pWin)} / ${pct(m.pPush)}</strong></div><div><span>NON-PUSH MODEL / REQUIRED</span><strong>${pct(conditional)} / ${pct(a.breakEven)}</strong></div><div><span>MODEL NET / 1 UNIT</span><strong>${m.expectedValue>=0?'+':''}${m.expectedValue.toFixed(3)}</strong></div></div><p><b>Recorded support:</b> ${s.hits}/${s.n} at this threshold; last 5 ${s.last5.hits}/${s.last5.n}, last 10 ${s.last10.hits}/${s.last10.n}. Historical mean ${s.mean.toFixed(1)}, SD ${s.sd?.toFixed(1)??'unavailable'}. ${s.current.n} current-season and ${s.previous.n} prior-season appearances; last 5/10 may span seasons.</p><p><b>Model inputs:</b> ${m.season?.currentN??s.current.n} current-team games; ${m.season?.priorN??s.previous.n} prior games used. ${m.season?`Current-season weight ${pct(m.season.currentWeight)}.`:''} Chronological replay: ${m.backtest.n} tests; current-season tests ${m.backtest.currentSeasonN??'not separated'}.</p>${renderDecisionChecks(a.decision,{compact:true})}<details><summary>Reason, risks and sources</summary><p>${esc(a.decision.reason)}</p><ul>${risks.map(r=>`<li>${esc(r)}</li>`).join('')}</ul><p>${sourceHTML||'No additional source links available.'}</p></details><button type="button" class="btn subtle" data-open-pick="${index}">Open full Evidence Readback →</button></article>`;
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
 function render(result){
  report=result;items=[...result.recommendations,...result.watchlist];$('picksStatus').textContent=result.message;
  const c=result.counts;$('picksCoverage').textContent=`${c.gameQuotes} returned game quotes · ${c.scanned} distinct prices checked · ${c.eligiblePrices} current supported prices in range · ${c.modeled} forecasts · ${c.shortlisted} distinct players shown. Scanned ${time(result.generatedAt)}.`;
  $('picksExclusions').textContent=Object.entries(result.excluded).filter(([,n])=>n).map(([k,n])=>`${({wrongBook:'other books',unsupported:'unsupported market/period',closedOrStale:'stale/closed/started',priceBand:'outside price range',alternateExcluded:'alternates disabled',invalidPrice:'invalid price',rosterConflict:'roster conflict',unavailableStatus:'availability gate',missingHistory:'missing history',noForecast:'forecast unavailable',smallSample:'insufficient training sample',nonpositiveReturn:'nonpositive model return',weakTail:'fewer than 3 observed training wins'})[k]||k}: ${n}`).join(' · ')||'No exclusions.';
  let html='';if(result.recommendations.length)html+='<h3 class="picksGroupTitle">Research leans</h3>'+result.recommendations.map((x,i)=>renderPickCard(x,i)).join('');
  if(result.watchlist.length)html+='<h3 class="picksGroupTitle">Strongest watchlist candidates · still Pass</h3>'+result.watchlist.map((x,i)=>renderPickCard(x,result.recommendations.length+i)).join('');
  $('picksResults').innerHTML=html||'<div class="empty">No qualifying selections from the saved quotes and evidence. Check the exclusions above or adjust the price range. Unsupported or missing markets are not replaced with picks.</div>';
  $('picksResults').querySelectorAll('[data-open-pick]').forEach(b=>b.onclick=()=>{const item=items[Number(b.dataset.openPick)];if(item)onOpenQuote(item.quote,item.id);});
 }
 async function scan(force=false){
  if(!active)return;const input=getInput(),books=[...new Set((input.quotes||[]).filter(q=>q.league===input.game?.league&&q.game===input.game?.game).map(q=>q.book))].sort();
  const prev=$('picksBook').value||'draftkings';$('picksBook').replaceChildren();for(const b of [...new Set(['draftkings',...books,'all'])])$('picksBook').append(new Option(b==='all'?'Best price across returned books':b==='draftkings'?'DraftKings':b,b));$('picksBook').value=prev;if(!$('picksBook').value)$('picksBook').value='draftkings';
  input.book=$('picksBook').value||'draftkings';input.includeAlts=$('picksAlts').checked;input.priceBand=$('picksPriceBand').value;input.limit=5;input.now=new Date().toISOString();
  const next=JSON.stringify([input.game?.league,input.game?.eventID||input.game?.game,input.revision,input.book,input.includeAlts,input.priceBand,input.now.slice(0,16)]);if(!force&&next===key)return;key=next;stop();const id=serial;
  $('picksStatus').textContent='Scanning this game’s saved quotes and statistical evidence…';$('picksCoverage').textContent='Checking fresh prices, supported markets, comparable history and availability.';$('picksExclusions').textContent='';$('picksResults').replaceChildren();
  // Send only this game's player histories to the background worker.
  const playerNames=new Set((input.quotes||[]).filter(q=>q.league===input.game?.league&&q.game===input.game?.game).map(q=>nameKey(q.player)));input.records=(input.records||[]).filter(s=>s.league===input.game?.league&&playerNames.has(nameKey(s.subject)));
  const accept=result=>{if(id===serial&&active)render(result);};const failed=message=>{if(id===serial&&active){$('picksStatus').textContent='Game scan could not finish: '+message;key='';}};
  if(typeof Worker==='function'){
   try{worker=new Worker('/console/picks-worker.mjs',{type:'module'});worker.onmessage=e=>{if(e.data.id!==serial||!active)return;if(e.data.type==='result'){accept(e.data.result);worker?.terminate();worker=null;}else if(e.data.type==='error'){failed(e.data.error);worker?.terminate();worker=null;}else if(e.data.type==='progress')$('picksStatus').textContent=`${e.data.progress.phase==='analysis'?'Reviewing shortlisted evidence':'Scanning prices'}: ${e.data.progress.processed}/${e.data.progress.total}…`;};worker.onerror=()=>{if(id!==serial||!active)return;failed('Background worker unavailable. Restart the v1.12.1 server and retry.');worker?.terminate();worker=null;};worker.postMessage({id,input});return;}catch{}
  }
  try{const {scanGamePicks}=await import('./picks.mjs');accept(await scanGamePicks(input));}catch(e){failed(e.message);}
 }
 $('bestPicksTab').onclick=()=>{active=true;views();void scan(true);};$('rescanPicks').onclick=()=>void scan(true);
 for(const id of ['picksBook','picksPriceBand','picksAlts'])$(id).addEventListener('change',()=>void scan(true));
 return {close(){active=false;stop();key='';views();},update(){views();if(active){clearTimeout(timer);timer=setTimeout(()=>void scan(),120);}},get active(){return active;}};
}
