/* HTTP over XMLHttpRequest (Chromium 47 has no fetch), always with a hard timeout. ES5.
 *   Net.request(opts, done)  opts: { url, timeoutMs, method ('GET'), body (string), headers ({}), json (bool), expires (bool) }
 *   Net.getJson(url, timeoutMs, done) / Net.getText(url, timeoutMs, done)
 *   Net.getJsonDated(url, timeoutMs, done)  as getJson, and a good answer also passes { dataAt }: when its data were made —
 *                                       the Date header less the Age header (an HTTP cache, the browser's or a CDN's, may
 *                                       answer with older data); NaN when either is missing or unreadable (FIX-BATCH-19 4, P10)
 *   Net.getJsonExpiring(url, timeoutMs, done)  as getJson, and a good answer also passes { expires }: its Expires header
 *                                       ('' when absent) — batch 15: MET Norway's answers are not asked again before it
 *   Net.getImage(url, timeoutMs, done)  an image (the traffic map) with the same hard deadline: done(error, img) once,
 *                                       error 'error' | 'timeout' | 'cancelled'; returns { img, cancel() }. A timeout or
 *                                       cancel removes the handlers and clears src, which stops the download.
 * GETs carry no custom header: a plain GET needs no CORS preflight (the alert feed never answers one).
 * done(error, result) is called exactly once: error is a short string ('timeout', 'http 503', 'network', 'parse')
 * or null; result is the parsed JSON (json: true) or the response text. An HTTP error also passes a third argument,
 * { retryAfter }: the response's Retry-After header as sent ('' when absent), for callers that must honour it;
 *   Net.retryAfterAt(value, now)        that header (delta seconds or an HTTP date) as a moment, or 0 when absent, malformed
 *                                       or already past (batch 23: one parser for the traffic and the markets). */
var Net = (function () {
  function request(opts, done) {
    var finished = false;
    var xhr = new XMLHttpRequest();
    function finish(err, result, meta) {
      if (finished) return;
      finished = true;
      done(err, result, meta);
    }
    xhr.onreadystatechange = function () {
      // Status 0 = no HTTP answer: a timeout, abort or network error fires its own event right after
      // this one, so that event names the cause.
      if (xhr.readyState !== 4 || !xhr.status) return;
      if (xhr.status !== 200) { finish('http ' + xhr.status, undefined, { retryAfter: xhr.getResponseHeader('Retry-After') || '' }); return; }
      if (!opts.json) { finish(null, xhr.responseText); return; }
      var json;
      try { json = JSON.parse(xhr.responseText); } catch (e) { finish('parse'); return; }
      finish(null, json, opts.expires ? { expires: xhr.getResponseHeader('Expires') || '' } : opts.dated ? { dataAt: dataAt(xhr) } : undefined);
    };
    xhr.ontimeout = function () { finish('timeout'); };
    xhr.onerror = xhr.onabort = function () { finish('network'); };
    try {
      xhr.open(opts.method || 'GET', opts.url, true);
      xhr.timeout = opts.timeoutMs;
      var headers = opts.headers || {};
      for (var k in headers) if (headers.hasOwnProperty(k)) xhr.setRequestHeader(k, headers[k]);
      xhr.send(opts.body === undefined ? null : opts.body);
    } catch (e) { finish('network'); }
    return xhr;
  }

  // The time an answer's data were made: Date − Age (both the server's clock); NaN without a Date, or with an Age that is not
  // a number ≥ 0. FIX-19B C7: read from getAllResponseHeaders() once — it lists only what the page may read, so a header the
  // server did not expose is simply absent (getResponseHeader on it made the browser log «Refused to get unsafe header»).
  var DATE_HEADER = /(?:^|\n)date:[ \t]*([^\r\n]*)/i, AGE_HEADER = /(?:^|\n)age:[ \t]*([^\r\n]*)/i;   // built once
  function headerOf(all, re) { var m = re.exec(all); return m ? m[1] : null; }
  function dataAt(xhr) {
    var all = xhr.getAllResponseHeaders ? xhr.getAllResponseHeaders() || '' : '', ageText = headerOf(all, AGE_HEADER);
    var date = Date.parse(headerOf(all, DATE_HEADER) || ''), age = ageText === null ? 0 : Number(ageText);
    return isNaN(date) || !(age >= 0) ? NaN : date - age * 1000;
  }
  var RETRY_SECONDS = /^\s*\d+\s*$/;   // built once
  function retryAfterAt(value, now) {
    var t = RETRY_SECONDS.test(value) ? now + 1000 * +value : value ? Date.parse(value) : NaN;
    return isFinite(t) && t > now ? Math.ceil(t) : 0;
  }
  function getJson(url, timeoutMs, done) { return request({ url: url, timeoutMs: timeoutMs, json: true }, done); }
  function getJsonDated(url, timeoutMs, done) { return request({ url: url, timeoutMs: timeoutMs, json: true, dated: true }, done); }
  function getJsonExpiring(url, timeoutMs, done) { return request({ url: url, timeoutMs: timeoutMs, json: true, expires: true }, done); }
  function getText(url, timeoutMs, done) { return request({ url: url, timeoutMs: timeoutMs }, done); }

  function getImage(url, timeoutMs, done) {
    var img = new Image(), finished = false, timer = null;
    function finish(err) {
      if (finished) return;
      finished = true;
      if (timer !== null) clearTimeout(timer);
      img.onload = img.onerror = null;
      if (err) img.src = '';
      done(err, err ? null : img);
    }
    img.onload = function () { finish(null); };
    img.onerror = function () { finish('error'); };
    timer = setTimeout(function () { finish('timeout'); }, timeoutMs);
    img.src = url;
    return { img: img, cancel: function () { finish('cancelled'); } };
  }

  return { request: request, getJson: getJson, getJsonDated: getJsonDated, getJsonExpiring: getJsonExpiring, getText: getText, getImage: getImage, retryAfterAt: retryAfterAt };
})();
