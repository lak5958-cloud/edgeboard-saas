// Keys belong to exact selections, so open evidence never moves to another pick.
const detailKey=detail=>JSON.stringify([detail.closest('[data-refresh-key]')?.dataset.refreshKey||'',detail.querySelector('summary')?.textContent.trim()||'']);
export const isEditing=region=>{const active=region?.ownerDocument.activeElement;return !!(active&&region.contains(active)&&active.matches('input,select,textarea,[contenteditable="true"]'));};
export function replaceView(region,html,{preserve=false}={}){
 if(!region)return false;
 // Let the next poll update an actively edited directory rather than stealing focus.
 if(preserve&&isEditing(region))return false;
 const open=preserve?new Set([...region.querySelectorAll('details[open]')].map(detailKey)):new Set();
 if(region.innerHTML===html)return false;
 region.innerHTML=html;
 if(preserve)for(const detail of region.querySelectorAll('details'))detail.open=open.has(detailKey(detail));
 return true;
}
export function createRefreshTask(work){let pending=false;return async()=>{if(pending)return false;pending=true;try{await work();return true;}finally{pending=false;}};}
