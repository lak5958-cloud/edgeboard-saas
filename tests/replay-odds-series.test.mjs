import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

test('historical series uses strict cutoff and retains the valid quote when a later duplicate exists', () => {
 const root = mkdtempSync(join(tmpdir(), 'edgeboard-replay-'));
 try {
  const game = {eventID:'nba-1',league:'NBA',home:'BOS',away:'NYK',start:'2026-11-10T23:00:00Z'};
  const quote = {eventID:game.eventID,league:'NBA',book:'draftkings',kind:'Total',stat:'points',
   side:'over',line:225.5,odds:-110,periodID:'game',alt:false,available:true,
   asOf:'2026-11-10T21:55:00Z',observedAt:'2026-11-10T22:00:00Z'};
  const files = {
   'manifest.json': {holdoutFrom:'2026-11-10',slates:[{
    board:'board.json',evidence:'evidence.json',rosters:'rosters.json',
    teamHistory:'history.json',teamOutcomes:'finals.json'
   }]},
   'board.json': {generatedAt:quote.observedAt,games:[game],quotes:[
    quote,{...quote,asOf:'2026-11-10T22:03:00Z',observedAt:'2026-11-10T22:04:00Z'},
    {...quote,side:'under',observedAt:undefined}
   ]},
   'evidence.json': [],'rosters.json': [],'history.json': {games:[]},'finals.json': []
  };
  for (const [name, data] of Object.entries(files)) writeFileSync(join(root, name), JSON.stringify(data));
  const script = fileURLToPath(new URL('../scripts/replay-odds-series.mjs', import.meta.url));
  const result = JSON.parse(execFileSync(process.execPath, [script, join(root, 'manifest.json')], {encoding:'utf8'}));
  assert.equal(result.reports[0].pointInTimeVerified, true);
  assert.equal(result.reports[0].coverage.eligibleGameLines, 1);
  assert.equal(result.windows.holdout.games.scoredDates, 0);
 } finally {
  rmSync(root, {recursive:true,force:true});
 }
});
