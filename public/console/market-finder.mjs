import {sameName,sameStat,quoteStatus} from './insights.mjs';import {quotePeriod} from './markets.mjs';import {teamCode} from './rosters.mjs';import {latestQuotes} from './quote-selection.mjs';
const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
const gameKey=s=>String(s||'').trim().split(/\s*@\s*|\s+vs\.?\s+/i).map(s=>teamCode(s.trim())).join('@');
export function findBoardMarket(pick,{quotes=[],games=[],preferredBook='draftkings',now=new Date()}={}){
 const league=String(pick.league||'').toUpperCase(),targetPeriod=String(pick.periodID||'unknown').toLowerCase(),knownPeriod=targetPeriod!=='unknown'&&targetPeriod!=='';
 const targetGames=games.filter(g=>(!league||g.league===league)&&(!pick.game||gameKey(g.game)===gameKey(pick.game))&&(!pick.eventID||g.eventID===pick.eventID));
 const loaded=q=>games.find(g=>g.league===q.league&&(g.eventID&&q.eventID?g.eventID===q.eventID:g.game===q.game));
 const matches=latestQuotes(quotes.filter(q=>(!league||q.league===league)&&loaded(q)&&sameName(q.player,pick.subject)&&sameStat(q.stat,pick.market)&&String(q.side||'').toLowerCase()===String(pick.side||'').toLowerCase()));
 const inGame=q=>targetGames.some(g=>g.league===q.league&&(g.eventID&&q.eventID?g.eventID===q.eventID:g.game===q.game));
 const book=String(pick.book||pick.sportsbook||preferredBook).toLowerCase();
 const sort=(a,b)=>Number(quoteStatus(b,loaded(b),now).ok)-Number(quoteStatus(a,loaded(a),now).ok)||Number(finite(pick.line)&&Number(b.line)===Number(pick.line))-Number(finite(pick.line)&&Number(a.line)===Number(pick.line))||Number(String(b.book).toLowerCase()===book)-Number(String(a.book).toLowerCase()===book)||String(a.game).localeCompare(String(b.game))||String(quotePeriod(a)).localeCompare(String(quotePeriod(b)))||Number(a.line)-Number(b.line);
 const scoped=matches.filter(inGame).sort(sort),alternatives=(scoped.length?scoped:matches).sort(sort).slice(0,8);
 if(pick.game&&!targetGames.length)return {status:'game-missing',message:`${pick.game} is not in the loaded ${league||''} game board. It may be an earlier or different fixture. ${alternatives.length?'Other saved player/stat markets are listed below; their matchups may differ.':'No matching player/stat/side quote is available elsewhere in the loaded board.'}`,alternatives};
 if(!matches.length)return {status:'missing',message:`No saved quote matches ${pick.subject} / ${pick.market} / ${pick.side}. The source post is not evidence that the bookmaker currently offers it.`,alternatives:[]};
 if(!scoped.length)return {status:'game-mismatch',message:'That player/stat/side has quotes in other loaded matchups, but not the source matchup. Choose an explicitly labeled alternative to inspect it.',alternatives};
 if(!knownPeriod)return {status:'needs-period',message:'The source does not specify the game period. Choose an actual saved market below; full-game, half and quarter props are different bets.',alternatives};
 const periodMatches=scoped.filter(q=>quotePeriod(q)===targetPeriod);
 if(!periodMatches.length)return {status:'period-missing',message:`No saved ${targetPeriod} quote matches the source. Available periods are shown below; none was substituted automatically.`,alternatives};
 if(!finite(pick.line))return {status:'needs-line',message:'The source has no valid exact threshold. Choose a quoted line below.',alternatives:periodMatches.slice(0,8)};
 const exact=periodMatches.filter(q=>Number(q.line)===Number(pick.line)&&(!(pick.book||pick.sportsbook)||String(q.book).toLowerCase()===String(pick.book||pick.sportsbook).toLowerCase())).sort(sort);
 if(!exact.length)return {status:'line-missing',message:`No saved quote matches the source's exact ${pick.side} ${pick.line} ${targetPeriod}${pick.book||pick.sportsbook?' at '+(pick.book||pick.sportsbook):''}. Different quoted lines/books are listed for deliberate comparison.`,alternatives:periodMatches.slice(0,8)};
 if(new Set(exact.map(q=>q.kind)).size>1)return {status:'needs-type',message:'More than one market type matches this description. Choose the exact quoted market below.',alternatives:exact.slice(0,8)};
 const quote=exact[0],state=quoteStatus(quote,loaded(quote),now);
 if(!state.ok)return {status:'stale',message:`The matching saved market is ${state.label.toLowerCase()}. You can inspect it, but refresh before relying on its price.`,alternatives:exact.slice(0,8)};
 return {status:'matched',quote,message:`Opened the current board's ${quote.side} ${quote.line} ${targetPeriod} at ${quote.book} (${quote.odds>0?'+':''}${quote.odds}). The source post's original date and price may differ.`,alternatives:[]};
}
