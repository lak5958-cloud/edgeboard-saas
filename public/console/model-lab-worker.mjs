import {modelLab} from './model-lab.mjs';
self.onmessage=event=>{
 try{self.postMessage({report:Array.isArray(event.data) ? modelLab(event.data) : modelLab(event.data.audits, event.data.options)});}
 catch{self.postMessage({error:'Saved forecasts could not be compared. No incomplete model score was produced.'});}
};
