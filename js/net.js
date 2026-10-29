/* One JSON GET with a hard timeout (XMLHttpRequest: Chromium 47 has no fetch). ES5.
 * done(error, json) is called exactly once: error is a short string ('timeout', 'http 503', 'network',
 * 'parse') or null. */
var Net = (function () {
  function getJson(url, timeoutMs, done) {
    var finished = false;
    var xhr = new XMLHttpRequest();
    function finish(err, json) {
      if (finished) return;
      finished = true;
      done(err, json);
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status !== 200) { finish(xhr.status ? 'http ' + xhr.status : 'network'); return; }
      var json;
      try { json = JSON.parse(xhr.responseText); } catch (e) { finish('parse'); return; }
      finish(null, json);
    };
    xhr.ontimeout = function () { finish('timeout'); };
    xhr.onerror = function () { finish('network'); };
    try {
      xhr.open('GET', url, true);
      xhr.timeout = timeoutMs;
      xhr.send();
    } catch (e) { finish('network'); }
    return xhr;
  }
  return { getJson: getJson };
})();
