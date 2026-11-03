import test from 'node:test';
import assert from 'node:assert/strict';
import {auditFrozen} from '../lib/frozen-audit.mjs';
import {summarizeAudits} from '../lib/audit-summary.mjs';
import {selectFrozenSources,readFrozenSources} from '../lib/frozen-review.mjs';
import {frozenAuditView} from '../public/console/frozen-audit-view.mjs';
const now=new Date('2026-11-03T16:00Z'),q={league:'NBA',eventID:'event',kind:'Player Prop',periodID:'game',athleteID:'7',book:'draftkings',stat:'points',side:'over',line:20.5,odds:110};
const pick={quote:q,player:'Synthetic',game:{start:'2026-11-03T00:00Z'},asOf:'2026-11-02T20:00Z',experimentalProbability:.7,stat:'points',side:'over',line:20.5,odds:110,label:'LEAN',modelEvidence:{pPush:0}};
const source=(p=pick,savedAt='2026-11-02T20:01Z')=>({report:{modelVersion:'test-v1',byBook:{draftkings:{leagues:{NBA:{picks:[p]}}}}},savedAt,path:'imports/refresh-test/daily-picks.json.gz'});
const record=(patch={},g={})=>({league:'NBA',athleteID:'7',subject:'Synthetic',stat:'points',periodID:'game',games:[{date:'2026-11-03',gameID:'game-7',seasonType:'regular',value:25,source:'https://example.org/result',...g}],...patch});
const audit=(p=pick,records=[record()],sources=[source(p)])=>auditFrozen(sources,records,{day:'2026-11-02',now});
test('full-game archives cannot settle from quarter totals, raw period overrides or another athlete',()=>{
 assert.equal(audit(pick,[record({periodID:'1q'})]).unsettled,1);
 assert.equal(audit(pick,[record({}, {periodID:'1q'})]).unsettled,1);
 assert.equal(audit(pick,[record({}, {athleteID:'8'})]).unsettled,1);
 assert.equal(audit({...pick,quote:{...q,periodID:'1q'}}).excluded.unsupportedPeriod,1);
 assert.equal(audit({...pick,quote:{...q,periodID:undefined}}).excluded.unsupportedPeriod,1);
 assert.equal(audit(pick,[record({periodID:'1q'}, {value:2}),record()]).results[0].actual,25);
});
test('conditional calibration bins and Brier use the same probability; invalid mass stays unscored',()=>{
 const integer={...pick,line:20,quote:{...q,line:20},experimentalProbability:.4,modelEvidence:{pPush:.5}},r=audit(integer);
 assert.equal(r.results[0].scoringProbability,.8);assert(Math.abs(r.brier-.04)<1e-9);assert.equal(r.bins[4].n,1);assert.equal(r.bins[2].n,0);
 for(const push of [.8,1,-.1,'0']){
  const broken=audit({...integer,modelEvidence:{pPush:push}});assert.equal(broken.settled,1);assert.equal(broken.scored,0);assert.equal(broken.results[0].scoringProbability,null);
 }
 const missing=audit({...integer,modelEvidence:{}});assert.equal(missing.scored,0);
 assert.equal(summarizeAudits([r]).bins[4].predicted,.8);
});
test('conflicting IDs, inconsistent quoted selection fields and future frozen times cannot be used',()=>{
 assert.equal(audit({...pick,headshot:'https://example.org/full/8.png'}).excluded.noIdentity,1);
 for(const patch of [{side:'under'},{line:21.5},{stat:'assists'},{book:'fanduel'},{odds:-110}])assert.equal(audit({...pick,quote:{...q,...patch}}).excluded.invalidSelection,1);
 assert.equal(audit(pick,[record()],[source(pick,'2026-11-04T00:00Z')]).excluded.notPregame,1);
});
test('earliest exact selection survives aliases, later label changes and repeated archives unchanged',()=>{
 const late={...pick,stat:'pts',quote:{...q,stat:'pts'},label:'PASS',experimentalProbability:.2},sources=[source(late,'2026-11-02T21:00Z'),source()],records=[record()],before=JSON.stringify({sources,records});
 const r=audit(pick,records,sources);assert.equal(r.results.length,1);assert.equal(r.results[0].probability,.7);assert.equal(r.results[0].label,'LEAN');assert.equal(r.results[0].modelVersion,'test-v1');assert.equal(JSON.stringify({sources,records}),before);
});
test('settlement gaps explain missing, unsafe and conflicting results without turning them into losses',()=>{
 const missing=audit(pick,[]);assert.match(missing.results[0].settlementReason,/No matching full-game/);
 const bad=audit(pick,[record({}, {source:'javascript:bad'})]);assert.match(bad.results[0].settlementReason,/unverified/);
 const conflict=audit(pick,[record(),record({}, {value:5})]);assert.match(conflict.results[0].settlementReason,/Conflicting/);assert.equal(conflict.results[0].actual,null);
 const summary=summarizeAudits([conflict]);assert.equal(summary.overall.losses,0);assert.equal(summary.gaps[0].n,1);
});
test('original-price comparison is paired only on valid saved odds and scored non-push outcomes',()=>{
 const a=audit(),b=audit({...pick,odds:null,quote:{...q,odds:null}}),s=summarizeAudits([{...a,results:[...a.results,...b.results]}]);
 assert.equal(s.overall.scored,2);assert.equal(s.overall.quotedPricePaired,1);assert(Math.abs(s.overall.quotedPriceBrier-(1-100/210)**2)<1e-9);assert(Math.abs(s.overall.pricePairedActiveBrier-.09)<1e-9);
 assert.equal(s.byModel[0].group,'test-v1');assert.equal(s.byStatistic[0].group,'points');
});
test('all retained intrahour snapshots are read and duplicate paths removed; overflow fails explicitly',()=>{
 const sources=['20:01','20:10','20:20'].map((time,i)=>({kind:'players',slateDate:'2026-11-02',savedAt:`2026-11-02T${time}Z`,path:`imports/refresh-${i}/daily-picks.json.gz`}));
 const r=selectFrozenSources([...sources,sources[0]],[], '2026-11-02');assert.equal(r.length,3);assert.deepEqual(r.map(s=>s.path),sources.map(s=>s.path));assert.throws(()=>selectFrozenSources(sources,[],'2026-11-02',{limit:2}),/No sampled or partial score/);
 assert.throws(()=>selectFrozenSources([{...sources[0],path:'../../private'}],[],'2026-11-02'),/Invalid retained/);
});
test('bounded archive reads retain order and never return a partial success after a failed read',async()=>{
 let active=0,max=0;const sources=Array.from({length:9},(_,id)=>({id}));
 const results=await readFrozenSources(sources,async s=>{active++;max=Math.max(max,active);await Promise.resolve();active--;return {id:s.id};},{concurrency:3});
 assert(max<=3);assert.deepEqual(results.map(r=>r.report.id),sources.map(s=>s.id));
 await assert.rejects(readFrozenSources(sources,async s=>{if(s.id===3)throw Error('source unreadable');return s;}),/source unreadable/);
});
test('audit UI explains counts, sources and gaps in readable language and escapes archived content',()=>{
 const r=audit({...pick,player:'<script>alert(1)</script>'}),html=frozenAuditView({...r,coverage:'All test snapshots'});
 assert.match(html,/Archive exclusions/);assert.match(html,/Verified result source/);assert.match(html,/original sportsbook price/);assert.match(html,/not a no-vig/);assert(!html.includes('<script>'));assert.match(html,/Model versions/);
});
