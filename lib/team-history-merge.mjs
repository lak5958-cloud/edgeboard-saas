/** Preserve sourced team box-score metrics during cheaper periodic schedule refreshes.
 * The completed-game final score stays authoritative. Conflicting scores
 * invalidate all previously derived detailed columns rather than silently merging.
 */
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const numericAllowed=entry=>finite(entry?.pointsAllowed)?Number(entry.pointsAllowed):(finite(entry?.allowed)?Number(entry.allowed):null);
export function mergeTeamScheduleRow(prior,completed,observedAt){
 const oldPoints=finite(prior?.points)?Number(prior.points):null;
 const oldAllowed=numericAllowed(prior);
 const matched=prior && oldPoints===Number(completed.points)&&oldAllowed===Number(completed.allowed)
  &&String(prior.gameID)===String(completed.gameID)
  &&String(prior.teamID)===String(completed.teamID);
 const merged={...(matched?prior:{}),...completed,pointsAllowed:Number(completed.allowed),
  observedAt,source:matched&&prior.source?.startsWith('https:')?prior.source:completed.source};
 if(matched&&prior.allowed&&typeof prior.allowed==='object'&&!Array.isArray(prior.allowed))
  merged.allowed=prior.allowed;
 // The schedule uses numeric allowed; the rich object is retained only for
 // matching results. The numeric pointsAllowed is always stored separately.
 if(!matched)delete merged.stats;
 return merged;
}
