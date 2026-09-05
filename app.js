/* ------------------------------------------------------------------
   League Stats site — all data is read live from the CSV files in
   /data. To update the site, replace those CSVs (same file names)
   and push. No conversion step needed.
------------------------------------------------------------------- */

const DATA = {
  points: 'data/points_league_nrr.csv',
  batting: 'data/league_batting_stats_alltime.csv',
  bowling: 'data/league_bowling_stats_alltime.csv',
  matchlog: 'data/player_match_logs_odiwc.csv',
};

function loadCSV(path) {
  return new Promise((resolve, reject) => {
    Papa.parse(path, {
      download: true,
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: reject,
    });
  });
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

    const tbody = data.map((row, i) => {
      const cells = columns.map(col => {
        let val = row[col.key];
        if (col.format) val = col.format(val, row);
        return `<td class="${col.num ? 'num' : ''} ${col.cellClass ? col.cellClass(row) : ''}">${val}</td>`;
      }).join('');
      return `<tr><td class="rank-cell num">${i + 1}</td>${cells}</tr>`;
    }).join('');

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
