/* Line-style weather icons as inline SVG strings (soft colours and per-size stroke widths via CSS). ES5.
 * Icons.weather(code, isDay) maps an Open-Meteo WMO code to an icon; Icons.glyph(name) gives the small
 * detail icons (wind, drop, umbrella, sunrise, sunset) and the screens' glyphs (car, warning, news). */
var Icons = (function () {
  var CLOUD = 'M19 46h27a9 9 0 0 0 0-18a13 13 0 0 0-25-2a10 10 0 0 0-2 20z';
  var maskSeq = 0;

  function rays(cx, cy, r1, r2) {
    var out = '';
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      out += '<line x1="' + (cx + r1 * Math.cos(a)).toFixed(1) + '" y1="' + (cy + r1 * Math.sin(a)).toFixed(1) +
        '" x2="' + (cx + r2 * Math.cos(a)).toFixed(1) + '" y2="' + (cy + r2 * Math.sin(a)).toFixed(1) + '"/>';
    }
    return out;
  }
  var SUN = '<g class="ic-sun"><circle cx="32" cy="32" r="10"/>' + rays(32, 32, 16, 22) + '</g>';
  var MOON = '<g class="ic-moon"><path d="M40 44a15 15 0 0 1-13-25a16 16 0 1 0 19 22a15 15 0 0 1-6 3z"/></g>';
  var SMALL_SUN = '<circle cx="23" cy="23" r="7"/>' + rays(23, 23, 11.5, 16);
  var SMALL_MOON = '<path d="M27 31a10 10 0 0 1-8-17a11 11 0 1 0 13 15a10 10 0 0 1-5 2z"/>';

  function svg(cls, body) {
    return '<svg class="icon ' + cls + '" viewBox="0 0 64 64" aria-hidden="true">' + body + '</svg>';
  }
  function cloud(dy) { return '<path class="ic-cloud" d="' + CLOUD + '" transform="translate(0 ' + (dy || 0) + ')"/>'; }

  // A small sun or moon partly hidden behind a cloud: the cloud's outline masks it out.
  function behindCloud(isDay, dx, dy) {
    var id = 'icm' + (++maskSeq);
    var move = 'translate(' + dx + ' ' + dy + ')';
    return '<mask id="' + id + '"><rect width="64" height="64" fill="#fff"/>' +
      '<path d="' + CLOUD + '" transform="' + move + '" fill="#000" stroke="#000" stroke-width="8"/></mask>' +
      '<g class="' + (isDay ? 'ic-sun' : 'ic-moon') + '" mask="url(#' + id + ')">' + (isDay ? SMALL_SUN : SMALL_MOON) + '</g>' +
      '<path class="ic-cloud" d="' + CLOUD + '" transform="' + move + '"/>';
  }

  function drops(cls, xs) {
    var out = '<g class="' + cls + '">';
    for (var i = 0; i < xs.length; i++) out += '<line x1="' + xs[i] + '" y1="50" x2="' + (xs[i] - 3) + '" y2="58"/>';
    return out + '</g>';
  }
  function flakes(xs) {
    var out = '<g class="ic-snow">';
    for (var i = 0; i < xs.length; i++) out += '<circle cx="' + xs[i] + '" cy="' + (i % 2 ? 57 : 53) + '" r="2.6"/>';
    return out + '</g>';
  }

  function kind(code) {
    if (code === 0) return 'clear';
    if (code === 1 || code === 2) return 'partly';
    if (code === 3) return 'cloudy';
    if (code === 45 || code === 48) return 'fog';
    if (code >= 51 && code <= 57) return 'drizzle';
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'thunder';
    return 'cloudy';
  }

  function weather(code, isDay) {
    switch (kind(code)) {
      case 'clear': return svg('w-clear', isDay ? SUN : MOON);
      case 'partly': return svg('w-partly', behindCloud(isDay, 6, 4));
      case 'cloudy': return svg('w-cloudy', cloud(2));
      case 'fog': return svg('w-fog', cloud(-6) + '<g class="ic-fog"><line x1="14" y1="48" x2="50" y2="48"/><line x1="18" y1="55" x2="46" y2="55"/></g>');
      case 'drizzle': return svg('w-drizzle', cloud(-6) + drops('ic-drizzle', [26, 38]));
      case 'rain': return svg('w-rain', cloud(-6) + drops('ic-rain', [22, 32, 42]));
      case 'snow': return svg('w-snow', cloud(-6) + flakes([22, 32, 42]));
      default: return svg('w-thunder', cloud(-6) + '<path class="ic-bolt" d="M34 42l-6 9h8l-5 9"/>');
    }
  }

  var GLYPHS = {
    wind: '<g class="ic-wind"><path d="M10 26h28a6 6 0 1 0-6-6"/><path d="M10 36h38a6 6 0 1 1-6 6"/><path d="M10 46h18"/></g>',
    drop: '<g class="ic-drop"><path d="M32 12c8 11 13 18 13 25a13 13 0 0 1-26 0c0-7 5-14 13-25z"/></g>',
    umbrella: '<g class="ic-umbrella"><path d="M10 32a22 22 0 0 1 44 0z"/><path d="M32 32v16a5 5 0 0 1-10 0"/></g>',
    sunrise: '<g class="ic-sun"><path d="M18 44a14 14 0 0 1 28 0"/><line x1="10" y1="50" x2="54" y2="50"/><path d="M32 12v14M25 19l7-7 7 7"/></g>',
    sunset: '<g class="ic-sun"><path d="M18 44a14 14 0 0 1 28 0"/><line x1="10" y1="50" x2="54" y2="50"/><path d="M32 12v14M25 19l7 7 7-7"/></g>',
    // a car seen from the front (traffic), a warning triangle (alerts), a folded newspaper (news)
    car: '<g class="ic-car"><path d="M14 40l5-14a5 5 0 0 1 5-3h16a5 5 0 0 1 5 3l5 14"/><rect x="10" y="38" width="44" height="12" rx="4"/>' +
      '<path d="M16 50v5M48 50v5"/><circle cx="19" cy="44" r="1.6"/><circle cx="45" cy="44" r="1.6"/></g>',
    warning: '<g class="ic-warning"><path d="M32 10l24 42H8z"/><path d="M32 26v12"/><circle cx="32" cy="45" r="1.4"/></g>',
    news: '<g class="ic-news"><rect x="12" y="14" width="34" height="38" rx="4"/><path d="M46 24h6v22a6 6 0 0 1-12 0"/>' +
      '<path d="M19 23h20M19 31h20M19 39h12"/></g>'
  };
  function glyph(name) { return svg('g-' + name, GLYPHS[name] || ''); }

  return { weather: weather, glyph: glyph };
})();
