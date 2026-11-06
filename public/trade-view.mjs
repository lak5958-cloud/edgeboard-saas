const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function avatar(p={}){const url=/^https:\/\/a\.espncdn\.com\/i\/headshots\/(nba|nfl)\/players\/full\/\d+\.png$/.test(p.headshot||'')?p.headshot:null;const initials=String(p.name||'?').split(' ').map(x=>x[0]).slice(0,2).join('');return `<span class="playerAvatar"><span>${esc(initials)}</span>${url?`<img src="/api/headshot?league=${/headshots\/(nba|nfl)/.exec(url)[1].toUpperCase()}&amp;id=${/full\/(\d+)/.exec(url)[1]}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}</span>`;}
const links=urls=>[...new Set(urls||[])].filter(u=>/^https:\/\//.test(u)).slice(0,8).map((u,i)=>`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">Game source ${i+1} ↗</a>`).join('');
const labels={points:'Points',rebounds:'Rebounds',assists:'Assists',steals:'Steals',blocks:'Blocks',turnovers:'Turnovers',passingyards:'Passing yards',passingtd:'Passing touchdowns',passinginterceptions:'Interceptions thrown',rushingyards:'Rushing yards',rushingtd:'Rushing touchdowns',receivingyards:'Receiving yards',receivingtd:'Receiving touchdowns',receptions:'Catches',fumbleslost:'Fumbles lost'};
function playerCard(p){return `<article class="tradePlayer"><div class="playerHeading">${avatar(p)}<div><h4>${esc(p.name)}</h4><small>${esc(p.team||'Team not verified')} · ${esc(p.position||'')} · ${p.sample} verified games</small></div><div class="playerScore"><b>${p.perAppearance===null?'—':p.perAppearance.toFixed(1)}</b><small>points / game*</small></div></div><p>${p.recent3===null?'More game history is needed.':`Last 3 recorded games: <strong>${p.recent3.toFixed(1)}</strong> points per game.`} ${p.scheduleFresh?`${p.next21Days.games} games scheduled over the next 3 weeks.`:''}</p>${p.injuries?.length?`<p class="availability">Latest reported status: <b>${esc(p.injuries.map(i=>i.status).join(', '))}</b>. Check the latest team report before trading.</p>`:'<p class="fine">No recent injury report matched. That does not confirm the player is healthy.</p>'}<details><summary>Scoring breakdown and recent games</summary><table><thead><tr><th>Stat</th><th>Per game*</th><th>Fantasy points</th></tr></thead><tbody>${Object.entries(p.components||{}).map(([k,v])=>`<tr><td>${esc(labels[k]||k)}</td><td>${v.average.toFixed(1)}</td><td>${v.contribution.toFixed(1)}</td></tr>`).join('')}</tbody></table><div class="gameStrip">${(p.recentGames||[]).map(g=>`<span><b>${g.points.toFixed(1)}</b><small>${esc(g.date.slice(5))}</small></span>`).join('')}</div></details>${p.opponents?.length?`<details><summary>Upcoming opponents and schedule</summary><p class="fine">These are past results for the opponent, not a prediction for this player. Lower points allowed can suggest a tougher matchup, but coverage and player roles matter.</p>${p.opponents.map(o=>`<p><strong>${esc(o.opponent)}</strong> · ${esc(o.date)}${o.fantasyAllowed!==null&&o.fantasyAllowed!==undefined?`<br>Allowed ${o.fantasyAllowed.toFixed(1)} combined fantasy points per covered game to ${esc(o.position||'recorded players')} (${o.fantasyGames} games with data).`:''}</p>`).join('')}</details>`:''}<details><summary>Sources and data limits</summary><div class="sources">${links(p.sources)}</div><p>${p.sample} recorded games from this season with the current team. Missing zero-stat games may be absent, so this average can differ from your fantasy provider. It is not a guaranteed future score.</p></details></article>`;}

const difference = value => (value > 0 ? '+' : '') + value.toFixed(1);

function scenariosView(scenarios) {
 if (!scenarios?.length) return '';
 return `<section class="adviceBlock"><h3>How the lineup changes the deal</h3>
 <div class="tradeScenarioTable"><table><thead><tr><th>Assumption</th><th>Players you send</th><th>Players you receive</th><th>Change</th></tr></thead><tbody>
 ${scenarios.map(row => `<tr><th scope="row">${esc(row.label)}${row.selected ? '<br><small>Selected</small>' : ''}</th>
 <td>${esc(row.give)}<br>${row.givePoints.toFixed(1)} points</td><td>${esc(row.receive)}<br>${row.receivePoints.toFixed(1)} points</td>
 <td><strong>${difference(row.delta)}</strong>${row.adjustment ? `<br><small>Includes ${difference(row.adjustment)} for the roster spot</small>` : ''}</td></tr>`).join('')}
 </tbody></table></div><p class="fine">Changes are measured in fantasy points per recorded appearance.</p></section>`;
}

export function tradeResult(r) {
 const a=r.advice;
 const evidence=a.evidence?.length ? a.evidence.filter(item => item.kind !== 'availability')
  : a.reasons.map(text => ({text,sources:[]}));
 return `<div class="card result"><div class="verdict"><div class="eyebrow">Our take</div><h2>${esc(r.recommendation)}</h2><p>${esc(a.summary)}</p></div>
 ${scenariosView(a.scenarios)}
 <section class="adviceBlock"><h3>Evidence for this trade</h3>
 ${evidence.map(item => `<p>${esc(item.text)}</p>${item.sources?.length ? `<details><summary>Evidence sources</summary><div class="sources">${links(item.sources)}</div></details>` : ''}`).join('')}
 <p class="lineupBasis">${esc(a.basis)}</p></section>
 ${a.conditions.length ? `<section class="adviceBlock"><h3>What would change the decision</h3><ul>${a.conditions.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
 <div class="resultGrid">${[['You send',r.give],['You receive',r.receive]].map(([label,ps])=>`<section><h3>${label}</h3>${ps.map(playerCard).join('')}</section>`).join('')}</div>
 <p class="fine">*Per-game scoring uses the verified appearances listed above and your chosen scoring settings.</p>
 <button class="subtle" id="aiBrief">Explain this trade in more detail</button>
 <p class="fine">Sign in for the evidence review. Pro adds named roster scenarios, scoring drivers and decision thresholds.</p>
 <div id="aiOutput" aria-live="polite"></div></div>`;
}

export function briefView(r) {
 const labels={summary:'Scoring and recommendation',roster_fit:'Lineup impact',uncertainty:'What could shift the result',scenarios:'Other ways to value the deal',next_steps:'What to verify before trading'};
 return `<h3>Your trade, explained</h3>${Object.entries(r.brief).map(([key,value])=>
  `<section class="adviceBlock"><h4>${esc(labels[key]||key)}</h4><p>${esc(value)}</p>${r.briefSources?.[key]?.length ? `<div class="sources">${links(r.briefSources[key])}</div>` : ''}</section>`).join('')}
 <p class="fine">AI prioritizes evidence calculated and sourced by EdgeBoard.</p>`;
}
