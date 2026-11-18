import {normalizeStat} from './insights.mjs';

// Offline, observational check of ORIGINAL frozen research features. The feature
// belongs to the pregame archive; no completed-game opponent statistics are joined
// here, and no coefficients or live selection criteria are changed.
const numeric=v=>typeof v==='number'&&Number.isFinite(v);
const day=v=>String(v||'').slice(0,10);
const mean=a=>a.length?a.reduce((s,n)=>s+n,0)/a.length:null;
const unit=r=>JSON.stringify([r.league,r.eventID]);
const identity=r=>JSON.stringify([r.league,r.eventID,r.athleteID,r.book,normalizeStat(r.stat),r.side,r.line]);
const STAT={three:'3pointersmade',assists:'assists'};
const ratioBand=ratio=>ratio>=1.10?'higher':ratio<=.90?'lower':'typical';
export const DEFENSE_GROUPS=Object.freeze({higher:'10%+ more allowed',typical:'Within ±10% of league average',lower:'10%+ fewer allowed'});
function parse(audits){
 const earliest=new Map(),conflicts=new Set(),reasons={notNBA:0,statUnsupported:0,notSettled:0,noVerifiedFreeze:0,noArchivedOpponentFeature:0};
 let candidates=0;
 for(const audit of audits||[])for(const raw of audit.results||[]){
  if(raw.league!=='NBA'){reasons.notNBA++;continue;}
  if(![STAT.three,STAT.assists].includes(normalizeStat(raw.stat))){reasons.statUnsupported++;continue;}
  candidates++;
  if(!['win','loss'].includes(raw.outcome)||!numeric(raw.brier)||!numeric(raw.scoringProbability)){reasons.notSettled++;continue;}
  const captured=Date.parse(raw.frozenAt),verified=Date.parse(raw.outcomeObservedAt);
  if(!numeric(captured)||!numeric(verified)||verified<=captured||!/^https:\/\//.test(raw.source||'')||
   !raw.eventID||!raw.athleteID||!raw.book||!['over','under'].includes(raw.side)||!numeric(raw.line)){
   reasons.noVerifiedFreeze++;continue;
  }
  const feature=raw.researchCandidates?.features?.defenseAllowed;
  const created=Date.parse(raw.researchCandidates?.createdAt);
  if(!feature||!numeric(feature.ratio)||feature.ratio<=0||!numeric(feature.games)||feature.games<3||
    !numeric(created)||created>captured||!raw.researchCandidates?.version||
    !numeric(feature.mean)||!numeric(feature.baseline)||feature.baseline<=0||
    Math.abs(feature.mean/feature.baseline-feature.ratio)>.000001){
    reasons.noArchivedOpponentFeature++;continue;
  }
  const id=identity(raw),row={...raw,day:audit.day||day(raw.frozenAt),defenseRatio:feature.ratio,defenseN:feature.games};
  const prior=earliest.get(id);
  if(prior&&(prior.outcome!==row.outcome||Math.abs(prior.defenseRatio-row.defenseRatio)>.000001))conflicts.add(id);
  if(!prior||captured<Date.parse(prior.frozenAt))earliest.set(id,row);
 }
 return {rows:[...earliest].filter(([k])=>!conflicts.has(k)).map(([,r])=>r),candidates,conflicts:conflicts.size,reasons};
}
function summarize(rows){
 const games=new Map();
 for(const r of rows){const key=unit(r);if(!games.has(key))games.set(key,[]);games.get(key).push(r);}
 const aggregate=[...games.values()].map(rr=>({
  observed:mean(rr.map(r=>Number(r.outcome==='win'))),
  predicted:mean(rr.map(r=>r.scoringProbability)),
  brier:mean(rr.map(r=>r.brier)),
  market:mean(rr.filter(r=>numeric(r.quotedPriceBrier)).map(r=>r.quotedPriceBrier)),
  ratio:mean(rr.map(r=>r.defenseRatio))
 }));
 return {selections:rows.length,games:games.size,days:new Set(rows.map(r=>r.day)).size,
  wins:rows.filter(r=>r.outcome==='win').length,losses:rows.filter(r=>r.outcome==='loss').length,
  observed:mean(aggregate.map(a=>a.observed)),predicted:mean(aggregate.map(a=>a.predicted)),
  brier:mean(aggregate.map(a=>a.brier)),marketBrier:mean(aggregate.map(a=>a.market).filter(numeric)),
  ratio:mean(aggregate.map(a=>a.ratio))};
}
/**
 * Compare eligible frozen NBA over/under selections by an opponent's own
 * pregame recorded same-stat allowance relative to league baseline.
 * A fixed, untrained 10% threshold; this is observational stratification,
 * NOT a causal test or evidence of an improved model.
 */
export function analyzeFrozenDefense(audits,{holdoutFrom=null}={}){
 const {rows,candidates,conflicts,reasons}=parse(audits);
 const dateRows=holdoutFrom?rows.filter(r=>r.day>=holdoutFrom):rows;
 const groups=[];
 for(const stat of ['three','assists'])for(const side of ['over','under']){
  const eligible=dateRows.filter(r=>normalizeStat(r.stat)===STAT[stat]&&r.side===side);
  const buckets=Object.fromEntries(['higher','typical','lower'].map(key=>[key,summarize(eligible.filter(r=>ratioBand(r.defenseRatio)===key))]));
  const higher=buckets.higher,lower=buckets.lower;
  const adequate=higher.games>=10&&lower.games>=10&&higher.days>=3&&lower.days>=3;
  groups.push({stat,side,eligible:summarize(eligible),buckets,
   contrast:adequate?higher.observed-lower.observed:null,
   adequate,
   caveat:'Markets, books, lines and players within a game are correlated; these are game-weighted descriptive rates, not independent Bernoulli samples.'});
 }
 return {version:'frozen-defense-association-v1',holdoutFrom,archiveRows:candidates,eligible:rows.length,
  holdoutEligible:dateRows.length,excluded:{...reasons,conflictingDuplicate:conflicts},
  groups,
  method:'Retrospective association from researchCandidates.features.defenseAllowed recorded in original pregame snapshots. No reconstructed final-game feature joins, no refitting, no new odds requests. Fixed high/low bins are >=1.10 and <=0.90 times archived league baseline. Outcomes must be sourced and verified after freeze. Only settlement-valid NBA player prop selections are scored. Comparisons are game-weighted to reduce correlated bookmaker/alternate-line duplication, but remains observational; missing feature coverage and selective capture can bias results. Never promote or adjust the production betting model on these splits alone.'};
}

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;'}[c]));
const pct=n=>numeric(n)?(n*100).toFixed(1)+'%':'—';
const decimal=n=>numeric(n)?n.toFixed(4):'—';
const title={three:'Made 3-pointers',assists:'Assists'};
export function frozenDefenseView(audits,{holdoutFrom=null}={}){
 const r=analyzeFrozenDefense(audits,{holdoutFrom});
 const records=r.groups.map(g=>'<section class="defenseAuditGroup"><h4>'+title[g.stat]+' · '+(g.side==='over'?'Over':'Under')+' props</h4>'+
  '<p class="fine">'+g.eligible.selections+' archived eligible selections across '+g.eligible.games+' games.</p>'+
  '<div class="evaluationTable"><table><thead><tr><th>Opponent historically allowed</th><th>Selections</th><th>Distinct games / dates</th><th>Actual win rate*</th><th>Original model estimated</th><th>Brier error</th></tr></thead><tbody>'+
  ['higher','typical','lower'].map(bucket=>{const b=g.buckets[bucket];return '<tr><td>'+esc(DEFENSE_GROUPS[bucket])+'</td><td>'+b.selections+'</td><td>'+b.games+' / '+b.days+'</td><td>'+pct(b.observed)+'</td><td>'+pct(b.predicted)+'</td><td>'+decimal(b.brier)+'</td></tr>';}).join('')+
  '</tbody></table></div><p class="fine">'+(g.adequate?
   'Exploratory high-versus-low win-rate difference: '+pct(g.contrast)+'. Not a demonstrated improvement in forecasting accuracy.':
   'Insufficient distinct games and slate dates for a meaningful high-versus-low comparison (requires at least 10 games and three dates in each outer band).')+'</p></section>').join('');
 return '<details class="defenseAuditSection" open><summary><strong>Do permissive defenses actually help our archived picks?</strong> · experimental validation</summary>'+
  '<p>Uses each prediction’s <em>original frozen opponent defense feature</em>, not updated defensive rankings. The selection and its win/loss are matched to verified final outcomes. Higher means that opponent previously allowed more of the selected stat than the archived league average.</p>'+
  '<p><strong>'+r.holdoutEligible+' eligible frozen selections</strong> in the '+(holdoutFrom?'selected untouched holdout from '+esc(holdoutFrom):'reviewed historical window')+
  '. '+r.excluded.noArchivedOpponentFeature+' reviewed candidates lacked sufficient frozen opponent context; '+r.excluded.conflictingDuplicate+' conflicting archived selections excluded.</p>'+
  (r.holdoutEligible?records:'<p>No qualifying archived defensive-context selections were found for this period. This does not imply defenses have no effect; EdgeBoard needs more complete frozen pregame data.</p>')+
  '<p class="fine">*Actual win rates and prediction averages give each matchup equal weight. Different prop lines and sportsbooks can still be correlated. Small samples, opponents, injuries, and player role may confound these comparisons. No model parameters or recommendations have been changed.</p>'+
  '<p class="fine">'+esc(r.method)+'</p></details>';
}
