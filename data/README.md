# League Stats site

A static site: points table, all-time batting/bowling leaderboards, a
records/milestones page, and a player search page. Everything reads live
from the CSV files in `/data` — there is no build step and no database.

## Pages

- `index.html` — points table, filterable by team name / min wins / min points
- `batting.html` / `bowling.html` — all-time leaderboards, filterable by
  format/venue/opponent, plus threshold filters (min runs, min average, min
  SR for batting; min wickets, max economy, max bowling average for bowling)
- `records.html` — highest scores, best bowling figures, and career milestones
  (100s, 50s, 5-wicket hauls, 3-wicket hauls), always across the whole
  league — computed live from the match log, no filters
- `player.html` — search any player for career stats, recent form, and venue
  splits, plus their milestone totals — filterable by format, opponent and
  a min-matches threshold on the venue-split table
- `positions.html` ("Player Position" in the nav) — runs by batting position
  (1-11) crossed with venue, with a total column across all venues —
  league-wide, or scoped to one player via the player filter (type-ahead
  suggests names as you type)
- `matchup.html` — batter-vs-bowler head-to-head from the ball-by-ball log
- `100k_batting.html` / `100k_bowling.html` / `100k_matchup.html` — the
  simulation-engine output (see below), kept separate from the pages above
  since it's a different data source (simulated seasons, not real matches)

(The old `venues.html` page was removed — it was the one causing pages to
hang on load.)

## The 100k pages

`100k_batting.html` and `100k_bowling.html` read **directly from the Excel
workbook** at `data/100k_simulation_results.xlsx` — there's no CSV
conversion step. The browser fetches the `.xlsx` file and parses it with
the SheetJS library (loaded from a CDN in those two pages only), the same
way the other pages fetch and parse CSVs with PapaParse.

The workbook is expected to contain:
- `Overall Batting` / `Overall Bowling` — league-wide totals per player
- `V_<Venue> Bat` / `V_<Venue> Bowl` — one pair of sheets per venue
  (Mohali, Ekana, Chepauk, Hyderabad, Jaipur, Ahmedabad, Wankhede, Eden,
  Chinnaswamy, Delhi), same columns as the overall sheets
- A `Team` column formatted as `<franchise>_<pace|spin|neutral>` (e.g.
  `dc_neutral`) — the site splits this into a **Team** filter and a
  separate **Attack faced** filter
- Phase splits as column groups: `PP_*` (Powerplay), `Mid_*` (Middle),
  `Death_*`
- Strategy splits as column groups: `Def_*` (Defensive), `Norm_*` (Normal),
  `Agg_*` (Aggressive)

**Updating to the full 100k run:** once the 100k simulation finishes,
just replace `data/100k_simulation_results.xlsx` with the new workbook,
keeping the same file name and the same sheet names/column headers inside
it. Nothing else needs to change — reload the page and it reads the new
numbers. (Same idea as the CSV files elsewhere: replace, don't re-code.)

The **Phase** and **Strategy** filters are mutually exclusive — picking one
locks the other back to "Overall" — because the sim doesn't have a
Powerplay-and-Aggressive (or any phase-and-strategy) cross-tab, only the
two marginal breakdowns. When neither is selected, the table shows the
career/overall columns.

`100k_matchup.html` works exactly like `matchup.html`, just pointed at
`data/100k_batter_vs_bowler_matchup.csv`. Update it the same way as the
other CSVs — replace the file, keep the name and columns.

## Deploy for free (GitHub Pages)

1. Create a new GitHub repository (public repos get free Pages hosting).
2. Upload all files in this folder, keeping the structure:
   ```
   index.html
   batting.html
   bowling.html
   records.html
   player.html
   positions.html
   matchup.html
   100k_batting.html
   100k_bowling.html
   100k_matchup.html
   style.css
   app.js
   data/
     points_league_nrr.csv
     league_batting_stats_alltime.csv
     league_bowling_stats_alltime.csv
     player_match_logs_odiwc.csv
     batter_vs_bowler_matchup.csv
     100k_simulation_results.xlsx
     100k_batter_vs_bowler_matchup.csv
   ```
   Easiest way with no git experience: on the repo page, click
   **Add file → Upload files**, drag everything in, and commit.
3. Go to the repo's **Settings → Pages**.
4. Under "Build and deployment", set Source to **Deploy from a branch**,
   branch `main`, folder `/ (root)`. Save.
5. GitHub gives you a URL like `https://yourname.github.io/repo-name/`
   within a minute or two. That's your live site — it stays online even
   if your laptop is off, because GitHub is hosting it, not you.

## Updating the stats later

No conversion step — just replace the CSV file with the same name and
push (or drag-and-drop the new file over the old one in the GitHub web
UI, which also works and needs no git commands). The site reads
whatever is in `/data` on every page load, so once the new file is live
on GitHub, the site reflects it immediately for every visitor.

If you'd rather do it from your laptop with git installed:
```
git add data/*.csv
git commit -m "update stats"
git push
```

## Notes

- `t20_ball_by_ball_log.csv` was intentionally left out — it's 26MB,
  too heavy to fetch in a browser, and none of the pages here need
  ball-by-ball detail (only the two all-time stat files, the points
  table, and the per-player match log).
- Player search matches any substring of a name, case-insensitive,
  same as the bot's `!stats_alltime` behavior.
- Table headers are clickable to sort by any column.
