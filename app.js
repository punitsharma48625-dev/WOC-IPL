/* ------------------------------------------------------------------
   League Stats site — all data is read live from the CSV files in
   /data. To update the site, replace those CSVs (same file names)
   and push. No conversion step needed.

   Data model note:
   - league_batting_stats_alltime.csv / league_bowling_stats_alltime.csv
     are the OFFICIAL career totals. They are the source of truth for
     "all venues / all opponents" views.
   - player_match_logs_odiwc.csv is a per-player-per-match log (one row
     per player per match they appeared in, format/venue/opponent
     included). It's the source of truth for anything the official
     totals can't answer: per-venue splits, per-opponent ("matchup")
     splits, and recent form. Its grand totals can differ slightly from
     the official CSVs (it's a rawer, ungroomed log) — that's expected,
     not a bug, and the site labels those views accordingly.
------------------------------------------------------------------- */

const DATA = {
  points: 'data/points_league_nrr.csv',
  batting: 'data/league_batting_stats_alltime.csv',
  bowling: 'data/league_bowling_stats_alltime.csv',
  matchlog: 'data/player_match_logs_odiwc.csv',
};

/* ---------- CSV loading, cached so every page only fetches once ---------- */
const _csvCache = {};
function loadCSV(path) {
  if (_csvCache[path]) return _csvCache[path];
  _csvCache[path] = new Promise((resolve, reject) => {
    Papa.parse(path, {
      download: true,
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: reject,
    });
  });
  return _csvCache[path];
}

function num(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function debounce(fn, ms = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ---------- generic sortable table renderer ---------- */
function renderSortableTable(container, columns, rows, initialSortKey, initialDir = 'desc') {
  let sortKey = initialSortKey;
  let sortDir = initialDir;

  function sortedRows() {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return copy;
  }

  function draw() {
    const data = sortedRows();
    const thead = columns.map(col => {
      const cls = ['num-col-' + (col.num ? 'y' : 'n')];
      if (col.key === sortKey) cls.push(sortDir === 'asc' ? 'sorted-asc' : 'sorted');
      return `<th data-key="${col.key}" class="${col.num ? 'num ' : ''}${cls.join(' ')}">${col.label}</th>`;
    }).join('');

    const tbody = data.length ? data.map((row, i) => {
      const cells = columns.map(col => {
        let val = row[col.key];
        if (col.format) val = col.format(val, row);
        return `<td class="${col.num ? 'num' : ''} ${col.cellClass ? col.cellClass(row) : ''}">${val}</td>`;
      }).join('');
      return `<tr><td class="rank-cell num">${i + 1}</td>${cells}</tr>`;
    }).join('') : `<tr><td colspan="${columns.length + 1}" class="empty-state">No rows match these filters.</td></tr>`;

    container.innerHTML = `
      <table>
        <thead><tr><th class="num rank-cell">#</th>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    `;

    container.querySelectorAll('thead th[data-key]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.key;
        if (sortKey === key) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey = key;
          sortDir = 'desc';
        }
        draw();
      });
    });
  }

  draw();
}

/* ---------- fuzzy-ish name match, same idea as the bot's stats_alltime ---------- */
function nameMatches(name, term) {
  if (!name) return false;
  return name.toLowerCase().includes(term.toLowerCase());
}

/* ---------- pull a sortable timestamp out of a match_id when date is blank ---------- */
function matchTimestamp(row) {
  if (row.date) {
    const t = Date.parse(row.date);
    if (!isNaN(t)) return t;
  }
  const m = String(row.match_id).match(/(\d{8})_(\d{6})$/);
  if (m) {
    const [, d, t] = m;
    const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`;
    const parsed = Date.parse(iso);
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
}

function readableDate(ts) {
  if (!ts) return 'undated';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/* ------------------------------------------------------------------
   Match-log filtering & aggregation
   Every function below operates on rows from player_match_logs_odiwc.csv
------------------------------------------------------------------- */

function uniqueSorted(rows, key) {
  const set = new Set();
  rows.forEach(r => {
    const v = r[key];
    if (v !== undefined && v !== null && v !== '') set.add(String(v));
  });
  return [...set].sort((a, b) => a.localeCompare(b));
}

function filterMatchRows(rows, f) {
  return rows.filter(r => {
    if (f.format && f.format !== 'All' && r.format !== f.format) return false;
    if (f.venue && f.venue !== 'All' && r.venue !== f.venue) return false;
    if (f.opponent && f.opponent !== 'All' && r.opponent !== f.opponent) return false;
    if (f.team && f.team !== 'All' && r.team !== f.team) return false;
    if (f.search && !nameMatches(r.player, f.search)) return false;
    return true;
  });
}

/* Aggregate batting figures per player from raw match-log rows.
   "Batted" = a row where balls>0 or runs>0 (mirrors how the row is
   populated when a player has no batting contribution at all). */
function aggregateBatting(rows) {
  const byPlayer = new Map();
  rows.forEach(r => {
    if (!r.player) return;
    const runs = num(r.runs);
    const balls = num(r.balls);
    if (balls <= 0 && runs <= 0) return; // did not bat this match
    const key = `${r.player}|${r.format || ''}`;
    if (!byPlayer.has(key)) {
      byPlayer.set(key, {
        name: r.player, format: r.format || '', matches: 0, innings: 0, runs: 0, balls: 0, dismissals: 0,
      });
    }
    const p = byPlayer.get(key);
    p.matches += 1;
    p.innings += 1;
    p.runs += runs;
    p.balls += balls;
    if (r.out === 'Yes') p.dismissals += 1;
  });
  return [...byPlayer.values()].map(p => ({
    ...p,
    strike_rate: p.balls > 0 ? (p.runs / p.balls) * 100 : 0,
    avg_runs: p.innings > 0 ? p.runs / p.innings : 0,
    not_outs: p.innings - p.dismissals,
    average: p.dismissals > 0 ? p.runs / p.dismissals : p.runs,
  }));
}

/* Aggregate bowling figures per player from raw match-log rows.
   "Bowled" = a row where overs>0 (mirrors having a bowling spell). */
function aggregateBowling(rows) {
  const byPlayer = new Map();
  rows.forEach(r => {
    if (!r.player) return;
    const overs = num(r.overs);
    const runsConceded = num(r.runs_conceded);
    const wickets = num(r.wickets);
    if (overs <= 0 && runsConceded <= 0 && wickets <= 0) return; // did not bowl
    const key = `${r.player}|${r.format || ''}`;
    if (!byPlayer.has(key)) {
      byPlayer.set(key, {
        name: r.player, format: r.format || '', matches: 0, overs: 0, runs_conceded: 0, wickets: 0,
      });
    }
    const p = byPlayer.get(key);
    p.matches += 1;
    p.overs += overs;
    p.runs_conceded += runsConceded;
    p.wickets += wickets;
  });
  return [...byPlayer.values()].map(p => ({
    ...p,
    economy: p.overs > 0 ? p.runs_conceded / p.overs : 0,
    bowling_average: p.wickets > 0 ? p.runs_conceded / p.wickets : 0,
    bowling_sr: p.wickets > 0 ? (p.overs * 6) / p.wickets : 0,
  }));
}

/* Group a player's own match rows by an arbitrary key (venue/opponent)
   and return combined batting+bowling figures per group. Used for the
   "matchup" breakdowns on the player page. */
function aggregateByGroup(rows, groupKey) {
  const byGroup = new Map();
  rows.forEach(r => {
    const g = r[groupKey];
    if (!g) return;
    if (!byGroup.has(g)) {
      byGroup.set(g, {
        group: g, matches: 0,
        runs: 0, balls: 0, dismissals: 0, innings: 0,
        wickets: 0, overs: 0, runs_conceded: 0,
      });
    }
    const p = byGroup.get(g);
    p.matches += 1;
    const runs = num(r.runs), balls = num(r.balls);
    if (balls > 0 || runs > 0) {
      p.innings += 1;
      p.runs += runs;
      p.balls += balls;
      if (r.out === 'Yes') p.dismissals += 1;
    }
    const overs = num(r.overs), rc = num(r.runs_conceded), wkts = num(r.wickets);
    if (overs > 0 || rc > 0 || wkts > 0) {
      p.overs += overs;
      p.runs_conceded += rc;
      p.wickets += wkts;
    }
  });
  return [...byGroup.values()].map(p => ({
    ...p,
    strike_rate: p.balls > 0 ? (p.runs / p.balls) * 100 : 0,
    average: p.dismissals > 0 ? p.runs / p.dismissals : p.runs,
    economy: p.overs > 0 ? p.runs_conceded / p.overs : 0,
    bowling_average: p.wickets > 0 ? p.runs_conceded / p.wickets : 0,
    bowling_sr: p.wickets > 0 ? (p.overs * 6) / p.wickets : 0,
  })).sort((a, b) => b.matches - a.matches);
}

/* ------------------------------------------------------------------
   Records & milestones — all derived from the raw match log.
------------------------------------------------------------------- */

/* Per-player-per-format count of milestone innings/spells:
   centuries, fifties, five-wicket hauls, three-wicket hauls. */
function aggregateMilestones(rows) {
  const byPlayer = new Map();
  function bucket(player, format) {
    const key = `${player}|${format || ''}`;
    if (!byPlayer.has(key)) {
      byPlayer.set(key, {
        name: player, format: format || '',
        centuries: 0, fifties: 0, fivefers: 0, threefers: 0,
      });
    }
    return byPlayer.get(key);
  }
  rows.forEach(r => {
    if (!r.player) return;
    const runs = num(r.runs), balls = num(r.balls);
    if (balls > 0 || runs > 0) {
      const p = bucket(r.player, r.format);
      if (runs >= 100) p.centuries += 1;
      else if (runs >= 50) p.fifties += 1;
    }
    const wickets = num(r.wickets), overs = num(r.overs), rc = num(r.runs_conceded);
    if (overs > 0 || wickets > 0 || rc > 0) {
      const p = bucket(r.player, r.format);
      if (wickets >= 5) p.fivefers += 1;
      else if (wickets >= 3) p.threefers += 1;
    }
  });
  return [...byPlayer.values()];
}

/* Top N single-innings batting performances (qualified by a minimum
   number of balls faced, so a lucky single ball doesn't rank). */
function topIndividualScores(rows, n = 10, minBalls = 1) {
  return rows
    .filter(r => r.player && (num(r.balls) > 0 || num(r.runs) > 0) && num(r.balls) >= minBalls)
    .map(r => ({
      player: r.player, format: r.format, runs: num(r.runs), balls: num(r.balls),
      strike_rate: num(r.balls) > 0 ? (num(r.runs) / num(r.balls)) * 100 : 0,
      out: r.out, team: r.team, opponent: r.opponent, venue: r.venue,
      ts: matchTimestamp(r),
    }))
    .sort((a, b) => b.runs - a.runs || b.strike_rate - a.strike_rate)
    .slice(0, n);
}

/* Top N single-spell bowling figures (most wickets, tie-broken by
   fewest runs conceded, then best economy). */
function topBowlingFigures(rows, n = 10, minOvers = 0) {
  return rows
    .filter(r => r.player && (num(r.overs) > 0 || num(r.wickets) > 0 || num(r.runs_conceded) > 0))
    .filter(r => num(r.overs) >= minOvers)
    .map(r => ({
      player: r.player, format: r.format, wickets: num(r.wickets),
      runs_conceded: num(r.runs_conceded), overs: num(r.overs),
      economy: num(r.overs) > 0 ? num(r.runs_conceded) / num(r.overs) : 0,
      bowling_average: num(r.wickets) > 0 ? num(r.runs_conceded) / num(r.wickets) : 0,
      bowling_sr: num(r.wickets) > 0 ? (num(r.overs) * 6) / num(r.wickets) : 0,
      team: r.team, opponent: r.opponent, venue: r.venue, ts: matchTimestamp(r),
    }))
    .sort((a, b) => b.wickets - a.wickets || a.runs_conceded - b.runs_conceded)
    .slice(0, n);
}

/* ------------------------------------------------------------------
   Position analysis — runs by batting position (1-11), broken down by
   venue, with a Total column. Position "0" in the log means the player
   didn't bat, so it's excluded. Works for either the whole league or
   a single player's rows, depending on what's passed in.
------------------------------------------------------------------- */
function aggregatePositionByVenueMatrix(rows) {
  const posSet = new Set();
  const venueSet = new Set();
  // cell[position][venue] = { runs, balls, dismissals, innings }
  const cell = new Map();

  function getCell(pos, venue) {
    const key = `${pos}|${venue}`;
    if (!cell.has(key)) cell.set(key, { runs: 0, balls: 0, dismissals: 0, innings: 0 });
    return cell.get(key);
  }

  rows.forEach(r => {
    const pos = num(r.position);
    const venue = r.venue;
    if (pos <= 0 || !venue) return;
    const runs = num(r.runs), balls = num(r.balls);
    if (balls <= 0 && runs <= 0) return;
    posSet.add(pos);
    venueSet.add(venue);
    const c = getCell(pos, venue);
    c.innings += 1;
    c.runs += runs;
    c.balls += balls;
    if (r.out === 'Yes') c.dismissals += 1;
  });

  const positions = [...posSet].sort((a, b) => a - b);
  const venues = [...venueSet].sort((a, b) => a.localeCompare(b));

  const table = positions.map(pos => {
    const row = { position: pos, total: 0, totalInnings: 0 };
    venues.forEach(v => {
      const c = cell.get(`${pos}|${v}`);
      row[v] = c ? c.runs : 0;
      row.total += c ? c.runs : 0;
      row.totalInnings += c ? c.innings : 0;
    });
    return row;
  });

  return { positions, venues, table };
}

/* ------------------------------------------------------------------
   Reusable filter bar. Renders format / venue / opponent / search /
   min-matches controls into `container` and calls onChange(filters)
   whenever any control changes. Any of the `with*` options can be
   omitted to hide that control.
------------------------------------------------------------------- */
function buildFilterBar(container, opts, onChange) {
  const {
    formats = [], venues = [], opponents = [],
    withFormat = true, withVenue = false, withOpponent = false,
    withSearch = true, withMinMatches = false,
    minMatchesLabel = 'Min matches',
    searchLabel = 'Search player',
    searchPlaceholder = 'e.g. kohli, mhatre…',
    numericFilters = [],
    // numericFilters: [{ key, label, placeholder }]
    // each becomes a number input; value lands in filters.numeric[key]
    // (null when left blank, i.e. "no threshold"). The caller's render
    // function decides how to compare it (gte/lte/etc) against rows.
  } = opts;

  const state = {
    format: 'All', venue: 'All', opponent: 'All', search: '', minMatches: 0,
    numeric: {},
  };
  numericFilters.forEach(nf => { state.numeric[nf.key] = null; });

  const parts = [];

  if (withSearch) {
    parts.push(`
      <div class="filter-field filter-search">
        <label>${searchLabel}</label>
        <input type="text" id="f-search" placeholder="${searchPlaceholder}" autocomplete="off">
      </div>`);
  }
  if (withFormat) {
    parts.push(`
      <div class="filter-field">
        <label>Format</label>
        <select id="f-format">
          <option value="All">All formats</option>
          ${formats.map(f => `<option value="${f}">${f}</option>`).join('')}
        </select>
      </div>`);
  }
  if (withVenue) {
    parts.push(`
      <div class="filter-field">
        <label>Venue</label>
        <select id="f-venue">
          <option value="All">All venues (official totals)</option>
          ${venues.map(v => `<option value="${v}">${v}</option>`).join('')}
        </select>
      </div>`);
  }
  if (withOpponent) {
    parts.push(`
      <div class="filter-field">
        <label>Opponent</label>
        <input type="text" id="f-opponent" list="f-opponent-list" placeholder="All opponents" autocomplete="off">
        <datalist id="f-opponent-list">
          ${opponents.map(o => `<option value="${o}">`).join('')}
        </datalist>
      </div>`);
  }
  if (withMinMatches) {
    parts.push(`
      <div class="filter-field filter-narrow">
        <label>${minMatchesLabel}</label>
        <input type="number" id="f-min" min="0" step="1" value="0">
      </div>`);
  }

  numericFilters.forEach(nf => {
    parts.push(`
      <div class="filter-field filter-narrow">
        <label>${nf.label}</label>
        <input type="number" id="f-num-${nf.key}" step="${nf.step || 'any'}" placeholder="${nf.placeholder || 'any'}">
      </div>`);
  });

  parts.push(`<button type="button" class="filter-reset" id="f-reset">Reset</button>`);

  container.innerHTML = `<div class="filter-bar">${parts.join('')}</div>`;

  function fire() { onChange({ ...state }); }

  if (withSearch) {
    const el = container.querySelector('#f-search');
    el.addEventListener('input', debounce(() => { state.search = el.value.trim(); fire(); }, 120));
  }
  if (withFormat) {
    container.querySelector('#f-format').addEventListener('change', (e) => {
      state.format = e.target.value; fire();
    });
  }
  if (withVenue) {
    container.querySelector('#f-venue').addEventListener('change', (e) => {
      state.venue = e.target.value; fire();
    });
  }
  if (withOpponent) {
    const el = container.querySelector('#f-opponent');
    el.addEventListener('input', debounce(() => {
      const v = el.value.trim();
      state.opponent = v === '' ? 'All' : v; fire();
    }, 150));
  }
  if (withMinMatches) {
    const el = container.querySelector('#f-min');
    el.addEventListener('input', debounce(() => {
      state.minMatches = num(el.value); fire();
    }, 150));
  }

  numericFilters.forEach(nf => {
    const el = container.querySelector(`#f-num-${nf.key}`);
    el.addEventListener('input', debounce(() => {
      state.numeric[nf.key] = el.value.trim() === '' ? null : num(el.value);
      fire();
    }, 150));
  });

  container.querySelector('#f-reset').addEventListener('click', () => {
    state.format = 'All'; state.venue = 'All'; state.opponent = 'All';
    state.search = ''; state.minMatches = 0;
    numericFilters.forEach(nf => { state.numeric[nf.key] = null; });
    if (withSearch) container.querySelector('#f-search').value = '';
    if (withFormat) container.querySelector('#f-format').value = 'All';
    if (withVenue) container.querySelector('#f-venue').value = 'All';
    if (withOpponent) container.querySelector('#f-opponent').value = '';
    if (withMinMatches) container.querySelector('#f-min').value = 0;
    numericFilters.forEach(nf => {
      container.querySelector(`#f-num-${nf.key}`).value = '';
    });
    fire();
  });

  return { getState: () => ({ ...state }) };
}
