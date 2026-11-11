import {filterPerformance,performanceLedger} from './performance-filters.mjs';
import {requestJson} from '../request.mjs';
import {coverageView,performanceHeadline} from './performance-view.mjs';
import {summarizeAudits} from './audit-summary.mjs';
import {auditSummaryView} from './audit-summary-view.mjs';
import {modelLabView} from './model-lab-view.mjs';
const el=id=>document.getElementById(id);
let coverageBusy=false,request=0,alive=true;
async function coverage(){
 const league=el('sport').value,book=el('book').value,id=++request;
 if(coverageBusy)return;
 coverageBusy=true;el('coverageRefresh').disabled=true;el('coverageStatus').textContent='Checking saved quotes, rosters and statistical inputs…';
 try{
  const r=await requestJson('/api/research-health?'+new URLSearchParams({league,book}),{timeoutMs:90000});
  if(id!==request||league!==el('sport').value||book!==el('book').value)return;
  el('coverage').innerHTML=coverageView(r);
  el('coverageStatus').textContent='Coverage checked '+new Date(r.checkedAt).toLocaleTimeString()+'. Odds snapshot '+(r.snapshotAt?new Date(r.snapshotAt).toLocaleString():'unavailable')+'.';
 }catch(e){el('coverageStatus').textContent=e.message;}
 finally{coverageBusy=false;el('coverageRefresh').disabled=false;if(id!==request)void coverage();}
}
el('coverageRefresh').onclick=()=>void coverage();
let loadedAudits = [], ledgerPage = 0, auditRequest = 0;
const selectedFilters = () => ({
 decision: el('auditDecision').value,
 agreement: el('auditAgreement').value,
 minimum: Math.min(100, Math.max(0, Number(el('auditMinimum').value) || 0)) / 100
});
function renderPerformance() {
 const filtered = filterPerformance(loadedAudits, selectedFilters());
 const summary = summarizeAudits(filtered);
 el('results').innerHTML = performanceHeadline(filtered, summary) + auditSummaryView(summary);
 renderLedger(filtered);
}
function renderLedger(filtered = filterPerformance(loadedAudits, selectedFilters())) {
 const ledger = performanceLedger(filtered, ledgerPage);
 el('ledger').innerHTML = ledger.html;
 el('ledgerPrevious').disabled = ledgerPage === 0;
 el('ledgerNext').disabled = (ledgerPage + 1) * 25 >= ledger.total;
}
function clearPerformance() {
 auditRequest++;
 loadedAudits = [];
 el('results').replaceChildren();
 el('modelLab').replaceChildren();
 el('trackingFilters').hidden = el('ledgerSection').hidden = true;
 el('performanceStatus').textContent = 'Select Review completed slates to load the selected forecast group.';
}
for (const id of ['auditDecision', 'auditAgreement', 'auditMinimum']) {
 el(id).oninput = () => { ledgerPage = 0; renderPerformance(); };
}
el('ledgerPrevious').onclick = () => { ledgerPage--; renderLedger(); };
el('ledgerNext').onclick = () => { ledgerPage++; renderLedger(); };
for (const id of ['sport','book']) el(id).onchange = () => {
 if (!el('allAuditMarkets').checked) clearPerformance();
 void coverage();
};
el('scope').onchange = el('allAuditMarkets').onchange = el('auditEnd').onchange = clearPerformance;
el('compare').onclick = async () => {
 clearPerformance();
 const id = auditRequest;
 el('compare').disabled = true;
 const league = el('sport').value, book = el('book').value, scope = el('scope').value, all = el('allAuditMarkets').checked, end = el('auditEnd').value;
 try {
  const {dates} = await requestJson('/api/frozen-audit-dates');
  const selected = dates.filter(date => date.completed && (!end || date.day <= end) && (scope === 'games' ? date.gameSnapshots : date.snapshots) > 0).slice(-7);
  const audits = [], gaps = [];
  for (const [index, date] of selected.entries()) {
   if (id !== auditRequest) return;
   el('performanceStatus').textContent = 'Reading completed slate ' + (index+1) + ' of ' + selected.length + '…';
   try {
    const params = new URLSearchParams({day: date.day, scope, preferGraded: '1'});
    const audit = await requestJson('/api/frozen-audit?' + params, {timeoutMs: 90000});
    audits.push({...audit, results: all ? audit.results : audit.results.filter(row => row.league === league && row.book === book)});
   } catch (error) {
    gaps.push(date.day + ' (' + error.message + ')');
   }
  }
  if (id !== auditRequest) return;
  loadedAudits = audits;
  ledgerPage = 0;
  el('trackingFilters').hidden = el('ledgerSection').hidden = !audits.length;
  if (audits.length) renderPerformance();
  const latestGrade = audits.map(audit => audit.gradedAt).filter(Boolean).sort().at(-1);
  el('performanceStatus').textContent = 'Reviewed ' + audits.length + ' of ' + selected.length + ' archived slates.' +
   (latestGrade ? ' Latest saved grade ' + new Date(latestGrade).toLocaleString('en-US', {timeZone:'America/New_York',timeZoneName:'short'}) + '.' : '') +
   (gaps.length ? ' Unavailable slates: ' + gaps.join('; ') + '.' : '');
  if (audits.length) {
   try {
    const holdoutFrom = selected.at(-2)?.day ?? selected.at(-1)?.day;
    const lab = await compare(audits, {holdoutFrom});
    if (id === auditRequest) el('modelLab').innerHTML = modelLabView(audits, lab);
   } catch (error) {
    if (id === auditRequest) el('modelLab').textContent = error.message;
   }
  }
 } catch (error) {
  if (id === auditRequest) el('performanceStatus').textContent = 'Comparison could not start. ' + error.message;
 } finally {
  el('compare').disabled = false;
 }
};
function compare(audits,options){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./model-lab-worker.mjs',import.meta.url),{type:'module'});
  const timer=setTimeout(()=>{worker.terminate();reject(Error('Model comparison timed out.'));},60000);
  worker.onmessage=e=>{clearTimeout(timer);worker.terminate();e.data.error?reject(Error(e.data.error)):resolve(e.data.report);};
  worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(Error('The comparison worker could not run.'));};
  worker.postMessage({audits,options});
 });
}
try{
 const access=await requestJson('/api/session');
 el('access').hidden=access.pro===true;el('dashboard').hidden=access.pro!==true;
 if(access.pro)await coverage();
}catch{el('access').hidden=false;}
document.addEventListener('visibilitychange',()=>{alive=!document.hidden;});
setInterval(()=>{if(alive&&!el('dashboard').hidden&&!coverageBusy)void coverage();},60000);
