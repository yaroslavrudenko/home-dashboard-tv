/* Home Dashboard: every setting the owner may want to change lives here. ES5 (Tizen 3.0 / Chromium 47). */
var Config = {
  // Interface language: 'ru' (default) or 'en'. Hebrew / Ukrainian slots are ready in js/i18n.js.
  lang: 'ru',

  // World clocks, left to right. `zones` lists IANA names in order of preference: the first one the TV's
  // time-zone database accepts is used (Chromium 47 ships tzdata from 2015 and knows Kyiv only as
  // "Europe/Kiev"). `rule` is the built-in daylight-saving rule used when the TV has no usable Intl
  // time-zone support at all (see js/tz.js); the card then carries a small "≈" marker.
  // `place` links the card to a weather place below (its current temperature is shown on the card).
  clocks: [
    { id: 'israel', zones: ['Asia/Jerusalem', 'Asia/Tel_Aviv'], rule: 'IL', place: 'rehovot' },
    { id: 'ukraine', zones: ['Europe/Kyiv', 'Europe/Kiev'], rule: 'EU', place: 'kyiv' },
    { id: 'sydney', zones: ['Australia/Sydney'], rule: 'AU_SYD', place: 'sydney' }
  ],

  // Weather places. The first one is the main card (current weather, hourly strip, 7-day forecast); the last three are
  // the regions of the Israel weather screen. Every place comes in ONE Open-Meteo request per refresh
  // (comma-separated coordinates), so a screen more costs no request more.
  places: [
    { id: 'rehovot', lat: 31.8928, lon: 34.8113 },
    { id: 'kyiv', lat: 50.4501, lon: 30.5234 },
    { id: 'sydney', lat: -33.8688, lon: 151.2093 },
    { id: 'haifa', lat: 32.794, lon: 34.9896 },
    { id: 'telaviv', lat: 32.0853, lon: 34.7818 },
    { id: 'beersheva', lat: 31.2518, lon: 34.7913 }
  ],

  // The Israel weather screen: one card per region (left to right), each a place above, with a `days`-day forecast.
  israel: {
    regions: [{ id: 'north', place: 'haifa' }, { id: 'center', place: 'telaviv' }, { id: 'south', place: 'beersheva' }],
    days: 5
  },

  weather: {
    base: 'https://api.open-meteo.com/v1/forecast',
    refreshMs: 15 * 60 * 1000,          // regular refresh
    timeoutMs: 15 * 1000,               // one request
    // Back-off ceilings after 1, 2, 3, 4 failed refreshes, then refreshMs. Each wait is drawn at random
    // between retryFloorMs and its ceiling (full jitter), so it never loops tightly and never exceeds the ceiling.
    retryMs: [60 * 1000, 2 * 60 * 1000, 4 * 60 * 1000, 8 * 60 * 1000],
    retryFloorMs: 30 * 1000,
    staleAfterMs: 45 * 60 * 1000,       // data older than this is marked stale even without a failure
    hours: 12,                          // hourly strip length
    forecastHours: 24,                  // hourly rows fetched: the strip can follow the clock for 12 h without new data
    days: 7                             // daily list length
  },

  // Screens, switched with the remote's ◀ ▶: 'main' (clocks + weather), 'israel' (the weather across Israel), 'news',
  // 'traffic' (ten routes), 'map' (the traffic map with the highways). Auto-rotation shows the
  // next one every intervalMs (enabled: false turns it off); any key press pauses it for pauseAfterKeyMs, and an
  // Israel alert on screen pauses it until the alert is gone.
  screens: ['main', 'israel', 'news', 'traffic', 'map'],
  rotation: { enabled: true, intervalMs: 45 * 1000, pauseAfterKeyMs: 2 * 60 * 1000 },

  // News: two columns of Israeli news from the top outlets, in Hebrew, each one feed's top stories, newest first. All
  // feeds come in ONE parallel round every refreshMs. Left «Израиль»: Ynet's main feed; right «Экономика»: Globes' home
  // page feed (Calcalist answers 403 and TheMarker's feed stopped in May 2026; checked 2026-10-30). `id` names the source
  // in js/i18n.js ('n.src.<id>'), a column's `id` its title ('n.col.<id>'); `feed` is the feed it shows and `dir` the
  // direction its headlines are read in.
  news: {
    feeds: [
      { id: 'ynet', url: 'https://www.ynet.co.il/Integration/StoryRss2.xml' },
      { id: 'globes', url: 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=2' }
    ],
    columns: [{ id: 'il', feed: 'ynet', dir: 'rtl' }, { id: 'econ', feed: 'globes', dir: 'rtl' }],
    perFeed: 15,                        // items read from each feed (newest first)
    perColumn: 5,                       // stories in each column; a headline takes at most two lines
    refreshMs: 10 * 60 * 1000,
    timeoutMs: 20 * 1000,
    retryMs: [60 * 1000, 2 * 60 * 1000, 4 * 60 * 1000, 8 * 60 * 1000],
    retryFloorMs: 30 * 1000,
    staleAfterMs: 35 * 60 * 1000
  },

  // Traffic from TomTom (Routing API, one batch request for the ten routes). The key is NOT kept here: the build
  // replaces the placeholder with TOMTOM_KEY from the git-ignored build.local.env. Without a key the screen shows how to
  // connect one and sends nothing. Coordinates are lat,lon; edit freely. The main roads are watched on the map screen.
  traffic: {
    key: '__TOMTOM_KEY__',
    base: 'https://api.tomtom.com/routing/1/batch/sync/json',
    // Routes, all from Rehovot (the screen's grouping is `columns` below).
    routes: [
      { id: 'tlv', from: [31.8928, 34.8113], to: [32.0853, 34.7818] },          // Tel Aviv, city centre (Dizengoff Square)
      { id: 'jlm', from: [31.8928, 34.8113], to: [31.7816, 35.2186] },          // Jerusalem, city centre (Zion Square)
      { id: 'haifa', from: [31.8928, 34.8113], to: [32.8185, 34.9988] },        // Haifa, city centre (Paris Square)
      { id: 'beersheva', from: [31.8928, 34.8113], to: [31.2518, 34.7913] },    // Beer Sheva, city centre
      { id: 'ashkelon', from: [31.8928, 34.8113], to: [31.6688, 34.5743] },     // Ashkelon, city centre
      { id: 'modiin', from: [31.8928, 34.8113], to: [31.8986, 35.0076] },       // Modi'in, city centre
      { id: 'rishon', from: [31.8928, 34.8113], to: [31.9640, 34.8044] },       // Rishon LeZion
      { id: 'airport', from: [31.8928, 34.8113], to: [32.0004, 34.8706] },      // Ben Gurion Airport, Terminal 3
      { id: 'holon', from: [31.8928, 34.8113], to: [32.0158, 34.7874] },        // Holon, city centre
      { id: 'glilot', from: [31.8928, 34.8113], to: [32.1449, 34.8073] }        // Glilot, Cinema City
    ],
    // The screen: two columns of five widgets, left to right (`legs`: route ids, top to bottom).
    columns: [
      { id: 'cities', legs: ['tlv', 'jlm', 'haifa', 'beersheva', 'ashkelon'] },
      { id: 'near', legs: ['modiin', 'rishon', 'airport', 'holon', 'glilot'] }
    ],
    // When a batch is sent (js/traffic.js, Traffic.decide: one gate for every path), at any hour, only while the screen
    // is on view: an explicit ◀ ▶ open sends at once; a rotation arrival, the screen staying open and wake wait
    // minIntervalMs since the last ATTEMPT (failures and refusals included). Quota: TomTom's free routing tier is 20,000
    // items a MONTH for the whole account (docs.tomtom.com/pricing, read 2026-10-30); a batch costs one item per route
    // (10). dailyItemCap is a hard guard per UTC date, reserved in localStorage before every POST and never refunded:
    // any 31 days stay ≤ 31 × 580 = 17,980; parked on the screen, 58 batches a UTC date (17,860 in 31 days).
    // tests/build-config.test.js simulates every pattern. Re-check it when adding a route or changing these values.
    schedule: {
      minIntervalMs: 25 * 60 * 1000,    // rotation arrivals, staying open, wake: at most one attempt per 25 min
      openMinIntervalMs: 0,             // an explicit ◀ ▶ open: every time (still one batch in flight, still the cap)
      dailyItemCap: 580                 // items per UTC date
    },
    timeoutMs: 20 * 1000,
    staleAfterMs: 30 * 60 * 1000,
    // Delay chip colour: travel time against free flow
    amberRatio: 1.15,
    redRatio: 1.5
  },

  // The traffic map: TomTom raster tiles (Map Display API base map + Traffic Flow overlay) with the traffic key above,
  // centred on Rehovot, Tel Aviv to Ashdod in view. 512-px tiles at zoom 10 look like zoom 11 at 256 px and need a
  // quarter of the requests. Tiles load only while the map is on view (js/trafficmap.js: the daily tile budget).
  map: {
    base: 'https://api.tomtom.com/map/1/tile/basic/night/',
    // relative0-dark: TomTom's flow colours for a dark map; it takes no `thickness` (that pair is an HTTP 400).
    flow: 'https://api.tomtom.com/traffic/map/4/tile/flow/relative0-dark/',
    center: [31.8928, 34.8113],
    zoom: 10,
    tileSize: 512,
    language: 'ru-RU',
    refreshMs: 5 * 60 * 1000,           // the traffic overlay while on view; a failed layer is tried again after as long
    timeoutMs: 20 * 1000,               // one tile: a round with a tile not loaded by then has failed
    staleAfterMs: 15 * 60 * 1000
  },

  // Pikud HaOref alerts. `areas` are the alert area names (Hebrew, exactly as Pikud HaOref's area list writes them —
  // tests/fixtures/oref/districts_heb.json; a test checks every name) that raise the full-screen alert; `nearby` only shows a quiet notice. `name` is how the screen calls the area in Russian.
  alerts: {
    url: 'https://www.oref.org.il/WarningMessages/alert/alerts.json',
    areas: [{ he: 'רחובות', name: 'Реховот' }],
    nearby: [
      { he: 'נס ציונה', name: 'Нес-Циона' }, { he: 'ראשון לציון', name: 'Ришон-ле-Цион' }, { he: 'יבנה', name: 'Явне' },
      { he: 'גדרה', name: 'Гедера' }, { he: 'מזכרת בתיה', name: 'Мазкерет-Батья' }, { he: 'קריית עקרון', name: 'Кирьят-Экрон' },
      { he: 'באר יעקב', name: 'Беэр-Яаков' }, { he: 'רמלה', name: 'Рамла' }, { he: 'לוד', name: 'Лод' },
      { he: 'אשדוד', name: 'Ашдод' }, { he: 'תל אביב', name: 'Тель-Авив' }
    ],
    pollMs: 5 * 1000,                   // the next poll starts this long after the previous one ENDED
    timeoutMs: 4 * 1000,
    // An alert never ends on a guess (js/alerts.js): it stays for the instruction's minutes after the area was last
    // listed ("stay in the protected space 10 min"), or defaultHoldMs when the instruction names no duration, AND
    // until the feed has answered without the area for graceMs. An end message never clears or shortens it.
    graceMs: 60 * 1000,
    defaultHoldMs: 10 * 60 * 1000,
    failAfter: 3                        // consecutive failed polls before "no connection" is shown
  },

  // Burn-in care: the whole layout moves by a few pixels every `shiftMs`, slowly.
  burnIn: { shiftMs: 3 * 60 * 1000, offsets: [[0, 0], [8, 4], [-6, 8], [-8, -4], [6, -8], [2, 6], [-4, -6]] },

  // A clock card is tinted for the night from its place's fresh weather (Open-Meteo's is_day); without fresh
  // weather, between these local hours.
  dayStartsHour: 6,
  nightStartsHour: 19
};
