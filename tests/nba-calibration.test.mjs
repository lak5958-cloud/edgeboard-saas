import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIVE_PROP_VERSION, nbaCalibration, archivedNbaCalibration} from '../lib/nba-calibration.mjs';

test('NBA calibration binds to the exact pregame selection and active inputs',()=>{
 const quote={league:'NBA',eventID:'game',book:'draftkings',player:'Player',stat:'rebounds',side:'over',line:8,asOf:'2026-11-16T20:00:00Z'};
 const game={start:'2026-11-16T23:00:00Z'};
 const model={pWin:.7,pPush:.1};
 const now=new Date('2026-11-16T22:10:00Z');
 const saved=nbaCalibration(model,quote,game,ACTIVE_PROP_VERSION,now);
 assert.ok(saved.probability>.5&&saved.probability<model.pWin/(1-model.pPush));
 const pick={game,quote,asOf:quote.asOf,experimentalProbability:model.pWin,modelEvidence:{pPush:model.pPush},nbaCalibration:saved};
 assert.equal(archivedNbaCalibration(pick,ACTIVE_PROP_VERSION,now.toISOString()),saved);
 assert.equal(archivedNbaCalibration({...pick,quote:{...quote,line:8.5}},ACTIVE_PROP_VERSION,now.toISOString()),null);
 assert.equal(archivedNbaCalibration(pick,ACTIVE_PROP_VERSION,quote.asOf),null);
 assert.equal(nbaCalibration(model,{...quote,league:'NFL'},game,ACTIVE_PROP_VERSION,now),null);
 assert.equal(nbaCalibration(model,quote,game,'other',now),null);
 assert.equal(nbaCalibration(model,quote,game,ACTIVE_PROP_VERSION,new Date(game.start)),null);
});
