export function appendFrozenIndex(prior,entries){
 const map=new Map((Array.isArray(prior)?prior:[]).map(e=>[e.path,e]));
 for(const e of entries){if(!/^imports\/refresh-[A-Za-z0-9-]+\/(daily-picks|daily-game-markets)\.json\.gz$/.test(e.path)||!Number.isFinite(Date.parse(e.savedAt))||!/^\d{4}-\d{2}-\d{2}$/.test(e.slateDate))throw Error('Invalid frozen snapshot index entry');if(!map.has(e.path))map.set(e.path,e);}
 return [...map.values()].sort((a,b)=>Date.parse(a.savedAt)-Date.parse(b.savedAt)).slice(-20000);
}
