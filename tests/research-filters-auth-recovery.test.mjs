import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pageView} from '../public/views.mjs';
import {requestPasswordReset} from '../lib/auth.mjs';
const html=fs.readFileSync(new URL('../public/console/index.html',import.meta.url),'utf8');
const picks=fs.readFileSync(new URL('../public/console/picks-ui.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/console/app.mjs',import.meta.url),'utf8');
test('research filter lets users screen by sport-wide coverage, model chance, and American odds',()=>{
 for(const id of ['picksScope','picksMinimum','picksOddsMin','picksOddsMax','picksSort'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/value="-450"/);assert.match(html,/value="0.8"/);
 assert.match(picks,/input\.games/);
 assert.match(app,/games:data\.games/);
 assert.match(picks,/Number\.isFinite\(win\)/);
 assert.match(picks,/No research candidates matched/);
});
test('login includes recovery path; recovery rejects bad emails without contacting an auth provider',async()=>{
 const h=pageView('/login','NBA',{user:null,pro:false});
 assert.match(h,/id="resetPassword"/);
 assert.match(h,/id="resetStatus"/);
 await assert.rejects(requestPasswordReset('invalid'),/valid email/);
 const server=fs.readFileSync(new URL('../api/server.mjs',import.meta.url),'utf8');
 assert.match(server,/route==='auth\/reset'/);
});
test('pricing remains explicit that sandbox checkout is not a live payment',()=>{
 const h=pageView('/pricing','NFL',{user:null,pro:false});
 assert.match(h,/Stripe shows the charge and renewal terms/);
});

test('custom odds bounds are not silently overridden by legacy default odds band',()=>{
 assert.match(html,/<select id="picksPriceBand"><option value="any">/);
 assert.match(picks,/priceBand:\$\('picksPriceBand'\)\.value/);
 assert.match(picks,/pickVisualComparison/);
});
test('recovery completion requires a valid token and password before contacting Supabase',async()=>{
 const {completePasswordReset}=await import('../lib/auth.mjs');
 await assert.rejects(completePasswordReset('invalid','password123'),/invalid or expired/);
 await assert.rejects(completePasswordReset('x'.repeat(30),'short'),/at least eight/);
 const app=fs.readFileSync(new URL('../public/app.mjs',import.meta.url),'utf8');
 assert.match(app,/bindRecoveryCompletion/);
 assert.match(app,/history\.replaceState/);
 assert.match(pageView('/login','NBA',{user:null,pro:false}),/id="recoveryForm"/);
});
