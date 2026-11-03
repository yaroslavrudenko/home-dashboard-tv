/* The home city (batch 17, C-1): resolved before anything is made (its routes, map, weather place and alert areas
 * written into Config: js/homecity.js), a new choice saved and the app reloaded once, the toast after that reload. ES5. */
var AppCity = (function () {
  var CITY_STORE = 'homedash.city', CITY_TOAST = 'homedash.cityToast';

  // d: { env (AppEnv), toast (ToastView) }.
  function create(d) {
    // The remembered city, else Config.homeCity, else Rehovot; its sections written into Config before anything is made.
    function start() {
      var st = d.env.storage(), saved = null;
      try { saved = st && st.getItem(CITY_STORE); } catch (e) { saved = null; }
      HomeCity.apply(Config, HomeCity.derive(Cities, HomeCity.resolve(Cities, saved, Config.homeCity)));
    }
    // A new city: written and read back (a TV that refuses storage keeps the city: false), then one reload — the same
    // cold start as switching the TV on, so nothing built for the old city survives.
    function choose(id) {
      var st = d.env.storage(), ok = false;
      if (!st) { d.env.log('city not saved: the TV gives no storage'); return false; }   // C-18: the real cause, not a TypeError
      try { st.setItem(CITY_STORE, id); ok = st.getItem(CITY_STORE) === id; } catch (e) { d.env.log('city not saved: ' + e.message); }
      if (!ok) return false;
      try { d.env.sessionStore().setItem(CITY_TOAST, '1'); } catch (e) { d.env.log('city toast not kept: ' + e.message); }   // no toast after the reload
      d.env.reload();
      return true;
    }
    // After a reload for a new city: «Город: Хайфа», once.
    function toast() {
      var ss = d.env.sessionStore(), due = false;
      try { due = !!(ss && ss.getItem(CITY_TOAST)); if (due) ss.removeItem(CITY_TOAST); } catch (e) { due = false; }
      if (due) d.toast.show(I18n.t('city.saved', { name: HomeCity.homeName(Config, I18n.lang()) }));
    }
    return { start: start, choose: choose, toast: toast };
  }
  return { create: create };
})();
