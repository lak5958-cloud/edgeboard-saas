import test from 'node:test';import assert from 'node:assert/strict';import {tradeEvidence,groundedBrief} from '../lib/ai-evidence.mjs';
const trade={recommendation:'Close trade',give:[{name:'Synthetic Player',team:'A',sample:5,perAppearance:12.34,sources:['https://example.org/test'],risks:['Limited sample'],scheduleFresh:false}],receive:[],risks:['Not validated']};
test('AI brief renders numerical statements only from computed evidence',()=>{const e=tradeEvidence(trade),b=groundedBrief(e,{summary:[e.facts[0].id],roster_fit:[e.facts[1].id],uncertainty:[e.risks[0].id]});assert.match(b.summary,/Close trade/);assert.match(b.roster_fit,/12.3/);assert.equal(trade.recommendation,'Close trade')});
test('invented IDs, free text, duplicated evidence, risk/fact swaps and extra fields fail closed',()=>{const e=tradeEvidence(trade),valid={summary:['e1'],roster_fit:['e2'],uncertainty:['e3']};for(const patch of [{summary:['invented']},{summary:['Guaranteed winner']},{summary:['e1','e1']},{uncertainty:['e1']},{prediction:.99}])assert.throws(()=>groundedBrief(e,{...valid,...patch}),/evidence/)});

test('fallback uses only verified evidence when model selection is unusable',async()=>{
 const {defaultBriefSelection}=await import('../lib/ai-evidence.mjs');
 const evidence=tradeEvidence(trade,{pro:true});
 const result=groundedBrief(evidence,defaultBriefSelection(evidence),{withSources:true});
 assert.match(result.brief.summary,/Close trade/);
 assert.match(result.brief.roster_fit,/12.3/);
 assert.ok(result.briefSources.roster_fit.includes('https://example.org/test'));
});
