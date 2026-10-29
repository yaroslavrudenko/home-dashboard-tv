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
  // All places are requested in parallel, one request per place per refresh.
  places: [
    { id: 'rehovot', lat: 31.8928, lon: 34.8113 },
    { id: 'kyiv', lat: 50.4501, lon: 30.5234 },
    { id: 'sydney', lat: -33.8688, lon: 151.2093 }
  ],

  weather: {
    base: 'https://api.open-meteo.com/v1/forecast',
    refreshMs: 15 * 60 * 1000,          // regular refresh
    timeoutMs: 15 * 1000,               // one request
    retryMs: [60 * 1000, 2 * 60 * 1000, 4 * 60 * 1000, 8 * 60 * 1000],   // back-off after failed refreshes, then refreshMs
    staleAfterMs: 45 * 60 * 1000,       // data older than this is marked stale even without a failure
    hours: 12,                          // hourly strip length
    days: 7                             // daily list length
  },

  // Burn-in care: the whole layout moves by a few pixels every `shiftMs`, slowly.
  burnIn: { shiftMs: 3 * 60 * 1000, offsets: [[0, 0], [8, 4], [-6, 8], [-8, -4], [6, -8], [2, 6], [-4, -6]] },

  // A clock card shows the night style between these local hours (no weather needed for the hint).
  dayStartsHour: 6,
  nightStartsHour: 19
};
