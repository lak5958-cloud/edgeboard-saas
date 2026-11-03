// Offline retrospective research. All thresholds are generated from earlier box scores.
import fs from 'node:fs';
import {normalizeSeasonGame} from '../lib/seasons.mjs';
import {fitSeason} from '../lib/season-model.mjs';
import {fitFootball} from '../lib/football-model.mjs';
import {readOpportunity} from '../lib/opportunity.mjs';
import {normalizeStat} from '../lib/insights.mjs';

const paths=process.argv.slice(2);
if(!paths.length) throw Error('Usage: node scripts/replay-workload.mjs evidence.json [more evidence files]');
const series=new Map();
for(const path of paths) for(const r of JSON.parse(fs.readFileSync(path,'utf8'))) {
 const id=r.athleteID||r.profile?.id;
 if(!id||!['NBA','NFL'].includes(r.league)||(r.periodID||'game')!=='game') continue;
 const key=JSON.stringify([r.league,id,normalizeStat(r.stat)]);
 if(!series.has(key)) series.set(key,{league:r.league,stat:r.stat,rows:new Map()});
 const s=series.get(key);
 for(const raw of r.games||[]) {
  const g=normalizeSeasonGame(raw);
  if(g.seasonType!=='regular'||!g.teamID||!g.gameID||!g.date||!/^https:\/\//.test(g.source||'')||!Number.isFinite(g.value)) continue;
  const old=s.rows.get(g.gameID);
  if(old===null) continue;
  s.rows.set(g.gameID,old&&(old.value!==g.value||old.date!==g.date||String(old.teamID)!==String(g.teamID))?null:old||g);
 }
}
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const scores=new Map();
let transitions=0;
for(const {league,stat,rows} of series.values()){
 const ordered=[...rows.values()].filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));
 const opportunity=league==='NBA'?g=>Number(g.minutes):g=>readOpportunity(g,stat);
 for(let i=5;i<ordered.length;i++){
  const target=ordered[i],past=ordered.slice(0,i).filter(g=>g.date<target.date),team=past.at(-1)?.teamID;
  if(!team||String(team)!==String(target.teamID)){transitions++;continue;}
  const current=past.filter(g=>g.seasonYear===target.seasonYear&&String(g.teamID)===String(team));
  if(!current.length) continue;
  const center=Math.floor(mean(current.slice(-5).map(g=>g.value)));
  const measured=current.filter(g=>Number.isFinite(opportunity(g))&&opportunity(g)>0);
  const recent=measured.slice(-3), workload=recent.length===3?mean(recent.map(opportunity)):null;
  const adjusted=workload!==null&&measured.length>=5?measured.map(g=>({...g,value:Math.round(g.value*workload/opportunity(g))})):null;
  for(const [type,line] of [['central',center+.5],['higher',center+.5+Math.max(1,Math.round(center*.2))]]){
   const q={stat,side:'over',line};
   const active=league==='NBA'?fitSeason(past,q,target.seasonYear,team):fitFootball(past,q,target.seasonYear,team);
   if(!active.available)continue;
   const shorter=fitSeason(past,q,target.seasonYear,team,{priorStrength:active.priorStrength?5:0,minimumPriorCombined:league==='NBA'?20:12});
   const scaled=adjusted?fitSeason(adjusted,q,target.seasonYear,team,{priorStrength:0}):null;
   for(const [variant,fit] of [['less-prior',shorter],['workload-scaled',scaled]]){
    if(!fit?.available)continue;
    const actual=Number(target.value>line),key=JSON.stringify([league,type,variant]);
    if(!scores.has(key))scores.set(key,{league,type,variant,n:0,active:0,challenger:0});
    const out=scores.get(key);out.n++;out.active+=(active.pWin-actual)**2;out.challenger+=(fit.pWin-actual)**2;
   }
  }
 }
}
console.log(JSON.stringify({series:series.size,transitionsExcluded:transitions,results:[...scores.values()].map(r=>({...r,active:r.active/r.n,challenger:r.challenger/r.n})),method:'Chronological box-score replay with synthetic thresholds based on earlier results. Paired Brier scores. No archived odds, injuries or projected workload assumed.'},null,2));
