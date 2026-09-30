# Quadra Play

**Live site: https://jaypengx.github.io/Quadra-Play/**

Quadra Play is the place to play in **Quadra**: sports bets on every sport
and match the sources carry, and Taiwan Lottery's draw games and scratch
cards, all with the one Quadra balance.

| App | Part it plays |
| --- | --- |
| **Quadra Securities** | Where money lives and grows |
| **Quadra Play** | A place to play: sports bets and the lottery |
| **Quadra Fixtures** | The sports data centre, and the way into Play |
| **Quadra Rewards** | The centre of Quadra: earning, goals and every app's guide |
| Orbit Class | A related add-on: the class schedule |

- **Quadra Pass required**, one app at a time, one money pool: see the
  shared kit (`public/lib/quadra.mjs`, from Shared-Proxy's `kit/`). The
  account is kept with the pass; the odds proxy answers signed-in apps only.
  Syncs of the account run one after another, so a slower save never lands
  after a newer one.
- **Tabs:** 首頁 Home, 賽事 Games, 彩券 Lottery, 投注單 Slip, 紀錄 History.
  The simulator tab, the guide tab and the mini games are gone: the guide
  is in Quadra Rewards' help centre, the mini games moved to Rewards, and
  the simulator's crowd now only serves analysis (紀錄's "you against the
  crowd").

### 首頁 Home

`public/home.js`.

Calm on purpose: no banners, no one-tap "hot" parlays, no nags.

- **The balance:** the Quadra balance; with open slips, what's in play and
  what they'd cash out for right now (or the most they can pay).
- **焦點賽事 Featured:** up to four games, drawn like the board (logos, the
  win prices; a tap puts a price on the slip). Ranked by Quadra's shared
  recommender (`rank` in `quadra.mjs`): what's followed in Quadra Fixtures
  weighs most (the wallet's `follow:match`), then the teams, leagues and
  sports bet on and opened; each game's own weight is its league tier
  (`leagueTier` in `rules.mjs`: MLB, NBA, NFL, NHL, the top soccer leagues
  and F1 first, thinly traded ones last) and how soon it starts.
- **你的投注 Your bets:** open slips, each with its cash-out price.
- **The lottery:** the next draws and their jackpots.
- **Quadra Plus**, once, for someone who isn't a member.

- **精選串關:** two ready-made trebles from the big leagues' win prices
  (favourites 1.30-1.80, bigger prices 1.90-4.00; games in the next two
  days, one pick a game), with the boosted payout on NT$500; one tap puts
  them on the slip.

### Built to keep people betting

- **The slip bar:** while the slip has picks, a bar above the tab bar on
  every tab shows how many, the stake and the most it pays, and opens the
  slip.
- **Parlay by default:** a second pick turns the slip into a parlay unless
  another way was chosen. **Quick stakes** (NT$100 to 5,000), and the stake
  is remembered on the device (NT$500 to start).
- **After a bet:** "投注成功" with a way straight back to the board.
- **戰績** (`stats-ui.js`): only wins, over all time, 30 or 7 days. A gold
  hero with the total won and its rhythm (weekly bars, or 3-day/daily for
  the shorter periods); tiles (this month, wins, longest run, top multiple,
  cashed out, biggest lottery prize); 11 achievements (first win, 3 and 5
  in a row, 3+ and 5+ pick parlays all right, a 10× slip, NT$10,000 in one
  win, a lottery or scratch prize, a profitable cash out, NT$100K and 1M
  won in all), unlocked ones first and the rest with their progress; the
  six biggest moments with their multiple; the sports that paid most; and
  buttons back to the games and the lottery.
- **電腦彩券's slip** (`lottery-ui.js`): the jackpot on top, then a slip:
  slots fill as numbers are picked (tap one to take it back), a full zone
  swaps out its oldest pick, a dot marks last draw's numbers, 快選 fills
  the rest (keeping the picks), and a finished line is counted and can be
  added to start the next. +1/+5/+10 random lines; the prize table folds
  away; a bar at the bottom holds the multiple, total and 購買.
- **Nothing that talks people out of it:** 紀錄's 戰績 shows only wins; slips
  show what they paid, never a net or an expected return; the lottery
  shows prizes, not odds, and no purchase confirmation; groups and the
  account show 累計中獎, not 輸贏.

### Making money the way a real book does

- **The board** opens on the big leagues; with every sport shown, thinly
  traded games (table tennis, lower tennis tours…) fold behind one row
  ("其他 N 場").
- **Parlay boost** (`PARLAY_BOOST` in `odds.mjs`): the winnings of any
  winning combination of 3+ picks grow by 5% (3), 8%, 12%, 15%, up to 20%
  (7+); Quadra Plus doubles it. The slip shows the ladder and where the
  ticket stands. A slip keeps its `boost` (1 or 2) from when it was bought;
  older slips have none. Even doubled, a parlay keeps most of the house's
  cut, since every pick carries its own and they multiply.
- **Cash out** (`lib/cashout.mjs`): an open slip can be sold back. Its price
  weighs every way the undecided picks can land by the board's current
  odds (1/odds, so the cut is in it), times what the slip would pay then
  (tax, cap and boost included), less 5% (2% for Plus). Before a game the
  pick's own price is used; once it's under way, the same market on the
  live board (MLB and soccer win, total, run line, team total); no price:
  suspended. Paid as `payout-<slip>` with kind `cashout`, so a result
  arriving later on another device can never pay twice.

Notices: a slip settling (won, or not) and a winning lottery ticket, as a
banner on screen or a system notice when allowed.

### 賽事 Games: every match, more sports

- **No time window:** every game the sources list that hasn't started is
  shown (daily sports about a week ahead, soccer every matchday in three
  weeks, football the current week), not only tomorrow's or the next
  matchweek.
- **More leagues** (ESPN's DraftKings lines, the other markets from our
  model): 2. Bundesliga, LaLiga 2, Serie B, Ligue 2, League One, Belgium,
  Austria, Switzerland, Denmark, Norway, Sweden, Greece, Saudi Pro League,
  A-League, Chinese Super League, Colombia, Chile, USL, NWSL, the
  Conference League, Libertadores, Sudamericana, the Nations League, World
  Cup qualifying, the EFL Cup and the Copa del Rey, and NCAA men's and
  women's basketball, on top of everything before.
- **F1:** the race winner and podium, and now the **top six**, **points
  finish (top ten)**, **teammates head to head** and the **winning team**,
  from the win chances (Harville finishing orders, 40,000 draws with a
  fixed seed, `f1Markets` in `board.mjs`), settled from ESPN's full
  finishing order.
- **Every match settles by itself.** Kambi never publishes results; a
  match is settled from its live score once decided, and when Kambi drops
  it with no deciding score kept (short table-tennis matches such as the
  Czech Liga Pro used to end between the Worker's checks) the pick is void
  (stake back) within hours, instead of waiting three days. The Worker's
  watch now checks every 2 minutes.

### 彩券 Lottery

`public/lib/lottery.mjs`, `public/lib/scratch.mjs`, `public/lottery-ui.js`.

- **11 computer-drawn games**, Taiwan Lottery's rules: 威力彩, 大樂透,
  今彩539, 賓果賓果, 3星彩 (正彩/組彩/對彩), 4星彩 (正彩/組彩), 38/39/49樂合彩
  (二合 to 五合, every combination a bet), 雙贏彩 and 大福彩. Nine settle
  against the real draws (Taiwan Lottery's public results API, read
  directly: it sends CORS headers); 樂合彩 use their parent game's draw
  (威力彩's first zone, 今彩539, 大樂透). 雙贏彩 and 大福彩 are no longer
  sold, so their numbers come from the real BINGO BINGO draw at 20:30,
  hashed with the game's name: nobody can know them before that draw.
  Pool prizes (威力彩's first two tiers, 大樂透's first four) pay what that
  draw paid per winner, shared with the real winners; a tier nobody won
  pays its whole pool. Prizes over NT$5,000 are taxed 20.4%. Sales for an
  evening draw close half an hour before it; BINGO draws every 5 minutes
  07:05-23:55.
- **6 scratch cards** (NT$100-2,000): 幸運7, 三個一樣, 對中發財, 賓果連線,
  金幣翻倍 and 億萬富翁, each paying back about 58-65% with a top prize of
  10,000 times its price. The prize is fixed when the card is bought (crypto
  random, by the card's table); scratching (on a canvas, with a finger)
  reveals the face, laid out to show exactly that prize.
- **Buying:** each game card shows the time to the draw and the latest
  numbers, with a one-tap quick pick. A game's sheet shows your numbers as
  you pick them (with progress), a basket (add this bet, or quick pick 5)
  paid in one go from a buy bar that stays in view, then a done panel.
  My tickets lists those waiting for a draw and those drawn, with the total
  won.
- Tickets live on the account beside the slips (ledger entries
  `lotto-<id>` and `prize-<id>`), merge across devices like slips, and pay
  into the one pool.

An educational app about the math of the Taiwan Sports Lottery (台灣運彩): what each bet gives back on average, where the money goes, and why nearly every bet loses over time.

> Not betting advice. Lottery tickets in Taiwan are 18+ only, and betting on overseas sites (Polymarket included) is illegal in Taiwan.

## The app

Five tabs, drawn by the kit (`tabBar`, the same in every Quadra app): a bottom bar on phones, the top bar on desktop; the slip's count is a badge on 投注單. The top right is the kit's `topActions`: help, refresh, the account. Big numbers never wrap: they shrink (to 60% at most) to fit on one line. On desktop the tabs are in the top bar.

Logos come from ESPN, with dark-background versions in dark mode: the leagues on the filters, cards and boards, and the teams on the games.

The page stays simple: odds, colours and the amounts that matter. What the numbers mean (fair chance, back per NT$100, house take, margins of error) is explained in 說明's first card, 怎麼看這些數字; hovering a pick shows its own figures.

### 賽事 Games

- **What's listed:** every game of every league starting within the next 14 days (one reach for all, see the house cut below):
  - MLB and the Premier League (DraftKings and Polymarket).
  - **More sports from ESPN** (DraftKings' lines, else the house's own prices): football, basketball, hockey and the soccer leagues.
  - **More sports from Kambi** (a European bookmaker's public odds, `public/lib/kambi.mjs`): NPB, KBO and CPBL baseball, EuroLeague and B.League basketball, tennis (ATP, WTA), UFC, NRL, AFL, badminton, table tennis, volleyball and snooker. Every game on each league's own schedule is sold, not only the ones Kambi prices (`public/lib/schedules.mjs`): Asian baseball's month lists (clubs' strength from this season's results; settled from the lists' final scores, so only winner, totals, run lines, team totals, odd/even and margin), ESPN's UFC cards (fighters' records), tennis draws (ranking points), NRL and AFL schedules (ESPN standings), and for the rest every match in Kambi's list, priced or not. Kambi's price takes over a game once it has one.
  - The next F1 race winner, every driver named as the lottery writes them (G.羅素, AK.安東內利 …).
  - Championships (see Boards below).
  Everything but MLB, the Premier League and F1 loads in the background after the page opens.
- **Filters:** one tile per sport, never several sports in one (棒球, 籃球, 足球, 美式足球, 冰球, 網球, 羽球, 桌球, 排球, 撞球, F1, each with its games listed). Picking one with several leagues shows its leagues as chips underneath (全部聯賽, MLB, 日職 …). Then a day strip.
- **Picks:** tap one to add it to the bet slip. It shows the estimated lottery odds, and:
  - 🔒 (just the lock) when the lottery doesn't sell it, and 限2關 / 限3關 when it's sold only in parlays (see House rules);
  - a corner tag when it's recommended: 划算 (value), 穩 (steady) or 值博 (worth a shot) (see Recommendations);
  - a green tint when it gives back more than most; its fair chance, the market's cut and the average back per NT$100 in its tooltip.
- **更多玩法 (more markets)**, one tab per kind of market:
  - MLB: 大小分, 讓分 and 單隊大小 (the lottery's own lines, checked against its board, and a wider range), 得分最高單局, and from the score model 單雙, 勝分差, 首局得分, 前五局 and **首分** (who scores first);
  - other baseball (NPB, KBO, CPBL): the same (得分最高單局 too), from Kambi's win, run line and total;
  - football and basketball: 讓分, 大小分, **單隊總分** (team totals), 單雙, 勝分差, 上半場, **上半場大小** (first-half total) and **第一節** (first quarter);
  - hockey: puck lines, totals, **單隊大小**, 60 分鐘勝負, 單雙;
  - soccer: 讓球, 大小, **單隊大小**, 雙方進球, 波膽, 上半場, **上半場大小**, **雙重機會** (double chance: either of two results), **半全場** (half-time and full-time results together, 9 outcomes) and **總進球數** (0–1, 2–3, 4–6, 7+);
  - tennis, badminton, table tennis, volleyball, snooker: **第一局, 局數比分** ("Sinner 2:1"), **總局數, 讓局**, and handicaps and totals in games (tennis), points or frames on every match: Kambi's own line plus lines from a point-by-point model (each game or point won with the chance that gives the set chance; a set to 6 with a tiebreak, 11, 21 capped at 30, or 25 with a 15-point decider), shifted so it agrees with Kambi's price. Snooker's match length isn't in the feed: it's the one whose frame total best matches Kambi's line. Set chances come from the match chance (best of 3 or 5, sets independent);
  - F1: the race winner and **前三名** (podium): top-three chances from the win chances (Harville), priced to return what the winner board does.
- **Cards:** each shows its series (日職 · NPB, 網球 WTA · Seoul: the league and, for tours and cups, the event). Players' sports (tennis, badminton, table tennis, snooker) have no 主/客: players are listed in the draw's order as "A vs B".
- **場中 (live):** games in progress (MLB and the Premier League), refreshed every 30 seconds while on screen, with the same market tabs, 第N分 for MLB, and the live model (`public/lib/live.mjs`) checked on one real snapshot of the lottery's 場中 page. The house rules apply live too, so lopsided games show their lopsided side locked.

- **Boards:** F1 (drivers with team-coloured badges, and whether the odds are before or after qualifying) and every championship: World Series, AL, NL, NBA, Premier League, and from Polymarket's search NFL, NHL, WNBA, college football, Champions League, Europa League, La Liga, Serie A, Bundesliga, Ligue 1, MLS, and the F1 drivers' and constructors' titles.

### House rules, the house cut and recommendations

- **House rules** (`public/lib/rules.mjs`), for you and the simulated crowd alike:
  - locked (🔒): odds of 1.05 or less, or 8+ on ordinary markets (80+ on correct scores, margins, set scores and the like). F1 and championships are priced one by one up to 500 and never locked;
  - parlay only: under 1.30 only in parlays of 2+ games (限2關), under 1.15 of 3+ (限3關). The slip refuses a ticket with any combination too small for one of its picks. These thresholds are the house's usual shape, not measured on the lottery's board.
- **One house cut:** every market takes what the lottery was measured taking on that kind of market (1.158 two-way, 1.20 three-way, 1.35 bands, 1.50 correct scores, 1.92 the top inning, 1.16 live), whatever the league and whoever priced the game, so Play stays close to 運彩's prices (1.72-1.73 each side of a coin flip).
- **Every game, two weeks ahead** (`SOLD_DAYS` in the kit's `leagues.mjs`, shared with Fixtures' 投注): every league's games up to 14 days out. A game no bookmaker prices yet (preseason, a game past DraftKings' posting, a small league) is priced by the house (`public/lib/house.mjs`): each team's share of wins in ESPN's standings (last season, pulled a third of the way to even, weighted like 30% of a season, this season's games on top), log5 between the two, plus the home side's edge; soccer takes a draw out (27% between even sides); preseason pulled halfway to even. A bookmaker's line replaces it as soon as one is posted.
- **Recommendations** (`public/lib/recommend.mjs`), shown on each pick instead of a separate list: every pick is judged by its average back per NT$100 against the others. The day's top 10% get 划算; picks of 65%+ that return at least the median get 穩; picks of 30% or less in the top quarter get 值博. Locked picks, picks over 85% or under 5%, and lots of under 10 picks get none. The simulator's value hunters bet exactly these picks.

### 投注單 Bet slip

- **Ticket rules** follow the lottery:
  - 一關, 全部過關 and 過關組合 (過2關 … 過11關, 全過);
  - 1–12 picks, one per game;
  - NT$100–100,000 per ticket, with a NT$20 million payout cap;
  - 20% income tax plus 0.4% stamp duty on any combination paying over NT$5,000.
- **Mode:** 一關 (singles) by default.
- **Stake:** typed in NT$10 units, like a real slip (10 = NT$100 per combination).
- **Each pick** shows its market as a coloured tag (不讓分, 大小分, 讓分, 單隊大小 …), the pick, its game and start time in full, and its odds large (`@1.87`).
- **派彩試算 (what it pays)** above the place button: for 全部過關 the odds multiplied out (`1.89 × 1.87 × 1.68 = ×5.94`), for 一關 each pick's return, for 過關組合 each size with its number of combinations; then the ticket total, what all correct pays after tax (large) with the profit, the tax withheld when any combination is over NT$5,000, and the least a winning ticket pays.
- **Games that have started:** their pregame picks drop off the slip; live picks from 場中 stay.
- **Analysis:** all of it is exact over every way the picks can land:
  - **Key numbers:** cost, top payout, average back after tax, chance of any payout, chance of profit, take + tax. Each comes with its error range.
  - **Where each NT$100 goes:** back to you, the lottery's cut and the tax.
  - **Every result:** the chance of k of n correct, what it pays, and which results make a profit.
  - **Each pick on its own:** the odds against the fair odds, its value per NT$100, and what the ticket returns without it. The costliest pick is flagged.
  - **One pick short:** the chance of missing by exactly one pick, how many times likelier that is than winning outright, and for each pick the chance it's the only one that lost. The pick most likely to let the ticket down is flagged.
- **Grade:** a letter from the average back per NT$100 (a single game at the usual cut gets an A), a type from the chance of profit (steady to lottery ticket), the average loss per ticket in bubble teas, and how many tickets it takes on average to get paid once.
- **How hard is it to win?** The ticket's chances of all correct and of any profit, placed among well-known odds: a coin, a die, a stranger's birthday, 10 heads in a row, a royal flush, the Lotto 6/49 and Power Lottery jackpots.
- **Try a draw:** opens the ticket with each pick drawn from its fair chance. One ticket at a time, the picks revealed one by one; the button reads 開始 (Start), then 再開一張 (Restart) once a ticket is done. A running tally shows tickets opened, how many paid, the result so far with a small chart, the biggest ticket, and what the odds say that many tickets average.

### 紀錄 History: practice account, saved slips and stats

- **錢從哪裡來、到哪裡去 (where the money came from and went)** at the top of 統計分析 (`moneySources` in `history.mjs`): a bar of all money in (the start, weekly grants, mini games, payouts) and one of all stakes, each with amounts and shares; then betting's net result on settled slips, what the lottery kept (stakes minus payouts before tax) and the tax withheld, what work earned and how many minutes of a minimum-wage job it equals, how many mini-game rounds betting's losses would take to earn back, and money still out on open slips. Below it, mini games by game (rounds, total, average and best round, about how long played and the hourly rate), and each week's grants, mini games, betting and change. Shown as soon as there's a grant or a round, before any slip; the balance chart marks mini-game money too.

- **Play money only:** the money is the Quadra Pass's one pool (Quadra pays the month and the week); there's no betting limit and no sending money to another pass.
- **Kept on the pass:** the account is Play's data on the Quadra Pass, merged with this device's copy (never saved over when the pass's copy can't be read). A bet the account lost but the pass's money records still hold comes back as a recovered slip (cost, time and payout; picks lost), listed on its own and left out of the per-play tables.
- **模擬下注 (place with play money)** on the slip buys it at the odds shown: the cost comes off the balance at once, and the page opens the 紀錄 (history) tab with the slip in **我的投注單 (my slips)**. A slip costing more than the balance can't be placed.
- **Settling:** opening the 紀錄 tab (or coming back to it) checks every open slip whose games have started, at most every 90 seconds, or at once with 檢查結果:
  - MLB and Premier League from ESPN's final scores (innings for the top-scoring inning);
  - F1 from ESPN's race result;
  - championships from Polymarket once it resolves the market;
  - tennis from ESPN's tennis scoreboards (sets and games, whichever side each player is on; a retirement is void);
  - the other Kambi sports have no public results: they settle when Kambi's live score shows the match decided (a side has won the sets it needs, each sport's set target counted: 11 in table tennis, 21 in badminton, 25 and 15 in volleyball), otherwise 3 hours after the start the pick shows 中 / 沒中 / 取消 buttons to settle it by hand.

  Each pick is marked won, lost or void. Once all are decided the slip pays like a real ticket: a postponed or cancelled game counts at odds 1.00, every combination over NT$5,000 is taxed 20.4%, NT$20 million at most. A game still without a result three days after its start counts as void.
- **The card** shows the balance, the money on open slips, the total won or lost, and each slip with its picks (✓ ✗ ↺ ⏳, each with its market tag and odds) and a row of large figures: cost, total odds (全部過關), and what all correct pays or, once settled, the payout and profit.
- **Two views** under the account card: 投注單 (slips) and 統計分析 (stats).
- **Slip history:** a summary row (open slips, money at stake, the most they can pay, the settled result), filters for all, open, won and lost, and the slips in groups, each with its count, cost and result (or the most it can pay):
  - 比賽進行中: at least one game on now;
  - 等待開賽: no game started yet;
  - 已確定沒中: open, but nothing left can pay (a parlay with a lost pick) while its other games finish;
  - settled slips by the day they settled (今天, 昨天, then dates); 10 shown, the rest behind a button.

  Each pick shows its team's logo (saved with the pick, so it stays after the board moves on), the driver's badge for F1, or the league's logo for picks on no one team (單雙, 波膽 …).   Each card shows the mode, the number of games and when it was bought; a bar with one segment per pick (green won, red lost, grey void, pulsing red in play, empty not started); how many games are over and when the next one starts; each pick with its state (✓ ✗ ↺ ● ⏳), market tag and odds; and large figures: cost, total odds (parlays), what is already locked in and the most it can still pay, or once settled the payout and profit. **Games in play:** each pick whose game is on shows its score (sets and each set's score for matches in sets), where the game is (8局上, Q3 5:21, 67', 第 3 局) and whether it's winning, losing or level right now, judged by the same settlement the slip will use; the slip adds how many picks are winning and, once nothing is left to start, what it would pay at these scores. Scores come from the result checks themselves (ESPN's scoreboards, Kambi's live feed), every 30 seconds while 紀錄 is on screen and a game is in play. **History is kept for good:** each pick keeps its final score (or race winner) as it's decided, so old slips never depend on the sources keeping old games; picks are saved without empty fields; the sync holds up to 1 MB (several thousand slips) and warns if an account ever outgrows it; and 備份紀錄 downloads the whole account as a file and restores one (merged, like the sync, so nothing is lost or counted twice). Each slip folds out what the odds said when it was bought: its average payout, the chance of any payout, each pick's fair chance and value per NT$100, and once settled, its result against that average (luck) and the tax withheld.
- **統計與分析 (stats and analysis)**, from `public/lib/history.mjs`:
  - key numbers: slips settled, staked, paid after tax, net, back per NT$100 and the share of slips that paid, each against what the odds said to expect;
  - the balance over time, a step line with payouts and weekly claims marked;
  - luck or the cut: the expected loss (the lottery's cut plus tax) against the actual result, the usual luck range (one standard deviation over all settled slips) and how rare the result is (normal approximation);
  - how good the picks are: won against their fair chances, overall, by chance band (0–20% … 80–100%) and by market, with average odds;
  - by sport (slips from several sports count as mixed), by mode and by number of picks: slips, staked, net, back per NT$100 actual and expected;
  - streaks and records: the current and longest winning and losing runs, the best and worst slip, the biggest return, the average slip and the tax paid;
  - week by week (Taiwan weeks from Monday);
  - **你的下注輪廓 (how you bet)**, from `public/lib/profile.mjs`: tickets and hit rate, back per NT$100, average and largest ticket, picks per ticket and singles, average odds and pick chance, biggest win, longest streaks, near misses, best and worst week, pace, and the simulator's traits your tickets show (backs favourites, upset hunter, singles, parlay lover, every day, now and then, tilts). A simulated person's lookup shows the very same card from their replayed tickets;
  - **你和 100,000 人比 (you against the crowd):** the simulated crowd playing the nearest period at least as long as your record, run only now that it's needed, in the background: the share of the crowd your result beats, you against the typical person, and how the crowd's people with your traits did;
  - **趣味數據 (fun facts):** the biggest upset you picked, the most painful miss, parlays one pick short and what they'd have paid, the team you pick most and its record, your most played market, your favourite day to bet, how many picks were live, your boldest slip, and the lottery's average take from you in bubble teas.
- **Saves are always compressed:** the account is gzip-compressed (JSON → gzip → base64, marked `gz1:`, see `public/lib/codec.mjs`) both in `localStorage` and in the synced copy, about 8–10 times smaller. Older plain-JSON saves still open, and are rewritten compressed.
- **Sync:** 建立同步碼 creates an 8-character passcode (letters and digits, no 0/1/O/I); typing it on another device links that device to the same account. The two copies merge: the balance is a ledger of entries with fixed ids (start, each week's grant, each slip's stake and payout), so nothing counts twice, and a slip settled on either device is settled on both. Changes are sent a second after they happen, and picked up when the page opens or the tab comes back. The account lives in `localStorage` on each device and in Firestore (through Shared-Proxy's `/odds-sync`), stored under the passcode's hash.

### The simulated crowd (analysis only)

`public/lib/sim.mjs` still simulates about 100,000 bettors on this very board
(traits, stakes, the lottery's rules), but only for analysis: 紀錄's "you
against the crowd" compares your record with theirs over the same time.
The simulator tab itself was removed.

## The math

| What | How |
| --- | --- |
| Fair chance | DraftKings (via ESPN), Polymarket and Kambi, each with its margin removed, averaged |
| MLB win odds | `1 ÷ (fair × 1.15)`; average error about 0.04 against 14 real lottery games (2026-09-25) |
| MLB totals | Total runs as negative binomial (r = 5) fitted to DraftKings' line; the lottery's 3 lines (the one closest to 50/50, ±1). Matched all 12 lottery lines, 0.9 points off |
| MLB run lines | Lottery chance `0.5 + 0.732 × (p − 0.5)` for ±1.5, then 8.6 points more for ±2.5; 1.6% off on 38 prices |
| MLB team totals | Each team's runs as negative binomial (r = 4) fitted to the win chance and total; 17 of 18 lines matched |
| Top-scoring inning | The lottery's own fixed table (about a 48% take) |
| F1 winner, after qualifying | `1 ÷ (1.17 × fair^0.765)`, at least 1.05; drivers under 1% get the lottery's fixed 65 (0.4–1%) / 275 (0.15–0.4%) / 500. About 10% off on 8 drivers the eve of the 2026 Azerbaijan GP (`tests/fixtures/lottery-f1-2026-09-26.json`) |
| F1 winner, before qualifying | `1 ÷ fair^0.692`; 65 (0.4–1%) / 325 (0.1–0.4%) / 500. About 8% off on 9 prices from the same race's board the morning before qualifying. The phase comes from ESPN's F1 schedule (qualifying start + 90 minutes); without it, over 21 hours before the race counts as before |
| House cut | The measured cut of the market's kind, the same for every league and source |
| Sets (tennis …) | Per-set chance q from the match chance (best of 3 or 5); set scores `C(need−1+lost, lost) q^need (1−q)^lost` |
| Extra lines | Totals from the same negative binomial; run lines and team totals from the per-team score grid; odds `1 ÷ (p × 1.158)` (totals × 1.153), never above halfway from p to 1 in implied chance, at least 1.01. Not checked against the lottery |
| Championships | Implied chance ∝ `fair^0.7`, scaled to the lottery's total (MLB 200%, EPL 160%, others 180%, unchecked); longshots 133 / 300 |
| Back per NT$100 | `fair chance × odds × 100`; below 100 loses on average |
| House take | `1 − 1 ÷ Σ(1 / odds)` |
| Tax | 20.4% of any combination paying over NT$5,000 |

Every estimate carries its **margin of error**:

- **Fair chances:** half the DraftKings–Polymarket gap. `*` marks a game with only one source, which gets its league's typical gap.
- **Estimated odds:** their measured error against real lottery prices. `?` marks one not yet checked.
- **Simulator results:** 95% sampling error.

The calibration data is the real lottery prices in `tests/fixtures/lottery-mlb-2026-09-25.json` `tests/fixtures/lottery-f1-2026-09-26.json` and, for live odds, `tests/fixtures/lottery-live-2026-09-26.json`. Soccer, the Kambi sports and the new plays haven't been checked against the lottery yet.

### Our own lines (`lines.mjs`)

Every market past the winner (totals, handicaps, team totals, halves,
quarters, first five innings, margins, correct scores, both teams to score…)
is priced from two numbers: the win chance and the game's expected total.
The win chance always exists (DraftKings, Polymarket or Kambi). The total
used to come only from DraftKings, so a game without its line got little
more than the winner. Now, when no total is posted, it comes from a model:

- **Soccer**: each team's mean goals fitted to the game's own 1X2 chances (a
  likely draw means fewer goals), scaled up 12% (real games draw more often
  than independent goal counts say) and blended 70/30 with the league's own
  average.
- **Everything else**: the league's average total (`LEAGUE_TOTALS`), plus a
  little for one-sided basketball and football games.

The line is the half line nearest the mean, priced with the same spreads
the bookmaker lines use (negative binomial for runs and goals, normal for
points), and shown as the model's own (never as the lottery's line, with
more room for error in the recommendations).

Checked against the bookmakers' totals on one day's slate (2026-09-27),
mean gap between our total and theirs: MLB 0.7 runs (no bias), NPB 0.45,
KBO 0.9, CPBL 0.6, B.League 5 points, WNBA 10 (a four-game playoff sample),
NFL 2.9 points, NCAAF 0.4, MLS 0.2 goals, Liga MX 0.1. Game-to-game
differences (pitchers, parks, injuries) are what the model can't see; its
averages are unbiased.

With this, a league needs only a winner price to get the full board: the
Brasileirão, Argentina's Liga Profesional, the Süper Lig and the Scottish
Premiership were added this way (ESPN's DraftKings winner odds).

## How it works

A static site with no build step and no dependencies. The browser fetches odds live through the `sports-proxy` Cloudflare Worker from [Shared-Proxy](https://github.com/JayPengX/Shared-Proxy) (`PROXY_URL` in `public/lib/sources.mjs`). The Worker adds the CORS headers Polymarket doesn't send, and caches responses. A failed request is retried once. Team logos load straight from ESPN's image server; for the leagues ESPN doesn't cover (NPB, KBO, CPBL, B.League, EuroLeague, and the badminton, table tennis, snooker and WTA tours) they come from TheSportsDB's free badges, matched by the words the club names share. Players (tennis and the like) show initials.

The page depends on that Worker:

- **No proxy, no data.** If the Worker is down, the page opens without odds. The tests don't need it.
- **Allowed origins only:** `https://jaypengx.github.io` and `http://localhost:<port>`. Hosting elsewhere needs the origin added to `ALLOWED_ORIGINS` in Shared-Proxy's `sports-proxy-worker.js`.
- **Allowed hosts only:** `site.api.espn.com`, `gamma-api.polymarket.com` and `eu-offering-api.kambicdn.com` are the ones used here.
- **Fetching politely:** every response is cached at the Worker for every viewer (Kambi's lists 2 minutes, Polymarket's championship search 10 minutes, live scores 20 seconds), Kambi's responses are trimmed to the fields used (`&trim=kambi-events`, about 5× smaller), the page sends at most 6 requests at once, and live scores are polled only while the page is visible.

The account lives on the Quadra Pass: Shared-Proxy's `orbit-workers-proxy`, route `/eco` (the shared kit, `public/lib/quadra.mjs`). A Quadra Pass is required.

| File | Purpose |
| --- | --- |
| `public/lib/odds.mjs` | The math: devig, estimated odds, F1 phases, bet slip rules and analysis |
| `public/lib/board.mjs` | Every priced option of a game, for the page and the crowd alike, and the crowd's pool |
| `public/lib/lottery.mjs` | The lottery's draw games: rules, draw times, real results, prizes |
| `public/lib/scratch.mjs` | Scratch cards: prize tables and faces |
| `public/home.js`, `public/lottery-ui.js` | The home and lottery tabs |
| `public/lib/audit.mjs` | The fairness audit of sports and series |
| `public/lib/rules.mjs` | House rules (locks, parlay only) and the house cut |
| `public/lib/house.mjs` | The house's own prices for games no bookmaker prices: standings, records, ranking points |
| `public/lib/schedules.mjs` | Kambi leagues' own schedules (Asian baseball, UFC cards, tennis draws), every game on them |
| `public/lib/recommend.mjs` | Recommendations on single picks |
| `public/lib/sim.mjs` | The simulated crowd: traits, calendar, the shared world, leaderboards |
| `public/lib/profile.mjs` | One person's betting from their tickets, for you and for anyone in the crowd |
| `public/lib/kambi.mjs` | Kambi's odds and live scores |
| `public/lib/markets.mjs` | Every sport's side markets, the new plays and matches in sets |
| `public/lib/sources.mjs` | Fetching and parsing ESPN, Polymarket and Kambi; results; what the lottery would list |
| `public/lib/teams.mjs` | Leagues, Chinese team and driver names, ESPN logo ids, TheSportsDB badges, the F1 grid's team colours |
| `public/lib/i18n.mjs` | Traditional Chinese and English text (follows the browser's language) |
| `public/lib/account.mjs` | The practice account: ledger, weekly grant, placing and settling slips, merging two copies |
| `public/lib/quadra.mjs` | The shared Quadra kit (sign-in, session, pool, recommender) |
| `public/lib/live.mjs` | Live odds: the in-game score model, the lines closest to 50/50, prices at the live cut |
| `public/lib/history.mjs` | Stats over saved slips: money, luck against the cut, picks against their chances, breakdowns, streaks, records |
| `public/lib/codec.mjs` | gzip + base64 for every save |
| `public/app.js` | Rendering |
| `public/sim-worker.js` | Runs the crowd simulation off the main thread |
| `public/styles.css` | Design tokens (light and dark) and components |

A loading screen (logo, spinner, progress, time left) covers the page until the odds are ready, for 45 seconds at most. The crowd simulation never runs at start-up: only when the 模擬 tab opens (the page waits for it when it opens on that tab), or quietly in the background when 紀錄's 統計分析 needs it for the comparison. If the scripts never start, a failsafe in `index.html` offers Reload or Open anyway. On deploy, `scripts/stamp-version.mjs` does two things:

- It adds `?v=<commit>` to every local file, so browsers never mix new files with cached old ones.
- It stamps the commit into `index.html` and writes `version.json`. On open, and whenever the tab comes back, the page fetches `version.json` past every cache. If a newer deploy is out, the page reloads once under `?v=<commit>`, which fetches it and every file fresh.

A browser holding an old copy of the page still gets the new version.

## Development

```sh
npm test                                              # node:test, no installs needed
python3 -m http.server 8000 --directory public        # then open http://localhost:8000
```

Pushing to `main` runs the tests and deploys to GitHub Pages (Settings → Pages → Source: GitHub Actions).
