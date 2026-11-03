// Keep every indexed snapshot: hourly sampling can miss a selection that appears briefly.
export function selectFrozenSources(index,legacy,day,{limit=512}={}){
 const unique=new Map();
 for(const source of [...legacy,...index.filter(e=>e.kind==='players'&&e.slateDate===day)]){
  if(!/^imports\/refresh-[A-Za-z0-9-]+\/daily-picks\.json\.gz$/.test(source.path||'')||!Number.isFinite(Date.parse(source.savedAt)))throw Error('Invalid retained snapshot metadata. No audit was inferred.');
  const previous=unique.get(source.path);if(!previous||Date.parse(source.savedAt)<Date.parse(previous.savedAt))unique.set(source.path,source);
 }
 const sources=[...unique.values()].sort((a,b)=>Date.parse(a.savedAt)-Date.parse(b.savedAt)||a.path.localeCompare(b.path));
 if(sources.length>limit)throw Error('This date exceeds the retained snapshot review limit. No sampled or partial score is shown.');
 return sources;
}
export async function readFrozenSources(sources,read,{concurrency=4}={}){
 const reports=new Array(sources.length);let cursor=0,failed=false;
 await Promise.all(Array.from({length:Math.min(concurrency,sources.length)},async()=>{
  while(!failed&&cursor<sources.length){const i=cursor++;try{reports[i]={...sources[i],report:await read(sources[i])};}catch(e){failed=true;throw e;}}
 }));
 return reports;
}
