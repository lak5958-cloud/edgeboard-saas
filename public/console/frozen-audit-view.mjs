import {statLabel} from './markets.mjs';
import {summarizeAudits} from './audit-summary.mjs';
import {auditSummaryView} from './audit-summary-view.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),pct=x=>Number.isFinite(x)?(100*x).toFixed(1)+'%':'unavailable';
function captureView(d){
 if(!d)return '';
 if(!d.instrumented)return '<p>Capture diagnostics are unavailable for these older snapshots.</p>';
 if(!d.groups.length)return '<p>No NBA game and sportsbook scan was recorded for this date.</p>';
 return `<details open><summary>Pregame capture status</summary><ul>${d.groups.map(g=>{
  const b=g.best;
  const status=!g.windowChecks?'No scan reached the 60–45 minute window':!g.retainedWindowChecks?'Scanned in the window, but storage finished outside it':b.captured?'Forecasts captured':!b.quotes?'No sportsbook quotes in the window':!b.examined?'No quote reached the history and roster check':'No player and line met the trade trial requirements';
  return `<li><b>${esc(g.game)} · ${esc(g.book)}</b> — ${esc(status)}.${b?` Quotes ${b.quotes}. Reached history check ${b.examined}. Eligible ${b.eligible}. Captured ${b.captured}. Scan exclusions: ${b.historyMissing} missing history, ${b.rosterConflict} roster conflicts, ${b.staleOrClosed} stale or closed, ${b.unavailable} unavailable. Trial exclusions: ${b.trialExclusions?.rosterUnverified||0} unverified roster, ${b.trialExclusions?.currentTeamHistory||0} current-team history, ${b.trialExclusions?.oldTeamHistory||0} old-team history, ${b.trialExclusions?.unsupportedLine||0} unsupported line.`:''}</li>`;
 }).join('')}</ul><p>Counts describe the most informative saved scan for each game and sportsbook.</p></details>`;
}
function pregameEvidence(c){
 if(!c)return '';
 const link=(url,label)=>/^https:\/\//.test(url||'')?` <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:'';
 const injury=c.availability,lineup=c.lineup;
 return `<br>Pregame evidence saved ${esc(c.capturedAt)} · ${injury?esc(injury.status)+(injury.fresh?'':' (older listing)')+link(injury.url,'Injury source'):'Availability unconfirmed'} · ${lineup?'Confirmed lineup role: '+esc(lineup.role)+link(lineup.url,'Lineup source'):'Confirmed lineup unavailable'} · ${(c.teammateReports||[]).length} sourced teammate injury listings`;
}
export function frozenAuditView(r){
 return `<p>${r.settled} settled selections; ${r.unsettled} awaiting an unambiguous verified result.</p><p>${esc(r.coverage)}</p>${captureView(r.captureDiagnostics)}<details><summary>Archive exclusions</summary><ul>${Object.entries(r.excluded||{}).map(([key,n])=>`<li>${esc(({notPregame:'Not eligible as a frozen pregame forecast',noIdentity:'Missing or conflicting athlete identity',invalidProbability:'Invalid saved win probability',unsupportedPeriod:'Period missing or not full game',invalidSelection:'Missing or conflicting market identity'})[key]||key)}: ${n}</li>`).join('')}</ul><p>Counts can include the same row in multiple snapshots. Excluded forecasts are never treated as losses.</p></details>${auditSummaryView(summarizeAudits([r]))}<details><summary>Frozen picks and outcomes</summary>${r.results.map(p=>`<p><b>${esc(p.player)}</b> · ${esc(p.side)} ${esc(p.line)} ${esc(statLabel(p.stat,p.league))} · ${pct(p.probability)} original win estimate · ${pct(p.scoringProbability)} among non-push outcomes · ${Number.isFinite(p.shadowProbability)?pct(p.shadowProbability)+' shadow (non-push)':'no pregame shadow saved'} → ${esc(p.outcome)}${p.actual!==null?' (observed '+esc(p.actual)+')':''}<br>${p.tradeEvidence?`New-team only ${pct(p.tradeEvidence.currentOnly)} · Active ${pct(p.tradeEvidence.active)} · No-vig ${pct(p.marketProbability)}<br>${p.tradeEvidence.currentN} new-team games · ${p.tradeEvidence.oldN} old-team games${/^https:\/\//.test(p.tradeEvidence.roster?.url||'')?` · <a href="${esc(p.tradeEvidence.roster.url)}" target="_blank" rel="noopener noreferrer">Roster source ↗</a>`:''}<br>`:''}${esc(p.settlementReason)}${pregameEvidence(p.pregameContext)}${p.scoreReason?' · '+esc(p.scoreReason):''}<br>Frozen ${esc(p.frozenAt)} · ${esc(p.modelVersion)}${/^https:\/\//.test(p.source||'')?` · <a href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">Verified result source ↗</a>`:''}</p>`).join('')}</details><p>${esc(r.method)}</p>`;
}
