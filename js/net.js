/* HTTP over XMLHttpRequest (Chromium 47 has no fetch), always with a hard timeout. ES5.
 *   Net.request(opts, done)  opts: { url, timeoutMs, method ('GET'), body (string), headers ({}), json (bool) }
 *   Net.getJson(url, timeoutMs, done) / Net.getText(url, timeoutMs, done)
 * GETs carry no custom header: a plain GET needs no CORS preflight (the alert feed never answers one).
 * done(error, result) is called exactly once: error is a short string ('timeout', 'http 503', 'network', 'parse')
 * or null; result is the parsed JSON (json: true) or the response text. An HTTP error also passes a third argument,
 * { retryAfter }: the response's Retry-After header as sent ('' when absent), for callers that must honour it. */
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
      finish(null, json);
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

  function getJson(url, timeoutMs, done) { return request({ url: url, timeoutMs: timeoutMs, json: true }, done); }
  function getText(url, timeoutMs, done) { return request({ url: url, timeoutMs: timeoutMs }, done); }

  return { request: request, getJson: getJson, getText: getText };
})();
