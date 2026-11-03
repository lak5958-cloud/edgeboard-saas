import {tradeReplayForecast} from '../lib/trade-replay.mjs';
// Offline retrospective research. All thresholds are generated from earlier box scores.
import fs from 'node:fs';
import {normalizeSeasonGame} from '../lib/seasons.mjs';
import {fitSeason} from '../lib/season-model.mjs';
import {fitFootball} from '../lib/football-model.mjs';
import {readOpportunity} from '../lib/opportunity.mjs';
import {teamCode} from '../lib/rosters.mjs';
import {verifiedFixtures} from '../lib/matchup-model.mjs';
import {normalizeStat} from '../lib/insights.mjs';

const paths=process.argv.slice(2);
const defenseArg=paths.findIndex(p=>p==='--team-history');
const teamPath=defenseArg>=0?paths.splice(defenseArg,2)[1]:null;
const teamRows=teamPath?JSON.parse(fs.readFileSync(teamPath,'utf8')).games:[];
const defenseCache=new Map();
function opponentAdjustment(target){
 if(!teamRows.length||!target.opponent)return null;
 let context=defenseCache.get(target.date);
 if(!context){
  const fixtures=verifiedFixtures(teamRows,'NBA',target.date).filter(g=>g.seasonYear===target.seasonYear);
  const allowed=new Map(),scores=[];
  for(const g of fixtures)for(const [team,value] of [[g.home,g.a],[g.away,g.h]]){
   if(!allowed.has(team))allowed.set(team,[]);
   allowed.get(team).push(value);scores.push(value);
  }
  context={allowed,baseline:scores.length>=40?mean(scores):null};
  defenseCache.set(target.date,context);
 }
 const recent=context.allowed.get(teamCode(target.opponent,'NBA'))?.slice(-10);
 if(!recent||recent.length<5||!(context.baseline>0))return null;
 // Shrink the opponent's observed scoring environment toward league average.
 return (recent.reduce((a,b)=>a+b,0)+10*context.baseline)/((recent.length+10)*context.baseline);
}
if(!paths.length) throw Error('Usage: node scripts/replay-workload.mjs evidence.json [more evidence files]');
const series=new Map();
for(const path of paths) for(const r of JSON.parse(fs.readFileSync(path,'utf8'))) {
 const id=r.athleteID||r.profile?.id;
 if(!id||!['NBA','NFL'].includes(r.league)||(r.periodID||'game')!=='game') continue;
 const key=JSON.stringify([r.league,id,normalizeStat(r.stat)]);
 if(!series.has(key)) series.set(key,{league:r.league,stat:r.stat,rows:new Map(),debutYear:null});
 const s=series.get(key);
 if(Number.isInteger(r.profile?.debutYear))s.debutYear=r.profile.debutYear;
 for(const raw of r.games||[]) {
  const g=normalizeSeasonGame(raw);
  if(g.seasonType!=='regular'||!g.teamID||!g.gameID||!g.date||!/^https:\/\//.test(g.source||'')||!Number.isFinite(g.value)) continue;
  const old=s.rows.get(g.gameID);
  if(old===null) continue;
  s.rows.set(g.gameID,old&&(old.value!==g.value||old.date!==g.date||String(old.teamID)!==String(g.teamID))?null:old||g);
 }
}
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const scores=new Map(),coverage=new Map(),tradeDays=new Map();
let transitions=0;
for(const {league,stat,rows,debutYear} of series.values()){
 const ordered=[...rows.values()].filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));
 const opportunity=league==='NBA'?g=>Number(g.minutes):g=>readOpportunity(g,stat);
 for(let i=5;i<ordered.length;i++){
  const target=ordered[i],past=ordered.slice(0,i).filter(g=>g.date<target.date),team=past.at(-1)?.teamID;
  const cohort=debutYear===target.seasonYear?'Recorded debut-year':past.some(g=>String(g.teamID)!==String(team))?'Prior team observed':debutYear===null?'Debut year unavailable':'Established, same observed team';
  const key=league+' | '+cohort;
  if(!coverage.has(key))coverage.set(key,{league,cohort,eligible:0,forecast:0,transitionExcluded:0});
  const count=coverage.get(key);
  if(!team||String(team)!==String(target.teamID)){transitions++;count.transitionExcluded++;continue;}
  count.eligible++;
  const current=past.filter(g=>g.seasonYear===target.seasonYear&&String(g.teamID)===String(team));
  if(!current.length) continue;
  const center=Math.floor(mean(current.slice(-5).map(g=>g.value)));
  const measured=current.filter(g=>Number.isFinite(opportunity(g))&&opportunity(g)>0);
  const recent=measured.slice(-3), workload=recent.length===3?mean(recent.map(opportunity)):null;
  const adjusted=workload!==null&&measured.length>=5?measured.map(g=>({...g,value:Math.round(g.value*workload/opportunity(g))})):null;
  const defense=league==='NBA'&&normalizeStat(stat)==='points'?opponentAdjustment(target):null;
  const defenseRows=defense===null?null:past.map(g=>({...g,value:Math.round(g.value*defense)}));
  for(const [type,line] of [['central',center+.5],['higher',center+.5+Math.max(1,Math.round(center*.2))]]){
   const q={stat,side:'over',line};
   const active=league==='NBA'?fitSeason(past,q,target.seasonYear,team):fitFootball(past,q,target.seasonYear,team);
   if(type==='central'&&current.length<=5){
    const trade=tradeReplayForecast(past,team,target.seasonYear,line);
    if(trade){
     const key=JSON.stringify([league,target.date]),actual=Number(target.value>line);
     if(!tradeDays.has(key))tradeDays.set(key,{league,day:target.date,n:0,withoutActive:0,currentError:0,oldError:0});
     const row=tradeDays.get(key);
     row.n++;
     row.withoutActive+=Number(!active.available);
     row.currentError+=(trade.currentOnly-actual)**2;
     row.oldError+=(trade.limitedOldTeam-actual)**2;
    }
   }
   if(!active.available)continue;
   if(type==='central')count.forecast++;
   const shorter=fitSeason(past,q,target.seasonYear,team,{priorStrength:active.priorStrength?5:0,minimumPriorCombined:league==='NBA'?20:12});
   const scaled=adjusted?fitSeason(adjusted,q,target.seasonYear,team,{priorStrength:0}):null;
   const opponent=defenseRows?fitSeason(defenseRows,q,target.seasonYear,team):null;
   for(const [variant,fit] of [['less-prior',shorter],['workload-scaled',scaled],['opponent-points-allowed',opponent]]){
    if(!fit?.available)continue;
    const actual=Number(target.value>line);
    for(const group of ['All',cohort]){
     const key=JSON.stringify([league,type,variant,group]);
     if(!scores.has(key))scores.set(key,{league,type,variant,group,n:0,active:0,challenger:0});
     const out=scores.get(key);out.n++;out.active+=(active.pWin-actual)**2;out.challenger+=(fit.pWin-actual)**2;
    }
   }
  }
 }
}
const tradeEvaluation=[];
for(const league of ['NBA','NFL']){
 const days=[...tradeDays.values()].filter(r=>r.league===league).sort((a,b)=>a.day.localeCompare(b.day));
 const split=Math.floor(days.length*.8);
 for(const [window,rows] of [['earlier',days.slice(0,split)],['latest 20% of dates',days.slice(split)]]){
  const n=rows.reduce((total,row)=>total+row.n,0);
  tradeEvaluation.push({league,window,first:rows[0]?.day??null,last:rows.at(-1)?.day??null,dates:rows.length,n,withoutActive:rows.reduce((total,row)=>total+row.withoutActive,0),dayEqualCurrentOnly:n?mean(rows.map(r=>r.currentError/r.n)):null,dayEqualLimitedOldTeam:n?mean(rows.map(r=>r.oldError/r.n)):null});
 }
}
console.log(JSON.stringify({tradeEvaluation,series:series.size,transitionsExcluded:transitions,coverage:[...coverage.values()],results:[...scores.values()].map(r=>({...r,active:r.active/r.n,challenger:r.challenger/r.n})),method:'Chronological box-score replay with synthetic thresholds based on earlier results. Paired Brier scores. No archived odds, injuries or projected workload assumed. Optional NBA points-allowed challenger uses earlier verified team scores and the scheduled opponent.'},null,2));
