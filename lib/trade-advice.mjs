const sum = players => players.reduce((total, player) => total + player.perAppearance, 0);
const names = players => players.map(player => player.name).join(' + ');
const signed = value => (value > 0 ? '+' : '') + value.toFixed(1);
const sources = players => [...new Set(players.flatMap(player => player.sources || []))].slice(0, 8);

export function tradeAdvice(yours, theirs, {rosterNeed = 'balanced', lineupPlan = 'best', replacementPoints = null} = {}) {
 if (!['balanced','RB','WR','TE','QB','G','F','C','depth','consolidate'].includes(rosterNeed) || !['best','all'].includes(lineupPlan)) {
  throw Object.assign(Error('Choose a supported roster need and lineup plan.'), {status:400});
 }
 const missing = [...yours, ...theirs].filter(player => !player.available);
 if (missing.length) {
  return {
   recommendation:'Hold off on this trade',
   summary:missing.map(player => player.name + ' has ' + (player.sample ?? 0) + ' of the three required verified scoring appearances').join('. ') + '.',
   reasons:[], conditions:[], evidence:[], scenarios:[], basis:'Incomplete scoring history', lineupDelta:null
  };
 }

 const send = [...yours].sort((a,b) => b.perAppearance - a.perAppearance);
 const receive = [...theirs].sort((a,b) => b.perAppearance - a.perAppearance);
 const slots = Math.min(send.length, receive.length);
 const spotDelta = send.length - receive.length;
 const scenario = (label, give, get, adjustment = 0) => ({
  label, give:names(give), receive:names(get), givePoints:sum(give), receivePoints:sum(get),
  adjustment, delta:sum(get) - sum(give) + adjustment
 });
 const starters = scenario('Equal starting slots', send.slice(0, slots), receive.slice(0, slots));
 const everyone = scenario('Every player starts', send, receive);
 const entered = replacementPoints === null || spotDelta === 0 ? null :
  scenario('Your roster replacement', send, receive, spotDelta * replacementPoints);
 const selected = entered || (lineupPlan === 'all' ? everyone : starters);
 const delta = selected.delta;
 const close = Math.abs(delta) < Math.max(1, starters.givePoints * .1);
 const direction = delta > .05 ? 'accept the trade' : 'keep your players';
 const format = value => value.toFixed(1);
 const evidence = [], conditions = [];
 const add = (kind, text, urls = []) => evidence.push({kind, text, sources:urls});
 const basis = entered
  ? 'Uses your entered ' + format(replacementPoints) + ' point value for each ' + (spotDelta > 0 ? 'added' : 'dropped') + ' roster player.'
  : lineupPlan === 'all' ? 'Assumes every player in the trade would start for you.'
  : 'Compares the best ' + (slots === 1 ? 'starter' : slots + ' starters') + ' on each side.';

 add('comparison', selected.receive + ' score ' + format(selected.receivePoints) + ' versus ' +
  format(selected.givePoints) + ' for ' + selected.give + ' per recorded appearance' +
  (entered ? ', with a ' + signed(entered.adjustment) + ' roster adjustment' : '') +
  '. The receiving side changes your scoring comparison by ' + signed(delta) + ' points.', sources([...send, ...receive]));

 if (spotDelta !== 0) {
  const threshold = everyone.delta / -spotDelta;
  if (threshold >= 0) {
   conditions.push(spotDelta < 0
    ? 'The deal breaks even if the player' + (spotDelta < -1 ? 's you drop average' : ' you drop averages') + ' ' + format(threshold) + ' points per appearance per spot. Above that, keeping your roster leads on combined scoring.'
    : 'The waiver replacement needs more than ' + format(threshold) + ' points per appearance per open spot for accepting to lead on combined scoring.');
  } else {
   conditions.push(spotDelta < 0
    ? names(receive) + ' trail on combined scoring even before accounting for a dropped player.'
    : names(receive) + ' lead on combined scoring before adding a waiver replacement.');
  }
 }

 const activeSend = selected === starters ? send.slice(0, slots) : send;
 const activeReceive = selected === starters ? receive.slice(0, slots) : receive;
 const activePlayers = [...activeSend, ...activeReceive];
 const scoringFields = Object.keys(activePlayers[0]?.components || {}).filter(stat =>
  activePlayers.every(player => Number.isFinite(player.components?.[stat]?.contribution)));
 const drivers = scoringFields.map(stat => {
  const contribution = players => players.reduce((total, player) => total + player.components[stat].contribution, 0);
  return {stat, gap:contribution(activeReceive) - contribution(activeSend)};
 }).sort((a,b) => Math.abs(b.gap) - Math.abs(a.gap));
 const driver = drivers[0];
 if (driver && Math.abs(driver.gap) >= .1) {
  const stat = ({passingyards:'passing yards',passingtd:'passing touchdowns',passinginterceptions:'interceptions thrown',
   rushingyards:'rushing yards',rushingtd:'rushing touchdowns',receivingyards:'receiving yards',
   receivingtd:'receiving touchdowns',receptions:'catches',fumbleslost:'fumbles lost'})[driver.stat] || driver.stat;
  add('driver', 'The largest scoring difference comes from ' + stat + '. That category contributes ' +
   signed(driver.gap) + ' fantasy points to the receiving side per appearance, before any roster replacement.', sources(activePlayers));
 }

 if (activePlayers.every(player => Number.isFinite(player.recent3))) {
  const recent = players => players.reduce((total, player) => total + player.recent3, 0);
  const recentDelta = recent(activeReceive) - recent(activeSend) + selected.adjustment;
  add('recent', 'Using the same players and their last three recorded appearances, the receiving side changes by ' +
   signed(recentDelta) + ' points versus ' + signed(delta) + ' across the full samples.' +
   (Math.abs(delta) >= .05 && Math.abs(recentDelta) >= .05 && Math.sign(delta) !== Math.sign(recentDelta) ? ' The shorter sample reverses the scoring lead.' : ''), sources(activePlayers));
 }

 const unavailable = [...send, ...receive].filter(player => player.availabilityReview);
 for (const player of unavailable) {
  const reports = player.injuries || [];
  conditions.unshift('Confirm ' + player.name + '’s availability. Latest matched status ' +
   (reports.map(report => report.status).join(', ') || 'requires review') + '.');
  add('availability', conditions[0], reports.map(report => report.source).filter(Boolean));
 }
 const smallSamples = activePlayers.filter(player => Number.isFinite(player.sample) && player.sample < 5);
 if (smallSamples.length) add('sample', 'The comparison relies on ' +
  smallSamples.map(player => player.name + ' (' + player.sample + ' verified appearances)').join(', ') + '.', sources(smallSamples));

 if (!['balanced','depth','consolidate'].includes(rosterNeed)) {
  const matches = players => players.filter(player => String(player.position || '').split(/[-/]/).includes(rosterNeed) ||
   (['G','F','C'].includes(rosterNeed) && String(player.position || '').includes(rosterNeed)));
  const added = matches(receive), removed = matches(send);
  conditions.push('You said you need ' + rosterNeed + ' help. This deal brings in ' + (names(added) || 'no player at that position') +
   ' and sends out ' + (names(removed) || 'no player at that position') + '.');
 } else if (rosterNeed === 'depth' && receive.length > slots) {
  conditions.push(names(receive.slice(slots)) + ' would add depth beyond the equal-slot comparison. Check which of your current players they would replace.');
 } else if (rosterNeed === 'consolidate' && send.length !== receive.length) {
  conditions.push('For consolidation, compare ' + send[0].name + ' at ' + format(send[0].perAppearance) +
   ' with ' + receive[0].name + ' at ' + format(receive[0].perAppearance) + ' points per appearance.');
 }

 const schedulePlayers = [...send, ...receive].filter(player => player.scheduleFresh && player.next21Days);
 if (schedulePlayers.length === send.length + receive.length) {
  add('schedule', 'Scheduled games over the next 21 days include ' +
   schedulePlayers.map(player => player.name + ' (' + player.next21Days.games + ')').join(', ') +
   '. This comparison assumes each listed game is played.', schedulePlayers.flatMap(player => (player.opponents || []).map(opponent => opponent.source)));
 }

 return {
  recommendation: unavailable.length ? 'Hold off until player availability is confirmed'
   : (close ? 'Slight lean' : 'Lean') + ': ' + direction,
  summary: unavailable.length ? 'Verify the listed status for ' + names(unavailable) + ' before weighing the scoring change.'
   : Math.abs(delta) < .05 ? 'The selected lineup comparison is essentially even.'
   : 'Your selected lineup changes by ' + signed(delta) + ' fantasy points per recorded appearance.',
  reasons:evidence.filter(item => ['comparison','driver','recent','sample'].includes(item.kind)).map(item => item.text),
  conditions, evidence, basis, lineupDelta:delta, combinedDelta:everyone.delta,
  scenarios:spotDelta === 0 ? [] : [starters, everyone, ...(entered ? [entered] : [])].map(row => ({...row, selected:row === selected}))
 };
}
