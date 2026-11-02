/* Home Dashboard: every setting the owner may want to change lives here. ES5 (Tizen 3.0 / Chromium 47). */
var Config = {
  // Interface language at the first start: 'ru', 'he' (the whole layout right to left) or 'uk'. The remote's yellow key
  // switches to the next one in `languages` (ru → he → uk → ru); the choice is remembered on the TV (localStorage) and
  // wins over `lang` from then on. The language also picks the news sources (news.columns below).
  lang: 'ru',
  languages: ['ru', 'he', 'uk'],

  // The home city: the main weather card, the traffic routes and map, and the alert areas are all derived from it
  // (js/homecity.js, from the catalogue js/cities.js). The OK key opens the city picker on the TV; the choice is
  // remembered there and wins over this value from then on.
  homeCity: 'rehovot',                // HOME_CITY: build.local.env may set another catalogue id (js/cities.js)

  // World clocks, left to right. `zones` lists IANA names in order of preference: the first one the TV's
  // time-zone database accepts is used (Chromium 47 ships tzdata from 2015 and knows Kyiv only as
  // "Europe/Kiev"). `rule` is the built-in daylight-saving rule used when the TV has no usable Intl
  // time-zone support at all (see js/tz.js); the card then carries a small "≈" marker.
  // `place` links the card to a weather place below (its current temperature is shown on the card); 'home' is the home
  // city's.
  clocks: [
    { id: 'israel', zones: ['Asia/Jerusalem', 'Asia/Tel_Aviv'], rule: 'IL', place: 'home' },
    { id: 'ukraine', zones: ['Europe/Kyiv', 'Europe/Kiev'], rule: 'EU', place: 'kyiv' },
    { id: 'sydney', zones: ['Australia/Sydney'], rule: 'AU_SYD', place: 'sydney' }
  ],

  // Weather places. The first one is the main card (current weather, hourly strip, 7-day forecast): the home city, its
  // coordinates filled in at boot (js/homecity.js); the last three are the regions of the Israel weather screen. Every
  // place comes in ONE Open-Meteo request per refresh (comma-separated coordinates), so a screen more costs no request more.
  places: [
    { id: 'home' },
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

  // Air quality (js/air.js): Open-Meteo's air-quality API, no key, ONE request for the home city and the Israel regions
  // (the App passes them). The data are hourly (CAMS), so it is asked hourly; the same back-off as the weather. Dust is
  // flagged from dustUgm3 µg/m³: twice the EU daily PM10 limit from dust alone (ordinary haze reads 10–32, 2026-11-02).
  air: {
    base: 'https://air-quality-api.open-meteo.com/v1/air-quality',
    refreshMs: 60 * 60 * 1000,
    timeoutMs: 15 * 1000,
    retryMs: [60 * 1000, 2 * 60 * 1000, 4 * 60 * 1000, 8 * 60 * 1000],
    retryFloorMs: 30 * 1000,
    staleAfterMs: 3 * 60 * 60 * 1000,
    dustUgm3: 100,
    // Batch 13: the dust forecast in the same request — hourly for forecastDays days from today's 00:00 (CAMS reaches ~4 to
    // 5 days, later cells are null); a day's value (its hourly maximum) is shown only with dustDayMinHours of its 24 values.
    forecastDays: 5,
    dustDayMinHours: 20
  },

  // The Shabbat & holidays screen (js/shabbat.js): ONE Hebcal request (no key) for the home city, from 9 days back (an
  // ongoing holiday keeps its first day) to lookaheadDays ahead — 180 is the shortest lookahead that always holds `upcoming` holidays (measured over a year of
  // start days) — once a day, plus when the screen is opened and when the TV wakes with old data; no polling; a failing
  // source is retried with the usual back-off and then at most every retryMaxMs. `place` ({ geo: GeoNames id or null,
  // lat, lon, candleMins, shushanPurim }) is the home city's, written at boot (js/homecity.js). Shown: the festivals,
  // the four Israeli national days of `holidays` and the public fasts of `fasts` (Hebcal's ids).
  shabbat: {
    base: 'https://www.hebcal.com/hebcal',
    lookaheadDays: 180,
    upcoming: 6,                        // rows of the holiday list
    refreshMs: 24 * 60 * 60 * 1000,
    timeoutMs: 15 * 1000,
    retryMs: [60 * 1000, 2 * 60 * 1000, 4 * 60 * 1000, 8 * 60 * 1000],
    retryFloorMs: 30 * 1000,
    retryMaxMs: 60 * 60 * 1000,         // past retryMs: an outage is retried hourly, never only the next day
    staleAfterMs: 48 * 60 * 60 * 1000,
    holidays: ['rosh-hashana', 'yom-kippur', 'sukkot', 'shmini-atzeret', 'chanukah', 'tu-bishvat', 'purim', 'pesach',
      'yom-hashoah', 'yom-hazikaron', 'yom-haatzmaut', 'lag-baomer', 'yom-yerushalayim', 'shavuot'],
    fasts: ['tzom-gedaliah', 'asara-btevet', 'taanit-esther', 'tzom-tammuz', 'tisha-bav']
  },

  // Screens, switched with the remote's ◀ ▶: 'main' (clocks + weather), 'israel' (the weather across Israel), 'news',
  // 'markets' (shares, crypto, indices, currencies, commodities), 'shabbat' (candle lighting, havdalah and the next holidays
  // of the home city), 'traffic' (ten routes), 'map' (the traffic map with the highways), 'alerts' (Pikud HaOref: home, nearby and the recent alerts in Israel). Auto-rotation shows the
  // next one every intervalMs (enabled: false turns it off) — a screen named in dwellMs stays that long instead (the
  // markets 90 s: the owner, 2026-11-02); any key press pauses it for pauseAfterKeyMs, and an
  // alert at home (alerts.areas) holds it while the alert is up and for afterAlertMs after it clears.
  screens: ['main', 'israel', 'news', 'markets', 'shabbat', 'traffic', 'map', 'alerts'],
  rotation: { enabled: true, intervalMs: 45 * 1000, dwellMs: { markets: 90 * 1000 }, pauseAfterKeyMs: 2 * 60 * 1000, afterAlertMs: 2 * 60 * 1000 },

  // News: two columns, each one feed's top stories, newest first; the interface language picks the feeds (only the
  // active language's feeds are fetched, all in ONE parallel round every refreshMs):
  //   ru  Russian-language Israeli news: NEWSru.co.il's «Израиль» section and its «Экономика» section
  //   he  the top Hebrew outlets: Ynet's main feed and Globes' home page feed (Calcalist answers 403, TheMarker's feed
  //       stopped in May 2026)
  //   uk  news about Ukraine in Ukrainian: Ukrainska Pravda's main feed and Ekonomichna Pravda's feed
  // (every feed checked live with curl on 2026-10-30). `id` names the source in js/i18n.js ('n.src.<id>'), a column's
  // `id` its title ('n.col.<id>'); `feeds` is the feed it shows in each language.
  news: {
    feeds: [
      { id: 'newsru', url: 'https://www.newsru.co.il/il/www/section/israel' },
      { id: 'newsrufin', url: 'https://www.newsru.co.il/il/www/section/finance' },
      { id: 'ynet', url: 'https://www.ynet.co.il/Integration/StoryRss2.xml' },
      { id: 'globes', url: 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=2' },
      { id: 'pravda', url: 'https://www.pravda.com.ua/rss/' },
      { id: 'epravda', url: 'https://epravda.com.ua/rss/' }
    ],
    columns: [
      { id: 'il', feeds: { ru: 'newsru', he: 'ynet', uk: 'pravda' } },
      { id: 'econ', feeds: { ru: 'newsrufin', he: 'globes', uk: 'epravda' } }
    ],
    perFeed: 15,                        // items read from each feed (newest first)
    perColumn: 5,                       // stories in each column; a headline takes at most two lines
    refreshMs: 10 * 60 * 1000,
    timeoutMs: 20 * 1000,
    retryMs: [60 * 1000, 2 * 60 * 1000, 4 * 60 * 1000, 8 * 60 * 1000],
    retryFloorMs: 30 * 1000,
    staleAfterMs: 35 * 60 * 1000
  },

  // Traffic from Mapbox (Directions API, profile driving-traffic: live traffic for Israel; one GET per route, the ten in
  // parallel). The token is NOT kept here: the build replaces the placeholder with MAPBOX_TOKEN from the git-ignored
  // build.local.env. Without a token the screen shows how to connect one and sends nothing. The live traffic picture is
  // on the map screen (a Mapbox image).
  // The ten routes (`routes`: { id, from, to }, lat,lon) and their two columns of five (`columns`: «Города», «Рядом») are
  // derived from the home city at boot (js/homecity.js): all from home, to five big cities and to the five nearest.
  traffic: {
    token: '__MAPBOX_TOKEN__',
    base: 'https://api.mapbox.com/directions/v5/mapbox/driving-traffic/',
    // When a round is sent (js/traffic.js, Traffic.decide: one gate for every path), at any hour, only while the screen
    // is on view: an explicit ◀ ▶ open sends at once; a rotation arrival, the screen staying open and wake wait
    // minIntervalMs since the last ATTEMPT (failures and refusals included). Quota: Mapbox's free tier is 100,000
    // Directions requests a MONTH; a round costs one request per route (10). dailyRequestCap is a hard guard per UTC
    // date, reserved in localStorage before every round and never refunded: any 31 days touch at most 32 UTC dates, so
    // they stay ≤ 32 × 3,000 = 96,000 (< 100,000);
    // parked on the screen, 144 rounds a UTC date (1,440 requests). tests/build-config.test.js simulates every pattern.
    // Re-check it when adding a route or changing these values.
    schedule: {
      minIntervalMs: 10 * 60 * 1000,    // rotation arrivals, staying open, wake: at most one attempt per 10 min
      openMinIntervalMs: 0,             // an explicit ◀ ▶ open: every time (still one round in flight, still the cap)
      dailyRequestCap: 3000             // requests per UTC date
    },
    timeoutMs: 20 * 1000,
    staleAfterMs: 30 * 60 * 1000,
    // Delay chip colour: travel time now against the usual time at this hour (Mapbox's duration_typical)
    amberRatio: 1.15,
    redRatio: 1.5
  },

  // The traffic map: ONE image from the Mapbox Static Images API in the live-traffic style (traffic-night-v2), with the
  // same Mapbox token as the routes (traffic.token above, put in by the build). Its `center`, `zoom` and `home` (the dot)
  // come from the home city at boot (js/homecity.js; Rehovot keeps the owner's view: Tel Aviv, Rehovot, Ashdod and
  // Jerusalem fill the card with little sea). When it is loaded (js/trafficmap.js, one
  // gate): only while the map is on view and the TV shows the page, at once on a ◀ ▶ open, else every refreshMs; one image
  // at a time; never past dailyRequestCap images per UTC date, reserved in localStorage before each and never refunded.
  // Static Images' free tier is 50,000 a MONTH: any 31 days touch at most 32 UTC dates, so ≤ 32 × 600 = 19,200.
  map: {
    base: 'https://api.mapbox.com/styles/v1/mapbox/traffic-night-v2/static/',
    maxSide: 1280,                      // the API's largest side, in map points (the image is asked @2x)
    refreshMs: 5 * 60 * 1000,
    timeoutMs: 20 * 1000,
    staleAfterMs: 15 * 60 * 1000,
    dailyRequestCap: 600
  },

  // Pikud HaOref alerts. `areas` (the home city: raises the full-screen alert) and `nearby` (the cities around it: only a
  // quiet notice) are derived from the home city at boot (js/homecity.js): { he, ru, uk, en, ruIn, ukIn, match }, where
  // `match` holds the area names exactly as Pikud HaOref's area list writes them (tests/fixtures/oref/districts_heb.json;
  // a test checks every name). The screen calls an area by its name in the interface language.
  alerts: {
    url: 'https://www.oref.org.il/WarningMessages/alert/alerts.json',
    pollMs: 5 * 1000,                   // the next poll starts this long after the previous one ENDED
    timeoutMs: 4 * 1000,
    // An alert never ends on a guess (js/alerts.js): it stays for the instruction's minutes after the area was last
    // listed ("stay in the protected space 10 min"), or defaultHoldMs when the instruction names no duration, AND
    // until the feed has answered without the area for graceMs. An end message never clears or shortens it.
    graceMs: 60 * 1000,
    defaultHoldMs: 10 * 60 * 1000,
    failAfter: 3,                       // consecutive failed polls before "no connection" is shown
    previewMs: 10 * 1000,               // the blue key's alert preview stays this long (any key ends it sooner)
    // An alert at home rings a short attention sound (made with Web Audio, js/chime.js; the bundled sounds/alert.wav only
    // where Web Audio is missing): at its start, then every repeatMs while it is up, maxPlays times at most. Never for
    // nearby or other alerts; the preview plays it once.
    sound: { enabled: true, repeatMs: 30 * 1000, maxPlays: 5 },
    // The Alerts screen's list of recent alerts in Israel (js/alerts-history.js): asked only while that screen is on
    // view. mode=2 is the last 7 days (`days`, said on screen when the list is empty); mode=3 (a month) can run to
    // megabytes in a busy month, too much for the TV.
    history: {
      url: 'https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx?lang=he&mode=2',
      days: 7,
      max: 7,                           // rows on screen
      refreshMs: 2 * 60 * 1000,         // the feed itself is cached for 2 minutes (Cache-Control: max-age=120)
      timeoutMs: 15 * 1000,
      staleAfterMs: 10 * 60 * 1000
    }
  },

  // Markets (js/markets.js): six groups of six rows. A row is { id, yahoo: Yahoo symbol } or { id, base, code }: `code`
  // units for one `base` from open.er-api's daily table (UAH and RUB, which Yahoo has no shekel pair for). The Yahoo
  // symbols go perRequest at a time (the spark endpoint's limit, checked 2026-11-02: 21 symbols answer 400) — 33 symbols
  // = 2 requests — and the two rate tables are one request each, reused until the time the provider names for its next
  // update (at most rateReuseMaxMs): 4 requests in one parallel round, 2 while the daily rates are still current.
  // Asked only while the screen is on view (js/onview.js): at once on a ◀ ▶ open, else every refreshMs.
  // The lists, checked 2026-11-02 (tests/fixtures/markets/ranking.json): us = the five largest US companies by market cap +
  // Intuit; il = the six largest companies listed on the Tel Aviv exchange; crypto = the six largest by market cap without
  // stablecoins. Yahoo quotes TASE in agorot.
  markets: {
    spark: 'https://query1.finance.yahoo.com/v7/finance/spark',
    perRequest: 20,
    rates: 'https://open.er-api.com/v6/latest/',
    rateReuseMaxMs: 24 * 60 * 60 * 1000,
    refreshMs: 5 * 60 * 1000,
    staleAfterMs: 15 * 60 * 1000,       // data older than this reads «not updating» even without a failure
    timeoutMs: 15 * 1000,
    groups: [
      { id: 'fx', rows: [
        { id: 'USDILS', yahoo: 'USDILS=X' },          // shekels per dollar
        { id: 'EURILS', yahoo: 'EURILS=X' },          // shekels per euro
        { id: 'UAHperILS', base: 'ILS', code: 'UAH' }, // hryvnias per shekel
        { id: 'RUBperILS', base: 'ILS', code: 'RUB' }, // rubles per shekel
        { id: 'EURUSD', yahoo: 'EURUSD=X' },          // dollars per euro
        { id: 'UAHperUSD', base: 'USD', code: 'UAH' }  // hryvnias per dollar
      ] },
      { id: 'us', rows: [
        { id: 'AAPL', yahoo: 'AAPL' }, { id: 'NVDA', yahoo: 'NVDA' }, { id: 'MSFT', yahoo: 'MSFT' }, { id: 'GOOGL', yahoo: 'GOOGL' },
        { id: 'AMZN', yahoo: 'AMZN' }, { id: 'INTU', yahoo: 'INTU' }
      ] },
      { id: 'il', rows: [
        { id: 'TEVA.TA', yahoo: 'TEVA.TA' }, { id: 'ESLT.TA', yahoo: 'ESLT.TA' }, { id: 'LUMI.TA', yahoo: 'LUMI.TA' },
        { id: 'POLI.TA', yahoo: 'POLI.TA' }, { id: 'TSEM.TA', yahoo: 'TSEM.TA' }, { id: 'MZTF.TA', yahoo: 'MZTF.TA' }
      ] },
      { id: 'crypto', rows: [
        { id: 'BTC', yahoo: 'BTC-USD' }, { id: 'ETH', yahoo: 'ETH-USD' }, { id: 'BNB', yahoo: 'BNB-USD' }, { id: 'XRP', yahoo: 'XRP-USD' },
        { id: 'SOL', yahoo: 'SOL-USD' }, { id: 'TRX', yahoo: 'TRX-USD' }
      ] },
      { id: 'indices', rows: [
        { id: '^GSPC', yahoo: '^GSPC' }, { id: '^DJI', yahoo: '^DJI' }, { id: '^IXIC', yahoo: '^IXIC' }, { id: '^NDX', yahoo: '^NDX' },
        { id: '^RUT', yahoo: '^RUT' }, { id: '^VIX', yahoo: '^VIX' }
      ] },
      { id: 'commodities', rows: [
        { id: 'BZ=F', yahoo: 'BZ=F' }, { id: 'NG=F', yahoo: 'NG=F' }, { id: 'GC=F', yahoo: 'GC=F' }, { id: 'SI=F', yahoo: 'SI=F' },
        { id: 'HG=F', yahoo: 'HG=F' }, { id: 'CL=F', yahoo: 'CL=F' }
      ] }
    ]
  },

  // Burn-in care: the whole layout moves by a few pixels every `shiftMs`, slowly.
  burnIn: { shiftMs: 3 * 60 * 1000, offsets: [[0, 0], [8, 4], [-6, 8], [-8, -4], [6, -8], [2, 6], [-4, -6]] },

  // A clock card is tinted for the night from its place's fresh weather (Open-Meteo's is_day); without fresh
  // weather, between these local hours.
  dayStartsHour: 6,
  nightStartsHour: 19
};
