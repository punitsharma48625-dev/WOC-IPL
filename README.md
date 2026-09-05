# League Stats site

A static site: points table, all-time batting/bowling leaderboards, and a
player search page. Everything reads live from the CSV files in `/data` —
there is no build step and no database.

## Deploy for free (GitHub Pages)

1. Create a new GitHub repository (public repos get free Pages hosting).
2. Upload all files in this folder, keeping the structure:
   ```
   index.html
   batting.html
   bowling.html
   player.html
   style.css
   app.js
   data/
     points_league_nrr.csv
     league_batting_stats_alltime.csv
     league_bowling_stats_alltime.csv
     player_match_logs_odiwc.csv
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
