import {scanGamePicks} from './picks.mjs';
self.onmessage=async event=>{const {id,input}=event.data;try{const result=await scanGamePicks(input,{progress:p=>self.postMessage({id,type:'progress',progress:p})});self.postMessage({id,type:'result',result});}catch(e){self.postMessage({id,type:'error',error:e.message||'Game scan failed.'});}};
