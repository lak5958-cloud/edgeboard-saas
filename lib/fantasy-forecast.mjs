import {createHash} from 'node:crypto';

const dayMs = 86400000;
const windowDays = 45;
const appearanceLimit = 3;
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export function prepareFantasyForecast(trade) {
 const players = [];
 for (const [side, group] of [['send', trade.give], ['receive', trade.receive]]) {
  for (const player of group) {
   if (!player.id || !player.team || !player.available || !Number.isFinite(player.perAppearance) || !Number.isFinite(player.recent3)) return null;
   players.push({
    id:String(player.id), name:player.name, team:player.team, side, weights:player.weights,
    gamesUsed:player.sample, latestDate:player.latestDate,
    baseline:player.perAppearance, recentBlend:(player.perAppearance + player.recent3) / 2
   });
  }
 }
 const forecast = {version:1, league:trade.league, format:trade.format, players};
 const key = createHash('sha256').update(JSON.stringify({
  ...forecast, day:trade.generatedAt.slice(0,10), recommendation:trade.recommendation,
  lineupDelta:trade.advice.lineupDelta, basis:trade.advice.basis
 })).digest('hex');
 return {key, forecast};
}

export function gradeFantasyForecasts(saved, logs, now = new Date()) {
 const tracked = new Set(saved.flatMap(row => row.forecast.players.map(player => row.forecast.league + '|' + player.id)));
 const byPlayer = new Map();
 for (const log of logs) {
  const key = log.league + '|' + log.athleteID;
  const start = Date.parse(log.start);
  const observed = Date.parse(log.observedAt);
  if (!tracked.has(key) || !log.verifiedComplete || log.seasonType !== 'regular' || !log.gameID ||
    !/^https:\/\//.test(log.source || '') || !Number.isFinite(start) || !Number.isFinite(observed) ||
    start >= now.getTime() || observed < start || observed > now.getTime()) continue;
  if (!byPlayer.has(key)) byPlayer.set(key, []);
  byPlayer.get(key).push({...log,start});
 }

 return saved.map(row => {
  const captured = Date.parse(row.captured_at);
  const ends = captured + windowDays * dayMs;
  const {league,format} = row.forecast;
  const players = row.forecast.players.map(player => {
   const unique = new Map();
   const weights = Object.entries(player.weights).filter(([,weight]) => weight !== 0);
   for (const log of byPlayer.get(league + '|' + player.id) || []) {
    if (log.start <= captured || log.start > ends || !weights.every(([stat]) => Number.isFinite(log.stats?.[stat]))) continue;
    const actual = weights.reduce((sum,[stat,weight]) => sum + log.stats[stat] * weight, 0);
    const prior = unique.get(log.gameID);
    if (prior && (prior.actual !== actual || prior.team !== log.team || prior.start !== log.start)) {
     prior.conflict = true;
    } else if (!prior) {
     unique.set(log.gameID, {gameID:log.gameID, start:log.start, team:log.team, actual, source:log.source});
    }
   }
   const appearances = [...unique.values()].sort((a,b) => a.start - b.start || a.gameID.localeCompare(b.gameID)).slice(0,appearanceLimit);
   const games = appearances.filter(game => !game.conflict);
   const complete = games.length === appearanceLimit;
   return {
    ...player, games, status:complete ? 'Complete' : appearances.some(game => game.conflict) ? 'Conflicting result'
     : now.getTime() >= ends ? 'Window ended' : 'Pending',
    baselineError:average(games.map(game => Math.abs(game.actual - player.baseline))),
    recentBlendError:average(games.map(game => Math.abs(game.actual - player.recentBlend)))
   };
  });
  return {key:row.forecast_key,capturedAt:row.captured_at,league,format,players};
 });
}
