/* The home city: which one it is, and everything the dashboard derives from it — the main weather card, the traffic
 * routes and their two columns, the traffic map, the alert areas at home and nearby, the Shabbat calendar's place. Written into Config once, at boot,
 * before anything is made (a change of city reloads the app: js/app.js). ES5. No DOM.
 *   HomeCity.resolve(cities, storedId, buildId)  the stored choice when it names a catalogue city, else the build's
 *                                                (Config.homeCity), else 'rehovot'
 *   HomeCity.find(cities, id)       the catalogue entry of a city or a route destination (js/cities.js), or null
 *   HomeCity.derive(cities, id)     { id, city, place, routes, columns, map, alerts: { areas, nearby }, names,
 *                                   shabbat: { geo (GeoNames id or null), lat, lon, candleMins (or null), shushanPurim } }
 *   HomeCity.apply(config, derived) writes the derived sections into Config
 *   HomeCity.name(entry, lang, form)  the entry's name in the interface language (form 'In': its "in <place>" form where
 *                                   the language has one); English, then Russian, where it has none
 * An entry may carry its own `near` (route ids), `alertsNearby` (city ids) and `map` ({ center, zoom }): Rehovot does,
 * the owner's hand-tuned setup. Every other city derives them by the rules below. */
var HomeCity = (function () {
  var DEFAULT = 'rehovot';
  var HOME_PLACE = 'home';                        // the main weather card's place id (never a region's: 'haifa' is one)
  // «Города»: the first CITY_ROUTES of these that are not home.
  var MAJOR = ['tlv', 'jlm', 'haifa', 'beersheva', 'ashkelon', 'netanya'], CITY_ROUTES = 5;
  // «Рядом»: the NEAR_ROUTES nearest catalogue cities, at least NEAR_MIN_KM away (a twin centre is no trip).
  var NEAR_ROUTES = 5, NEAR_MIN_KM = 2;
  var MAP_ZOOM = 9.6;                             // the owner's zoom: home and the cities around it fill the card
  // Alerts nearby: the cities within NEARBY_KM, nearest first, NEARBY_MAX at most; fewer than NEARBY_MIN: the
  // NEARBY_MIN nearest within NEARBY_FAR_KM.
  var NEARBY_KM = 20, NEARBY_MAX = 11, NEARBY_MIN = 3, NEARBY_FAR_KM = 40;
  var EARTH_KM = 6371;

  function inList(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function find(cities, id) { return inList(cities.list, id) || inList(cities.pois, id); }
  function isCity(cities, id) { return typeof id === 'string' && inList(cities.list, id) !== null; }
  function resolve(cities, storedId, buildId) { return isCity(cities, storedId) ? storedId : isCity(cities, buildId) ? buildId : DEFAULT; }

  function rad(d) { return d * Math.PI / 180; }
  function km(a, b) {
    var h = Math.pow(Math.sin(rad(b[0] - a[0]) / 2), 2) + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.pow(Math.sin(rad(b[1] - a[1]) / 2), 2);
    return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
  }
  // Every other catalogue city with its distance from home, nearest first (a tie keeps the catalogue's order).
  function around(cities, home) {
    var out = [];
    for (var i = 0; i < cities.list.length; i++) {
      var c = cities.list[i];
      if (c.id !== home.id) out.push({ id: c.id, km: km(home.at, c.at), i: i });
    }
    out.sort(function (a, b) { return a.km - b.km || a.i - b.i; });
    return out;
  }
  function ids(list) { var out = []; for (var i = 0; i < list.length; i++) out.push(list[i].id); return out; }
  function within(list, maxKm) { var out = []; for (var i = 0; i < list.length; i++) if (list[i].km <= maxKm) out.push(list[i]); return out; }

  function majors(id) {
    var out = [];
    for (var i = 0; i < MAJOR.length && out.length < CITY_ROUTES; i++) if (MAJOR[i] !== id) out.push(MAJOR[i]);
    return out;
  }
  function nearRoutes(dist, taken) {
    var out = [];
    for (var i = 0; i < dist.length && out.length < NEAR_ROUTES; i++) {
      if (dist[i].km >= NEAR_MIN_KM && taken.indexOf(dist[i].id) < 0) out.push(dist[i].id);
    }
    return out;
  }
  function nearbyAlerts(dist) {
    var close = within(dist, NEARBY_KM).slice(0, NEARBY_MAX);
    return ids(close.length >= NEARBY_MIN ? close : within(dist, NEARBY_FAR_KM).slice(0, NEARBY_MIN));
  }
  // An alert area: the names the screens show, and the Oref names it is matched against.
  function area(c) { return { he: c.he, ru: c.ru, uk: c.uk, en: c.en, ruIn: c.ruIn, ukIn: c.ukIn, match: c.match || [c.he] }; }

  function derive(cities, id) {
    var city = inList(cities.list, id) || inList(cities.list, DEFAULT), dist = around(cities, city), i;
    var columns = majors(city.id), near = city.near || nearRoutes(dist, columns), dests = columns.concat(near);
    var routes = [], names = {}, nearby = city.alertsNearby || nearbyAlerts(dist), areas = [];
    names[city.id] = city;
    for (i = 0; i < dests.length; i++) {
      var d = find(cities, dests[i]);
      names[d.id] = d;
      routes.push({ id: d.id, from: city.at, to: d.at });
    }
    for (i = 0; i < nearby.length; i++) areas.push(area(find(cities, nearby[i])));
    var map = city.map || { center: city.at, zoom: MAP_ZOOM };
    return { id: city.id, city: city, place: { id: HOME_PLACE, lat: city.at[0], lon: city.at[1] }, routes: routes,
      columns: [{ id: 'cities', legs: columns }, { id: 'near', legs: near }],
      map: { center: map.center, zoom: map.zoom, home: city.at }, alerts: { areas: [area(city)], nearby: areas }, names: names,
      shabbat: { geo: city.geo || null, lat: city.at[0], lon: city.at[1], candleMins: city.candleMins || null, shushanPurim: !!city.shushanPurim } };
  }

  // The derived sections into Config: the main weather place (and the Israel clock's temperature with it), the routes and
  // their columns, the map's centre / zoom / home dot, the alert areas, the Shabbat calendar's place; Config.home keeps the
  // city and the names.
  function apply(config, d) {
    config.places[0] = d.place;
    config.clocks[0].place = d.place.id;
    config.traffic.routes = d.routes;
    config.traffic.columns = d.columns;
    config.map.center = d.map.center;
    config.map.zoom = d.map.zoom;
    config.map.home = d.map.home;
    config.alerts.areas = d.alerts.areas;
    config.alerts.nearby = d.alerts.nearby;
    config.shabbat.place = d.shabbat;
    config.home = { id: d.id, city: d.city, names: d.names };
  }

  // C-4, the one place-name rule of every screen: the entry's name in the interface language — in its "in <place>" form
  // (form 'In': ruIn / ukIn) where the language has one — else English, else Russian.
  function name(entry, lang, form) { return (form && entry[lang + form]) || entry[lang] || entry.en || entry.ru; }

  // The home city's name in a language (config: the Config the home city was applied to).
  function homeName(config, lang) { return name(config.home.city, lang); }
  return { resolve: resolve, find: find, derive: derive, apply: apply, name: name, homeName: homeName, km: km };
})();
