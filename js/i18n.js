/* Interface strings. One table per language; a missing key falls back to English, then to the key itself.
 * Adding Hebrew or Ukrainian = adding one more table here (Hebrew also sets dir: 'rtl'). ES5. */
var I18n = (function () {
  var WMO_RU = {
    0: 'Ясно', 1: 'Преимущественно ясно', 2: 'Переменная облачность', 3: 'Пасмурно', 45: 'Туман', 48: 'Изморозь',
    51: 'Слабая морось', 53: 'Морось', 55: 'Сильная морось', 56: 'Ледяная морось', 57: 'Ледяная морось',
    61: 'Небольшой дождь', 63: 'Дождь', 65: 'Сильный дождь', 66: 'Ледяной дождь', 67: 'Ледяной дождь',
    71: 'Небольшой снег', 73: 'Снег', 75: 'Сильный снег', 77: 'Снежная крупа',
    80: 'Ливень', 81: 'Ливни', 82: 'Сильный ливень', 85: 'Снегопад', 86: 'Сильный снегопад',
    95: 'Гроза', 96: 'Гроза с градом', 99: 'Гроза с градом'
  };
  var WMO_EN = {
    0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog',
    51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
    80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Heavy snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm, hail', 99: 'Thunderstorm, hail'
  };

  var TABLES = {
    ru: {
      dir: 'ltr',
      weekdays: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
      weekdaysShort: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
      monthsGen: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
      dateLong: '{weekday}, {day} {month}',
      wmo: WMO_RU,
      s: {
        'city.israel': 'Израиль', 'city.ukraine': 'Украина', 'city.sydney': 'Сидней',
        'place.rehovot': 'Реховот', 'place.kyiv': 'Киев', 'place.sydney': 'Сидней',
        'place.haifa': 'Хайфа', 'place.telaviv': 'Тель-Авив', 'place.beersheva': 'Беэр-Шева',
        'r.north': 'Север', 'r.center': 'Центр', 'r.south': 'Юг', 'w.days': 'Прогноз на {n} дней', 'screen.israel': 'Погода в Израиле',
        'clock.same': 'Как здесь', 'clock.ahead': '+{h} ч', 'clock.behind': '−{h} ч',
        'clock.unknown': 'Пояс неизвестен',
        'w.feels': 'Ощущается как {t}', 'w.high': 'Макс.', 'w.low': 'Мин.',
        'w.wind': 'Ветер', 'w.humidity': 'Влажность', 'w.rain': 'Осадки', 'w.sunrise': 'Восход', 'w.sunset': 'Закат',
        'w.kmh': 'км/ч', 'w.now': 'Сейчас', 'w.today': 'Сегодня', 'w.hourly': 'Почасовой прогноз', 'w.daily': 'Прогноз на 7 дней',
        'w.updated': 'Обновлено в {time}', 'w.stale': 'Не обновляется · данные от {time}', 'w.loading': 'Загружаем погоду…',
        'w.failed': 'Погода временно недоступна', 'w.retry': 'Повторим в {time}', 'w.retrySoon': 'Повторим позже',
        'screen.main': 'Главная', 'screen.news': 'Новости', 'screen.traffic': 'Пробки', 'screen.map': 'Карта пробок',
        'm.loading': 'Загружаем карту…', 'm.unavailable': 'Карта недоступна',
        'n.src.ynet': 'Ynet', 'n.src.globes': 'Globes', 'n.col.il': 'Израиль', 'n.col.econ': 'Экономика',
        'n.justNow': 'Только что', 'n.minAgo': '{n} мин назад', 'n.hAgo': '{n} ч назад', 'n.dAgo': '{n} дн. назад',
        'n.loading': 'Загружаем новости…', 'n.failed': 'Новости временно недоступны',
        'n.colFailed': 'Не удалось загрузить', 'n.colFailedRetry': 'Не удалось загрузить · повторим в {time}', 'n.failedRetry': 'Новости временно недоступны · повторим в {time}',
        't.col.cities': 'Города', 't.col.near': 'Рядом',
        't.route.tlv': 'Тель-Авив', 't.route.jlm': 'Иерусалим', 't.route.haifa': 'Хайфа', 't.route.beersheva': 'Беэр-Шева',
        't.route.ashkelon': 'Ашкелон', 't.route.modiin': 'Модиин', 't.route.rishon': 'Ришон-ле-Цион',
        't.route.airport': 'Аэропорт', 't.route.holon': 'Холон', 't.route.glilot': 'Глилот',
        't.min': '{n} мин', 't.hmin': '{h} ч {m} мин', 't.delay': '+{n} мин', 't.km': '{n} км',
        't.level.ok': 'Свободно', 't.level.slow': 'Затруднено', 't.level.jam': 'Пробка', 't.noData': 'Нет данных',
        't.noKey': 'Подключите ключ TomTom, чтобы видеть пробки', 't.noKeySub': 'TOMTOM_KEY в build.local.env, затем пересоберите приложение',
        't.updated': 'Обновлено {time} · {n} мин назад', 't.updating': 'Обновляется…', 't.updatingFrom': 'Обновляется… · данные от {time}',
        't.failed': 'Не удалось обновить пробки', 't.future': 'Данные устарели · время данных требует проверки',
        't.stale': 'Данные устарели · обновлено {time} · {n} мин назад',
        't.cap': 'Дневной лимит запросов пробок исчерпан · обновление после {time}',
        't.refused': 'TomTom отклонил запрос (доступ или лимит) · автоматический повтор не раньше {time}',
        't.storage': 'Обновления пробок приостановлены: не удалось проверить или сохранить счётчик запросов',
        't.dataFrom': '{text} · данные от {time}',
        'a.kind.missiles': 'Ракетный обстрел', 'a.kind.aircraft': 'Вражеский беспилотник', 'a.kind.infiltration': 'Проникновение террористов',
        'a.kind.earthquake': 'Землетрясение', 'a.kind.tsunami': 'Угроза цунами', 'a.kind.hazmat': 'Утечка опасных веществ',
        'a.kind.radiological': 'Радиационная угроза', 'a.kind.prealert': 'Скоро возможна тревога', 'a.generic': 'Тревога',
        'a.since': 'С {time}', 'a.shelter': 'Войдите в защищённое помещение', 'a.shelterFor': 'Войдите в защищённое помещение и оставайтесь там {n} мин',
        'a.nearby': 'Тревога рядом: {areas}', 'a.nearbyMore': '{areas} и ещё {n}', 'a.offline': 'Тревоги: нет связи',
        'a.offlineSince': 'Тревоги: нет связи · данные от {time}'
      }
    },
    en: {
      dir: 'ltr',
      weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      weekdaysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      monthsGen: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      dateLong: '{weekday}, {month} {day}',
      wmo: WMO_EN,
      s: {
        'city.israel': 'Israel', 'city.ukraine': 'Ukraine', 'city.sydney': 'Sydney',
        'place.rehovot': 'Rehovot', 'place.kyiv': 'Kyiv', 'place.sydney': 'Sydney',
        'place.haifa': 'Haifa', 'place.telaviv': 'Tel Aviv', 'place.beersheva': 'Beer Sheva',
        'r.north': 'North', 'r.center': 'Centre', 'r.south': 'South', 'w.days': '{n}-day forecast', 'screen.israel': 'Weather in Israel',
        'clock.same': 'Same time', 'clock.ahead': '+{h} h', 'clock.behind': '−{h} h',
        'clock.unknown': 'Zone unknown',
        'w.feels': 'Feels like {t}', 'w.high': 'H', 'w.low': 'L',
        'w.wind': 'Wind', 'w.humidity': 'Humidity', 'w.rain': 'Rain', 'w.sunrise': 'Sunrise', 'w.sunset': 'Sunset',
        'w.kmh': 'km/h', 'w.now': 'Now', 'w.today': 'Today', 'w.hourly': 'Hourly forecast', 'w.daily': '7-day forecast',
        'w.updated': 'Updated at {time}', 'w.stale': 'Not updating · data from {time}', 'w.loading': 'Loading the weather…',
        'w.failed': 'Weather is temporarily unavailable', 'w.retry': 'Retrying at {time}', 'w.retrySoon': 'Will retry soon',
        'screen.main': 'Home', 'screen.news': 'News', 'screen.traffic': 'Traffic', 'screen.map': 'Traffic map',
        'm.loading': 'Loading the map…', 'm.unavailable': 'The map is unavailable',
        'n.src.ynet': 'Ynet', 'n.src.globes': 'Globes', 'n.col.il': 'Israel', 'n.col.econ': 'Economy',
        'n.justNow': 'Just now', 'n.minAgo': '{n} min ago', 'n.hAgo': '{n} h ago', 'n.dAgo': '{n} d ago',
        'n.loading': 'Loading the news…', 'n.failed': 'News is temporarily unavailable',
        'n.colFailed': 'Could not load', 'n.colFailedRetry': 'Could not load · retrying at {time}', 'n.failedRetry': 'News is temporarily unavailable · retrying at {time}',
        't.col.cities': 'Cities', 't.col.near': 'Nearby',
        't.route.tlv': 'Tel Aviv', 't.route.jlm': 'Jerusalem', 't.route.haifa': 'Haifa', 't.route.beersheva': 'Beer Sheva',
        't.route.ashkelon': 'Ashkelon', 't.route.modiin': 'Modi\'in', 't.route.rishon': 'Rishon LeZion',
        't.route.airport': 'Airport', 't.route.holon': 'Holon', 't.route.glilot': 'Glilot',
        't.min': '{n} min', 't.hmin': '{h} h {m} min', 't.delay': '+{n} min', 't.km': '{n} km',
        't.level.ok': 'Clear', 't.level.slow': 'Slow', 't.level.jam': 'Jammed', 't.noData': 'No data',
        't.noKey': 'Connect a TomTom key to see the traffic', 't.noKeySub': 'TOMTOM_KEY in build.local.env, then rebuild the app',
        't.updated': 'Updated {time} · {n} min ago', 't.updating': 'Updating…', 't.updatingFrom': 'Updating… · data from {time}',
        't.failed': 'Could not update the traffic', 't.future': 'Data is out of date · its time needs checking',
        't.stale': 'Data is out of date · updated {time} · {n} min ago',
        't.cap': 'Today\'s traffic request limit is used up · updating after {time}',
        't.refused': 'TomTom refused the request (access or limit) · automatic retry not before {time}',
        't.storage': 'Traffic updates paused: could not check or save the request counter',
        't.dataFrom': '{text} · data from {time}',
        'a.kind.missiles': 'Rocket and missile fire', 'a.kind.aircraft': 'Hostile aircraft intrusion', 'a.kind.infiltration': 'Terrorist infiltration',
        'a.kind.earthquake': 'Earthquake', 'a.kind.tsunami': 'Tsunami', 'a.kind.hazmat': 'Hazardous materials',
        'a.kind.radiological': 'Radiological event', 'a.kind.prealert': 'Alerts expected shortly', 'a.generic': 'Alert',
        'a.since': 'Since {time}', 'a.shelter': 'Enter the protected space', 'a.shelterFor': 'Enter the protected space and stay {n} min',
        'a.nearby': 'Alert nearby: {areas}', 'a.nearbyMore': '{areas} and {n} more', 'a.offline': 'Alerts: no connection',
        'a.offlineSince': 'Alerts: no connection · data from {time}'
      }
    }
  };

  var lang = 'ru';

  function table() { return TABLES[lang] || TABLES.en; }

  function fill(text, vars) {
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, function (all, k) { return vars.hasOwnProperty(k) ? String(vars[k]) : all; });
  }

  return {
    setLang: function (l) { lang = TABLES[l] ? l : 'en'; },
    lang: function () { return lang; },
    dir: function () { return table().dir; },
    t: function (key, vars) {
      var own = table().s[key];
      var text = own !== undefined ? own : (TABLES.en.s[key] !== undefined ? TABLES.en.s[key] : key);
      return fill(text, vars);
    },
    weekdayShort: function (i) { return table().weekdaysShort[i]; },
    // How long ago, for a headline: "Только что", "12 мин назад", "3 ч назад", "2 дн. назад" (no plural forms needed).
    ago: function (ms) {
      var min = Math.floor(Math.max(ms, 0) / 60000);
      if (min < 1) return this.t('n.justNow');
      if (min < 60) return this.t('n.minAgo', { n: min });
      if (min < 24 * 60) return this.t('n.hAgo', { n: Math.floor(min / 60) });
      return this.t('n.dAgo', { n: Math.floor(min / 1440) });
    },
    dateLong: function (weekdayIndex, day, monthIndex) {
      var tb = table();
      return fill(tb.dateLong, { weekday: tb.weekdays[weekdayIndex], day: day, month: tb.monthsGen[monthIndex] });
    },
    condition: function (code) {
      var w = table().wmo;
      return w[code] !== undefined ? w[code] : (TABLES.en.wmo[code] !== undefined ? TABLES.en.wmo[code] : '');
    },
    languages: function () { var out = []; for (var k in TABLES) if (TABLES.hasOwnProperty(k)) out.push(k); return out; }
  };
})();
