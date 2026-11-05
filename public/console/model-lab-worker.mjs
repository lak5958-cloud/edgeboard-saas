import {modelLab} from './model-lab.mjs';
self.onmessage=event=>{
 try{self.postMessage({report:modelLab(event.data)});}
 catch{self.postMessage({error:'Saved forecasts could not be compared. No incomplete model score was produced.'});}
};
