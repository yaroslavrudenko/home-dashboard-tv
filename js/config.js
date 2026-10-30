/* Home Dashboard: every setting the owner may want to change lives here. ES5 (Tizen 3.0 / Chromium 47). */
var Config = {
  // Interface language at the first start: 'ru', 'he' (the whole layout right to left) or 'uk'. The remote's yellow key
  // switches to the next one in `languages` (ru → he → uk → ru); the choice is remembered on the TV (localStorage) and
  // wins over `lang` from then on. The language also picks the news sources (news.columns below).
  lang: 'ru',
  languages: ['ru', 'he', 'uk'],

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
  // 'traffic' (ten routes), 'map' (the traffic map with the highways), 'alerts' (Pikud HaOref: home, nearby and the
  // recent alerts in Israel). Auto-rotation shows the
  // next one every intervalMs (enabled: false turns it off); any key press pauses it for pauseAfterKeyMs, and an
  // alert at home (alerts.areas) holds it while the alert is up and for afterAlertMs after it clears.
  screens: ['main', 'israel', 'news', 'traffic', 'map', 'alerts'],
  rotation: { enabled: true, intervalMs: 45 * 1000, pauseAfterKeyMs: 2 * 60 * 1000, afterAlertMs: 2 * 60 * 1000 },

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
  // build.local.env. Without a token the screen shows how to connect one and sends nothing. Coordinates are lat,lon; edit
  // freely. The live traffic picture is on the map screen (a Mapbox image).
  traffic: {
    token: '__MAPBOX_TOKEN__',
    base: 'https://api.mapbox.com/directions/v5/mapbox/driving-traffic/',
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
  // same Mapbox token as the routes (traffic.token above, put in by the build), centred so that Tel Aviv, Rehovot, Ashdod
  // and Jerusalem fill the card with little sea; `home` is the dot on Rehovot. When it is loaded (js/trafficmap.js, one
  // gate): only while the map is on view and the TV shows the page, at once on a ◀ ▶ open, else every refreshMs; one image
  // at a time; never past dailyRequestCap images per UTC date, reserved in localStorage before each and never refunded.
  // Static Images' free tier is 50,000 a MONTH: any 31 days touch at most 32 UTC dates, so ≤ 32 × 600 = 19,200.
  map: {
    base: 'https://api.mapbox.com/styles/v1/mapbox/traffic-night-v2/static/',
    center: [31.93, 34.94],             // lat, lon (checked on the live image 2026-10-30: Tel Aviv to Jerusalem, Ashdod in)
    zoom: 9.6,
    maxSide: 1280,                      // the API's largest side, in map points (the image is asked @2x)
    home: [31.8928, 34.8113],           // Rehovot
    refreshMs: 5 * 60 * 1000,
    timeoutMs: 20 * 1000,
    staleAfterMs: 15 * 60 * 1000,
    dailyRequestCap: 600
  },

  // Pikud HaOref alerts. `areas` are the alert area names (Hebrew, exactly as Pikud HaOref's area list writes them —
  // tests/fixtures/oref/districts_heb.json; a test checks every name) that raise the full-screen alert; `nearby` only
  // shows a quiet notice. The screen calls an area by its name in the interface language: `he` itself, `ru`, `uk`.
  alerts: {
    url: 'https://www.oref.org.il/WarningMessages/alert/alerts.json',
    areas: [{ he: 'רחובות', ru: 'Реховот', uk: 'Реховот' }],
    nearby: [
      { he: 'נס ציונה', ru: 'Нес-Циона', uk: 'Нес-Ціона' }, { he: 'ראשון לציון', ru: 'Ришон-ле-Цион', uk: 'Рішон-ле-Ціон' },
      { he: 'יבנה', ru: 'Явне', uk: 'Явне' }, { he: 'גדרה', ru: 'Гедера', uk: 'Гедера' },
      { he: 'מזכרת בתיה', ru: 'Мазкерет-Батья', uk: 'Мазкерет-Батья' }, { he: 'קריית עקרון', ru: 'Кирьят-Экрон', uk: 'Кір’ят-Екрон' },
      { he: 'באר יעקב', ru: 'Беэр-Яаков', uk: 'Беер-Яаков' }, { he: 'רמלה', ru: 'Рамла', uk: 'Рамла' }, { he: 'לוד', ru: 'Лод', uk: 'Лод' },
      { he: 'אשדוד', ru: 'Ашдод', uk: 'Ашдод' }, { he: 'תל אביב', ru: 'Тель-Авив', uk: 'Тель-Авів' }
    ],
    pollMs: 5 * 1000,                   // the next poll starts this long after the previous one ENDED
    timeoutMs: 4 * 1000,
    // An alert never ends on a guess (js/alerts.js): it stays for the instruction's minutes after the area was last
    // listed ("stay in the protected space 10 min"), or defaultHoldMs when the instruction names no duration, AND
    // until the feed has answered without the area for graceMs. An end message never clears or shortens it.
    graceMs: 60 * 1000,
    defaultHoldMs: 10 * 60 * 1000,
    failAfter: 3,                       // consecutive failed polls before "no connection" is shown
    previewMs: 10 * 1000,               // the blue key's alert preview stays this long (any key ends it sooner)
    // An alert at home rings a short attention sound (sounds/alert.wav): at its start, then every repeatMs while it is
    // up, maxPlays times at most. Never for nearby or other alerts; the preview plays it once.
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

  // Burn-in care: the whole layout moves by a few pixels every `shiftMs`, slowly.
  burnIn: { shiftMs: 3 * 60 * 1000, offsets: [[0, 0], [8, 4], [-6, 8], [-8, -4], [6, -8], [2, 6], [-4, -6]] },

  // A clock card is tinted for the night from its place's fresh weather (Open-Meteo's is_day); without fresh
  // weather, between these local hours.
  dayStartsHour: 6,
  nightStartsHour: 19
};
