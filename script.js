/* ==========================================================================
   HeatJumper – script.js
   Course: HUMCOM1 | Area covered: the whole world
   Sections:
     1. Settings            5. Map helpers (world map, place names)
     2. Sample data         6. Live world temperatures
     3. Storage helpers     7. Shared page pieces
     4. Small helpers       8. Search box
                            9. Page controllers (one per page)
   ========================================================================== */


/* ---------- 1. SETTINGS ---------- */
const WORLD_CENTER = [20, 0];                       // the map opens showing the whole world
const WORLD_BOUNDS = [[-85, -180], [85, 180]];
const COUNTRIES_URLS = [
  "https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json",
  "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json"
];
const EVERY_MINUTE = 60000;                         // milliseconds
const WORLD_REFRESH = 1800000;                      // 30 minutes (keeps us inside the free weather limit)
const NEWS_REFRESH = 300000;                        // 5 minutes

const COLORS = {
  green:  "#2f6a17",   // caution
  yellow: "#ffe15a",   // extreme caution
  orange: "#ff7a0e",   // danger
  blue:   "#1e88e5",   // cooling station
  tree:   "#7cc242"    // tree-planting spot
};


/* ---------- 2. SAMPLE DATA ----------
   San Fernando City, La Union is our home area. The admin dashboard can add or change
   data; it is saved in the browser. */
const DEFAULTS = {
  cities: [
    { name: "Poblacion (City Center)", lat: 16.6145, lng: 120.3158, temp: 35 },
    { name: "Poro",                    lat: 16.6065, lng: 120.3049, temp: 34 },
    { name: "Carlatan",                lat: 16.6330, lng: 120.3150, temp: 35 },
    { name: "Pagdaraoan",              lat: 16.6256, lng: 120.3163, temp: 36 },
    { name: "Sevilla",                 lat: 16.5958, lng: 120.3207, temp: 36 }
  ],
  stations: [
    { name: "Poblacion – City Hall area",     lat: 16.6145, lng: 120.3158, note: "Air-conditioned public offices, open office hours" },
    { name: "Pagdaraoan – barangay hall area", lat: 16.6256, lng: 120.3163, note: "Ask the barangay for opening hours" },
    { name: "Sevilla – barangay hall area",    lat: 16.5958, lng: 120.3207, note: "Covered court and waiting area" },
    { name: "Carlatan – roadside",  lat: 16.6330, lng: 120.3150, note: "Suggested tree-planting site (little shade)", kind: "tree" },
    { name: "Poro – open space",    lat: 16.6065, lng: 120.3049, note: "Suggested tree-planting site", kind: "tree" }
  ],
  news: [
    { title: "Dangerous heat index expected in several areas", body: "PAGASA warns residents to limit outdoor work between 10AM and 4PM.", date: "2026-11-03" },
    { title: "Classes suspended as heat index reaches danger level", body: "Local governments advise schools to shift to online or modified classes.", date: "2026-11-05" }
  ],
  acts: [
    { title: "Tree Planting Day",  body: "Join your barangay in planting shade trees this Saturday." },
    { title: "Cool Roof Painting", body: "Volunteers paint roofs white to reduce indoor heat." }
  ],
  contact: { office: "City Disaster Risk Reduction and Management Office", phone: "(02) 0000-0000", email: "cdrrmo@yourcity.gov.ph" }
};


/* ---------- 3. STORAGE HELPERS ---------- */
function get(key) {
  try {
    return JSON.parse(localStorage.getItem("hj3_" + key)) || DEFAULTS[key];
  } catch (error) {
    return DEFAULTS[key];
  }
}

function set(key, value) {
  localStorage.setItem("hj3_" + key, JSON.stringify(value));
}


/* ---------- 4. SMALL HELPERS ---------- */
const $ = (selector) => document.querySelector(selector);

// Makes text safe before putting it inside HTML
function esc(text) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
  return String(text).replace(/[&<>"]/g, (c) => map[c]);
}

// Temperature -> [css class, label, color]
function level(temp) {
  if (temp >= 42) return ["danger",  "Danger",          COLORS.orange];
  if (temp >= 33) return ["extreme", "Extreme caution", COLORS.yellow];
  return                 ["caution", "Caution",         COLORS.green];
}


/* ---------- 5. MAP HELPERS ---------- */

// Free map pictures. If one provider refuses (403 / key needed), the next is tried.
const BASE_MAPS = [
  ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19, noWrap: true, attribution: "Tiles © Esri" }],
  ["https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    { subdomains: "abcd", maxZoom: 19, noWrap: true, attribution: "© OpenStreetMap contributors © CARTO" }],
  ["https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    { maxZoom: 19, noWrap: true, attribution: "© OpenStreetMap contributors" }]
];

// Small message drawn on top of the map (used when pictures cannot load)
function mapNotice(map, text) {
  const box = map.getContainer();
  let note = box.querySelector(".map-notice");
  if (!text) { if (note) note.remove(); return; }
  if (!note) { note = document.createElement("div"); note.className = "map-notice"; box.appendChild(note); }
  note.textContent = text;
}

// Tries each map provider. Moves to the next one after 2 failed tiles or 8 seconds without a tile.
function addBaseMap(map, index = 0) {
  const layer = L.tileLayer(BASE_MAPS[index][0], BASE_MAPS[index][1]).addTo(map);
  let loaded = false, errors = 0, moved = false;
  const next = () => {
    if (loaded || moved) return;
    moved = true;
    map.removeLayer(layer);
    if (index < BASE_MAPS.length - 1) addBaseMap(map, index + 1);
    else mapNotice(map, "Map pictures could not load. Please check your internet connection and refresh the page.");
  };
  layer.on("tileload", () => { loaded = true; mapNotice(map, ""); });
  layer.on("tileerror", () => { if (++errors >= 2) next(); });
  setTimeout(next, 8000);
}

// A world map. Zoom in and street and place names appear.
function createMap() {
  const map = L.map("map", {
    center: WORLD_CENTER, zoom: 2,
    minZoom: 2, maxZoom: 19,
    maxBounds: WORLD_BOUNDS, maxBoundsViscosity: 1
  });
  addBaseMap(map);
  // A map that was drawn before the page finished laying out stays blank or grey: re-measure it.
  setTimeout(() => map.invalidateSize(), 250);
  window.addEventListener("load", () => map.invalidateSize());
  if (window.ResizeObserver) new ResizeObserver(() => map.invalidateSize()).observe(map.getContainer());
  return map;
}

// The Leaflet map library normally loads from the page. If that CDN is blocked, try two others.
const LEAFLET_SOURCES = [
  ["https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js", "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css"],
  ["https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js",      "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css"],
  ["https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",                 "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"]
];
const loadScript = (url) => new Promise((ok, fail) => {
  const el = document.createElement("script");
  el.src = url; el.onload = ok; el.onerror = () => fail(new Error(url));
  document.head.appendChild(el);
});
const addCss = (url) => new Promise((done) => {
  const el = document.createElement("link");
  el.rel = "stylesheet"; el.href = url; el.onload = done; el.onerror = done;
  document.head.appendChild(el);
});
function leafletCssWorks() {
  const probe = document.createElement("div");
  probe.className = "leaflet-pane"; probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const works = getComputedStyle(probe).position === "absolute";
  probe.remove();
  return works;
}
async function ensureLeaflet() {
  for (const [js] of LEAFLET_SOURCES) {
    if (window.L) break;
    try { await loadScript(js); } catch (error) { /* try the next one */ }
  }
  if (!window.L) return false;
  for (const [, css] of LEAFLET_SOURCES) {
    if (leafletCssWorks()) break;
    await addCss(css);
  }
  return true;
}

// Free OpenStreetMap data servers (Overpass). If one is busy, the next one is tried.
const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];

async function overpass(query) {
  for (const server of OVERPASS_SERVERS) {
    try {
      const response = await fetch(server + "?data=" + encodeURIComponent(query));
      return (await response.json()).elements;
    } catch (error) { /* try the next server */ }
  }
  throw new Error("All servers busy");
}

// Click anywhere on the map -> a popup tells the exact place (name from OpenStreetMap).
// moreInfo(latlng) can add extra lines (it may be async), such as the heat level of that spot.
function identifyPlaces(map, moreInfo) {
  map.on("click", async (event) => {
    const popup = L.popup().setLatLng(event.latlng).setContent("Finding this place…").openOn(map);
    let name;
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=en&lat=${event.latlng.lat}&lon=${event.latlng.lng}`;
      const data = await (await fetch(url)).json();
      const a = data.address || {};
      name = data.name || a.amenity || a.road || a.neighbourhood || a.suburb || a.village || a.city || a.country || "Open water / unnamed place";
      const area = [a.suburb || a.village || a.neighbourhood, a.city || a.town || a.municipality, a.country].filter(Boolean).join(", ");
      name = area && area !== name ? `${esc(name)}<br><small>${esc(area)}</small>` : esc(name);
    } catch (error) {
      name = "Place name unavailable (offline)";
    }
    const extra = moreInfo ? await moreInfo(event.latlng) : "";
    popup.setContent(`<b>📍 ${name}</b>${extra ? "<br>" + extra : ""}`);
  });
}


/* ---------- 6. LIVE WORLD TEMPERATURES ----------
   Open-Meteo is free and needs no key. The last result is saved, so the site still
   shows something when there is no internet. */

// Country borders (GeoJSON) -> list of countries with a center point
async function loadCountries() {
  let geo = null;
  for (const url of COUNTRIES_URLS) {
    try { geo = await (await fetch(url)).json(); break; } catch (error) { /* try the next source */ }
  }
  if (!geo) throw new Error("No country borders");
  const countries = geo.features.map((feature) => {
    const center = L.geoJSON(feature).getBounds().getCenter();
    return { id: feature.id, name: feature.properties.name, lat: center.lat, lng: center.lng };
  });
  return { geo, countries };
}

// One request per 50 countries -> { countryId: temperature }
async function worldTemps(countries) {
  const temps = {};
  const groups = [];
  for (let i = 0; i < countries.length; i += 50) groups.push(countries.slice(i, i + 50));

  await Promise.all(groups.map(async (group) => {
    const lats = group.map((c) => c.lat.toFixed(2)).join(",");
    const lngs = group.map((c) => c.lng.toFixed(2)).join(",");
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=apparent_temperature`;
    const data = await (await fetch(url)).json();
    (Array.isArray(data) ? data : [data]).forEach((item, i) => {
      temps[group[i].id] = Math.round(item.current.apparent_temperature);
    });
  }));

  localStorage.setItem("hj_world", JSON.stringify({ time: Date.now(), temps }));
  return temps;
}

// Last saved world temperatures (used when offline)
function savedWorld() {
  try { return JSON.parse(localStorage.getItem("hj_world")); } catch (error) { return null; }
}

// Exact temperature at one spot (used when you click the map)
async function pointTemp(lat, lng) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=apparent_temperature`;
  const data = await (await fetch(url)).json();
  return Math.round(data.current.apparent_temperature);
}

// The 9 hottest countries, ready for the temperature board
function hottest(countries, temps) {
  return countries
    .filter((c) => temps[c.id] !== undefined)
    .map((c) => ({ ...c, temp: temps[c.id] }))
    .sort((a, b) => b.temp - a.temp)
    .slice(0, 9);
}


/* ---------- 7. SHARED PAGE PIECES ---------- */
function contactBox() {
  const c = get("contact");
  return `<div class="emergency">
    <h3>🚨 Emergency Contact</h3>
    <p><strong>${esc(c.office)}</strong><br>
    Hotline: <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a><br>
    Email: <a href="mailto:${esc(c.email)}">${esc(c.email)}</a></p>
  </div>`;
}

function heatCards(cities) {
  return cities.map((c) => {
    const l = level(+c.temp);
    return `<div class="card ${l[0]}"><strong>${esc(c.name)}</strong><p class="temp">${c.temp}°C</p><strong>${l[1]}</strong></div>`;
  }).join("");
}

function stationTile(place) {
  return `<div class="tile"><h3>${esc(place.name)}</h3><p>${esc(place.note)}</p></div>`;
}


/* ---------- 8. SEARCH BOX ----------
   The search bar is separate from the pages bar. It searches the text of EVERY page (read from the pages
   themselves), the text on the page you are looking at, and the saved data (cities, stations, news,
   activities). Typing any word suggests matches; clicking one opens that page and highlights the
   matching text.
   Small spelling mistakes still match. */
const SEARCH_PAGES = [
  ["Home", "home.html"], ["Heat Map", "heatmap.html"], ["Cooling Station", "cooling.html"],
  ["Information", "information.html"], ["Action", "action.html"]
];
const TEXT_BLOCKS = "main h2, main h3, main h4, main p, main li, main label, main option, main td, main .tile, main .card, main .news";
let pageTexts = null;          // text collected from the pages (loaded once)

// True when one word is the other with one letter added, removed or changed (spelling mistakes)
function nearlySame(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

// Every searched word must appear in the text (or nearly appear)
function matches(text, words) {
  const low = text.toLowerCase();
  const tokens = low.split(/[^a-z0-9°]+/).filter(Boolean);
  return words.every((w) => low.includes(w) || (w.length >= 4 && tokens.some((t) => nearlySame(t, w))));
}

// The visible text blocks of one page (a document)
function blocksOf(doc, title, url) {
  const out = [];
  doc.querySelectorAll(TEXT_BLOCKS).forEach((el) => {
    if (el.closest(".tile, .card, .news") && !el.matches(".tile, .card, .news")) return;      // use the whole tile once
    const text = el.textContent.replace(/\s+/g, " ").trim();
    if (text.length > 2 && !/^Loading/i.test(text)) out.push({ title, url, text });
  });
  return out;
}

// Reads the text of every page. Falls back to search-data.js when pages cannot be fetched (e.g. opened as plain files).
async function loadPageTexts() {
  if (pageTexts) return pageTexts;
  const found = [];
  await Promise.all(SEARCH_PAGES.map(async ([name, url]) => {
    try {
      const html = await (await fetch(url)).text();
      found.push(...blocksOf(new DOMParser().parseFromString(html, "text/html"), name, url));
    } catch (error) { /* offline or opened as a file: use the saved copy below */ }
  }));
  if (!found.length && typeof SITE_TEXT !== "undefined") found.push(...SITE_TEXT);
  pageTexts = found;
  return pageTexts;
}

// Text that JavaScript added to the page you are on (hottest countries, news, activities ...)
function liveTexts() {
  const url = location.pathname.split("/").pop() || "home.html";
  const entry = SEARCH_PAGES.find((p) => p[1] === url);
  return entry ? blocksOf(document, entry[0], url) : [];
}

// Saved data (can be changed by the admin)
function dataTexts() {
  const items = [];
  get("cities").forEach((c)   => items.push({ title: "Heat Map", url: "heatmap.html", text: `${c.name} ${c.temp}°C ${level(+c.temp)[1]}` }));
  get("stations").forEach((s) => items.push({ title: s.kind === "tree" ? "Cooling Station – tree planting" : "Cooling Station", url: "cooling.html", text: `${s.name}. ${s.note}` }));
  get("news").forEach((n)     => items.push({ title: "Information – news", url: "information.html", text: `${n.title}. ${n.body}` }));
  get("acts").forEach((a)     => items.push({ title: "Action – activity", url: "action.html", text: `${a.title}. ${a.body}` }));
  const c = get("contact");
  items.push({ title: "Emergency Contact", url: "action.html#contact", text: `${c.office} hotline ${c.phone} ${c.email}` });
  return items;
}

function setupSearch() {
  const input = $("#q"), box = $("#results");
  if (!input) return;
  input.addEventListener("focus", loadPageTexts);          // start reading the pages early

  const link = (x, words) => x.url.includes("#") ? x.url : `${x.url}?find=${encodeURIComponent(words.join(" "))}`;
  const row = (x, words) => `<li><a href="${esc(link(x, words))}"><small>${esc(x.title)}</small><br>${esc(x.text.length > 90 ? x.text.slice(0, 90) + "…" : x.text)}</a></li>`;

  async function showSuggestions() {
    const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length || input.value.trim().length < 2) { box.hidden = true; return; }
    const all = (await loadPageTexts()).concat(liveTexts(), dataTexts());
    const seen = new Set();
    const hits = all
      .filter((x) => matches(x.title + " " + x.text, words))
      .map((x) => ({ ...x, score: words.filter((w) => x.text.toLowerCase().includes(w)).length * 2 + (x.text.toLowerCase().startsWith(words[0]) ? 1 : 0) }))
      .sort((a, b) => b.score - a.score)
      .filter((x) => { const k = x.url + x.text; if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 8);

    box.innerHTML = hits.length ? hits.map((x) => row(x, words)).join("") : "<li><a>No results found</a></li>";
    box.hidden = false;
  }

  input.addEventListener("input", showSuggestions);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); const first = box.querySelector("a[href]"); if (first) location.href = first.getAttribute("href"); }
    if (e.key === "ArrowDown") { const first = box.querySelector("a[href]"); if (first) { e.preventDefault(); first.focus(); } }
    if (e.key === "Escape") { box.hidden = true; input.blur(); }
  });
  box.addEventListener("keydown", (e) => {
    const links = [...box.querySelectorAll("a[href]")], i = links.indexOf(document.activeElement);
    if (e.key === "ArrowDown" && i < links.length - 1) { e.preventDefault(); links[i + 1].focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); (i > 0 ? links[i - 1] : input).focus(); }
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".search")) box.hidden = true; });
}

// On the page we landed on: find the searched text, scroll to it and highlight it
function highlightFound() {
  const query = new URLSearchParams(location.search).get("find");
  if (!query) return;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  let tries = 0;
  const timer = setInterval(() => {                      // some content is added by JavaScript, so we try a few times
    tries++;
    const hit = [...document.querySelectorAll(TEXT_BLOCKS)].find((el) => {
      if (el.closest(".tile, .card, .news") && !el.matches(".tile, .card, .news")) return false;
      return matches(el.textContent, words);
    });
    if (hit) { clearInterval(timer); hit.classList.add("found"); hit.scrollIntoView({ behavior: "smooth", block: "center" }); }
    else if (tries > 12) clearInterval(timer);
  }, 500);
}


/* ---------- 8b. USER ACCOUNTS ----------
   Front-end demo: accounts are saved in this browser. A real website would keep them on a server. */
async function hashText(text) {
  try {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (error) {
    return text;     // very old browsers: store as typed (demo only)
  }
}
const allUsers    = () => JSON.parse(localStorage.getItem("hj_users") || "[]");
const currentUser = () => JSON.parse(localStorage.getItem("hj_session") || "null");
const lastPhone   = () => localStorage.getItem("hj_last");      // the profile that was last used on this device

// The top-bar button shows the user's name and logs out when clicked
function setupAccountLink() {
  const link = $("#loginlink"), user = currentUser();
  if (!link || !user) return;
  link.textContent = "👤 " + user.name.split(" ")[0] + " • Log out";
  link.addEventListener("click", (event) => {
    event.preventDefault();
    localStorage.removeItem("hj_session");
    location.href = "index.html";
  });
}

// Asks the phone/computer for the current GPS location
function getLocation(onSuccess, onFail) {
  if (!navigator.geolocation) { onFail(); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => onSuccess({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }),
    onFail,
    { enableHighAccuracy: true, timeout: 15000 }
  );
}


// ----- City confirmation (used at sign-up and on the Home page) -----
function cityPickerHTML() {
  return `<label>Your city</label>
    <input class="cq" aria-label="Your city" placeholder="Type your city, e.g. San Fernando, La Union">
    <div class="row"><button type="button" class="btn green cfind">🔍 Find my city</button>
    <button type="button" class="btn green cgps">📍 Use my location</button></div>
    <div class="cres"></div><p class="cchosen" aria-live="polite"></p>`;
}

function setupCityPicker(root, onConfirm) {
  const input = root.querySelector(".cq"), results = root.querySelector(".cres"), chosen = root.querySelector(".cchosen");

  function showChoices(list) {
    results.innerHTML = list.length
      ? list.map((c, i) => `<label class="choice"><input type="radio" name="citychoice" value="${i}"> ${esc(c.name)}</label>`).join("") +
        `<button type="button" class="btn orange cok">✔ Confirm this city</button>`
      : "<p>No city found. Try another spelling.</p>";
    const ok = results.querySelector(".cok");
    if (ok) ok.addEventListener("click", () => {
      const picked = results.querySelector("input:checked");
      if (!picked) { chosen.textContent = "Pick one from the list first."; return; }
      const city = list[+picked.value];
      chosen.textContent = "✔ City confirmed: " + city.name;
      results.innerHTML = "";
      onConfirm(city);
    });
  }

  async function findCity() {
    if (input.value.trim().length < 2) return;
    chosen.textContent = "Searching…";
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=en&q=${encodeURIComponent(input.value.trim())}`;
      const list = (await (await fetch(url)).json()).map((r) => ({
        name: r.display_name.split(",").slice(0, 3).join(",").trim(), lat: +r.lat, lng: +r.lon }));
      chosen.textContent = "";
      showChoices(list);
    } catch (error) { chosen.textContent = "Could not search (offline). Try again when online."; }
  }

  root.querySelector(".cfind").addEventListener("click", findCity);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); findCity(); } });

  root.querySelector(".cgps").addEventListener("click", () => {
    chosen.textContent = "Finding your location…";
    getLocation(async (pos) => {
      let name = "My current location";
      try {
        const data = await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=en&lat=${pos.lat}&lon=${pos.lng}`)).json();
        const a = data.address || {};
        name = [a.city || a.town || a.municipality || a.village, a.state || a.country].filter(Boolean).join(", ") || name;
      } catch (error) { /* keep the default name */ }
      chosen.textContent = "";
      showChoices([{ name, lat: pos.lat, lng: pos.lng }]);
    }, () => { chosen.textContent = "Could not get your location. Type your city instead."; });
  });
}

function saveUserCity(city) {
  const session = currentUser();
  session.city = city;
  localStorage.setItem("hj_session", JSON.stringify(session));
  const users = allUsers(), account = users.find((u) => u.phone === session.phone);
  if (account) { account.city = city; localStorage.setItem("hj_users", JSON.stringify(users)); }
}

// "Your city" box on the Home page
function renderCityBox() {
  const box = $("#citybox"), city = (currentUser() || {}).city;
  if (!box) return;
  box.innerHTML = `<h2>📍 Your city</h2>
    <p>${city ? `<strong>${esc(city.name)}</strong> – the Heat Map and Cooling Station maps are pinned here.` : "Please confirm your city. The maps will pin it."}</p>
    <button class="btn green" id="changecity" type="button">${city ? "Change city" : "Confirm my city"}</button>
    <div id="citypicker" ${city ? "hidden" : ""}>${cityPickerHTML()}</div>`;
  $("#changecity").addEventListener("click", () => { $("#citypicker").hidden = false; });
  setupCityPicker($("#citypicker"), (picked) => { saveUserCity(picked); renderCityBox(); });
}

// Drops a 📍 pin on the user's confirmed city and zooms there (Leaflet maps)
async function pinCity(map, zoom) {
  const city = (currentUser() || {}).city;
  if (!city) return;
  map.setView([city.lat, city.lng], zoom);
  const pin = L.marker([city.lat, city.lng], { icon: L.divIcon({ html: "📍", className: "city-pin", iconSize: [32, 32], iconAnchor: [16, 32] }) })
    .addTo(map).bindPopup(`<b>📍 Your city</b><br>${esc(city.name)}`).openPopup();
  try {
    const t = await pointTemp(city.lat, city.lng);
    pin.setPopupContent(`<b>📍 Your city</b><br>${esc(city.name)}<br>${t}°C – ${level(t)[1]}`);
  } catch (error) { /* offline: keep the simple popup */ }
}


/* ---------- 9. PAGE CONTROLLERS ---------- */
const pages = {

  /* HOME: the hottest countries right now */
  async home() {
    renderCityBox();
    $("#contact").innerHTML = contactBox();
    let world = null;

    async function update() {
      try {
        if (!world) world = await loadCountries();
        const temps = await worldTemps(world.countries);
        $("#heat-preview").innerHTML = heatCards(hottest(world.countries, temps));
        $("#homelive").textContent = "● LIVE – updated " + new Date().toLocaleTimeString();
      } catch (error) {
        const saved = savedWorld();
        $("#homelive").textContent = saved
          ? "Offline – showing temperatures saved at " + new Date(saved.time).toLocaleString()
          : "No internet yet. Live temperatures will load automatically once you are online.";
      }
    }
    update();
    setInterval(update, WORLD_REFRESH);
    window.addEventListener("online", update);
  },

  /* HEAT MAP: every country of the world is colored green / yellow / orange */
  async heatmap() {
    const map = createMap();
    const layer = L.layerGroup().addTo(map);
    let world = null, temps = {};

    // Click anywhere: popup shows the exact place and the live temperature of that exact spot
    identifyPlaces(map, async (point) => {
      try {
        const t = await pointTemp(point.lat, point.lng);
        return `${t}°C – ${level(t)[1]}`;
      } catch (error) {
        return "Temperature unavailable (offline)";
      }
    });

    function draw() {
      layer.clearLayers();
      L.geoJSON(world.geo, {
        interactive: false,
        style: (feature) => {
          const t = temps[feature.id];
          return t === undefined
            ? { color: "#ffffff", weight: 0.5, fillColor: "#cccccc", fillOpacity: 0.3 }
            : { color: "#ffffff", weight: 0.7, fillColor: level(t)[2], fillOpacity: 0.55 };
        }
      }).addTo(layer);

      // MARKINGS: dot + label on the 9 hottest countries
      const top = hottest(world.countries, temps);
      $("#cards").innerHTML = heatCards(top);
      top.forEach((c) => {
        const l = level(c.temp);
        L.circleMarker([c.lat, c.lng], { radius: 9, color: "#ffffff", weight: 2, fillColor: l[2], fillOpacity: 1, bubblingMouseEvents: false })
          .bindTooltip(`${esc(c.name)}: ${c.temp}°C`, { permanent: true, direction: "right", offset: [8, 0], className: "heat-label" })
          .addTo(layer);
      });
    }

    async function refresh() {
      try {
        temps = await worldTemps(world.countries);
        $("#live").textContent = "● LIVE – updated " + new Date().toLocaleTimeString() + " (feels-like temperature, Open-Meteo). Click anywhere on the map.";
      } catch (error) {
        const saved = savedWorld();
        if (saved) temps = saved.temps;
        $("#live").textContent = saved
          ? "Offline – showing temperatures saved at " + new Date(saved.time).toLocaleString()
          : "No internet – live temperatures will appear when you are online.";
      }
      draw();
    }

    // DETAIL VIEW: when zoomed in, the visible area is split into a 6 x 6 grid and each square gets its own live temperature
    const grid = L.layerGroup().addTo(map);
    async function drawGrid() {
      const b = map.getBounds(), n = 6;
      const south = Math.max(b.getSouth(), -85), north = Math.min(b.getNorth(), 85);
      const dLat = (north - south) / n, dLng = (b.getEast() - b.getWest()) / n;
      const cells = [];
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const s = south + i * dLat, w = b.getWest() + j * dLng;
        cells.push({ s, w, n: s + dLat, e: w + dLng, lat: s + dLat / 2, lng: w + dLng / 2 });
      }
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${cells.map((c) => c.lat.toFixed(3)).join(",")}&longitude=${cells.map((c) => c.lng.toFixed(3)).join(",")}&current=apparent_temperature`;
        const data = await (await fetch(url)).json();
        grid.clearLayers();
        data.forEach((item, i) => {
          const t = Math.round(item.current.apparent_temperature), l = level(t), c = cells[i];
          L.rectangle([[c.s, c.w], [c.n, c.e]], { color: "#ffffff", weight: 0.5, fillColor: l[2], fillOpacity: 0.5, interactive: false })
            .bindTooltip(`${t}°C`, { permanent: true, direction: "center", className: "heat-label" }).addTo(grid);
        });
        $("#live").textContent = "● LIVE detail grid – each square is its own live temperature. Click any spot for its exact place and temperature.";
      } catch (error) {
        $("#live").textContent = "Detail grid unavailable (offline or busy). Move the map to try again.";
      }
    }
    let gridTimer = null;
    map.on("moveend", () => {
      clearTimeout(gridTimer);
      gridTimer = setTimeout(() => {
        if (map.getZoom() >= 7) { if (map.hasLayer(layer)) map.removeLayer(layer); drawGrid(); }
        else { grid.clearLayers(); if (!map.hasLayer(layer)) map.addLayer(layer); }
      }, 800);
    });

    pinCity(map, 11);                       // zoom to the user's confirmed city

    $("#live").textContent = "Loading the world map…";
    try {
      world = await loadCountries();
    } catch (error) {
      $("#live").textContent = "Could not load country borders. Check your internet and refresh.";
      return;
    }
    await refresh();
    setInterval(refresh, WORLD_REFRESH);
    window.addEventListener("online", refresh);
  },

  /* COOLING STATION: blue = safe place to stay, green = parks / places to plant trees.
     Zoom into any city in the world and real places are loaded from OpenStreetMap. */
  cooling() {
    const map = createMap();
    const layer = L.layerGroup().addTo(map);
    const own = get("stations");                          // places added by the admin
    let timer = null;

    function addPlace(place, color, border, emoji, text) {
      L.circle([place.lat, place.lng], { radius: 150, color: border, fillColor: color, fillOpacity: 0.25, weight: 1, interactive: false }).addTo(layer);
      L.circleMarker([place.lat, place.lng], { radius: 8, color: border, fillColor: color, fillOpacity: 0.95, bubblingMouseEvents: false })
        .bindPopup(`<b>${emoji} ${esc(place.name)}</b><br>${text}${place.note ? "<br>" + esc(place.note) : ""}`)
        .bindTooltip(place.name).addTo(layer);
    }

    function showLists(stay, trees) {
      $("#stations").innerHTML = stay.slice(0, 8).map((p) => stationTile({ name: p.name, note: p.note || "Safe place to stay" })).join("") || "<p>Zoom in to a city to see cooling places.</p>";
      $("#trees").innerHTML = trees.slice(0, 8).map((p) => `<div class="tile action"><h3>🌳 ${esc(p.name)}</h3><p>${esc(p.note || "Green space / place to plant trees")}</p></div>`).join("") || "<p>Zoom in to a city to see green spaces.</p>";
    }

    // Loads real places inside the part of the world you are looking at
    async function loadNearby() {
      const status = $("#mapstatus");
      if (map.getZoom() < 12) { status.textContent = "Zoom in to a city (zoom 12 or closer) to load cooling places and green spaces around it."; return; }
      status.textContent = "Loading places in this area…";
      const b = map.getBounds(), box = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
      const query = `[out:json][timeout:25];(
        nwr["amenity"~"^(library|community_centre|townhall|drinking_water|clinic|hospital)$"](${box});
        nwr["shop"="mall"](${box});
        nwr["leisure"~"^(park|garden)$"](${box});
        nwr["landuse"~"^(grass|brownfield|greenfield)$"](${box});
      );out center 200;`;
      try {
        const found = (await overpass(query)).map((e) => {
          const t = e.tags || {};
          const green = Boolean(t.leisure || t.landuse);
          let note = "Safe place to stay cool";
          if (t.leisure)  note = "Park / existing green space";
          if (t.landuse)  note = "Open land – possible tree-planting space";
          if (t.shop)     note = "Shopping mall (air-conditioned)";
          if (t.amenity)  note = t.amenity.replace("_", " ");
          return {
            name: t.name || (t.amenity === "drinking_water" ? "Drinking water" : t.landuse ? "Open land" : "Unnamed place"),
            lat: e.lat || e.center.lat, lng: e.lon || e.center.lon, isPark: green, note
          };
        });
        draw(found);
        status.textContent = `Showing ${found.length} real places from OpenStreetMap in this area.`;
      } catch (error) {
        status.textContent = "Could not load places (server busy or offline). Move the map to try again.";
      }
    }

    function draw(found) {
      layer.clearLayers();
      const stay  = found.filter((p) => !p.isPark).concat(own.filter((p) => p.kind !== "tree"));
      const trees = found.filter((p) => p.isPark).concat(own.filter((p) => p.kind === "tree"));
      stay.forEach((p)  => addPlace(p, COLORS.blue, "#0d47a1", "🔵", "Safe place to stay"));
      trees.forEach((p) => addPlace(p, COLORS.tree, "#1b4d0b", "🌳", "Green space / tree-planting spot"));
      showLists(stay, trees);
    }

    // Click anywhere: popup shows the exact place
    identifyPlaces(map, null);

    map.on("moveend", () => { clearTimeout(timer); timer = setTimeout(loadNearby, 700); });
    draw([]);
    pinCity(map, 13);                       // zoom to the user's confirmed city (this also loads nearby places)
    loadNearby();
    $("#contact").innerHTML = contactBox();
  },

  /* INFORMATION: city announcements + live heat news */
  info() {
    $("#contact").innerHTML = contactBox();
    const announcements = get("news").map((n) =>
      `<article class="news"><h3>${esc(n.title)}</h3><small>City announcement • ${esc(n.date)}</small><p>${esc(n.body)}</p></article>`).join("");
    const GOOGLE_NEWS = "https://news.google.com/rss/search?q=heat+index+%22La+Union%22+OR+Ilocos+when:14d&hl=en-PH&gl=PH&ceid=PH:en";

    // Source 1: rss2json (gives JSON). Source 2: a free proxy that returns the raw RSS, read with DOMParser.
    async function fetchHeadlines() {
      try {
        const data = await (await fetch("https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(GOOGLE_NEWS))).json();
        if (data.items && data.items.length) {
          return data.items.map((i) => ({ title: i.title, link: i.link, date: new Date(i.pubDate.replace(" ", "T") + "Z").toISOString() }));
        }
      } catch (error) { /* try source 2 */ }

      const text = await (await fetch("https://api.allorigins.win/raw?url=" + encodeURIComponent(GOOGLE_NEWS))).text();
      const xml = new DOMParser().parseFromString(text, "text/xml");
      return [...xml.querySelectorAll("item")].map((item) => ({
        title: item.querySelector("title").textContent,
        link: item.querySelector("link").textContent,
        date: new Date(item.querySelector("pubDate").textContent).toISOString()
      }));
    }

    function showNews(headlines, status) {
      const live = headlines.slice(0, 10).map((n) =>
        `<article class="news"><h3><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a></h3><small>${new Date(n.date).toLocaleString()}</small></article>`).join("");
      $("#news").innerHTML = announcements + live;
      $("#newsstatus").textContent = status;
    }

    async function loadNews() {
      try {
        const headlines = await fetchHeadlines();
        if (!headlines.length) throw new Error("empty");
        localStorage.setItem("hj_news_cache", JSON.stringify({ time: Date.now(), headlines }));   // saved for offline use
        showNews(headlines, "● LIVE – checked " + new Date().toLocaleTimeString());
      } catch (error) {
        // Offline or source busy: show the last news that was saved on this device
        const cache = JSON.parse(localStorage.getItem("hj_news_cache") || "null");
        if (cache) showNews(cache.headlines, "Offline – showing news saved at " + new Date(cache.time).toLocaleString() + ". It updates automatically when the internet returns.");
        else showNews([], "No internet yet and no saved news. It will load automatically once you are online.");
      }
    }

    loadNews();
    setInterval(loadNews, NEWS_REFRESH);
    window.addEventListener("online", loadNews);     // refresh right away when wifi comes back
  },

  /* ACTION: activities + report a problem (login needed so the city can find you) */
  action() {
    $("#contact").innerHTML = contactBox();
    $("#acts").innerHTML = get("acts").map((a) =>
      `<div class="tile action"><h3>${esc(a.title)}</h3><p>${esc(a.body)}</p></div>`).join("");

    const user = currentUser(), form = $("#report"), msg = $("#msg");
    if (!user) {
      form.hidden = true;
      $("#loginnotice").innerHTML = `<p>Please log in first, so the city can call you and find where the problem is.</p><a class="btn orange" href="index.html">Log in / Sign up</a>`;
      return;
    }
    $("#loginnotice").innerHTML = `<p>Reporting as <strong>${esc(user.name)}</strong> • 📞 ${esc(user.phone)}</p>`;

    let coords = null;
    $("#locate").addEventListener("click", () => {
      msg.textContent = "Finding your location…";
      getLocation((position) => {
        coords = position;
        $("#coords").textContent = `📍 Location captured (accurate to about ${coords.accuracy} m)`;
        msg.textContent = "";
      }, () => { msg.textContent = "Could not get your location. Allow location access, or type the address below."; });
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      if (!coords && !data.location.trim()) { msg.textContent = "Tap “Use my current location” or type where the problem is."; return; }

      const reports = JSON.parse(localStorage.getItem("hj_reports") || "[]");
      reports.push({
        id: Date.now(), time: new Date().toISOString(), status: "New",
        name: user.name, phone: user.phone,
        type: data.type, details: data.details, address: data.location,
        lat: coords ? coords.lat : null, lng: coords ? coords.lng : null
      });
      localStorage.setItem("hj_reports", JSON.stringify(reports));
      form.reset(); coords = null; $("#coords").textContent = "";
      msg.textContent = "Thank you! Your report, phone number and location were sent to the city government.";
    });
  },

  /* INDEX (main page): create your profile once, then just type your password */
  index() {
    const msg = $("#authmsg"), users = allUsers();
    let city = null;

    const show = (id, on) => { $(id).hidden = !on; };
    $("#signup-city").innerHTML = cityPickerHTML();
    setupCityPicker($("#signup-city"), (picked) => { city = picked; });

    function startSession(account) {
      localStorage.setItem("hj_last", account.phone);
      localStorage.setItem("hj_session", JSON.stringify({ name: account.name, phone: account.phone, address: account.address, city: account.city || null }));
      location.href = "home.html";
    }

    // First time on this device: only "Create your profile". Afterwards: only the password.
    function showScreen() {
      msg.textContent = "";
      if (!users.length) {
        $("#authintro").textContent = "Welcome! First create your profile. You only do this once – next time you open HeatJumper you just type your password.";
        show("#signup", true); show("#welcomeback", false); show("#backlogin", false);
        return;
      }
      $("#authintro").textContent = "Welcome back. Type your password to continue.";
      show("#welcomeback", true); show("#signup", false);
      const pick = $("#wbprofile");
      pick.innerHTML = users.map((u) => `<option value="${esc(u.phone)}">${esc(u.name)}</option>`).join("");
      const last = users.find((u) => u.phone === lastPhone()) || users[0];
      pick.value = last.phone;
      show("#wbpick", users.length > 1);                 // choose a profile only when several exist
      const hello = () => { const u = users.find((x) => x.phone === pick.value); $("#wbname").textContent = "Welcome back, " + u.name.split(" ")[0] + "!"; };
      pick.onchange = hello; hello();
      $("#wpw").focus();
    }

    $("#newprofile").addEventListener("click", () => {
      $("#authintro").textContent = "Create a new profile for this device.";
      show("#welcomeback", false); show("#signup", true); show("#backlogin", true); msg.textContent = "";
    });
    $("#backlogin").addEventListener("click", showScreen);

    $("#signup").addEventListener("submit", async (event) => {
      event.preventDefault();
      const d = Object.fromEntries(new FormData(event.target));
      if (!/^[0-9+\s-]{7,16}$/.test(d.phone)) { msg.textContent = "Please enter a valid phone number."; return; }
      if (users.some((u) => u.phone === d.phone)) { msg.textContent = "That phone number already has a profile. Tap “I already have a profile – log in”."; return; }
      if (!city) { msg.textContent = "Please find your city and tap “Confirm this city”."; return; }
      const account = { name: d.name, phone: d.phone, address: d.address, city, password: await hashText(d.password) };
      users.push(account);
      localStorage.setItem("hj_users", JSON.stringify(users));
      startSession(account);
    });

    $("#welcomeback").addEventListener("submit", async (event) => {
      event.preventDefault();
      const typed = await hashText($("#wpw").value);
      const found = users.find((u) => u.phone === $("#wbprofile").value && u.password === typed);
      if (!found) { msg.textContent = "Wrong password. Please try again."; $("#wpw").select(); return; }
      startSession(found);
    });

    showScreen();
  }
};

/* START: only logged-in users with a confirmed city may open the site pages */
function gate() {
  const user = currentUser(), page = document.body.dataset.page;
  if (!user && page !== "index" && page !== "admin") { location.replace("index.html"); return true; }
  if (user && page === "index")                       { location.replace("home.html");  return true; }
  if (user && !user.city && page !== "home" && page !== "admin") { location.replace("home.html"); return true; }
  return false;
}

async function start() {
  if (gate()) return;
  setupAccountLink();
  setupSearch();
  highlightFound();
  const currentPage = document.body.dataset.page;
  if ((currentPage === "heatmap" || currentPage === "cooling") && !(await ensureLeaflet())) {
    $("#map").innerHTML = "<p class=\"map-notice\" style=\"position:static\">The map library could not load. Please check your internet connection and refresh the page.</p>";
    return;
  }
  if (pages[currentPage]) pages[currentPage]();
}
start();
