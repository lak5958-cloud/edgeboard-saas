import {bindNavigation,authDestination} from './navigation.mjs';
import {requestJson} from './request.mjs';
import {replaceView,createRefreshTask,isEditing} from './refresh-view.mjs';
import {gameMarketsView} from './game-markets-view.mjs';
import {pickMarketsView,marketPlayerCards} from './pick-markets-view.mjs';
import {picksResults} from './picks-view.mjs';
import {avatar,tradeResult,briefView,forecastHistoryView} from './trade-view.mjs';
import {pageView} from './views.mjs';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let sportsbook='draftkings';let league='NFL',players=[],give=[],receive=[],access={user:null,pro:false},currentTrade=null,revision=0;
const sources=urls=>[...new Set(urls||[])].filter(u=>{try{return new URL(u).protocol==='https:'}catch{return false}}).slice(0,8).map((u,i)=>`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">Source ${i+1} ↗</a>`).join('');
async function api(route,body){return requestJson('/api/'+route,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});}
function toast(s){$('#toast').textContent=s;$('#toast').style.display='block';setTimeout(()=>$('#toast').style.display='none',7000)}
function bindLeagues(){document.querySelectorAll('[data-league]').forEach(b=>b.onclick=()=>{if(league===b.dataset.league)return;revision++;league=b.dataset.league;marketFilters={eventID:'',playerKey:'',stat:'',side:'',search:'',limit:25};gameFilters={eventID:'',kind:'Moneyline',cursor:'0'};give=[];receive=[];players=[];currentTrade=null;render()})}
function render(){
 const path=location.pathname;$('#app').innerHTML=pageView(path,league,access);
 document.querySelectorAll('.topbar nav a').forEach(a=>{const active=new URL(a.href).pathname===path;a.classList.toggle('current',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
 bindLeagues();if($('#accessCodeForm'))bindAccessCode();if($('#trade')){bindTool();$('#reviewForecasts').onclick=reviewForecasts;}if($('#daily')){const book=$('#sportsbook');book.value=sportsbook;$('#checkSlate').onclick=()=>void checkSlate();$('#slateReadiness').ontoggle=()=>{if($('#slateReadiness')?.open)void checkSlate();};book.onchange=()=>{sportsbook=book.value;if($('#slateReadiness')?.open)void checkSlate();marketFilters.playerKey='';marketFilters.stat='';marketFilters.side='';marketFilters.limit=25;gameFilters.cursor='0';void loadPicks(true);void loadMarketCoverage();void loadGameMarkets();};void loadPicks();void feedStatus();void loadMarketCoverage();void loadGameMarkets();$('#shortlistView').onclick=()=>setDailyView('shortlist');$('#marketView').onclick=()=>setDailyView('markets');$('#gameView').onclick=()=>setDailyView('games');setDailyView(dailyView);}if($('#ownerRefresh')){$('#ownerRefresh').onclick=ownerRefresh;void ownerStatus();void loadBillingReview();}if($('#loadPicks'))$('#loadPicks').onclick=()=>{void loadPicks();void loadMarketCoverage();void loadGameMarkets();};if($('#checkout')){ $('#checkout').onclick=()=>billing('checkout');void loadBilling();}if($('#portal'))$('#portal').onclick=()=>billing('portal');if($('#logout'))$('#logout').onclick=async()=>{try{await api('auth/logout',{});location.href='/'}catch(e){toast(e.message)}};if($('#authForm'))bindAuth();
}
function invalidateTrade(){revision++;currentTrade=null;if($('#tradeResult'))$('#tradeResult').innerHTML='';}
function bindPortraits(){document.querySelectorAll('.playerAvatar img').forEach(img=>img.addEventListener('error',()=>img.remove(),{once:true}));}
function chips(){invalidateTrade();for(const [side,items] of [['give',give],['receive',receive]]){$('#'+side+'Chips').innerHTML=items.length?items.map((p,i)=>`<span class="chip selectedPlayer">${avatar(players.find(x=>(x.choice||x.name)===p)||{name:p})}<span><b>${esc(p)}</b><small>${esc(players.find(x=>(x.choice||x.name)===p)?.team||'')} ${esc(players.find(x=>(x.choice||x.name)===p)?.position||'')}</small></span><button type="button" data-remove="${side}:${i}" aria-label="Remove ${esc(p)}">×</button></span>`).join(''):'<small>No players selected yet.</small>'}document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{const [side,i]=b.dataset.remove.split(':');(side==='give'?give:receive).splice(Number(i),1);chips()});bindPortraits();}
async function bindTool(){for(const id of ['format','passingTD','replacementPoints','rosterNeed','lineupPlan'])if($('#'+id))$('#'+id).onchange=invalidateTrade;document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{const side=b.dataset.add,input=$('#'+side+'Input'),name=players.find(p=>(p.choice||p.name).toLowerCase()===input.value.trim().toLowerCase())?.choice||players.find(p=>p.name.toLowerCase()===input.value.trim().toLowerCase()&&players.filter(x=>x.name===p.name).length===1)?.name;if(!name)return toast('Choose an exact player from the available list.');if([...give,...receive].includes(name))return toast('That player is already in this trade.');const target=side==='give'?give:receive;if(target.length>=3)return toast('Choose at most three players per side.');target.push(name);input.value='';chips()});$('#analyze').onclick=()=>runTrade(false);$('#analyze').disabled=true;document.querySelectorAll('[data-add]').forEach(b=>b.disabled=true);try{const requestLeague=league;const data=await api('players?league='+requestLeague);if(requestLeague!==league||!$('#playerNames'))return;players=data.players;$('#playerNames').innerHTML=players.map(p=>`<option value="${esc(p.choice||p.name)}">${esc(p.team||'')}</option>`).join('');$('#analyze').disabled=!players.length;document.querySelectorAll('[data-add]').forEach(b=>b.disabled=!players.length);$('#dataStatus').textContent=players.length?`${players.length} players with saved history. Snapshot: ${data.snapshotAt||'timestamp unavailable'}.`:'Player data is not available yet. You can explore the tools, but comparisons will be available after data is connected.';}catch(e){if($('#dataStatus'))$('#dataStatus').textContent=e.message}}
async function runTrade(ai){if(!give.length||!receive.length)return toast('Add at least one player to each side.');const input={league,format:$('#format').value,give:give.map(n=>{const p=players.find(p=>(p.choice||p.name)===n);return p?.id?'id:'+p.id:n}),receive:receive.map(n=>{const p=players.find(p=>(p.choice||p.name)===n);return p?.id?'id:'+p.id:n}),rosterNeed:$('#rosterNeed').value,lineupPlan:$('#lineupPlan').value,passingTD:Number($('#passingTD')?.value||4),replacementPoints:$('#replacementPoints')?.value?Number($('#replacementPoints').value):null};const requestRevision=revision,requestLeague=league;const button=ai?$('#aiBrief'):$('#analyze');button.disabled=true;try{const r=await api(ai?'ai/brief':'fantasy/analyze',input);if(requestRevision!==revision||requestLeague!==league||!$('#tradeResult'))return;currentTrade=ai?r.trade:r;
 $('#tradeResult').innerHTML=tradeResult(currentTrade);
 bindPortraits();
 $('#aiBrief').onclick=()=>runTrade(true);
 if($('#saveForecast'))$('#saveForecast').onclick=()=>saveForecast(input,currentTrade.forecastKey);
 if(ai){const output=$('#aiOutput');output.innerHTML=briefView(r);output.scrollIntoView({block:'nearest'});}}catch(e){toast(e.message)}finally{button.disabled=false}}
async function saveForecast(input, expectedKey) {
 const button=$('#saveForecast'),status=$('#forecastSaveStatus');
 button.disabled=true;
 status.textContent='Saving the displayed scoring estimates…';
 try {
  const saved=await api('fantasy/forecasts',{input,expectedKey});
  status.textContent='Forecast saved on '+new Date(saved.capturedAt).toLocaleString()+'.';
  if(status.isConnected)void reviewForecasts();
 } catch(error) {
  status.textContent=error.message;
  button.disabled=false;
 }
}

async function reviewForecasts() {
 const button=$('#reviewForecasts'),status=$('#forecastHistoryStatus'),results=$('#forecastHistory');
 if(!button||button.disabled)return;
 button.disabled=true;
 status.textContent='Checking verified appearances…';
 try {
  const {forecasts}=await api('fantasy/forecasts');
  results.innerHTML=forecastHistoryView(forecasts);
  status.textContent=forecasts.length?'Showing up to 30 recent forecasts.':'';
 } catch(error) {
  status.textContent=error.message;
 } finally {
  button.disabled=false;
 }
}

let pickRequest=0,marketRequest=0,dailyView='shortlist',marketFilters={eventID:'',playerKey:'',stat:'',side:'',search:'',limit:25},marketData=null,gameRequest=0,gameFilters={eventID:'',kind:'Moneyline',cursor:'0'};
async function loadPicks(force=false,quiet=false){const b=$('#loadPicks');if(!b||b.disabled&&!force)return;const id=++pickRequest;b.disabled=true;const requestLeague=league,requestBook=sportsbook;if(!quiet)$('#dailyResults').textContent='Checking the latest prices and player history…';try{const r=await api('picks?league='+requestLeague+'&book='+requestBook);if(id!==pickRequest||requestLeague!==league||requestBook!==sportsbook||!$('#dailyResults'))return;$('#dailyResults').className='';replaceView($('#dailyResults'),picksResults(r),{preserve:quiet});bindPortraits();}catch(e){if(id===pickRequest&&$('#dailyResults')){if(quiet)showUpdateError(e);else $('#dailyResults').textContent=e.message;}}finally{if(id===pickRequest)b.disabled=false}}
function setDailyView(view){const changed=dailyView!==view;dailyView=view;$('#dailyShortlist').hidden=view!=='shortlist';$('#dailyMarketCoverage').hidden=view!=='markets';$('#dailyGameCoverage').hidden=view!=='games';for(const [id,name] of [['shortlistView','shortlist'],['marketView','markets'],['gameView','games']]){$('#'+id).classList.toggle('active',view===name);$('#'+id).setAttribute('aria-pressed',String(view===name));}if(changed){if(view==='shortlist')void loadPicks();if(view==='markets')void loadMarketCoverage();if(view==='games')void loadGameMarkets();}}
function bindMarketCoverage(){
 $('#marketGame').onchange=()=>{marketFilters.eventID=$('#marketGame').value;marketFilters.playerKey='';marketFilters.stat='';marketFilters.side='';marketFilters.limit=25;void loadMarketCoverage();};
 $('#marketPlayerSearch').oninput=()=>{marketFilters.search=$('#marketPlayerSearch').value;$('#marketPlayerGrid').innerHTML=marketPlayerCards(marketData,marketFilters.search);bindPortraits();};
 $('#marketPlayerGrid').onclick=e=>{const b=e.target.closest('[data-market-player]');if(!b)return;marketFilters.playerKey=b.dataset.marketPlayer;marketFilters.stat='';marketFilters.side='';marketFilters.limit=25;void loadMarketCoverage();};
 for(const [id,key] of [['marketStat','stat'],['marketSide','side']])if($('#'+id))$('#'+id).onchange=()=>{marketFilters[key]=$('#'+id).value;marketFilters.limit=25;void loadMarketCoverage();};
 if($('#moreMarketLines'))$('#moreMarketLines').onclick=()=>{marketFilters.limit+=50;$('#dailyMarketCoverage').innerHTML=pickMarketsView(marketData,marketFilters);bindMarketCoverage();bindPortraits();};
}
async function loadMarketCoverage(retry=true,quiet=false){if(!$('#dailyMarketCoverage'))return;const id=++marketRequest,requestLeague=league,requestBook=sportsbook;const loading=$('#marketLoading');if(loading){loading.hidden=false;loading.textContent=`Updating ${requestBook==='fanduel'?'FanDuel':'DraftKings'} player lines…`;}$('#dailyMarketCoverage').setAttribute('aria-busy','true');try{const r=await api('pick-markets?'+new URLSearchParams({league:requestLeague,book:requestBook,eventID:marketFilters.eventID,playerKey:marketFilters.playerKey,stat:marketFilters.stat,side:marketFilters.side}));if(id!==marketRequest||league!==requestLeague||sportsbook!==requestBook||!$('#dailyMarketCoverage'))return;marketData=r;marketFilters.playerKey=r.selected?.key||'';$('#marketView').textContent=`All player lines (${r.totalPlayers} players)`;replaceView($('#dailyMarketCoverage'),pickMarketsView(r,marketFilters),{preserve:quiet});bindMarketCoverage();bindPortraits();}catch(e){if(id!==marketRequest)return;if(e.status===409&&retry){marketFilters.playerKey='';return loadMarketCoverage(false,quiet);}if($('#dailyMarketCoverage')){if(quiet)showUpdateError(e);else $('#dailyMarketCoverage').textContent=e.message;}}finally{if(id===marketRequest){if($('#marketLoading'))$('#marketLoading').hidden=true;$('#dailyMarketCoverage')?.setAttribute('aria-busy','false');}}}
async function loadGameMarkets(quiet=false){if(!$('#dailyGameCoverage'))return;const id=++gameRequest,l=league,b=sportsbook;$('#dailyGameCoverage').setAttribute('aria-busy','true');try{const r=await api('game-markets?'+new URLSearchParams({league:l,book:b,...gameFilters}));if(id!==gameRequest||l!==league||b!==sportsbook||!$('#dailyGameCoverage'))return;gameFilters.eventID=r.selected?.eventID||'';replaceView($('#dailyGameCoverage'),gameMarketsView(r),{preserve:quiet});for(const [selector,key] of [['#gameMarketGame','eventID'],['#gameMarketKind','kind']])if($(selector))$(selector).onchange=()=>{gameFilters[key]=$(selector).value;gameFilters.cursor='0';void loadGameMarkets();};if($('#previousGameMarkets'))$('#previousGameMarkets').onclick=()=>{gameFilters.cursor=r.previous;void loadGameMarkets();};if($('#moreGameMarkets'))$('#moreGameMarkets').onclick=()=>{gameFilters.cursor=r.next;void loadGameMarkets();};}catch(e){if(id===gameRequest&&$('#dailyGameCoverage')){if(e.status===400&&gameFilters.cursor!=='0'){gameFilters.cursor='0';return loadGameMarkets(quiet);}if(quiet)showUpdateError(e);else $('#dailyGameCoverage').textContent=e.message;}}finally{if(id===gameRequest)$('#dailyGameCoverage')?.setAttribute('aria-busy','false');}}
async function checkSlate(){
 const target=$('#slateReadinessResults'),l=league,b=sportsbook;
 if(!target)return;
 target.textContent='Checking the latest published slate…';
 try{
  const r=await api('slate-readiness?'+new URLSearchParams({league:l,book:b}));
  if(!target.isConnected||l!==league||b!==sportsbook)return;
  if(!r.checkedAt){target.textContent='Readiness will be available after a scheduled refresh publishes it.';return;}
  const p=document.createElement('p');
  p.textContent='Checked '+new Date(r.checkedAt).toLocaleString('en-US',{timeZone:'America/New_York'})+' ET. '+(r.stale?'This snapshot is aging. Check the sportsbook for current prices. ':'')+'History counts show at least one sourced full-game result for a roster-matched player. Forecast eligibility is checked separately.';
  target.replaceChildren(p);
  for(const day of [r.today,r.tomorrow]){
   const title=document.createElement('h3');title.textContent=day+' Eastern';target.append(title);
   const rows=r.rows.filter(row=>row.day===day);
   if(!rows.length){const empty=document.createElement('p');empty.textContent='No upcoming matchups appeared in the provider board for this date.';target.append(empty);continue;}
   const list=document.createElement('ul');
   for(const row of rows){const item=document.createElement('li');item.textContent=`${row.game} · ${row.props} current prop quotes · ${row.gameLines} current game lines · ${row.rosterMatches}/${row.players} players with a recent roster match · ${row.playersWithHistory} with sourced history`+(row.listed?'':' · no quotes from this book');list.append(item);}
   target.append(list);
  }
 }catch(e){if(target.isConnected&&l===league&&b===sportsbook)target.textContent=e.message;}
}
async function feedStatus(){try{const s=await api('data-status');const text=`Automatic updates every ${s.scheduledIntervalMinutes} minutes. ${s.finishedAt?'Last refresh: '+new Date(s.finishedAt).toLocaleString()+'.':'First refresh pending.'} ${s.oddsConfigured?['error','limited'].includes(s.odds?.status)?s.odds.message||'Odds coverage is limited.':'Odds provider configured.':'Live odds need the owner’s provider key; saved quotes retain their original timestamps.'}`;if($('#feedStatus'))$('#feedStatus').textContent=text;return s;}catch{return null;}}
async function ownerStatus(){try{const s=await api('refresh-status');if($('#ownerDataStatus'))$('#ownerDataStatus').textContent=s.running?'Refresh running on the server. You can leave this page.':`${s.finishedAt?'Last refresh: '+new Date(s.finishedAt).toLocaleString()+'. ':''}${s.processed||0} box scores processed; ${s.pendingGames??'unknown'} games pending. ${s.oddsConfigured?'Odds key configured.':'Add SPORTSGAMEODDS_API_KEY as a Production secret in Vercel to enable live prices.'} ${(s.issues||[]).length} collection issue(s).`;}catch(e){if($('#ownerDataStatus'))$('#ownerDataStatus').textContent=e.message;}}
async function ownerRefresh(){const b=$('#ownerRefresh');b.disabled=true;try{const s=await api('refresh',{});$('#ownerDataStatus').textContent=s.message;}catch(e){toast(e.message)}finally{b.disabled=false}}
function showUpdateError(error){const status=$('#feedStatus');if(status)status.textContent='Update could not finish. Previously loaded data is still shown; check each price timestamp. '+error.message;}
const refreshVisible=createRefreshTask(async()=>{
 if(document.hidden)return;
 if($('#daily')){
  await feedStatus();
  const editing=region=>region&&(isEditing(region)||region.getAttribute('aria-busy')==='true');
  const jobs=[];
  if(dailyView==='shortlist'&&!$('#loadPicks')?.disabled)jobs.push(loadPicks(false,true));
  if(dailyView==='markets'&&!editing($('#dailyMarketCoverage')))jobs.push(loadMarketCoverage(true,true));
  if(dailyView==='games'&&!editing($('#dailyGameCoverage')))jobs.push(loadGameMarkets(true));
  await Promise.allSettled(jobs);
 }
 if($('#ownerRefresh'))await ownerStatus();
 await loadBillingReview();
});
setInterval(()=>void refreshVisible(),60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshVisible();});
function bindAuth(){let signup=false;const set=value=>{signup=value;$('#authSubmit').textContent=value?'Create account →':'Sign in →';$('#signInTab').classList.toggle('active',!value);$('#signUpTab').classList.toggle('active',value);$('#signInTab').setAttribute('aria-pressed',String(!value));$('#signUpTab').setAttribute('aria-pressed',String(value));$('#password').autocomplete=value?'new-password':'current-password'};$('#signInTab').onclick=()=>set(false);$('#signUpTab').onclick=()=>set(true);$('#authForm').onsubmit=async e=>{e.preventDefault();$('#authSubmit').disabled=true;try{const r=await api(signup?'auth/signup':'auth/login',{email:$('#email').value,password:$('#password').value});$('#authStatus').textContent=r.message;if(r.signedIn)location.href=authDestination(location.search);}catch(e){$('#authStatus').textContent=e.message}finally{$('#authSubmit').disabled=false}}}
function bindAccessCode(){const form=$('#accessCodeForm');form.onsubmit=async event=>{event.preventDefault();const button=$('#redeemCode'),input=$('#accessCode'),status=$('#accessCodeStatus');button.disabled=true;status.textContent='Checking your access code…';try{const result=await api('access/redeem',{code:input.value});input.value='';status.textContent=result.message;access=await api('session');if(!access.pro)throw Error('Access was saved. Reload your account to check the latest status.');render();$('#accessCodeStatus').textContent=result.message;$('#codeResearchLink').hidden=false;}catch(error){if($('#accessCodeStatus'))$('#accessCodeStatus').textContent=error.message;}finally{if($('#redeemCode'))$('#redeemCode').disabled=false;}};}
async function loadBillingReview(){if(!$('#billingReview'))return;try{const r=await api('billing/review');if(!$('#billingReview'))return;$('#billingReview').innerHTML=r.events.length?r.events.map(e=>`<article class="billingReviewEvent"><b>${esc(e.type)}</b><p>${esc(e.created_at)} · ${e.livemode?'Live':'Sandbox'}</p><p>${esc(e.result)} ${(e.subscription_ids||[]).map(esc).join(', ')}</p><button class="subtle" data-billing-reviewed="${esc(e.id)}">Mark reviewed</button></article>`).join(''):'No billing events need review.';document.querySelectorAll('[data-billing-reviewed]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api('billing/review',{id:b.dataset.billingReviewed});void loadBillingReview();}catch(e){toast(e.message);b.disabled=false;}});}catch(e){if($('#billingReview'))$('#billingReview').textContent=e.message;}}
async function loadBilling(){try{const r=await api('billing/config');if($('#billingStatus'))$('#billingStatus').textContent=r.message;if($('#checkout')){$('#checkout').disabled=!r.ready;$('#checkout').textContent=r.ready?(r.mode==='test'?'Open test checkout':'Subscribe for $7.99/month'):'Checkout opens soon';}}catch{if($('#billingStatus'))$('#billingStatus').textContent='Payment availability could not be checked. Please try again later.';}}
async function billing(action){if(action==='checkout'&&!access.user){location.href='/login?next=pricing';return;}try{const r=await api('billing/'+action,{});const u=new URL(r.url);if(u.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(u.hostname))throw Error('Unexpected checkout destination.');location.href=u.href;}catch(e){toast(e.message)}}
async function checkCheckoutConfirmation(){if(location.pathname!=='/account'||new URLSearchParams(location.search).get('checkout')!=='success')return;for(let attempt=0;attempt<12;attempt++){try{const latest=await api('session');const changed=latest.subscriptionActive&&!access.subscriptionActive;access=latest;if(changed)render();if(!$('#checkoutStatus'))return;$('#checkoutStatus').hidden=false;$('#checkoutStatus').textContent=latest.subscriptionActive?'Subscription confirmed. Your research access is ready.':'Waiting for Stripe’s secure payment confirmation. This page cannot grant access by itself.';if(latest.subscriptionActive)return;}catch{}await new Promise(r=>setTimeout(r,5000));}if($('#checkoutStatus'))$('#checkoutStatus').textContent='Payment confirmation is still pending. Check Account & billing again shortly; do not pay a second time.';}
bindNavigation(document);
render();
try{access=await api('session');if(access.user)$('#accountLink').textContent='My account ↗';$('#accountLink').href=access.user?'/account':'/login';if(['/account','/research'].includes(location.pathname))render();}catch{}void checkCheckoutConfirmation();
