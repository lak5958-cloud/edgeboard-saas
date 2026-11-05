export function nflPregame(payload,scheduled,now=new Date()){
 const c=payload.header?.competitions?.[0],start=Date.parse(c?.date);
 if(String(payload.header?.id||c?.id)!==String(scheduled.gameID)||!Number.isFinite(start)||start<=now||Math.abs(start-Date.parse(scheduled.start))>600000||c.status?.type?.completed||c.status?.type?.state==='in')return null;
 const ids=new Set((c.competitors||[]).map(r=>String(r.team?.id)));
 if(ids.size!==2||!ids.has(String(scheduled.teamID))||!ids.has(String(scheduled.opponentID)))return null;
 const weather=payload.gameInfo?.weather||c.weather,venue=payload.gameInfo?.venue||c.venue,summary=weather?.displayValue||weather?.description||null;
 const temperature=weather?.temperature;
 return {gameID:String(scheduled.gameID),start:c.date,asOf:now.toISOString(),url:'https://www.espn.com/nfl/game/_/gameId/'+scheduled.gameID,indoor:typeof venue?.indoor==='boolean'?venue.indoor:null,weather:typeof summary==='string'?summary.slice(0,300):null,temperature:typeof temperature==='number'&&Number.isFinite(temperature)?temperature:null,temperatureUnit:typeof weather?.temperatureUnit==='string'?weather.temperatureUnit:null,method:'Pregame event summary. Temperature is displayed only with the provider-supplied unit. No weather probability multiplier is fitted.'};
}
