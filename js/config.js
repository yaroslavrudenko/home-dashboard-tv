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

  // Weather places. The first one is the main card (current weather, hourly strip, 7-day forecast).
  // Every place comes in ONE Open-Meteo request per refresh (comma-separated coordinates).
  places: [
    { id: 'rehovot', lat: 31.8928, lon: 34.8113 },
    { id: 'kyiv', lat: 50.4501, lon: 30.5234 },
    { id: 'sydney', lat: -33.8688, lon: 151.2093 }
  ],

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

  // Screens, switched with the remote's ◀ ▶: 'main' (clocks + weather), 'news', 'traffic'. Auto-rotation shows the
  // next one every intervalMs (enabled: false turns it off); any key press pauses it for pauseAfterKeyMs, and an
  // Israel alert on screen pauses it until the alert is gone.
  screens: ['main', 'news', 'traffic'],
  rotation: { enabled: true, intervalMs: 45 * 1000, pauseAfterKeyMs: 2 * 60 * 1000 },

  // News: Russian-language feeds, merged, de-duplicated and sorted newest first. All feeds come in ONE parallel
  // round every refreshMs. vesty.co.il publishes no live feed (every /Integration/StoryRss*.xml is weeks old), so
  // NEWSru.co.il "Важные новости" stands for Israel. `id` names the source in js/i18n.js ('news.src.<id>').
  news: {
    feeds: [
      { id: 'newsru', url: 'https://www.newsru.co.il/il/www/news/main' },
      { id: 'pravda', url: 'https://www.pravda.com.ua/rus/rss/' },
      { id: 'bbc', url: 'https://feeds.bbci.co.uk/russian/rss.xml' }
    ],
    perFeed: 15,                        // items kept from each feed (newest first)
    listSize: 6,                        // headlines under the lead story; fewer are shown when they do not fit
    refreshMs: 10 * 60 * 1000,
    timeoutMs: 20 * 1000,
    retryMs: [60 * 1000, 2 * 60 * 1000, 4 * 60 * 1000, 8 * 60 * 1000],
    retryFloorMs: 30 * 1000,
    staleAfterMs: 35 * 60 * 1000
  },

  // Traffic from TomTom (Routing API, one batch request for every route and road). The key is NOT kept here: the
  // build replaces the placeholder with TOMTOM_KEY from the git-ignored build.local.env. Without a key the screen
  // shows how to connect one and sends nothing. Coordinates are lat,lon; edit freely.
  traffic: {
    key: '__TOMTOM_KEY__',
    base: 'https://api.tomtom.com/routing/1/batch/sync/json',
    routes: [
      { id: 'telaviv', from: [31.8928, 34.8113], to: [32.0741, 34.7922] },      // Rehovot → Tel Aviv, Azrieli
      { id: 'rishon', from: [31.8928, 34.8113], to: [31.9640, 34.8044] },       // Rehovot → Rishon LeZion
      { id: 'jerusalem', from: [31.8928, 34.8113], to: [31.7890, 35.2030] }     // Rehovot → Jerusalem, entrance
    ],
    // Main roads: a stretch of each, measured as a route (same request): delay against free flow.
    roads: [
      { id: 'ayalon', from: [32.0405, 34.7905], to: [32.1050, 34.8040] },       // Ayalon (20), Holon → Rokach, northbound
      { id: 'road4', from: [31.8640, 34.8170], to: [31.9990, 34.8330] },        // Route 4, Bilu → Beit Dagan
      { id: 'road1', from: [31.9550, 34.9120], to: [31.7960, 35.1480] },        // Route 1, Ben Shemen → Motza
      { id: 'road6', from: [31.8790, 34.9230], to: [32.0820, 34.9520] }         // Route 6, Nahshon → Kesem
    ],
    // Quota: TomTom's free tier allows ~2,500 items (route requests) a day and every refresh costs one per route and
    // road (7 now). A test pins the worst day, retries included, under that limit — re-check it when adding a leg.
    visibleRefreshMs: 5 * 60 * 1000,    // while the traffic screen is on after a ◀ ▶ visit (a rotation visit keeps the hidden interval)
    refreshMs: 15 * 60 * 1000,          // otherwise
    timeoutMs: 20 * 1000,
    // Back-off after a failed round: never sooner than 4.5 min (a faster retry would spend the quota, not help);
    // a refusal (403 key, 429 daily limit) waits the regular interval or longer.
    retryMs: [5 * 60 * 1000, 10 * 60 * 1000],
    retryFloorMs: 270 * 1000,
    staleAfterMs: 30 * 60 * 1000,
    // Delay chip colour: travel time against free flow
    amberRatio: 1.15,
    redRatio: 1.5
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
