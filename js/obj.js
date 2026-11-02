/* Plain objects, said once (F-1, EN-6). ES5.
 *   Obj.copyWith(base, extra)   a new object: base's own fields, then extra's own fields over them (neither is changed) */
var Obj = (function () {
  function copyWith(base, extra) {
    var out = {}, k, own = Object.prototype.hasOwnProperty;
    for (k in base) if (own.call(base, k)) out[k] = base[k];
    for (k in extra) if (own.call(extra, k)) out[k] = extra[k];
    return out;
  }
  return { copyWith: copyWith };
})();
