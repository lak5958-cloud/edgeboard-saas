import {gunzipSync} from 'node:zlib';
import {AppError, bundle, readSnapshotObject, snapshot} from './cloud.mjs';
import {auditFrozen} from './frozen-audit.mjs';
import {createFrozenGameAudit} from './frozen-game-audit.mjs';
import {selectFrozenSources, readFrozenSources} from './frozen-review.mjs';
import {frozenSources} from './frozen-sources.mjs';
import {auditDates, summarizeAudits} from './audit-summary.mjs';

export async function readPublishedAudit(index, day, scope, {
 records, teamGames, deadline = Infinity, read = readSnapshotObject
} = {}) {
 const gameScope = scope === 'games';
 let sources;
 try {
  sources = selectFrozenSources(index, !gameScope && day === '2026-11-02' ? frozenSources : [], day, {kind: gameScope ? 'games' : 'players'});
 } catch (error) {
  throw new AppError(503, error.message);
 }
 const gameAudit = gameScope ? createFrozenGameAudit({day}) : null;
 let retainedBytes = 0;
 const reports = await readFrozenSources(sources, async source => {
  const timeout = Math.min(15000, deadline - Date.now());
  if (timeout < 500) throw new AppError(503, 'Archive grading reached its time limit.');
  const bytes = await read(source.path, {timeout});
  if (!bytes || bytes.length > 5000000) throw new AppError(503, 'A retained forecast was missing or exceeded the compressed size limit.');
  let report;
  try {
   report = JSON.parse(gunzipSync(bytes, {maxOutputLength: gameScope ? 64000000 : 20000000}).toString());
  } catch {
   throw new AppError(503, 'A retained forecast could not be decoded within the archive size limit.');
  }
  if (gameAudit) {
   gameAudit.add({...source, report});
   return null;
  }
  const {generatedAt, modelVersion, byBook, leagues, evaluationCohort, tradeCohort, tradeDiagnostics} = report;
  const relevant = {generatedAt, modelVersion};
  if (scope === 'cohort') relevant.evaluationCohort = evaluationCohort;
  else if (scope === 'trade') Object.assign(relevant, {tradeCohort, tradeDiagnostics});
  else Object.assign(relevant, {byBook, leagues});
  retainedBytes += Buffer.byteLength(JSON.stringify(relevant));
  if (retainedBytes > 40000000) throw new AppError(503, 'This slate exceeds the review memory limit. No partial score was saved.');
  return relevant;
 }, {concurrency: gameScope ? 2 : 4});
 if (gameAudit) {
  const outcomes = teamGames ?? (await snapshot('team-history.json', {})).games ?? [];
  return {...gameAudit.finish(outcomes), coverage: sources.length + ' retained game-market snapshots.'};
 }
 const outcomes = records ?? (await bundle({includeHistory: true})).records;
 return {...auditFrozen(reports, outcomes, {day, scope}), coverage: sources.length + ' retained player-prop snapshots.'};
}

export const performanceFile = (day, scope) => 'performance-' + day + '-' + scope + '.json';

export function nextAuditTask(dates, progress, now = new Date()) {
 const candidates = dates.filter(date => date.completed).reverse().flatMap(({day, snapshots, gameSnapshots}) =>
  [['shortlist', snapshots], ['games', gameSnapshots], ['cohort', snapshots]]
   .filter(([, count]) => count > 0)
   .map(([scope, count]) => ({day, scope, count, file: performanceFile(day, scope)}))
 );
 const currentDay = now.toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
 const oldestRetry = new Date(Date.parse(currentDay + 'T12:00:00Z') - 7 * 86400000).toISOString().slice(0, 10);
 const eligible = candidates.filter(task => {
  const previous = progress[task.file];
  if (!previous) return true;
  const age = now - Date.parse(previous.checkedAt);
  if (previous.error) return age >= 24 * 3600000;
  if (previous.archiveCount !== task.count) return age >= 3600000;
  return task.day >= oldestRetry && age >= 24 * 3600000;
 });
 return eligible.find(task => !progress[task.file]) ?? eligible[0] ?? null;
}

export async function updatePickPerformance(data, deadline, now = new Date()) {
 const previous = await snapshot('performance-progress.json', {});
 if (now - Date.parse(previous.checkedAt) < 3600000) return null;
 const index = await snapshot('frozen-index.json', []);
 const task = nextAuditTask(auditDates(index, '2026-11-02', now), previous.items || {}, now);
 if (!task) return null;
 const checkedAt = now.toISOString();
 let report, grade;
 try {
  report = await readPublishedAudit(index, task.day, task.scope, {
   records: data.records, teamGames: data.context.teamGames || [], deadline
  });
  const {byLeague} = summarizeAudits([report]);
  grade = {checkedAt, archiveCount: task.count, day: task.day, scope: task.scope, byLeague};
 } catch (error) {
  grade = {checkedAt, archiveCount: task.count, day: task.day, scope: task.scope, error: error instanceof AppError ? error.message : 'Saved data could not be graded.'};
 }
 const progress = {checkedAt, items: {...previous.items, [task.file]: grade}};
 return {grade, updates: {
  'performance-progress.json': progress,
  ...(report ? {[task.file]: {...report, gradedAt: checkedAt}} : {})
 }};
}
