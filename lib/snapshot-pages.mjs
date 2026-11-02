import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
export function decodeSnapshot(bytes,info){
 if(info){if(bytes.length!==info.bytes||createHash('sha256').update(bytes).digest('hex')!==info.sha256)throw Error('Stored snapshot checksum mismatch.');}
 const raw=info?gunzipSync(bytes,{maxOutputLength:100*1024*1024}):bytes;
 if(info&&raw.length!==info.rawBytes)throw Error('Stored snapshot length mismatch.');
 return JSON.parse(raw.toString('utf8'));
}
export function pageRows(rows,cursor=0,{maxRows=150,byteBudget=2000000}={}){
 cursor=Number(cursor);if(!Number.isSafeInteger(cursor)||cursor<0||cursor>rows.length)throw Error('Invalid cursor.');
 const items=[];let bytes=2,i=cursor;for(;i<rows.length&&items.length<maxRows;i++){const size=Buffer.byteLength(JSON.stringify(rows[i]))+1;if(bytes+size>byteBudget){if(!items.length)throw Error('A source record exceeds the page limit.');break;}items.push(rows[i]);bytes+=size;}
 return {items,next:i<rows.length?String(i):null};
}
export function manifestEntry(manifest,file){const x=manifest?.files?.[file];if(!x)return null;if(!/^imports\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.json\.gz$/.test(x.path)||!Number.isSafeInteger(x.bytes)||!Number.isSafeInteger(x.rawBytes)||x.bytes<1||x.rawBytes<1||x.rawBytes>100*1024*1024||!/^[a-f0-9]{64}$/.test(x.sha256))throw Error('Invalid snapshot manifest.');return x;}
