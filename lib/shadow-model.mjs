export const SHADOW_VERSION='shrink-even-strength20-v1';
export const shadowSelectionKey=q=>JSON.stringify([q.eventID,q.player,q.stat,q.side,q.line,q.book]);
const probability=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
export function shadowForecast(model,quote,now=new Date()){
 if(!probability(model?.pWin)||!probability(model?.pPush)||model.pPush>=1||model.pWin+model.pPush>1+1e-9)return null;
 const n=model.season?.effectiveN??model.n;if(typeof n!=='number'||!Number.isFinite(n)||n<=0)return null;
 const weight=n/(n+20),conditional=model.pWin/(1-model.pPush),pWin=(1-model.pPush)*(.5+weight*(conditional-.5));
 return {version:SHADOW_VERSION,status:'shadow-only',createdAt:now.toISOString(),selectionKey:shadowSelectionKey(quote),activeWin:model.pWin,activePush:model.pPush,effectiveN:n,weight,pWin,pPush:model.pPush,pLoss:Math.max(0,1-pWin-model.pPush),method:'Fixed 20-outcome shrinkage toward a 50% non-push probability. Hypothesis only, not fitted calibration. Low estimates can increase; high estimates can decrease. Live recommendations are unchanged.'};
}
export function archivedShadow(pick,savedAt,start){
 const s=pick.shadow;if(!s||s.version!==SHADOW_VERSION||s.status!=='shadow-only'||!probability(s.pWin)||!probability(s.pPush)||!probability(s.pLoss)||Math.abs(s.pWin+s.pPush+s.pLoss-1)>1e-8||s.activeWin!==pick.experimentalProbability||!Number.isFinite(Date.parse(s.createdAt))||Date.parse(s.createdAt)>Date.parse(savedAt)||Date.parse(s.createdAt)>=start)return null;
 const q={...pick.quote,player:pick.player,stat:pick.stat,side:pick.side,line:pick.line,book:pick.book||pick.quote?.book};return s.selectionKey===shadowSelectionKey(q)?s:null;
}
