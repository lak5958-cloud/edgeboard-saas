// A manifest pins one dated board and its input files per slate.
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const manifestPath=process.argv[2];
if(!manifestPath) throw Error('Usage: node scripts/replay-odds-series.mjs manifest.json');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
if(!Array.isArray(manifest.slates)||!manifest.slates.length) throw Error('Provide a nonempty slates array.');
const holdoutFrom=manifest.holdoutFrom;
if(typeof holdoutFrom!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(holdoutFrom)||!Number.isFinite(Date.parse(holdoutFrom))||new Date(holdoutFrom).toISOString().slice(0,10)!==holdoutFrom) throw Error('Provide an explicit valid Eastern holdoutFrom date.');
const replay=fileURLToPath(new URL('./replay-saved-odds.mjs',import.meta.url));
const root=dirname(resolve(manifestPath)),days=new Set(),reports=[];
for(const slate of manifest.slates){
 const files=['board','evidence','rosters','teamHistory',...(slate.verifiedOutcomes?['verifiedOutcomes']:[])].map(key=>{
  if(typeof slate[key]!=='string'||!slate[key].trim())throw Error('Missing slate input '+key);
  return resolve(root,slate[key]);
 });
  const teamOutcomes = slate.teamOutcomes ? ['--team-outcomes', resolve(root, slate.teamOutcomes)] : [];
 const report=JSON.parse(execFileSync(process.execPath,[replay,...files,'--point-in-time',...teamOutcomes],{encoding:'utf8',maxBuffer:1024*1024}));
 if(days.has(report.day))throw Error('Multiple boards for '+report.day+'. Choose one observation before evaluating outcomes.');
 days.add(report.day);
 reports.push(report);
}
reports.sort((a,b)=>a.day.localeCompare(b.day));
const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
function summarize(rows,kind){
 const paired=rows.map(r=>r[kind]).filter(r=>r.quotedPricePaired>0);
 return {
  dates:rows.length,scoredDates:paired.length,pairedLines:paired.reduce((sum,r)=>sum+r.quotedPricePaired,0),
  dayEqualModelBrier:mean(paired.map(r=>r.pricePairedActiveBrier)),
  dayEqualPriceBrier:mean(paired.map(r=>r.quotedPriceBrier)),
  dayEqualDifference:mean(paired.map(r=>r.priceDifference))
 };
}
const earlier=reports.filter(r=>r.day<holdoutFrom),holdout=reports.filter(r=>r.day>=holdoutFrom);
const windows=Object.fromEntries([['earlier',earlier],['holdout',holdout]].map(([name,rows])=>[name,{props:summarize(rows,'props'),games:summarize(rows,'games')}]));
console.log(JSON.stringify({holdoutFrom,windows,reports,method:'One declared observation per Eastern slate. Match model and saved prices on settled lines, then weight each scored date equally. This is a point-in-time retrospective reconstruction.'},null,2));
