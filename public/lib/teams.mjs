// Logos, flags and the F1 grid: the shared kit's (lib/logos.mjs).
import { CATALOG, familyOfSport } from './catalog.mjs';
import { normalizeTeamName, MLB_ABBR, NBA_ABBR, EPL_ESPN_ID, TEAM_BADGES, rememberLogo, teamLogo } from './logos.mjs';
export { normalizeTeamName, rememberLogo, teamLogo, leagueLogo, teamBadge, f1Driver, f1Constructor, countryFlag, playerFlag, playerNation, flagEmoji } from './logos.mjs';

// MLB team names as Taiwan Sports Lottery writes them. Astros/Athletics weren't
// in any captured lottery page, so those two are the usual Taiwanese names.
export const MLB_TEAM_ZH = {
  'Arizona Diamondbacks': '亞歷桑那響尾蛇',
  Athletics: '運動家',
  'Atlanta Braves': '亞特蘭大勇士',
  'Baltimore Orioles': '巴爾的摩金鶯',
  'Boston Red Sox': '波士頓紅襪',
  'Chicago Cubs': '芝加哥小熊',
  'Chicago White Sox': '芝加哥白襪',
  'Cincinnati Reds': '辛辛那堤紅人',
  'Cleveland Guardians': '克里夫蘭守護者',
  'Colorado Rockies': '科羅拉多落磯',
  'Detroit Tigers': '底特律老虎',
  'Houston Astros': '休士頓太空人',
  'Kansas City Royals': '堪薩斯皇家',
  'Los Angeles Angels': '洛杉磯天使',
  'Los Angeles Dodgers': '洛杉磯道奇',
  'Miami Marlins': '邁阿密馬林魚',
  'Milwaukee Brewers': '密爾瓦基釀酒人',
  'Minnesota Twins': '明尼蘇達雙城',
  'New York Mets': '紐約大都會',
  'New York Yankees': '紐約洋基',
  'Philadelphia Phillies': '費城費城人',
  'Pittsburgh Pirates': '匹茲堡海盜',
  'San Diego Padres': '聖地牙哥教士',
  'San Francisco Giants': '舊金山巨人',
  'Seattle Mariners': '西雅圖水手',
  'St. Louis Cardinals': '聖路易紅雀',
  'Tampa Bay Rays': '坦帕灣光芒',
  'Texas Rangers': '德州遊騎兵',
  'Toronto Blue Jays': '多倫多藍鳥',
  'Washington Nationals': '華盛頓國民'
};

// Premier League clubs, keyed by normalizeTeamName(), as the lottery wrote
// them on 2026-09-25. Includes recently promoted/relegated clubs, since the
// league changes every season.
const EPL_TEAM_ZH_BY_KEY = {
  arsenal: '兵工廠',
  'aston villa': '阿斯頓維拉',
  bournemouth: '伯恩茅斯',
  brentford: '布倫特福德',
  brighton: '布萊頓',
  'brighton hove albion': '布萊頓',
  burnley: '伯恩利',
  chelsea: '切爾西',
  'coventry city': '科芬特里城',
  'crystal palace': '水晶宮',
  everton: '艾佛頓',
  fulham: '富勒姆',
  'hull city': '赫爾城',
  'ipswich town': '伊普斯維奇',
  'leeds united': '利茲聯',
  'leicester city': '萊斯特城',
  liverpool: '利物浦',
  'manchester city': '曼城',
  'manchester united': '曼聯',
  'newcastle united': '紐卡索聯',
  'nottingham forest': '諾丁漢森林',
  southampton: '南安普頓',
  sunderland: '桑德蘭',
  tottenham: '托特納姆熱刺',
  'tottenham hotspur': '托特納姆熱刺',
  'west ham united': '西漢姆聯',
  'wolverhampton wanderers': '狼隊'
};

// NBA teams in the usual Taiwanese names. The lottery doesn't offer the NBA
// title yet, so these aren't checked against it.
export const NBA_TEAM_ZH = {
  'Atlanta Hawks': '亞特蘭大老鷹',
  'Boston Celtics': '波士頓塞爾提克',
  'Brooklyn Nets': '布魯克林籃網',
  'Charlotte Hornets': '夏洛特黃蜂',
  'Chicago Bulls': '芝加哥公牛',
  'Cleveland Cavaliers': '克里夫蘭騎士',
  'Dallas Mavericks': '達拉斯獨行俠',
  'Denver Nuggets': '丹佛金塊',
  'Detroit Pistons': '底特律活塞',
  'Golden State Warriors': '金州勇士',
  'Houston Rockets': '休士頓火箭',
  'Indiana Pacers': '印第安納溜馬',
  'Los Angeles Clippers': '洛杉磯快艇',
  'LA Clippers': '洛杉磯快艇',
  'Los Angeles Lakers': '洛杉磯湖人',
  'Memphis Grizzlies': '曼菲斯灰熊',
  'Miami Heat': '邁阿密熱火',
  'Milwaukee Bucks': '密爾瓦基公鹿',
  'Minnesota Timberwolves': '明尼蘇達灰狼',
  'New Orleans Pelicans': '紐奧良鵜鶘',
  'New York Knicks': '紐約尼克',
  'Oklahoma City Thunder': '奧克拉荷馬雷霆',
  'Orlando Magic': '奧蘭多魔術',
  'Philadelphia 76ers': '費城 76 人',
  'Phoenix Suns': '鳳凰城太陽',
  'Portland Trail Blazers': '波特蘭拓荒者',
  'Sacramento Kings': '沙加緬度國王',
  'San Antonio Spurs': '聖安東尼奧馬刺',
  'Toronto Raptors': '多倫多暴龍',
  'Utah Jazz': '猶他爵士',
  'Washington Wizards': '華盛頓巫師'
};

export function teamZh(sport, name) {
  if (sport === 'epl') return EPL_TEAM_ZH_BY_KEY[normalizeTeamName(name)] ?? name;
  if (sport === 'nba') return NBA_TEAM_ZH[name] ?? name;
  if (['npb', 'kbo', 'cpbl'].includes(sport)) return ASIA_TEAM_ZH[normalizeTeamName(name)] ?? name;
  return MLB_TEAM_ZH[name] ?? name;
}

// Every league Play sells, from the shared catalogue (catalog.mjs, the kit's
// leagues.mjs): its kind of markets (family), where its odds come from (an
// ESPN `path`, or a `kambi` list) and the market details for sports in sets.
export const LEAGUES = Object.fromEntries(
  Object.values(CATALOG)
    .filter(l => l.bet && l.odds)
    .map(l => {
      const league = { family: familyOfSport(l.sport) };
      if (l.odds === 'espn') league.path = l.espn;
      else league.kambi = l.kambi;
      for (const k of ['logo', 'icon', 'badge', 'neutral', 'sets', 'results', 'scores', 'cap', 'players', 'top']) if (l[k] !== undefined) league[k] = l[k];
      return [l.bet, league];
    })
);

// Leagues from Kambi.
export const KAMBI_LEAGUES = Object.keys(LEAGUES).filter(key => LEAGUES[key].kambi);
export const isSets = sport => LEAGUES[sport]?.family === 'sets';
// Played at a neutral venue by players, not home and away clubs.
export const isNeutral = sport => Boolean(LEAGUES[sport]?.neutral);
// Sides are people (a nation's flag as their picture).
export const isPlayers = sport => Boolean(LEAGUES[sport]?.players);

// Asian baseball clubs as Taiwan writes them, keyed by normalizeTeamName().
const ASIA_TEAM_ZH = {
  // CPBL
  'tsg hawks': '台鋼雄鷹', 'uni lions': '統一7-ELEVEn獅', 'fubon guardians': '富邦悍將', 'chinatrust brothers': '中信兄弟', 'ctbc brothers': '中信兄弟', 'rakuten monkeys': '樂天桃猿', 'wei chuan dragons': '味全龍',
  // NPB
  'yomiuri giants': '讀賣巨人', 'hanshin tigers': '阪神虎', 'chunichi dragons': '中日龍', 'yokohama dena baystars': '橫濱DeNA海灣之星', 'hiroshima toyo carp': '廣島東洋鯉魚', 'tokyo yakult swallows': '東京養樂多燕子', 'fukuoka softbank hawks': '福岡軟銀鷹', 'hokkaido nippon ham fighters': '北海道日本火腿鬥士', 'chiba lotte marines': '千葉羅德海洋', 'tohoku rakuten golden eagles': '東北樂天金鷲', 'orix buffaloes': '歐力士猛牛', 'saitama seibu lions': '埼玉西武獅',
  // KBO
  'kia tigers': '起亞虎', 'samsung lions': '三星獅', 'lg twins': 'LG雙子', 'doosan bears': '斗山熊', 'kt wiz': 'KT巫師', 'ssg landers': 'SSG登陸者', 'lotte giants': '樂天巨人', 'hanwha eagles': '韓華鷹', 'nc dinos': 'NC恐龍', 'kiwoom heroes': '培證英雄',
  // Kambi's spellings
  'yokohama bay stars': '橫濱DeNA海灣之星', 'nippon ham fighters': '北海道日本火腿鬥士', 'rakuten golden eagles': '東北樂天金鷲', 'seibu lions': '埼玉西武獅', 'kt wiz suwon': 'KT巫師', 'yomiuri': '讀賣巨人', 'hiroshima carp': '廣島東洋鯉魚'
};

export function familyOf(sport) {
  return sport === 'f1' ? 'racing' : LEAGUES[sport]?.family ?? null;
}

export const isSoccer = sport => familyOf(sport) === 'soccer';

// Every club of a league we have a logo for, one name each (aliases dropped):
// English names as the feeds write them. For games that show a team.
const titleCase = key => key.replace(/\b[a-z]/g, c => c.toUpperCase());
// Clubs from ESPN's team lists (rememberTeams): every league the quiz uses,
// MLB and the NBA included (ESPN gives each club's nickname).
const fetchedTeams = new Map();
const nicknames = new Map();
export function rememberTeams(sport, teams) {
  for (const { name, logo, nick } of teams) {
    rememberLogo(sport, name, logo);
    if (nick) nicknames.set(`${sport}|${name}`, nick);
  }
  fetchedTeams.set(sport, teams.map(t => t.name));
}
export const hasTeams = sport => (fetchedTeams.get(sport)?.length ?? 0) > 0 || Boolean(TEAM_BADGES[sport]);
export function leagueTeams(sport) {
  let names = [];
  if (fetchedTeams.get(sport)?.length) names = fetchedTeams.get(sport);
  else if (sport === 'mlb') names = Object.keys(MLB_ABBR);
  else if (sport === 'nba') names = Object.keys(NBA_ABBR);
  else if (sport === 'epl') names = Object.keys(EPL_ESPN_ID).map(titleCase);
  else if (TEAM_BADGES[sport]) names = Object.keys(TEAM_BADGES[sport]);
  const seen = new Set();
  return names.filter(name => {
    const logo = teamLogo(sport, name);
    if (!logo || seen.has(logo)) return false;
    seen.add(logo);
    return true;
  });
}

// ---- Finding a club's logo by a name that isn't ESPN's -------------------------------
//
// Championship markets write clubs their own way ("Betis", "Inter Milan",
// "1. FC Köln"); ESPN's team lists another ("Real Betis", "Internazionale",
// "FC Cologne"). A name finds its club in the given leagues' lists: the same
// name, one name inside the other, else the club sharing the most words
// (only when one club clearly shares the most). Names with no word in
// common go through TEAM_ALIASES (both sides as normalizeTeamName writes them).
const TEAM_ALIASES = {
  'inter milan': 'internazionale',
  inter: 'internazionale',
  rennes: 'stade rennais',
  'hamburger sv': 'hamburg sv',
  '1 koln': 'cologne',
  koln: 'cologne',
  'los angeles': 'lafc',
  psg: 'paris saint germain',
  'mississippi rebels': 'ole miss rebels',
  'athletic bilbao': 'athletic club',
  'bayern munchen': 'bayern munich',
  'sporting cp': 'sporting',
  'sporting lisbon': 'sporting'
};
const logoIndex = new Map();
export function findTeamLogo(sports, name) {
  if (!name) return null;
  let norm = normalizeTeamName(name);
  norm = TEAM_ALIASES[norm] ?? norm;
  const clubs = sports.flatMap(sport => {
    const key = `${sport}|${leagueTeams(sport).length}`;
    if (!logoIndex.has(key)) logoIndex.set(key, leagueTeams(sport).map(team => ({ sport, team, norm: normalizeTeamName(team), words: new Set(normalizeTeamName(team).split(' ').filter(w => w.length >= 3)) })));
    return logoIndex.get(key);
  });
  const logo = c => teamLogo(c.sport, c.team);
  const exact = clubs.find(c => c.norm === norm);
  if (exact) return logo(exact);
  const inside = clubs.filter(c => ` ${c.norm} `.includes(` ${norm} `) || ` ${norm} `.includes(` ${c.norm} `));
  if (inside.length) return logo(inside.sort((a, b) => Math.abs(a.norm.length - norm.length) - Math.abs(b.norm.length - norm.length))[0]);
  const words = norm.split(' ').filter(w => w.length >= 3);
  const scored = clubs.map(c => ({ c, n: words.filter(w => c.words.has(w)).length })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
  if (scored.length && (scored.length === 1 || scored[0].n > scored[1].n)) return logo(scored[0].c);
  return null;
}
