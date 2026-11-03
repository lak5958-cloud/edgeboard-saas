// One bounded request. Mutations are never automatically retried.
export async function requestJson(url,{timeoutMs=45000,signal,fetcher=fetch,...options}={}){
 const controller=new AbortController();let timedOut=false;
 const abort=()=>controller.abort(signal?.reason);
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
 try{
  const response=await fetcher(url,{cache:'no-store',...options,signal:controller.signal});
  let result;try{result=await response.json();}catch(error){if(controller.signal.aborted)throw error;throw Error('The server returned an unreadable response. Please try again.');}
  if(!response.ok)throw Object.assign(Error(result?.error||'The request could not finish. Please try again.'),{status:response.status});
  return result;
 }catch(error){if(timedOut)throw Object.assign(Error('This update took too long. Your previous view is retained; please try again.'),{name:'TimeoutError'});throw error;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
