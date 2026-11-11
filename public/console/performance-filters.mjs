import {statLabel} from './markets.mjs';

export function candidateAgreement(row) {
 const price = row.quotedPriceProbability;
 const candidates = (row.researchCandidates?.models || []).filter(model =>
  Number.isFinite(model.pWin) && Number.isFinite(model.pLoss) && model.pWin + model.pLoss > 0
 );
 if (!Number.isFinite(price) || !candidates.length) return {status: 'unavailable', agreeing: 0, total: 0};
 const agreeing = candidates.filter(model => model.pWin / (model.pWin + model.pLoss) > price).length;
 return {status: agreeing === candidates.length ? 'all' : agreeing ? 'mixed' : 'none', agreeing, total: candidates.length};
}

export function filterPerformance(audits, {decision = 'all', agreement = 'all-states', minimum = 0} = {}) {
 return audits.map(audit => ({...audit, results: audit.results.filter(row =>
  (decision === 'all' || String(row.label).toUpperCase() === decision) &&
  (agreement === 'all-states' || candidateAgreement(row).status === agreement) &&
  (minimum === 0 || Number.isFinite(row.scoringProbability) && row.scoringProbability >= minimum)
 )}));
}

const escape = value => String(value ?? '—').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
const pct = value => Number.isFinite(value) ? (value * 100).toFixed(1) + '%' : '—';
const stamp = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('en-US', {timeZone:'America/New_York', dateStyle:'short', timeStyle:'short'}) + ' ET' : '—';

export function performanceLedger(audits, page = 0, pageSize = 25) {
 const rows = audits.flatMap(audit => audit.results.map(row => ({...row, day: audit.day})))
  .sort((a,b) => String(b.frozenAt).localeCompare(String(a.frozenAt)));
 const start = page * pageSize;
 const body = rows.slice(start, start + pageSize).map(row => {
  const agreement = candidateAgreement(row);
  const source = /^https:\/\//.test(row.source || '') ? '<a href="' + escape(row.source) + '" target="_blank" rel="noopener noreferrer">Source</a>' : '';
  const price = Number.isFinite(row.odds) && row.odds > 0 ? '+' + row.odds : row.odds;
  const selection = [row.player, row.selectionTeam, statLabel(row.stat), row.side, row.line].filter(value => value != null && value !== '').join(' · ');
  return '<tr><td>' + escape(row.league) + '<br>' + escape(stamp(row.frozenAt)) + '</td><td>' + escape(selection) + '</td><td>' +
   escape(({draftkings:'DraftKings', fanduel:'FanDuel'})[row.book] || row.book) + '<br>' + escape(price) + '</td><td>' +
   escape(row.label) + '</td><td>' + pct(row.scoringProbability) + '</td><td>' + (agreement.total ? agreement.agreeing + ' / ' + agreement.total : '—') +
   '</td><td>' + escape(row.outcome === 'unsettled' ? 'Pending' : row.outcome) + ' · ' + escape(row.actual) + ' ' + source + '</td></tr>';
 }).join('');
 return {total: rows.length, html: rows.length ?
  '<p>Showing ' + (start+1) + '–' + Math.min(start+pageSize, rows.length) + ' of ' + rows.length + ' recorded selections.</p>' +
  '<div class="evaluationTable"><table><thead><tr><th>League / saved</th><th>Exact selection</th><th>Book / odds</th><th>Decision</th><th>Non-push win estimate</th><th>Candidates agreeing</th><th>Outcome / actual</th></tr></thead><tbody>' + body + '</tbody></table></div>' :
  '<p>No archived selections match these filters.</p>'};
}
