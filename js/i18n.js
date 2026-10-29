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
        'clock.same': 'Как здесь', 'clock.ahead': '+{h} ч', 'clock.behind': '−{h} ч',
        'clock.unknown': 'Пояс неизвестен',
        'w.feels': 'Ощущается как {t}', 'w.high': 'Макс.', 'w.low': 'Мин.',
        'w.wind': 'Ветер', 'w.humidity': 'Влажность', 'w.rain': 'Осадки', 'w.sunrise': 'Восход', 'w.sunset': 'Закат',
        'w.kmh': 'км/ч', 'w.now': 'Сейчас', 'w.today': 'Сегодня', 'w.hourly': 'Почасовой прогноз', 'w.daily': 'Прогноз на 7 дней',
        'w.updated': 'Обновлено в {time}', 'w.stale': 'Не обновляется · данные от {time}', 'w.loading': 'Загружаем погоду…',
        'w.failed': 'Погода временно недоступна', 'w.retry': 'Повторим в {time}', 'w.retrySoon': 'Повторим позже'
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
        'clock.same': 'Same time', 'clock.ahead': '+{h} h', 'clock.behind': '−{h} h',
        'clock.unknown': 'Zone unknown',
        'w.feels': 'Feels like {t}', 'w.high': 'H', 'w.low': 'L',
        'w.wind': 'Wind', 'w.humidity': 'Humidity', 'w.rain': 'Rain', 'w.sunrise': 'Sunrise', 'w.sunset': 'Sunset',
        'w.kmh': 'km/h', 'w.now': 'Now', 'w.today': 'Today', 'w.hourly': 'Hourly forecast', 'w.daily': '7-day forecast',
        'w.updated': 'Updated at {time}', 'w.stale': 'Not updating · data from {time}', 'w.loading': 'Loading the weather…',
        'w.failed': 'Weather is temporarily unavailable', 'w.retry': 'Retrying at {time}', 'w.retrySoon': 'Will retry soon'
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
