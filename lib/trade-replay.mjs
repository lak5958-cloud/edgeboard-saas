// Two fixed research estimates for a player with a small new-team sample.
export function tradeReplayForecast(past,team,season,line) {
 const current=past.filter(g=>g.seasonYear===season&&String(g.teamID)===String(team)).slice(-5);
 const old=past.filter(g=>g.teamID&&String(g.teamID)!==String(team)&&[season,season-1].includes(g.seasonYear)).slice(-20);
 if(current.length<2||old.length<5||!Number.isFinite(line))return null;
 const wins=rows=>rows.filter(g=>g.value>line).length;
 const currentWins=wins(current);
 return {
  currentN:current.length,oldN:old.length,
  currentOnly:(currentWins+.5)/(current.length+1),
  limitedOldTeam:(currentWins+.5+2*wins(old)/old.length)/(current.length+3)
 };
}
