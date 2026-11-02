// Read one immutable published version at a time; discard superseded navigation.
export function createWorkspaceReader(get){let serial=0,controller=null;
 return async function read({league,game='',knownVersion=null,force=false}={}){const id=++serial;controller?.abort();const active=new AbortController();controller=active;
  const call=async params=>{const result=await get('/api/research-workspace?'+new URLSearchParams(params),{signal:active.signal});if(id!==serial)throw Object.assign(Error('Superseded workspace read'),{name:'AbortError'});return result;};
  try{for(let attempt=0;attempt<2;attempt++){try{
   const meta=await call({part:'meta',league,...(game?{game}:{}),...(!force&&knownVersion&&attempt===0?{known:knownVersion}:{})});if(meta.unchanged)return meta;
   const scope={league,...(meta.scope.eventID?{eventID:meta.scope.eventID}:meta.scope.game?{game:meta.scope.game}:{}),version:meta.version};
   const pages=async part=>{const rows=[],seen=new Set();let cursor='0';do{if(seen.has(cursor)||seen.size>200)throw Error('Invalid workspace pagination.');seen.add(cursor);const p=await call({...scope,part,cursor});if(p.version!==meta.version||!Array.isArray(p.items))throw Object.assign(Error('Published version changed during pagination.'),{status:409});rows.push(...p.items);cursor=p.next;}while(cursor);return rows;};
   const [quotes,records]=await Promise.all([pages('quotes'),pages('records')]);return {...meta,board:{...meta.board,quotes},records};
  }catch(e){if(e.status!==409||attempt===1)throw e;}}
  }catch(e){if(e.name==='AbortError'||id!==serial)return null;active.abort();throw e;}
 };
}
