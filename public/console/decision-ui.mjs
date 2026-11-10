const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=x=>typeof x==='number'&&Number.isFinite(x)?(100*x).toFixed(1)+'%':'—';
export function decisionReadback(decision,breakEven,lower){
 const checks=decision?.checks||[];
 const byID=id=>checks.find(c=>c.id===id);
 const priceText=Number.isFinite(decision?.conditionalWin)&&Number.isFinite(breakEven)
  ? `The model estimates ${pct(decision.conditionalWin)} wins among non-push outcomes. This price needs ${pct(breakEven)} to break even.`
  : '';
 const sampleText=Number.isFinite(lower)&&Number.isFinite(breakEven)
  ? `The cautious historical estimate is ${pct(lower)}, ${lower>breakEven?'above':lower===breakEven?'equal to':'below'} break-even.`
  : '';
 if(decision?.label==='LEAN'){
  const history=[byID('current'),byID('replay')].filter(c=>c?.status==='pass').map(c=>c.detail.split('. ')[0]+'.').join(' ');
  return ['Lean at this price. '+(priceText||'The price and evidence cleared the research checks.'),sampleText,history,'The forecast is experimental.'].filter(Boolean).join(' ');
 }
 const blockers=decision?.blockers||checks.filter(c=>['fail','unknown'].includes(c.status));
 const priority=['quote','availability','price','forecast','matchup','return','bound','current','replay','push'];
 const first=priority.map(id=>blockers.find(c=>c.id===id)).find(Boolean)||blockers[0];
 const reasons={
  quote:'The exact price could not be verified as current.',
  availability:'A player availability report blocks this pick.',
  price:'A valid exact price is missing.',
  forecast:'There is too little verified evidence for a supported forecast.',
  matchup:'The game-market model still needs independent validation.',
  return:'The model does not show a positive return at this price.',
  bound:'The cautious historical estimate must be above break-even.',
  current:'There are too few verified games with the current team.',
  replay:'There are too few earlier games to test the forecast.',
  push:'The current rules require a line with zero estimated chance of a push.'
 };
 if(!first)return 'Pass. The available evidence does not support a Lean at this price.';
 const detail=first.id==='bound'&&sampleText?sampleText:first.id==='return'&&priceText?priceText:first.detail;
 const others=blockers.length>1?`${blockers.length-1} other ${blockers.length===2?'check also needs':'checks also need'} attention. See all checks below.`:'';
 return ['Pass at this price. '+(reasons[first.id]||first.label+'.'),detail,others].filter(Boolean).join(' ');
}
export function renderDecisionChecks(decision,{compact=false}={}){
 if(!decision?.checks)return '<p>No recommendation checks available for this selection.</p>';
 const failed=decision.blockers||[],title=failed.length?`${failed.length} unmet or unverified Lean requirement${failed.length===1?'':'s'}`:'All experimental Lean requirements met';
 const rows=decision.checks.filter(c=>!compact||['fail','unknown'].includes(c.status));
 return `<section class="decisionChecks"><h4>${esc(title)}</h4>${rows.length?`<ul>${rows.map(c=>`<li class="gate-${esc(c.status)}"><b>${esc(({pass:'MET',fail:'BLOCKED',unknown:'UNVERIFIED','not-applicable':'N/A'})[c.status]||c.status)} · ${esc(c.label)}</b><p>${esc(c.detail)}</p>${c.status!=='pass'&&c.status!=='not-applicable'&&c.action?`<p class="micro">Next: ${esc(c.action)}</p>`:''}</li>`).join('')}</ul>`:''}<p class="micro">${esc(decision.takePolicy)}</p></section>`;
}
export function renderValidationProgress(report={},error=''){
 if(error)return `<section class="validationProgress"><h4>Frozen pregame evaluation</h4><p>Report could not be loaded: ${esc(error)}. Saved evaluation counts are unverified; retry Reload saved after refresh.</p></section>`;
 if(!report?.generatedAt)return '<section class="validationProgress"><h4>Frozen pregame evaluation</h4><p>No saved evaluation report is available yet. Complete Refresh now, then Reload saved. Pregame forecasts are archived during refresh; later verified game logs provide provisional outcomes.</p><p class="micro">Automatic Take remains disabled. No validation progress is inferred from current hit rates.</p></section>';
 const n=report.n??0,pending=report.skipReasons?.pendingOutcome??0;
 const bins=bs=>`<table><thead><tr><th>Win bin</th><th>Evaluations</th><th>Mean forecast</th><th>Observed wins</th></tr></thead><tbody>${(bs||[]).map(b=>`<tr><td>${pct(b.from)}–${pct(b.to)}</td><td>${esc(b.n)}</td><td>${b.n?pct(b.predicted):'—'}</td><td>${b.n?pct(b.observed):'—'}</td></tr>`).join('')}</tbody></table>`;
 return `<section class="validationProgress"><h4>Frozen pregame evaluation · experimental</h4><p>All saved games and leagues. Report saved ${esc(report.generatedAt)}. ${esc(n)} settled price/selection evaluations across ${esc(report.independentEvents??0)} distinct events; ${esc(pending)} await a matched outcome.</p><p class="micro">Several players and lines from one game are correlated. Event count is not proof of statistical independence. This is separate from replaying today's line against older games.</p><details><summary>Evaluation coverage and model cohorts</summary><p>${esc(report.captureCount??'Unavailable')} archived captures; ${esc(report.distinctSelections??'unavailable')} distinct selection groups. Missing/invalid frozen predictions: ${esc(report.skipReasons?.missingFrozenPrediction??0)}; invalid captures: ${esc(report.skipReasons?.invalidCapture??0)}; ambiguous outcomes: ${esc(report.skipReasons?.ambiguousOutcome??0)}; wrong fixture: ${esc(report.skipReasons?.wrongFixture??0)}.</p>${report.marketComparison?`<p>Matched frozen market comparison: ${esc(report.marketComparison.n)} non-push evaluations across ${esc(report.marketComparison.events)} events. Conditional binary Brier: model ${typeof report.marketComparison.modelConditionalBrier==='number'?report.marketComparison.modelConditionalBrier.toFixed(4):'unavailable'}; market proxy ${typeof report.marketComparison.marketConditionalBrier==='number'?report.marketComparison.marketConditionalBrier.toFixed(4):'unavailable'}. These are separate from the three-outcome scores below; missing historical proxy prices are never reconstructed.</p>`:''}${report.contextCohorts?.length?`<p>Context/market coverage (overlapping cohorts): ${report.contextCohorts.map(c=>`${esc(c.name)}: ${esc(c.n)} evaluations / ${esc(c.events)} events`).join(' · ')}.</p>`:''}${(report.cohorts||[]).map(c=>`<h4>${esc(c.name)}</h4><p>${esc(c.n)} evaluations; ${esc(c.independentEvents)} events. Brier ${typeof c.brier==='number'?c.brier.toFixed(4):'unavailable'} (lower is better; no pass threshold is established).</p>${bins(c.calibration)}`).join('')||'<p>No settled model cohort yet.</p>'}<p>Outcomes are provisionally matched from sourced player/stat/period/game-date records; bookmaker settlements are not independently confirmed. Existing hypothetical return policy uses estimated EV above 0.05 units and does not represent the Lean recommendations or actual wagers.</p></details><p class="micro">Automatic Take remains disabled. No automatic sample-count unlock or validated betting edge is claimed.</p></section>`;
}
