// EdgeBoard v1.2.1 — deterministic parsing of ESPN finished-game box scores.
// ESPN may provide both human-readable 'names' and internal 'keys'.  Prefer
// the actual box-score column labels (names/labels), not opaque internal keys.

export function parseNumeric(value, {minutes=false}={}) {
  if (value == null || value === '') return null;
  const s=String(value).trim().replaceAll(',', '');
  if (!s || s==='--' || s==='DNP' || s==='-') return null;
  if (minutes && /^\d{1,3}:\d{1,2}$/.test(s)) {
    const [m,sec]=s.split(':').map(Number);
    if(sec>=60)return null;
    return Math.round((m+sec/60)*100)/100;
  }
  // 3PT, FT, and FG shooting lines often look like '2-6'; the first count is
  // makes. Passing C/ATT may look like '22/31', the first count is completions.
  const number=/^([-+]?\d+(?:\.\d+)?)(?:\s*[-/]\s*\d+(?:\.\d+)?)?$/u.exec(s);
  if (!number) return null;
  const n=Number(number[1]);
  return Number.isFinite(n)?n:null;
}
const norm=k=>String(k??'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
const NBA={
  fg:'field goals made',ft:'free throws made',fga:'field goals attempted',fta:'free throws attempted',
  min:'minutes',minutes:'minutes',pts:'points',points:'points',reb:'rebounds',rebs:'rebounds',rebounds:'rebounds',
  ast:'assists',assists:'assists',stl:'steals',steals:'steals',blk:'blocks',blocks:'blocks',
  to:'turnovers',tov:'turnovers',turnovers:'turnovers',oreb:'offensive rebounds',offensiverebounds:'offensive rebounds',
  dreb:'defensive rebounds',defensiverebounds:'defensive rebounds',
  '3pt':'3-pointers made', '3pm':'3-pointers made', fg3m:'3-pointers made',
  threepointfieldgoalsmade:'3-pointers made',threepointsmade:'3-pointers made',
  fg3a:'3-pointers attempted',threepointfieldgoalsattempted:'3-pointers attempted'
};
// Some internal stat field names include the made/attempted pair.  Treat the
// field as made shots only when it is a recognised shooting statistic.
const labelForNBA=(v)=>NBA[norm(v)] ?? (/^(threepointfieldgoalsmadethreepointfieldgoalsattempted|threepointfieldgoalsmadeattempted)$/u.test(norm(v))?'3-pointers made':null);

export function statsFromESPNRow({league, category='', names=[], labels=[], keys=[], values=[]}) {
  const out={};
  const preferred=[names,labels,keys].filter(x=>Array.isArray(x)&&x.length===values.length);
  const columns=Array.isArray(values)?values:[];
  for(let i=0;i<columns.length;i++){
    let label=null;
    if(league==='NBA'){
      for(const set of preferred){label=labelForNBA(set[i]);if(label)break;}
    }else if(league==='NFL'){
      const cat=norm(category), candidates=preferred.map(set=>norm(set[i]));
      const is= (...aliases)=>candidates.some(x=>aliases.includes(x));
      if(cat.includes('passing')){
        if(is('yds','yards','passingyards'))label='passing yards';
        else if(is('td','touchdowns','passingtouchdowns'))label='passing touchdowns';
        else if(is('int','interceptions','passinginterceptions'))label='passing interceptions';
        else if(is('cmp','completions','passingcompletions'))label='passing completions';
        else if(is('att','attempts','passingattempts'))label='passing attempts';
        else if(is('lng','long','longpassing','longestcompletion'))label='passing longest completion';
        else if(is('catt','cmpatt','completionsattempts')){label='passing completions';const pair=/^(\d+)\/(\d+)$/.exec(String(columns[i]));if(pair)out['passing attempts']=Number(pair[2]);}
      } else if(cat.includes('rushing')){
        if(is('yds','yards','rushingyards'))label='rushing yards';
        else if(is('car','att','attempts','rushingattempts'))label='rushing attempts';
        else if(is('lng','long','longrushing','longestrush'))label='rushing longest rush';
        else if(is('td','touchdowns','rushingtouchdowns'))label='rushing touchdowns';
      }else if(cat.includes('receiving')){
        if(is('yds','yards','receivingyards'))label='receiving yards';
        else if(is('rec','receptions','receivingreceptions'))label='receptions';
        else if(is('lng','long','longreception','longestreception'))label='receiving longest reception';
        else if(is('tgts','targets','receivingtargets'))label='receiving targets';
        else if(is('td','touchdowns','receivingtouchdowns'))label='receiving touchdowns';
      }else if(cat.includes('tackles')||cat.includes('defensive')){
        if(is('totaltackles','tacklestotal'))label='defense combined tackles';
        else if(is('solotackles'))label='defense solo tackles';
        else if(is('assisttackles'))label='defense assisted tackles';
        else if(is('sacks'))label='defense sacks';
      }else if(cat==='interceptions'){
        if(is('interceptions'))label='defense interceptions';
      }
    }
    if(!label)continue;
    const val=parseNumeric(columns[i],{minutes:label==='minutes'});
    if(val!==null)out[label]=val;
    if(league==='NBA'&&['field goals made','free throws made'].includes(label)){const pair=/^(\d+)-(\d+)$/.exec(String(columns[i]));if(pair)out[label==='field goals made'?'field goals attempted':'free throws attempted']=Number(pair[2]);}
  }
  return derivedStats(league,out);
}

export function derivedStats(league,out){
  if(league==='NFL'){
    if(out['defense solo tackles']!=null&&out['defense assisted tackles']!=null)out['defense tackles']=out['defense solo tackles']+.5*out['defense assisted tackles'];
    for(const [key,a,b] of [['passing+rushing yards','passing yards','rushing yards'],['rushing+receiving yards','rushing yards','receiving yards'],['rushing+receiving touchdowns','rushing touchdowns','receiving touchdowns']])if(out[a]!=null&&out[b]!=null)out[key]=out[a]+out[b];
    return out;
  }
  if(league!=='NBA')return out;
  if(out.points!=null&&out.rebounds!=null)out['points + rebounds']=out.points+out.rebounds;
  if(out.points!=null&&out.assists!=null)out['points + assists']=out.points+out.assists;
  if(out.rebounds!=null&&out.assists!=null)out['rebounds + assists']=out.rebounds+out.assists;
  if(out.points!=null&&out.rebounds!=null&&out.assists!=null)out['points + rebounds + assists']=out.points+out.rebounds+out.assists;
  return out;
}

export function extractPlayerBoxscores(payload, league, date, url) {
  const competitors=payload?.header?.competitions?.[0]?.competitors??[];
  const rows=[];
  for(const team of payload?.boxscore?.players??[]){
    const homeCode=team.team?.abbreviation||team.team?.team?.abbreviation||'';
    const opponent=competitors.find(c=>c.team?.abbreviation&&c.team.abbreviation!==homeCode)?.team?.abbreviation||'';
    for(const section of team.statistics??[]){
      const names=section.names||[],labels=section.labels||[],keys=section.keys||[];
      for(const athlete of section.athletes||[]){
        const player=athlete.athlete?.displayName||athlete.athlete?.fullName||'';
        if(!player || athlete.didNotPlay===true || !Array.isArray(athlete.stats))continue;
        const stats=statsFromESPNRow({league,category:section.name||section.type||'',names,labels,keys,values:athlete.stats});
        if(Object.keys(stats).length)rows.push({player,team:homeCode,date,opponent,league,stats,url,athleteId:String(athlete.athlete?.id||'')});
      }
    }
  }
  // NBA summary may have two category sections per player. Combine stats by
  // player per game so cumulative statistics don't become two incomplete rows.
  const players=new Map();
  for(const r of rows){const id=`${r.player}|${r.date}`;
    if(!players.has(id))players.set(id,{...r,stats:{}});
    Object.assign(players.get(id).stats,r.stats);
  }
  return addOpportunity([...players.values()].map(p=>({...p,stats:derivedStats(league,p.stats)})),league);
}

// Box-score estimates, requiring complete component coverage; never future inputs.
function addOpportunity(players,league){
 if(league!=='NBA')return players;
 const teams=[...new Set(players.map(p=>p.team))];
 const totals=new Map();
 for(const team of teams){const pp=players.filter(p=>p.team===team),keys=['minutes','field goals attempted','free throws attempted','turnovers','offensive rebounds','points'];
 if(pp.length<5||!pp.every(p=>keys.every(k=>Number.isFinite(p.stats[k]))))continue;
 const t=Object.fromEntries(keys.map(k=>[k,pp.reduce((s,p)=>s+p.stats[k],0)]));
 t.possessions=t['field goals attempted']+.44*t['free throws attempted']-t['offensive rebounds']+t.turnovers;
 if(t.minutes>0&&t.possessions>0)totals.set(team,t);
 }
 for(const p of players){const t=totals.get(p.team),o=totals.get(p.opponent);if(!t)continue;
 const s=p.stats,den=t['field goals attempted']+.44*t['free throws attempted']+t.turnovers;
 if(s.minutes>0&&den>0)p.usagePct=100*(s['field goals attempted']+.44*s['free throws attempted']+s.turnovers)*(t.minutes/5)/(s.minutes*den);
 if(o){const poss=(t.possessions+o.possessions)/2;p.pace=poss*240/t.minutes;p.opponentDefenseRating=100*t.points/poss;}
 }return players;
}
