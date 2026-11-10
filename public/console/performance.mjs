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
for(const id of ['sport','book'])el(id).onchange=()=>{el('results').replaceChildren();el('performanceStatus').textContent='Review completed slates for this sport and sportsbook.';void coverage();};
el('scope').onchange=el('allAuditMarkets').onchange=()=>{el('results').replaceChildren();el('performanceStatus').textContent='Review completed slates for this forecast group.';};
el('compare').onclick=async()=>{
 el('compare').disabled=true;
 const league=el('sport').value,book=el('book').value,scope=el('scope').value,all=el('allAuditMarkets').checked;
 try{
  const {dates}=await requestJson('/api/frozen-audit-dates'),selected=dates.filter(d=>d.completed&&(scope==='games'?d.gameSnapshots:d.snapshots)>0).slice(-7),audits=[];
  for(let i=0;i<selected.length;i++){
   el('performanceStatus').textContent='Reading completed slate '+(i+1)+' of '+selected.length+'…';
   const audit=await requestJson('/api/frozen-audit?'+new URLSearchParams({day:selected[i].day,scope}),{timeoutMs:90000});
   audits.push({...audit,results:all?audit.results:audit.results.filter(r=>r.league===league&&r.book===book)});
  }
  if((!all&&(league!==el('sport').value||book!==el('book').value))||scope!==el('scope').value||all!==el('allAuditMarkets').checked)return;
  const lab=await compare(audits),summary=summarizeAudits(audits);
  el('results').innerHTML=performanceHeadline(audits,summary)+modelLabView(audits,lab)+auditSummaryView(summary);
  el('performanceStatus').textContent=audits.length?'Reviewed '+audits.length+' completed slates. Candidate scores remain experimental.':'No completed archived slates are available.';
 }catch(e){el('performanceStatus').textContent='Comparison did not finish. '+e.message;}
 finally{el('compare').disabled=false;}
};
function compare(audits){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./model-lab-worker.mjs',import.meta.url),{type:'module'});
  const timer=setTimeout(()=>{worker.terminate();reject(Error('Model comparison timed out.'));},60000);
  worker.onmessage=e=>{clearTimeout(timer);worker.terminate();e.data.error?reject(Error(e.data.error)):resolve(e.data.report);};
  worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(Error('The comparison worker could not run.'));};
  worker.postMessage(audits);
 });
}
try{
 const access=await requestJson('/api/session');
 el('access').hidden=access.pro===true;el('dashboard').hidden=access.pro!==true;
 if(access.pro)await coverage();
}catch{el('access').hidden=false;}
document.addEventListener('visibilitychange',()=>{alive=!document.hidden;});
setInterval(()=>{if(alive&&!el('dashboard').hidden&&!coverageBusy)void coverage();},60000);
