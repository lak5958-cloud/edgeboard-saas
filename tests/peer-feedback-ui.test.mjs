import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pageView,picksPage} from '../public/views.mjs';
import {atAGlanceFactors,pickCard} from '../public/picks-view.mjs';
import {rankDailyPicks} from '../public/pick-ranking.mjs';

const anon={user:null,pro:false};
test('new visitors see first steps, free paths, and help without buying',()=>{
 const h=pageView('/','NBA',anon);
 assert.match(h,/Your first three minutes on EdgeBoard/);
 assert.match(h,/href="\/fantasy"/);
 assert.match(h,/href="\/picks"/);
 assert.match(h,/href="\/help"/);
});
test('daily picks puts confidence and value controls upfront without treating Pass as a Lean',()=>{
 const h=picksPage('NBA');
 assert.match(h,/New here\? Start with these three steps/);
 assert.match(h,/Find picks by confidence or value/);
 assert.match(h,/Highest estimated hit chance/);
 assert.match(h,/Highest model value/);
 assert.match(h,/Watchlist selections remain Pass/);
 assert.ok(!h.includes('<details class="scoringDetails pickFilters">'));
});
test('first-pass pick factors only summarize supplied evidence and blockers',()=>{
 const p={player:'Tester',stat:'points',book:'draftkings',side:'over',line:18.5,odds:-150,experimentalProbability:.8,breakEven:.6,
   modelEvidence:{conditionalWin:.69},last5:{n:5,hits:3,pushes:0},checks:[]};
 const lean=atAGlanceFactors(p,false);
 assert.equal(lean.length,2);
 assert.match(lean[0],/69.0%/);
 assert.match(lean[1],/3 wins in 5/);
 const blocked={...p,checks:[{id:'quote',status:'fail',label:'Stale quote'}]};
 const watch=atAGlanceFactors(blocked,true);
 assert.match(watch.join(' '),/price is no longer current/i);
 assert.doesNotMatch(watch.join(' '),/69.0%/);
 assert.equal(rankDailyPicks({picks:[],watchlist:[blocked]},{sort:'probability'})[0].watch,true);
 assert.match(pickCard(blocked,true),/Top factors behind this Pass/);
});
test('help explains uncertain estimates and advanced research offers a beginner guide',()=>{
 const h=pageView('/help','NFL',anon);
 for(const p of [/difference between hit chance and best value/,/required win rate/,/high percentage still be a Pass/,/guarantee a monthly return/])assert.match(h,p);
 const consoleHTML=fs.readFileSync(new URL('../public/console/index.html',import.meta.url),'utf8');
 assert.match(consoleHTML,/New to Research\? How to read this screen/);
});
