(function () {
  const games = window.GAMES || [];
  const $ = (sel) => document.querySelector(sel);

  const DIFFICULTY = { 1: "Easy", 2: "Medium", 3: "Hard" };
  const LENGTHS = [
    { id: "short", label: "Under 3 min", test: (m) => m < 3 },
    { id: "medium", label: "3 to 5 min", test: (m) => m >= 3 && m <= 5 },
    { id: "long", label: "5+ min", test: (m) => m > 5 },
  ];
  const lengthOf = (g) => LENGTHS.find((l) => l.test(g.minutes)).id;

  const state = {
    q: "",
    sort: "popular",
    category: new Set(),
    difficulty: new Set(),
    length: new Set(),
    features: new Set(),
  };

  // "Played today" ticks, stored per day in this browser only.
  const today = new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD, so ticks reset at the viewer's midnight
  let played = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem("dailies:played") || "{}");
    // Ticks for games no longer on the shelf are dropped, so they cannot inflate the count.
    if (saved.date === today) played = new Set(saved.ids.filter((id) => games.some((g) => g.id === id)));
  } catch (e) {}
  // Punches per day, kept past midnight so a streak can be counted. Local to this browser like the ticks.
  let days = {};
  try { days = JSON.parse(localStorage.getItem("dailies:days") || "{}") || {}; } catch (e) {}
  const dayAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString("en-CA"); };
  // Which games were punched each day (a 4-character code per game, so a card fits in a link), and the days a card was
  // completed. Same 400-day window as the counts.
  const hashStr = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const codeOf = (id) => (hashStr(id) % 1679616).toString(36).padStart(4, "0");
  const byCode = new Map(games.map((g) => [codeOf(g.id), g.id]));
  let log = {};
  let done = [];
  try { log = JSON.parse(localStorage.getItem("dailies:log") || "{}") || {}; } catch (e) {}
  try { done = JSON.parse(localStorage.getItem("dailies:done") || "[]") || []; } catch (e) {}
  const codesOf = (set) => games.filter((g) => set.has(g.id)).map((g) => codeOf(g.id)).join("");
  const lastKeys = (obj) => Object.fromEntries(Object.keys(obj).sort().slice(-400).map((k) => [k, obj[k]]));
  const saveDays = () => {
    const codes = codesOf(played);
    if (played.size) days[today] = played.size; else delete days[today];
    if (codes) log[today] = codes; else delete log[today];
    done = done.filter((d) => d !== today);
    if (games.length && codes.length === games.length * 4) done.push(today);
    days = lastKeys(days);
    log = lastKeys(log);
    done = done.sort().slice(-400);
    try {
      localStorage.setItem("dailies:days", JSON.stringify(days));
      localStorage.setItem("dailies:log", JSON.stringify(log));
      localStorage.setItem("dailies:done", JSON.stringify(done));
    } catch (e) {}
  };
  const savePlayed = () => {
    try {
      localStorage.setItem("dailies:played", JSON.stringify({ date: today, ids: [...played] }));
    } catch (e) {}
    saveDays();
  };
  if (played.size && (days[today] !== played.size || !log[today])) saveDays(); // punches made before streaks or the log existed
  // Days in a row with at least one punch. Today not punched yet doesn't break it: the run is counted back from yesterday.
  const streakNow = () => {
    let n = 0;
    const from = days[today] ? 0 : 1;
    while (days[dayAgo(from + n)]) n++;
    return n;
  };

  const bestStreak = () => {
    let best = 0, run = 0, prev = null;
    for (const k of Object.keys(days).sort()) {
      if (!(days[k] > 0)) continue;
      const [y, m, d] = k.split("-").map(Number);
      const at = new Date(y, m - 1, d);
      run = prev && Math.round((at - prev) / 864e5) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = at;
    }
    return best;
  };

  // Favorites: the games a visitor starred, in the order they starred them. Local to this browser.
  let favs = [];
  try { favs = JSON.parse(localStorage.getItem("dailies:favs") || "[]").filter((id) => games.some((g) => g.id === id)); } catch (e) {}
  const saveFavs = () => { try { localStorage.setItem("dailies:favs", JSON.stringify(favs)); } catch (e) {} };

  const unique = (arr) => [...new Set(arr)].sort();

  // Every category is punched with its own shape (the shapes themselves live in styles.css).
  // Known categories keep a fixed shape; any new one takes the next free shape.
  const SHAPE_OF = { Geography: "circle", Trivia: "diamond", Estimation: "triangle", Numbers: "square", Logic: "hexagon", Word: "star" };
  const SPARE_SHAPES = ["circle", "diamond", "triangle", "square", "hexagon", "star"];
  const newCategories = unique(games.map((g) => g.category)).filter((c) => !SHAPE_OF[c]);
  const shapeOf = (cat) => SHAPE_OF[cat] || SPARE_SHAPES[newCategories.indexOf(cat) % SPARE_SHAPES.length];

  // A game's icon becomes a mask, so the same shape can be printed in colour and then punched out black.
  const iconSvg = (g, color = "#000", size = 0) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"${size ? ` width="${size}" height="${size}"` : ""} fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${g.icon.split("#000").join(color)}</svg>`;
  const iconAttrs = (g) => {
    if (!g.icon) return "";
    return ` data-icon style="--icon:url('data:image/svg+xml,${encodeURIComponent(iconSvg(g)).replace(/'/g, "%27")}')"`;
  };

  const groups = [
    { key: "category", label: "Type", options: unique(games.map((g) => g.category)).map((c) => ({ id: c, label: c, shape: shapeOf(c) })) },
    { key: "difficulty", label: "Difficulty", options: [1, 2, 3].map((d) => ({ id: String(d), label: DIFFICULTY[d] })) },
    { key: "length", label: "Length", options: LENGTHS.map((l) => ({ id: l.id, label: l.label })) },
    { key: "features", label: "Features", options: unique(games.flatMap((g) => g.tags || [])).map((t) => ({ id: t, label: t })) },
  ].filter((g) => g.options.length);

  function renderFilters() {
    $("#filters").innerHTML = groups
      .map(
        (g) => `
        <div class="group" role="group" aria-label="${g.label}">
          <span class="group-label">${g.label}</span>
          <div class="chips">
            ${g.options
              .map(
                (o) =>
                  `<button type="button" class="chip" data-key="${g.key}" data-id="${o.id}"${o.shape ? ` data-shape="${o.shape}"` : ""} aria-pressed="${state[g.key].has(o.id)}">${
                    o.shape ? `<span class="glyph" data-shape="${o.shape}" aria-hidden="true"></span>` : ""
                  }${o.label}</button>`
              )
              .join("")}
          </div>
        </div>`
      )
      .join("");
  }

  function matches(g) {
    const q = state.q.trim().toLowerCase();
    if (q && !`${g.name} ${g.by} ${g.category} ${g.blurb} ${(g.tags || []).join(" ")}`.toLowerCase().includes(q)) return false;
    if (state.category.size && !state.category.has(g.category)) return false;
    if (state.difficulty.size && !state.difficulty.has(String(g.difficulty))) return false;
    if (state.length.size && !state.length.has(lengthOf(g))) return false;
    for (const f of state.features) if (!(g.tags || []).includes(f)) return false;
    return true;
  }

  const sorters = {
    popular: (a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name),
    easy: (a, b) => a.difficulty - b.difficulty || a.minutes - b.minutes,
    hard: (a, b) => b.difficulty - a.difficulty || b.minutes - a.minutes,
    short: (a, b) => a.minutes - b.minutes || a.name.localeCompare(b.name),
    long: (a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name),
    nameZ: (a, b) => b.name.localeCompare(a.name),
    new: (a, b) => b.added.localeCompare(a.added) || a.name.localeCompare(b.name),
  };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const host = (url) => new URL(url).hostname.replace(/^www\./, "");
  // A game's number runs through the categories in the order of the category boxes (biggest first, then A to Z), and through
  // each category in games.js order. It stays put when the shelf is filtered or sorted, and moves when games are added or removed.
  const serial = (g) => String(numbers.get(g.id)).padStart(2, "0");

  // The star toggles a favorite from anywhere it appears; all of them are kept in step by toggleFav.
  const star = (g) =>
    `<button class="star" type="button" data-fav="${esc(g.id)}" aria-pressed="${favs.includes(g.id)}" aria-label="Favorite ${esc(g.name)}" title="Favorite"></button>`;

  function card(g, i) {
    const done = played.has(g.id);
    const shape = shapeOf(g.category);
    const notches = [1, 2, 3].map((n) => `<i class="${n <= g.difficulty ? "on" : ""}"></i>`).join("");
    return `
      <article class="card${done ? " done" : ""}" data-cat="${esc(g.category)}" data-shape="${shape}" style="--i:${i}">
        <label class="tile tick" title="Mark as played today">
          <span class="serial"><small>N&ordm;</small>${serial(g)}</span>
          <input type="checkbox" data-played="${esc(g.id)}" ${done ? "checked" : ""}>
          <span class="punch" data-shape="${shape}"${iconAttrs(g)} aria-hidden="true"><i class="hole"></i></span>
          <span class="tick-text" aria-hidden="true"><b class="t-off">Punch</b><b class="t-on">Punched</b></span>
          <span class="sr">Played today</span>
        </label>
        <div class="main">
          <h2><a href="${esc(g.url)}" target="_blank" rel="noopener">${esc(g.name)}</a></h2>
          <p class="blurb">${esc(g.blurb)}</p>
          ${g.note ? `<p class="note">${esc(g.note)}</p>` : ""}
          <ul class="meta">
            <li class="cat-tag"><span class="glyph" data-shape="${shape}" aria-hidden="true"></span>${esc(g.category)}</li>
            <li title="Difficulty: ${DIFFICULTY[g.difficulty]}"><span class="notches" aria-hidden="true">${notches}</span>${DIFFICULTY[g.difficulty]}</li>
            <li><span class="clock" style="--a:${(Math.min(g.minutes, 6) / 6) * 360}deg" aria-hidden="true"></span>${g.minutes} min</li>
            <li>${esc(g.rounds)}</li>
          </ul>
          <div class="card-foot">
            <a class="pill play" href="${esc(g.url)}" target="_blank" rel="noopener">Play<span class="arrow" aria-hidden="true">&#8599;</span><span class="sr"> ${esc(g.name)}</span></a>
            <span class="host">${esc(host(g.url))}</span>
            ${star(g)}
          </div>
        </div>
        <span class="stamp" aria-hidden="true">Played</span>
      </article>`;
  }

  const grid = $("#grid");
  const calm = matchMedia("(prefers-reduced-motion: reduce)");
  const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const EASE_OUT = token("--ease-out");
  const EASE_IN_OUT = token("--ease-in-out");

  // Tickets keep their DOM node between renders so a filter or sort can move them instead of replacing them.
  const cards = new Map();
  function cardEl(g, i) {
    let el = cards.get(g.id);
    if (!el) {
      const t = document.createElement("template");
      t.innerHTML = card(g, i).trim();
      el = t.content.firstElementChild;
      el.dataset.id = g.id;
      cards.set(g.id, el);
    }
    return el;
  }

  // animate: chip, sort and clear changes get spatial continuity (FLIP). Typing in search stays instant.
  function render(animate) {
    const list = games.filter(matches).sort(sorters[state.sort]);

    // First: where every card is right now, mid-flight positions included, so a rapid second click retargets.
    const gridBox = grid.getBoundingClientRect();
    grid.querySelectorAll(".card.leaving").forEach((el) => el.remove());
    const first = new Map();
    for (const el of grid.children) first.set(el, el.getBoundingClientRect());
    for (const el of grid.children) el.getAnimations().forEach((a) => a.cancel());

    const next = list.map(cardEl);
    const kept = new Set(next);
    for (const el of [...grid.children]) {
      if (kept.has(el)) continue;
      cards.delete(el.dataset.id);
      const box = first.get(el);
      if (!animate || !box) { el.remove(); continue; }
      // Pull the card out of the grid at its old spot so the survivors can slide into the gap while it fades.
      Object.assign(el.style, {
        top: `${box.top - gridBox.top}px`,
        left: `${box.left - gridBox.left}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      });
      el.classList.add("leaving");
      el.inert = true;
      el.setAttribute("aria-hidden", "true");
      const out = el.animate(
        [{ opacity: 0, transform: calm.matches ? "none" : "scale(0.97)", offset: 1 }],
        { duration: 140, easing: EASE_OUT, fill: "forwards" }
      );
      out.onfinish = () => el.remove();
    }
    grid.append(...next);

    if (animate) {
      for (const el of next) {
        const from = first.get(el);
        if (!from) {
          el.animate(
            [{ opacity: 0, transform: calm.matches ? "none" : "scale(0.97)", offset: 0 }],
            { duration: 200, easing: EASE_OUT }
          );
        } else if (!calm.matches) {
          const to = el.getBoundingClientRect();
          const dx = from.left - to.left;
          const dy = from.top - to.top;
          if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
          el.animate(
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
            { duration: 260, easing: EASE_IN_OUT }
          );
        }
      }
    }

    $("#empty").hidden = list.length > 0;
    $("#count").textContent = `${list.length} of ${games.length} games`;
    const filtered = state.q || groups.some((g) => state[g.key].size);
    $("#clear").hidden = !filtered;
    renderProgress();
  }

  // Progress by type: one box per category, biggest first, each hole in games.js order.
  const trays = [...new Set(games.map((g) => g.category))]
    .map((c) => ({ c, list: games.filter((g) => g.category === c) }))
    .sort((a, b) => b.list.length - a.list.length || a.c.localeCompare(b.c));
  const numbers = new Map(trays.flatMap(({ list }) => list).map((g, i) => [g.id, i + 1]));
  const traysHtml = (counts) =>
    trays
      .map(
        ({ c, list }) => `
      <div class="cat" data-cat="${esc(c)}" data-shape="${shapeOf(c)}" style="--n:${list.length}">
        <p class="cat-head">${
          counts
            ? `<button type="button" class="cat-btn" aria-expanded="false" aria-controls="cat-panel"><span>${esc(c)}</span><span class="cat-count" data-cat="${esc(c)}"></span></button>`
            : `<span>${esc(c)}</span>`
        }</p>
        <div class="cat-holes">${list
          .map((g) => `<span class="punch" data-shape="${shapeOf(c)}"${iconAttrs(g)} data-id="${esc(g.id)}" title="${esc(g.name)}"><i class="hole"></i></span>`)
          .join("")}</div>
      </div>`
      )
      .join("");
  $("#holes").innerHTML = traysHtml(true);

  // Print only: every game with a box to punch by hand. Hidden on screen (see the print rules in styles.css).
  $("#sheet").innerHTML = `<h2>Today's card</h2><div class="sheet-cols">${trays
    .map(
      ({ c, list }) => `<div class="sheet-cat" data-shape="${shapeOf(c)}"><h3>${esc(c)}</h3><ul>${list
        .map((g) => `<li data-id="${esc(g.id)}"><i class="box"></i>${esc(g.name)}<small>${g.minutes} min</small></li>`)
        .join("")}</ul></div>`
    )
    .join("")}</div>`;

  // Slap the mark down as it flips to solid. Restarting the class lets a quick punch, un-punch, punch replay it.
  function punchOut(punch) {
    if (calm.matches) return;
    punch.classList.remove("punching");
    void punch.offsetWidth;
    punch.classList.add("punching");
    setTimeout(() => punch.classList.remove("punching"), 700);
  }

  // The new number arrives from the direction it moved: up when it grows, down when it shrinks.
  const slide = (el, dir) =>
    el.animate(
      [{ opacity: 0, transform: calm.matches ? "none" : `translateY(${dir * 8}px)`, offset: 0 }],
      { duration: 200, easing: EASE_OUT }
    );

  let shown = null;
  let streakShown = null;
  function renderStreak() {
    const n = streakNow();
    const week = [6, 5, 4, 3, 2, 1, 0].map((b) => days[dayAgo(b)] > 0);
    document.querySelectorAll("#streak .week i").forEach((el, i) => {
      el.classList.toggle("on", week[i]);
      el.classList.toggle("today", i === 6);
    });
    $("#streak-n").textContent = n;
    $("#streak-sr").textContent = `, punched on ${week.filter(Boolean).length} of the last 7 days`;
    if (streakShown !== null && n !== streakShown) slide($("#streak-n"), n > streakShown ? 1 : -1);
    streakShown = n;
  }

  function renderProgress() {
    const n = games.filter((g) => played.has(g.id)).length;
    const el = $("#progress");
    const complete = n > 0 && n === games.length;
    el.innerHTML = `<strong>${n}</strong><span class="of">/ ${games.length}</span>punched today`;
    $("#hero").classList.toggle("complete", complete);

    for (const el of document.querySelectorAll("#holes .cat-count")) {
      const inCat = games.filter((g) => g.category === el.dataset.cat);
      el.textContent = `${inCat.filter((g) => played.has(g.id)).length}/${inCat.length}`;
    }

    for (const punch of document.querySelectorAll("#holes .punch")) {
      const on = played.has(punch.dataset.id);
      if (on && !punch.classList.contains("on") && shown !== null) punchOut(punch);
      punch.classList.toggle("on", on);
    }

    for (const punch of document.querySelectorAll("#sets-out .punch")) punch.classList.toggle("on", played.has(punch.dataset.id));
    for (const li of document.querySelectorAll("#sheet li")) li.classList.toggle("on", played.has(li.dataset.id));
    for (const t of document.querySelectorAll(".tix")) t.classList.toggle("done", played.has(t.dataset.id));
    for (const box of document.querySelectorAll(".fav input[data-played]")) box.checked = played.has(box.dataset.played);

    if (shown !== null && n !== shown) slide(el.querySelector("strong"), n > shown ? 1 : -1);
    shown = n;
    renderStreak();
    renderMonth();
  }

  const now = new Date();
  $("#today").textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  // Card number = day of the year, so each day's card is its own.
  const dayOfYear = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(now.getFullYear(), 0, 0)) / 864e5);
  $("#cardno").textContent = `Card Nº ${String(dayOfYear).padStart(3, "0")}`;

  $("#filters").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    const set = state[b.dataset.key];
    set.has(b.dataset.id) ? set.delete(b.dataset.id) : set.add(b.dataset.id);
    b.setAttribute("aria-pressed", set.has(b.dataset.id));
    render(true);
  });

  $("#q").addEventListener("input", (e) => { state.q = e.target.value; render(false); });
  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; render(true); });

  $("#clear").addEventListener("click", () => {
    state.q = "";
    $("#q").value = "";
    groups.forEach((g) => state[g.key].clear());
    renderFilters();
    render(true);
  });

  // The punch box sits on the shelf card and on the favorite; either one drives the other.
  document.addEventListener("change", (e) => {
    const id = e.target.dataset && e.target.dataset.played;
    if (!id) return;
    e.target.checked ? played.add(id) : played.delete(id);
    savePlayed();
    // Update in place: re-rendering would drop focus and cut the punch animation short.
    const shelf = cards.get(id);
    if (shelf) {
      shelf.classList.toggle("done", e.target.checked);
      shelf.querySelector("input").checked = e.target.checked;
    }
    if (e.target.checked) punchOut(e.target.nextElementSibling);
    renderProgress();
  });

  // Tweaks: palette, mark shapes and light/dark. Saved per browser; index.html applies them before first paint.
  const look = { pal: "gin", holes: "shaped", theme: "auto" };
  try { Object.assign(look, JSON.parse(localStorage.getItem("dailies:look") || "{}")); } catch (e) {}
  delete look.ink; // the old desk-colour preference, replaced by palettes
  function applyLook() {
    for (const [k, v] of Object.entries(look)) {
      if (v === "auto") delete document.documentElement.dataset[k];
      else document.documentElement.dataset[k] = v;
    }
    for (const b of document.querySelectorAll("[data-tw]")) b.setAttribute("aria-pressed", look[b.dataset.tw] === b.dataset.v);
  }
  applyLook();

  const panel = $("#tweaks");
  const toggle = $("#tweaks-toggle");
  function setPanel(open) {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", open);
  }
  toggle.addEventListener("click", () => setPanel(panel.hidden));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) { setPanel(false); toggle.focus(); }
  });
  panel.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tw]");
    if (!b) return;
    look[b.dataset.tw] = b.dataset.v;
    try { localStorage.setItem("dailies:look", JSON.stringify(look)); } catch (e) {}
    applyLook();
  });

  // Pick for me --------------------------------------------------------------------
  // Moods are lenses on the data. A category added later is still reachable through "Any mood".
  const isIn = (g, ...cats) => cats.includes(g.category);
  const MOODS = [
    { id: "any", label: "Any mood", test: () => true },
    { id: "easy", label: "Easy going", test: (g) => g.difficulty === 1 || (g.difficulty === 2 && g.minutes <= 3 && !(g.tags || []).includes("Timed")) },
    { id: "hard", label: "Brain burner", test: (g) => g.difficulty === 3 },
    { id: "word", label: "Words", test: (g) => isIn(g, "Word") },
    { id: "puzzle", label: "Puzzles", test: (g) => isIn(g, "Logic", "Numbers") },
    { id: "place", label: "Places", test: (g) => isIn(g, "Geography") },
    { id: "trivia", label: "Trivia", test: (g) => isIn(g, "Trivia", "Estimation") },
  ];
  const TIMES = [
    { id: "3", label: "Up to 3 min", max: 3 },
    { id: "5", label: "Up to 5 min", max: 5 },
    { id: "any", label: "Any length", max: Infinity },
  ];
  const want = { mood: "any", time: "any" };
  const pickChips = (key, list) =>
    list.map((o) => `<button type="button" class="chip" data-pick="${key}" data-id="${o.id}" aria-pressed="${want[key] === o.id}">${o.label}</button>`).join("");
  $("#pick-mood").innerHTML = pickChips("mood", MOODS);
  $("#pick-time").innerHTML = pickChips("time", TIMES);

  let last = null; // the game just offered, so "Pick another" really is another
  let picked = false;
  function pick() {
    picked = true;
    const mood = MOODS.find((m) => m.id === want.mood);
    const max = TIMES.find((t) => t.id === want.time).max;
    const fits = games.filter((g) => mood.test(g) && g.minutes <= max);
    const fresh = fits.filter((g) => !played.has(g.id));
    let pool = fresh.length ? fresh : fits;
    if (pool.length > 1) pool = pool.filter((g) => g.id !== last);
    const out = $("#pick-out");
    $("#pick-go").textContent = "Pick another";
    if (!pool.length) {
      last = null;
      out.innerHTML = `<p class="pick-none">Nothing fits that. Try more minutes or another mood.</p>`;
      return;
    }
    // Popular games come up more often, but every game that fits can.
    let r = Math.random() * pool.reduce((sum, g) => sum + g.popularity, 0);
    const g = pool.find((x) => (r -= x.popularity) < 0) || pool[pool.length - 1];
    last = g.id;
    const shape = shapeOf(g.category);
    const notches = [1, 2, 3].map((n) => `<i class="${n <= g.difficulty ? "on" : ""}"></i>`).join("");
    out.innerHTML = `
      <article class="pick-card" data-shape="${shape}">
        <span class="punch" data-shape="${shape}"${iconAttrs(g)} aria-hidden="true"><i class="hole"></i></span>
        <div class="pick-body">
          <h3><a href="${esc(g.url)}" target="_blank" rel="noopener">${esc(g.name)}</a></h3>
          <p class="blurb">${esc(g.blurb)}</p>
          ${played.has(g.id) ? `<p class="pick-seen">Already punched today.</p>` : ""}
          <ul class="meta">
            <li><span class="glyph" data-shape="${shape}" aria-hidden="true"></span>${esc(g.category)}</li>
            <li><span class="notches" aria-hidden="true">${notches}</span>${DIFFICULTY[g.difficulty]}</li>
            <li><span class="clock" style="--a:${(Math.min(g.minutes, 6) / 6) * 360}deg" aria-hidden="true"></span>${g.minutes} min</li>
          </ul>
          <div class="card-foot">
            <a class="pill play" href="${esc(g.url)}" target="_blank" rel="noopener">Play<span class="arrow" aria-hidden="true">&#8599;</span><span class="sr"> ${esc(g.name)}</span></a>
            <span class="host">${esc(host(g.url))}</span>
          </div>
        </div>
      </article>`;
  }
  $("#pick-go").addEventListener("click", () => {
    pick();
    // On a phone the answer sits below the controls, so bring it into view.
    $("#pick-out").scrollIntoView({ block: "nearest", behavior: calm.matches ? "auto" : "smooth" });
  });
  $("#pick").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    want[b.dataset.pick] = b.dataset.id;
    for (const c of b.parentElement.children) c.setAttribute("aria-pressed", c === b);
    if (picked) pick(); // once an answer is showing, the chips steer it
  });

  // Pick for me and Plan your time stay folded until their bubble is clicked, and only one is open at a time.
  const tools = [[$("#pick-toggle"), $("#pick")], [$("#sets-toggle"), $("#sets")]];
  for (const [btn, panelEl] of tools) {
    btn.addEventListener("click", () => {
      const open = panelEl.hidden;
      for (const [b, p] of tools) {
        const on = p === panelEl && open;
        p.hidden = !on;
        b.setAttribute("aria-expanded", on);
      }
    });
  }

  // Plan your time: a stack for N minutes, or a hand-built routine ----------------------
  const ROUTINES = (window.ROUTINES || []).filter((r) => r.games.every((id) => games.some((g) => g.id === id)));
  const MINUTES = [5, 10, 20, 30];
  const setSel = { kind: "stack", id: "10" };
  const setChips = (kind, list) =>
    list.map((o) => `<button type="button" class="chip" data-kind="${kind}" data-id="${o.id}" aria-pressed="${setSel.kind === kind && setSel.id === o.id}">${o.label}</button>`).join("");
  $("#sets-time").innerHTML = setChips("stack", MINUTES.map((m) => ({ id: String(m), label: `${m} min` })));
  $("#sets-routines").innerHTML = setChips("routine", ROUTINES.map((r) => ({ id: r.id, label: r.name })));
  if (!ROUTINES.length) $("#sets-routines").parentElement.hidden = true;

  // Seeded by the date and the minutes, so everyone who opens the shelf today sees the same stack.
  const rng = (seed) => {
    let a = hashStr(seed);
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  function stackFor(minutes) {
    const rand = rng(`${today}:${minutes}`);
    const shuffle = (arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    };
    // One game from each type in turn, so a stack mixes shapes, until nothing else fits.
    const cats = shuffle(unique(games.map((g) => g.category)));
    const pools = new Map(cats.map((c) => [c, shuffle(games.filter((g) => g.category === c))]));
    const out = [];
    let left = minutes;
    for (let more = true; more; ) {
      more = false;
      for (const c of cats) {
        const pool = pools.get(c);
        const k = pool.findIndex((g) => g.minutes <= left);
        if (k < 0) continue;
        out.push(...pool.splice(k, 1));
        left -= out[out.length - 1].minutes;
        more = true;
      }
    }
    return out.sort((a, b) => a.minutes - b.minutes || a.name.localeCompare(b.name));
  }

  function renderSet() {
    let list, blurb;
    if (setSel.kind === "stack") {
      list = stackFor(+setSel.id);
      blurb = `A stack for ${setSel.id} minutes, short ones first. It is the same for everyone today.`;
    } else {
      const r = ROUTINES.find((x) => x.id === setSel.id);
      list = r.games.map((id) => games.find((g) => g.id === id));
      blurb = `${r.blurb} In this order.`;
    }
    const total = list.reduce((sum, g) => sum + g.minutes, 0);
    $("#sets-out").innerHTML = `
      <div class="set">
        <div class="set-head">
          <p class="set-blurb">${esc(blurb)}</p>
          <p class="set-total"><strong>${total}</strong> min, ${list.length} games</p>
        </div>
        <ol class="set-list">${list
          .map((g) => {
            const shape = shapeOf(g.category);
            return `<li class="set-row" data-shape="${shape}">
              <span class="set-tile"><span class="punch${played.has(g.id) ? " on" : ""}" data-shape="${shape}"${iconAttrs(g)} data-id="${esc(g.id)}" aria-hidden="true"><i class="hole"></i></span></span>
              <span class="set-name"><a href="${esc(g.url)}" target="_blank" rel="noopener">${esc(g.name)}</a><small>${esc(g.category)}, ${g.minutes} min</small></span>
              <a class="pill play" href="${esc(g.url)}" target="_blank" rel="noopener">Play<span class="arrow" aria-hidden="true">&#8599;</span><span class="sr"> ${esc(g.name)}</span></a>
            </li>`;
          })
          .join("")}</ol>
      </div>`;
  }
  $("#sets").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    setSel.kind = b.dataset.kind;
    setSel.id = b.dataset.id;
    for (const c of $("#sets").querySelectorAll(".chip")) c.setAttribute("aria-pressed", c === b);
    renderSet();
  });

  // Your cards: a month at a time, kept on this device -------------------------------
  let view = new Date(now.getFullYear(), now.getMonth(), 1);
  const pad2 = (n) => String(n).padStart(2, "0");
  function renderMonth() {
    const y = view.getFullYear();
    const m = view.getMonth();
    const first = new Date(y, m, 1);
    const count = new Date(y, m + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // weeks start on Monday
    const dow = [0, 1, 2, 3, 4, 5, 6].map((i) => `<li class="dow" aria-hidden="true">${new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: "narrow" })}</li>`);
    const doneSet = new Set(done);
    let punchedDays = 0;
    let completes = 0;
    const cells = [];
    for (let d = 1; d <= count; d++) {
      const key = `${y}-${pad2(m + 1)}-${pad2(d)}`;
      const n = days[key] || 0;
      const full = doneSet.has(key);
      if (n) punchedDays++;
      if (full) completes++;
      const label = `${first.toLocaleDateString(undefined, { month: "long" })} ${d}: ${full ? "card complete" : n ? `${n} punched` : "nothing punched"}`;
      cells.push(`<li class="day${n ? " on" : ""}${full ? " full" : ""}${key === today ? " today" : ""}${key > today ? " later" : ""}" title="${label}"><span aria-hidden="true">${d}</span><span class="sr">${label}</span></li>`);
    }
    $("#month").innerHTML = dow.join("") + '<li class="gap" aria-hidden="true"></li>'.repeat(lead) + cells.join("");
    $("#vault-month").textContent = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    $("#vault-sum").textContent = `${punchedDays} ${punchedDays === 1 ? "day" : "days"} punched, ${completes} ${completes === 1 ? "card" : "cards"} complete. Best streak: ${bestStreak()}.`;
    const earliest = Object.keys(days).sort()[0];
    $("#vault-next").disabled = y === now.getFullYear() && m === now.getMonth();
    $("#vault-prev").disabled = !earliest || new Date(y, m, 1) <= new Date(+earliest.slice(0, 4), +earliest.slice(5, 7) - 1, 1);
  }
  $("#vault-prev").addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); renderMonth(); });
  $("#vault-next").addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); renderMonth(); });
  $("#print-card").addEventListener("click", () => window.print());

  renderSet();
  // Your favorites ------------------------------------------------------------------
  const favEls = new Map();
  function favCard(g) {
    const shape = shapeOf(g.category);
    const done = played.has(g.id);
    const t = document.createElement("template");
    t.innerHTML = `
      <article class="fav" data-id="${esc(g.id)}" data-shape="${shape}">
        <label class="fav-tile" title="Mark as played today">
          <input type="checkbox" data-played="${esc(g.id)}" ${done ? "checked" : ""}>
          <span class="punch" data-shape="${shape}"${iconAttrs(g)} aria-hidden="true"><i class="hole"></i></span>
          <span class="sr">Played today</span>
        </label>
        <div class="fav-main">
          <h3><a href="${esc(g.url)}" target="_blank" rel="noopener">${esc(g.name)}</a></h3>
          <p>${esc(g.category)}, ${g.minutes} min</p>
        </div>
        <div class="fav-act">
          ${star(g)}
          <a class="pill play" href="${esc(g.url)}" target="_blank" rel="noopener">Play<span class="arrow" aria-hidden="true">&#8599;</span><span class="sr"> ${esc(g.name)}</span></a>
        </div>
      </article>`;
    return t.content.firstElementChild;
  }
  // New favorites join at the end, so nothing already there is moved or replayed. The first paint is quiet.
  function renderFavs(animate) {
    for (const [id, el] of favEls) {
      if (favs.includes(id)) continue;
      el.remove();
      favEls.delete(id);
    }
    for (const id of favs) {
      if (favEls.has(id)) continue;
      const el = favCard(games.find((g) => g.id === id));
      if (animate) {
        el.classList.add("new");
        el.addEventListener("animationend", () => el.classList.remove("new"), { once: true });
      }
      favEls.set(id, el);
      $("#fav-list").append(el);
    }
    $("#fav-none").hidden = favs.length > 0;
  }
  function toggleFav(id) {
    favs = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    saveFavs();
    for (const b of document.querySelectorAll(`.star[data-fav="${CSS.escape(id)}"]`)) b.setAttribute("aria-pressed", favs.includes(id));
    renderFavs(true);
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".star");
    if (b) toggleFav(b.dataset.fav);
  });

  // Category boxes open the list of their games, only when clicked ----------------------
  const catPanel = $("#cat-panel");
  let openCat = null;
  function showCat(name) {
    const open = openCat !== name;
    openCat = open ? name : null;
    for (const box of document.querySelectorAll("#holes .cat")) {
      const on = open && box.dataset.cat === name;
      box.classList.toggle("open", on);
      box.querySelector(".cat-btn").setAttribute("aria-expanded", on);
    }
    catPanel.hidden = !open;
    if (!open) return;
    const list = games.filter((g) => g.category === name);
    catPanel.dataset.shape = shapeOf(name);
    $("#cat-panel-title").textContent = `${name}, ${list.length} ${list.length === 1 ? "game" : "games"}`;
    $("#cat-panel-list").replaceChildren(...list.map(favCard));
    catPanel.animate([{ opacity: 0, transform: calm.matches ? "none" : "translateY(6px)", offset: 0 }], { duration: 200, easing: EASE_OUT });
    // Boxes stack on a phone, so the list can open below the fold.
    catPanel.scrollIntoView({ block: "nearest", behavior: calm.matches ? "auto" : "smooth" });
  }
  $("#holes").addEventListener("click", (e) => {
    const box = e.target.closest(".cat");
    if (box) showCat(box.dataset.cat);
  });
  $("#cat-close").addEventListener("click", () => {
    const name = openCat;
    showCat(name);
    for (const b of document.querySelectorAll("#holes .cat")) if (b.dataset.cat === name) b.querySelector(".cat-btn").focus();
  });

  // Hero carousel: games with a logo are dealt as punch card tickets -----------------------
  // Moves only when asked (arrows, keys, swipe, a tap on a neighbour): nothing turns by itself.
  const featured = games;
  const TICKET = "M22 0H278A22 22 0 0 1 300 22V156A14 14 0 0 0 300 184V398A22 22 0 0 1 278 420H22A22 22 0 0 1 0 398V184A14 14 0 0 0 0 156V22A22 22 0 0 1 22 0Z";
  const STUB = "M22 0H278A22 22 0 0 1 300 22V156A14 14 0 0 0 286 170H14A14 14 0 0 0 0 156V22A22 22 0 0 1 22 0Z";
  let at = 0;
  const deck = $("#deck");
  const stage = $("#deck-stage");

  const ticket = (g, i) => {
    const shape = shapeOf(g.category);
    const notches = [1, 2, 3].map((n) => `<i class="${n <= g.difficulty ? "on" : ""}"></i>`).join("");
    return `
      <article class="tix${played.has(g.id) ? " done" : ""}" data-id="${esc(g.id)}" data-shape="${shape}" style="--brand:${g.brand ? esc(g.brand) : "var(--cat)"}" role="group" aria-roledescription="slide" aria-label="${esc(g.name)}, ${i + 1} of ${featured.length}">
        <svg class="tix-bg" viewBox="0 0 300 420" preserveAspectRatio="none" aria-hidden="true">
          <path class="shadow" d="${TICKET}" transform="translate(5 5)"/>
          <path class="paper" d="${TICKET}"/>
          <path class="stub" d="${STUB}"/>
          <path class="perf" d="M26 170H274"/>
          <path class="edge" d="${TICKET}"/>
        </svg>
        <div class="tix-top">
          <span class="tix-no"><small>N&ordm;</small>${serial(g)}</span>
          <span class="tix-cat" title="${esc(g.category)}" aria-hidden="true"><span class="glyph" data-shape="${shape}"></span></span>
          ${star(g)}
          ${
            g.logo
              ? `<img class="tix-logo" src="${esc(g.logo)}" alt="${esc(g.name)} logo" width="96" height="96" draggable="false">`
              : `<span class="tix-logo tix-glyph"${iconAttrs(g)} role="img" aria-label="${esc(g.name)} icon"></span>`
          }
        </div>
        <div class="tix-body">
          <h3>${esc(g.name)}</h3>
          <p class="tix-desc">${esc(g.blurb)}</p>
          <ul class="tix-meta">
            <li>${esc(g.category)}</li>
            <li><span class="notches" aria-hidden="true">${notches}</span>${DIFFICULTY[g.difficulty]}</li>
            <li>${g.minutes} min</li>
          </ul>
          <a class="pill play" href="${esc(g.url)}" target="_blank" rel="noopener">Play<span class="arrow" aria-hidden="true">&#8599;</span><span class="sr"> ${esc(g.name)}</span></a>
        </div>
        <span class="stamp" aria-hidden="true">Played</span>
      </article>`;
  };

  function layoutDeck(slap) {
    const n = featured.length;
    [...stage.children].forEach((el, i) => {
      let o = (i - at) % n;
      if (o > n / 2) o -= n;
      if (o < -n / 2) o += n;
      const front = o === 0;
      el.style.setProperty("--o", o);
      el.dataset.slot = front ? "front" : Math.abs(o) === 1 ? "near" : "far";
      el.inert = !front; // only the front ticket's link takes focus
      el.setAttribute("aria-hidden", !front);
      if (front && slap && !calm.matches) {
        el.querySelector(".tix-logo").animate([{ scale: 1.25, offset: 0 }], { duration: 260, easing: EASE_OUT });
      }
    });
    $("#deck-count").textContent = `${at + 1} / ${n}`;
  }
  function go(step) {
    at = (at + step + featured.length) % featured.length;
    layoutDeck(true);
  }

  if (featured.length > 1) {
    stage.innerHTML = featured.map(ticket).join("");
    layoutDeck(false);
    setTimeout(() => deck.classList.remove("intro"), 1000);
    $("#deck-prev").addEventListener("click", () => go(-1));
    $("#deck-next").addEventListener("click", () => go(1));
    deck.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    });
    // A tap on a neighbour brings it forward; a swipe moves one ticket.
    let startX = null;
    deck.addEventListener("pointerdown", (e) => { startX = e.clientX; });
    deck.addEventListener("pointerup", (e) => {
      const dx = startX === null ? 0 : e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 40) { go(dx < 0 ? 1 : -1); return; }
      const near = e.target.closest('.tix[data-slot="near"]');
      if (near) go(Number(near.style.getPropertyValue("--o")));
    });
    deck.addEventListener("pointercancel", () => { startX = null; });
  } else {
    $(".deck-ctl").hidden = true;
  }

  renderFavs(false);
  renderFilters();
  render(false);
  // The cascade is for the first paint only; filter and sort changes use the FLIP in render().
  grid.classList.add("intro");
  setTimeout(() => grid.classList.remove("intro"), 1100);
})();
