/* The one freshness rule every source's state follows (weather and air, news, the markets, traffic, the traffic map, the
 * recent alerts). ES5.
 *   Freshness.old(updatedAt, now, staleAfterMs)   older than staleAfterMs, or dated in the future (a clock that went back:
 *                                                 an age below zero cannot be trusted as fresh)
 *   Freshness.kind(hasData, doubt, updatedAt, now, staleAfterMs)
 *     no data: 'failed' when in doubt (the last attempt failed), else 'loading';
 *     data:    'stale' when in doubt (the last attempt failed, the data came back from storage, …) or old, else 'fresh' */
var Freshness = (function () {
  function old(updatedAt, now, staleAfterMs) { var age = now - updatedAt; return age < 0 || age > staleAfterMs; }
  function kind(hasData, doubt, updatedAt, now, staleAfterMs) {
    if (!hasData) return doubt ? 'failed' : 'loading';
    return doubt || old(updatedAt, now, staleAfterMs) ? 'stale' : 'fresh';
  }
  return { old: old, kind: kind };
})();
