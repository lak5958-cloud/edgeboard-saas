// Presentation only. Sorting never promotes a Pass or changes a probability.
export const hitChance=p=>typeof p.experimentalProbability==='number'&&Number.isFinite(p.experimentalProbability)&&p.experimentalProbability>=0&&p.experimentalProbability<=1?p.experimentalProbability:null;
export const remainingChecks=p=>(p.checks||[]).filter(c=>c.status!=='pass');
export function rankDailyPicks(report,{sort='probability',status='all',minimum='0'}={}){
 const threshold=['0','0.6','0.7','0.8'].includes(String(minimum))?Number(minimum):0;
 const rows=[...(report.picks||[]).map(p=>({pick:p,watch:false})),...(report.watchlist||[]).map(p=>({pick:p,watch:true}))];
 const filtered=rows.filter(({pick:p,watch})=>
  (status==='leans'?!watch:status==='watchlist'?watch:status==='one-check'?watch&&remainingChecks(p).length===1:true)&&
  (threshold===0||hitChance(p)!==null&&hitChance(p)>=threshold));
 const score=x=>Number.isFinite(x)?x:-Infinity;
 if(sort==='research')return filtered;
 return filtered.sort((a,b)=>{
  const av=sort==='value'?score(a.pick.experimentalNet):score(hitChance(a.pick));
  const bv=sort==='value'?score(b.pick.experimentalNet):score(hitChance(b.pick));
  return (av===bv?0:av>bv?-1:1)||Number(a.watch)-Number(b.watch)||remainingChecks(a.pick).length-remainingChecks(b.pick).length||String(a.pick.player).localeCompare(String(b.pick.player));
 });
}
