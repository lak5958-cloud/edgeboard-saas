import test from 'node:test';import assert from 'node:assert/strict';import {tradeAdvice} from '../lib/trade-advice.mjs';import {avatar,tradeResult} from '../public/trade-view.mjs';
const p=(name,value,position='RB')=>({name,perAppearance:value,available:true,position});
test('two-for-one protects a stronger starter by default and gives a conditional depth answer',()=>{const r=tradeAdvice([p('Synthetic Star',27.9)],[p('Synthetic One',17.7),p('Synthetic Two',11.5)],{league:'NFL'});assert.match(r.recommendation,/keep/);assert(Math.abs(r.lineupDelta+10.2)<1e-8);assert(r.conditions.some(x=>x.includes('1.3')));assert(!r.recommendation.includes('context'));const both=tradeAdvice([p('Synthetic Star',27.9)],[p('Synthetic One',17.7),p('Synthetic Two',11.5)],{league:'NFL',lineupPlan:'all'});assert.match(both.recommendation,/accept/)});
test('user replacement value can reverse a two-for-one and remains an explicit assumption',()=>{const r=tradeAdvice([p('A',27.9)],[p('B',17.7),p('C',11.5)],{replacementPoints:10});assert.match(r.recommendation,/keep/);assert.match(r.basis,/entered/);assert(Math.abs(r.lineupDelta+8.7)<1e-8)});
test('positional need adds relevant advice without inventing numerical bonuses',()=>{const a=[p('A',15,'RB')],b=[p('B',16,'WR')];const x=tradeAdvice(a,b,{rosterNeed:'WR'}),y=tradeAdvice(a,b,{});assert.equal(x.lineupDelta,y.lineupDelta);assert(x.conditions.some(s=>s.includes('need WR help')));assert.throws(()=>tradeAdvice(a,b,{lineupPlan:'invented'}));});
test('missing data and injuries produce actionable holds without fabricated points',()=>{assert.match(tradeAdvice([{...p('A',null),available:false}],[p('B',10)]).recommendation,/Hold/);assert.match(tradeAdvice([p('A',15)],[{...p('B',18),availabilityReview:true}]).recommendation,/availability/)});
test('portraits use only trusted player IDs/host and names cannot inject markup',()=>{assert.match(avatar({name:'<script>',headshot:'javascript:bad'}),/&lt;/);assert(!avatar({name:'A',headshot:'https://evil.example/a.png'}).includes('<img'));assert(avatar({name:'A',headshot:'https://a.espncdn.com/i/headshots/nfl/players/full/123.png'}).includes('<img'));});

test('exact starter scenarios and scoring drivers explain a reversal without invented projections',()=>{
 const make=(name,perAppearance,recent3,contribution)=>({...p(name,perAppearance),recent3,sample:6,components:{rushingyards:{contribution}},sources:['https://example.com/'+name]});
 const r=tradeAdvice([make('Starter',20,10,12)],[make('Incoming',15,18,6),make('Depth',9,8,3)]);
 assert.deepEqual(r.scenarios.map(x=>[x.delta,x.selected]),[[-5,true],[4,false]]);
 assert.ok(r.evidence.some(x=>x.kind==='driver'&&x.text.includes('-6.0')));
 assert.ok(r.evidence.some(x=>x.kind==='recent'&&x.text.includes('reverses')));
});
