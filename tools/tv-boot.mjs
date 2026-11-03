// FIX-BATCH-19 item 7: how long the app takes to boot ON THE TV, read from the page's own clock — the Navigation Timing of
// the page and the app's two marks (js/app-env.js mark): «dash:start» (App.start, on load) and «dash:main-full» (the first
// main screen drawn with its weather). Every time is in ms from the page's navigationStart, the closest the page can see to
// the launch. Nothing here talks to the TV itself: the coordinator opens the app's inspector port first, e.g.
//
//   sdb shell 0 debug <appid>                    # Tizen launches the app in debug mode and prints its inspector port
//   sdb forward tcp:9222 tcp:<that port>
//   node tools/tv-boot.mjs http://127.0.0.1:9222 --reload     # or without --reload: read the boot that just happened
//
// --reload reloads the page through the inspector and waits (≤ 60 s) for the NEW document's «dash:main-full» — a read is
// taken only when its navigationStart differs from the one before the reload (FIX-19B C4: a slow unload must never hand back
// the previous boot), so each run is a fresh boot. --runs N (any N, 1 included) repeats it N times — it always reloads (C6) —
// and prints each run and the median. «main-full» is the first COMPLETE main screen with its weather: the weather card, its
// status and the clock cards drawn — from the data kept on the TV when there are some, else from the first answer (C5).
// Output: one JSON line per run (with its navigationStart, epoch ms), then a summary line. Node ≥ 22 (its global WebSocket and fetch); no dependency. Speaks the DevTools protocol of Chromium 47
// (Runtime.evaluate with returnByValue, Page.reload).
const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:9222').replace(/\/$/, '');
const runsAt = args.indexOf('--runs'), runs = runsAt >= 0 ? Math.max(1, Number(args[runsAt + 1]) || 1) : 1;
const reload = runsAt >= 0 || args.includes('--reload');   // FIX-19B C6: «--runs 1» reloads too

// The page's own account of its boot (ES5: it runs in the TV's Chromium 47).
const READ = `(function () {
  var t = performance.timing, n = t.navigationStart, marks = {};
  var list = performance.getEntriesByType ? performance.getEntriesByType('mark') : [];
  for (var i = 0; i < list.length; i++) marks[list[i].name] = Math.round(list[i].startTime);
  return JSON.stringify({ navigationStart: n, responseEnd: t.responseEnd - n, domContentLoaded: t.domContentLoadedEventEnd > 0 ? t.domContentLoadedEventEnd - n : null,
    load: t.loadEventEnd > 0 ? t.loadEventEnd - n : null, start: marks['dash:start'] === undefined ? null : marks['dash:start'],
    mainFull: marks['dash:main-full'] === undefined ? null : marks['dash:main-full'], ua: navigator.userAgent });
})()`;

async function connect() {
  const pages = await (await fetch(base + '/json')).json();
  const page = pages.find((p) => p.type === 'page' && /index\.html/.test(p.url)) || pages.find((p) => p.type === 'page');
  if (!page || !page.webSocketDebuggerUrl) throw new Error('no inspectable page at ' + base + '/json');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error('cannot open ' + page.webSocketDebuggerUrl)); });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => { const r = JSON.parse(m.data); if (r.id && waiting.has(r.id)) { waiting.get(r.id)(r); waiting.delete(r.id); } };
  const send = (method, params) => new Promise((ok, fail) => {
    const mine = ++id;
    waiting.set(mine, (r) => (r.error ? fail(new Error(method + ': ' + r.error.message)) : ok(r.result)));
    ws.send(JSON.stringify({ id: mine, method, params: params || {} }));
  });
  return { send, close: () => ws.close() };
}
async function read(cdp) {
  const r = await cdp.send('Runtime.evaluate', { expression: READ, returnByValue: true });
  return JSON.parse(r.result.value);
}
async function oneBoot(cdp) {
  let before = null;
  if (reload) {
    before = (await read(cdp)).navigationStart;                 // the document the reload replaces
    await cdp.send('Page.reload', { ignoreCache: true });
  }
  for (const end = Date.now() + 60000; ;) {
    let b = null;
    try { b = await read(cdp); } catch (e) { b = null; }      // the page may be between documents right after the reload
    if (b && b.mainFull !== null && b.navigationStart !== before) return b;   // only the NEW document's boot
    if (Date.now() > end) throw new Error('no «dash:main-full» within 60 s: ' + JSON.stringify(b));
    await new Promise((r) => setTimeout(r, 250));
  }
}

const cdp = await connect();
try {
  const all = [];
  for (let i = 0; i < runs; i++) { const b = await oneBoot(cdp); all.push(b); console.log(JSON.stringify(Object.assign({ run: i + 1 }, b))); }
  const med = (k) => { const v = all.map((b) => b[k]).filter((x) => typeof x === 'number').sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
  console.log('median ms from navigationStart — start: ' + med('start') + ', first full main screen: ' + med('mainFull') + ', load: ' + med('load') + ' (' + all.length + ' run' + (all.length > 1 ? 's' : '') + ')');
} finally { cdp.close(); }
