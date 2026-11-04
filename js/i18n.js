/* Interface strings. One table per language — 'ru', 'he' (right to left), 'uk', and 'en' as the fallback: a missing
 * key falls back to English, then to the key itself. In a right-to-left table a sign or a unit symbol glued to a figure
 * ("+9", "−4°") is kept left to right with LRE … PDF (U+202A … U+202C, understood by Chromium 47), so the bidi
 * algorithm never moves the sign to the other side of the number; plain figures and times read correctly unaided. ES5. */
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

  var WMO_HE = {
    0: 'בהיר', 1: 'בהיר ברובו', 2: 'מעונן חלקית', 3: 'מעונן', 45: 'ערפל', 48: 'ערפל קופא',
    51: 'טפטוף קל', 53: 'טפטוף', 55: 'טפטוף כבד', 56: 'טפטוף קופא', 57: 'טפטוף קופא',
    61: 'גשם קל', 63: 'גשם', 65: 'גשם כבד', 66: 'גשם קופא', 67: 'גשם קופא',
    71: 'שלג קל', 73: 'שלג', 75: 'שלג כבד', 77: 'גרגרי שלג',
    80: 'ממטרים', 81: 'ממטרים', 82: 'ממטרים עזים', 85: 'ממטרי שלג', 86: 'ממטרי שלג עזים',
    95: 'סופת רעמים', 96: 'סופת רעמים וברד', 99: 'סופת רעמים וברד'
  };
  var WMO_UK = {
    0: 'Ясно', 1: 'Переважно ясно', 2: 'Мінлива хмарність', 3: 'Похмуро', 45: 'Туман', 48: 'Паморозь',
    51: 'Слабка мряка', 53: 'Мряка', 55: 'Сильна мряка', 56: 'Крижана мряка', 57: 'Крижана мряка',
    61: 'Невеликий дощ', 63: 'Дощ', 65: 'Сильний дощ', 66: 'Крижаний дощ', 67: 'Крижаний дощ',
    71: 'Невеликий сніг', 73: 'Сніг', 75: 'Сильний сніг', 77: 'Снігова крупа',
    80: 'Злива', 81: 'Зливи', 82: 'Сильна злива', 85: 'Снігопад', 86: 'Сильний снігопад',
    95: 'Гроза', 96: 'Гроза з градом', 99: 'Гроза з градом'
  };
  var LRE = '\u202a', PDF = '\u202c';   // left-to-right embedding … pop: a signed figure inside right-to-left text

  var TABLES = {
    ru: {
      dir: 'ltr',
      weekdays: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
      weekdaysShort: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
      monthsGen: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
      dateLong: '{weekday}, {day} {month}',
      dateShort: '{weekday}, {day} {month}',   // with the short weekday (lists)
      dayMonth: '{day} {month}',              // no weekday («Сегодня, 10 апреля»)
      wmo: WMO_RU,
      num: { decimal: ',', group: '\u202f' },
      s: {
        'lang.name': 'Русский',
        'city.israel': 'Израиль', 'city.ukraine': 'Украина', 'city.sydney': 'Сидней',
        'place.kyiv': 'Киев', 'place.sydney': 'Сидней',
        'place.haifa': 'Хайфа', 'place.telaviv': 'Тель-Авив', 'place.beersheva': 'Беэр-Шева',
        'r.north': 'Север', 'r.center': 'Центр', 'r.south': 'Юг', 'w.days': 'Прогноз на {n} дней', 'screen.israel': 'Погода в Израиле',
        'clock.same': 'Как здесь', 'clock.ahead': '+{h} ч', 'clock.behind': '−{h} ч',
        'clock.unknown': 'Пояс неизвестен',
        'w.feels': 'Ощущается как {t}',
        'w.wind': 'Ветер', 'w.humidity': 'Влажность', 'w.sunrise': 'Восход', 'w.sunset': 'Закат',
        'w.kmh': 'км/ч', 'w.now': 'Сейчас', 'w.today': 'Сегодня', 'w.todayShort': 'Сег.', 'w.hourly': 'Почасовой прогноз',
        'st.fresh': 'Обновлено в {time}', 'st.stale': 'Не обновляется · данные от {time}', 'st.loading': 'Загрузка…', 'st.failed': 'Временно недоступно', 'st.retry': 'Повторим в {time}', 'st.retrySoon': 'Повторим позже', 'st.partStale': 'данные от {time}', 'st.noData': 'нет данных', 't.futureDetail': 'время данных требует проверки', 'src.met': 'MET Norway',
        // batch 12: the air & UV block, the Shabbat & holidays screen; then the names of the data (holidays by Hebcal slug,
        // Hebrew months by Hebcal name, weekly parashot by Hebcal id; a missing one shows the Latin id)
        'screen.shabbat': 'Шабат и праздники',
        'sh.candles': 'Зажигание свечей', 'sh.havdalah': 'Авдала', 'sh.week': 'Шабат · {name}',
        'sh.shabbat': 'Шабат', 'sh.parashaOf': 'Глава {name}', 'sh.greet.shabbat': 'Шабат шалом',
        'sh.greet.yomtov': 'Хаг самеах', 'sh.greet.yomkippur': 'Гмар хатима това', 'sh.today': 'Сегодня',
        'sh.tomorrow': 'Завтра', 'sh.inDays': 'через {n} дн.', 'sh.inHM': 'через {h} ч {m} мин',
        'sh.inM': 'через {m} мин', 'sh.ongoing': 'идёт', 'sh.todayIs': 'Сегодня: {name}',
        'sh.fastTimes': '{name} · начало {begins} · конец {ends}', 'sh.upcoming': 'Праздники и посты', 'sh.hdate': '{day} {month} {year}',
        // the weekly reading on the Shabbat screen
        'sh.read.parasha': 'Недельная глава', 'sh.read.torah': 'Чтение Торы', 'sh.read.haftarah': 'Афтара', 'sh.read.special': 'Особый шабат', 'sh.read.mevarchim': 'Шабат мевархим', 'sh.read.rc': 'Новый месяц', 'sh.read.rcText': 'Рош ходеш {month}', 'sh.read.omer': 'Счёт омера', 'sh.read.omerDay': 'день {n}',
        'sh.special.shabbat-shekalim': 'Шабат Шкалим', 'sh.special.shabbat-zachor': 'Шабат Захор', 'sh.special.shabbat-parah': 'Шабат Пара', 'sh.special.shabbat-hachodesh': 'Шабат а-Ходеш', 'sh.special.shabbat-hagadol': 'Шабат а-Гадоль', 'sh.special.shabbat-chazon': 'Шабат Хазон', 'sh.special.shabbat-nachamu': 'Шабат Нахаму', 'sh.special.shabbat-shuva': 'Шабат Шува', 'sh.special.shabbat-shirah': 'Шабат Шира',
        'sh.book.Genesis': 'Берешит', 'sh.book.Exodus': 'Шмот', 'sh.book.Leviticus': 'Ваикра', 'sh.book.Numbers': 'Бемидбар', 'sh.book.Deuteronomy': 'Дварим', 'sh.book.Joshua': 'Йеошуа', 'sh.book.Judges': 'Шофтим', 'sh.book.I Samuel': 'Шмуэль I', 'sh.book.II Samuel': 'Шмуэль II', 'sh.book.I Kings': 'Мелахим I', 'sh.book.II Kings': 'Мелахим II', 'sh.book.Isaiah': 'Йешаяу', 'sh.book.Jeremiah': 'Ирмеяу', 'sh.book.Ezekiel': 'Йехезкель', 'sh.book.Hosea': 'Ошеа', 'sh.book.Joel': 'Йоэль', 'sh.book.Amos': 'Амос', 'sh.book.Obadiah': 'Овадья', 'sh.book.Jonah': 'Йона', 'sh.book.Micah': 'Миха', 'sh.book.Nahum': 'Нахум', 'sh.book.Habakkuk': 'Хавакук', 'sh.book.Zephaniah': 'Цфанья', 'sh.book.Haggai': 'Хагай', 'sh.book.Zechariah': 'Зхарья', 'sh.book.Malachi': 'Малахи', 'sh.book.Ruth': 'Рут', 'sh.book.Esther': 'Эстер', 'sh.book.Lamentations': 'Эйха', 'sh.book.Ecclesiastes': 'Кохелет', 'sh.book.Song of Songs': 'Шир а-Ширим',
        'w.uv': 'УФ макс.', 'w.air': 'Качество воздуха',
        'w.dustLabel': 'Пыль', 'w.thousand': '{n}к', 'w.airShort': 'Воздух:', 'w.dustUnit': 'мкг/м³', 'w.uv.low': 'низкий', 'w.uv.moderate': 'умеренный',
        'w.uv.high': 'высокий', 'w.uv.veryHigh': 'очень высокий', 'w.uv.extreme': 'экстремальный',
        'w.air.good': 'хорошее', 'w.air.fair': 'приемлемое', 'w.air.moderate': 'умеренное',
        'w.air.poor': 'плохое', 'w.air.veryPoor': 'очень плохое', 'w.air.extreme': 'опасное',
        'w.air.khamsinWord': 'хамсин',
        'w.airShort.good': 'хороший', 'w.airShort.fair': 'приемлемый', 'w.airShort.moderate': 'умеренный',   // masculine: the Israel card's «Воздух:» (G4)
        'w.airShort.poor': 'плохой', 'w.airShort.veryPoor': 'очень плохой', 'w.airShort.extreme': 'опасный',
        'sh.h.rosh-hashana': 'Рош ха-Шана', 'sh.h.yom-kippur': 'Йом Кипур', 'sh.h.sukkot': 'Суккот', 'sh.h.shmini-atzeret': 'Симхат Тора',
        'sh.h.chanukah': 'Ханука', 'sh.h.tu-bishvat': 'Ту би-Шват', 'sh.h.purim': 'Пурим', 'sh.h.shushan-purim': 'Шушан Пурим', 'sh.h.pesach': 'Песах',
        'sh.h.yom-hashoah': 'День Катастрофы', 'sh.h.yom-hazikaron': 'День памяти павших', 'sh.h.yom-haatzmaut': 'День независимости', 'sh.h.lag-baomer': 'Лаг ба-Омер',
        'sh.h.yom-yerushalayim': 'День Иерусалима', 'sh.h.shavuot': 'Шавуот', 'sh.h.tisha-bav': 'Девятое ава', 'sh.h.tzom-gedaliah': 'Пост Гедалии',
        'sh.h.asara-btevet': 'Пост 10 тевета', 'sh.h.taanit-esther': 'Пост Эстер', 'sh.h.tzom-tammuz': 'Пост 17 тамуза',
        'sh.month.Nisan': 'нисана', 'sh.month.Iyyar': 'ияра', 'sh.month.Sivan': 'сивана', 'sh.month.Tamuz': 'тамуза', 'sh.month.Av': 'ава',
        'sh.month.Elul': 'элула', 'sh.month.Tishrei': 'тишрея', 'sh.month.Cheshvan': 'хешвана', 'sh.month.Kislev': 'кислева', 'sh.month.Tevet': 'тевета',
        'sh.month.Sh\'vat': 'швата', 'sh.month.Adar': 'адара', 'sh.month.Adar I': 'адара I', 'sh.month.Adar II': 'адара II',
        'sh.parasha.Nitzavim-Vayeilech': 'Ницавим-Ваелех', 'sh.parasha.Ha’azinu': 'Аазину', 'sh.parasha.Bereshit': 'Берешит', 'sh.parasha.Noach': 'Ноах', 'sh.parasha.Lech-Lecha': 'Лех-Леха',
        'sh.parasha.Vayera': 'Вайера', 'sh.parasha.Chayei Sara': 'Хаей Сара', 'sh.parasha.Toldot': 'Толдот', 'sh.parasha.Vayetzei': 'Ваеце', 'sh.parasha.Vayishlach': 'Ваишлах',
        'sh.parasha.Vayeshev': 'Ваешев', 'sh.parasha.Miketz': 'Микец', 'sh.parasha.Vayigash': 'Ваигаш', 'sh.parasha.Vayechi': 'Ваехи', 'sh.parasha.Shemot': 'Шмот',
        'sh.parasha.Vaera': 'Ваэра', 'sh.parasha.Bo': 'Бо', 'sh.parasha.Beshalach': 'Бешалах', 'sh.parasha.Yitro': 'Итро', 'sh.parasha.Mishpatim': 'Мишпатим',
        'sh.parasha.Terumah': 'Трума', 'sh.parasha.Tetzaveh': 'Тецаве', 'sh.parasha.Ki Tisa': 'Ки Тиса', 'sh.parasha.Vayakhel': 'Ваякгель', 'sh.parasha.Pekudei': 'Пкудей',
        'sh.parasha.Vayikra': 'Ваикра', 'sh.parasha.Tzav': 'Цав', 'sh.parasha.Shmini': 'Шмини', 'sh.parasha.Tazria': 'Тазриа', 'sh.parasha.Metzora': 'Мецора',
        'sh.parasha.Achrei Mot': 'Ахарей Мот', 'sh.parasha.Kedoshim': 'Кдошим', 'sh.parasha.Emor': 'Эмор', 'sh.parasha.Behar': 'Беар', 'sh.parasha.Bechukotai': 'Бехукотай',
        'sh.parasha.Bamidbar': 'Бамидбар', 'sh.parasha.Nasso': 'Насо', 'sh.parasha.Beha’alotcha': 'Беаалотха', 'sh.parasha.Sh’lach': 'Шлах', 'sh.parasha.Korach': 'Корах',
        'sh.parasha.Chukat': 'Хукат', 'sh.parasha.Balak': 'Балак', 'sh.parasha.Pinchas': 'Пинхас', 'sh.parasha.Matot-Masei': 'Матот-Масей', 'sh.parasha.Devarim': 'Дварим',
        'sh.parasha.Vaetchanan': 'Ваэтханан', 'sh.parasha.Eikev': 'Эйкев', 'sh.parasha.Re’eh': 'Рээ', 'sh.parasha.Shoftim': 'Шофтим', 'sh.parasha.Ki Teitzei': 'Ки Теце',
        'sh.parasha.Ki Tavo': 'Ки Таво', 'sh.parasha.Vayakhel-Pekudei': 'Ваякгель-Пкудей', 'sh.parasha.Tazria-Metzora': 'Тазриа-Мецора', 'sh.parasha.Achrei Mot-Kedoshim': 'Ахарей Мот-Кдошим', 'sh.parasha.Behar-Bechukotai': 'Беар-Бехукотай',
        'sh.parasha.Nitzavim': 'Ницавим', 'sh.parasha.Vayeilech': 'Ваелех', 'sh.parasha.Matot': 'Матот', 'sh.parasha.Masei': 'Масей',
        'screen.main': 'Главная', 'screen.news': 'Новости', 'screen.traffic': 'Пробки', 'screen.map': 'Карта пробок',
        'n.col.il': 'Израиль', 'n.col.econ': 'Экономика',
        'n.justNow': 'Только что', 'n.minAgo': '{n} мин назад', 'n.hAgo': '{n} ч назад', 'n.dAgo': '{n} дн. назад',
        't.col.cities': 'Города', 't.col.near': 'Рядом',
        't.min': '{n} мин', 't.hmin': '{h} ч {m} мин', 't.delay': '+{n} мин', 't.km': '{n} км',
        't.level.ok': 'Свободно', 't.level.slow': 'Затруднено', 't.level.jam': 'Пробка',
        't.noKey': 'Подключите токен Mapbox, чтобы видеть пробки', 't.noKeySub': 'MAPBOX_TOKEN в build.local.env, затем пересоберите приложение',
        't.cap': 'Дневной лимит запросов пробок исчерпан · обновление после {time}',
        't.refused': 'Mapbox отклонил запрос (доступ или лимит) · автоматический повтор не раньше {time}',
        't.storage': 'Обновления пробок приостановлены: не удалось проверить или сохранить счётчик запросов',
        'a.kind.missiles': 'Ракетный обстрел', 'a.kind.aircraft': 'Вражеский беспилотник', 'a.kind.infiltration': 'Проникновение террористов',
        'a.kind.earthquake': 'Землетрясение', 'a.kind.tsunami': 'Угроза цунами', 'a.kind.hazmat': 'Утечка опасных веществ',
        'a.kind.radiological': 'Радиационная угроза', 'a.kind.prealert': 'Скоро возможна тревога', 'a.generic': 'Тревога',
        'a.since': 'С {time}', 'a.shelter': 'Войдите в защищённое помещение', 'a.shelterFor': 'Войдите в защищённое помещение и оставайтесь там {n} мин',
        'a.nearby': 'Тревога рядом: {areas}', 'a.nearbyMore': '{areas} и ещё {n}', 'a.offline': 'Тревоги: нет связи',
        'a.offlineSince': 'Тревоги: нет связи · последний ответ {time}',
        'a.preview': 'Проверка тревоги — это не настоящая тревога',
        'city.title': 'Город', 'city.sub': 'Погода, пробки и тревоги — для этого города', 'city.saved': 'Город: {name}',
        'city.hint': '{ud} выбрать · {lr} по буквам · OK — готово · Назад — отмена', 'city.saveFailed': 'Не удалось сохранить город',
        'a.banner': 'Тревога в {place}', 'a.bannerSince': 'Тревога в {place} · с {time}',
        'screen.alerts': 'Тревоги', 'a.home.quiet': 'Тревог нет', 'a.checked': 'Проверено в {time}', 'a.checking': 'Проверяем…',
        'a.near.title': 'Рядом', 'a.near.quiet': 'Рядом тревог нет', 'a.recent': 'Последние тревоги в Израиле', 'a.col.when': 'Время', 'a.col.what': 'Тревога', 'a.col.where': 'Районы', 'a.col.whereHe': 'Районы (на иврите)',
        'a.recent.none': 'За последние {n} дней тревог не было',
        'screen.markets': 'Рынки',
        'markets.closed': 'закрыто', 'markets.partlyClosed': 'частично закрыто',
        'markets.group.fx': 'Валюты', 'markets.group.us': 'Акции США', 'markets.group.il': 'Акции Израиля',
        'markets.group.crypto': 'Криптовалюты', 'markets.group.indices': 'Индексы США', 'markets.group.commodities': 'Сырьё',
        'markets.row.USDILS': '₪ за 1 $', 'markets.row.EURILS': '₪ за 1 €', 'markets.row.UAHperILS': '₴ за 1 ₪', 'markets.row.RUBperILS': '₽ за 1 ₪',
        'markets.row.EURUSD': '$ за 1 €', 'markets.row.UAHperUSD': '₴ за 1 $',
        'markets.row.NVDA': 'NVIDIA', 'markets.row.MSFT': 'Microsoft', 'markets.row.AAPL': 'Apple', 'markets.row.GOOGL': 'Alphabet',
        'markets.row.AMZN': 'Amazon', 'markets.row.INTU': 'Intuit',
        'markets.row.LUMI.TA': 'Леуми', 'markets.row.POLI.TA': 'Апоалим', 'markets.row.ESLT.TA': 'Эльбит', 'markets.row.TEVA.TA': 'Тева',
        'markets.row.MZTF.TA': 'Мизрахи',
        'markets.row.TSEM.TA': 'Tower',
        'markets.row.BTC': 'Биткоин', 'markets.row.ETH': 'Эфириум', 'markets.row.XRP': 'XRP', 'markets.row.BNB': 'BNB', 'markets.row.SOL': 'Солана',
        'markets.row.TRX': 'TRON', 'markets.row.^GSPC': 'S&P 500', 'markets.row.^DJI': 'Dow Jones', 'markets.row.^IXIC': 'Nasdaq', 'markets.row.^NDX': 'Nasdaq 100', 'markets.row.^RUT': 'Russell 2000',
        'markets.row.BZ=F': 'Brent', 'markets.row.NG=F': 'Газ', 'markets.row.GC=F': 'Золото', 'markets.row.SI=F': 'Серебро', 'markets.row.HG=F': 'Медь',
        'markets.row.^VIX': 'VIX', 'markets.row.CL=F': 'WTI',
        'markets.unit.barrel': 'барр.', 'markets.unit.mmbtu': 'MMBtu', 'markets.unit.ounce': 'унц.', 'markets.unit.pound': 'фунт'
      }
    },
    he: {
      dir: 'rtl',
      weekdays: ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת'],
      weekdaysShort: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'],
      weekdaysBand: ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'],   // design C: the dust band's narrow cells
      monthsGen: ['בינואר', 'בפברואר', 'במרץ', 'באפריל', 'במאי', 'ביוני', 'ביולי', 'באוגוסט', 'בספטמבר', 'באוקטובר', 'בנובמבר', 'בדצמבר'],
      dateLong: '{weekday}, {day} {month}',
      dateShort: '{weekday}, {day} {month}',   // with the short weekday (lists)
      dayMonth: '{day} {month}',              // no weekday («Сегодня, 10 апреля»)
      wmo: WMO_HE,
      num: { decimal: '.', group: ',' },
      s: {
        'lang.name': 'עברית',
        'city.israel': 'ישראל', 'city.ukraine': 'אוקראינה', 'city.sydney': 'סידני',
        'place.kyiv': 'קייב', 'place.sydney': 'סידני',
        'place.haifa': 'חיפה', 'place.telaviv': 'תל אביב', 'place.beersheva': 'באר שבע',
        'r.north': 'צפון', 'r.center': 'מרכז', 'r.south': 'דרום', 'w.days': 'תחזית ל־{n} ימים', 'screen.israel': 'מזג האוויר בישראל',
        'clock.same': 'כמו כאן', 'clock.ahead': LRE + '+{h}' + PDF + ' שע׳', 'clock.behind': LRE + '−{h}' + PDF + ' שע׳',
        'clock.unknown': 'אזור הזמן לא ידוע',
        'w.feels': 'מרגיש כמו {t}',
        'w.wind': 'רוח', 'w.humidity': 'לחות', 'w.sunrise': 'זריחה', 'w.sunset': 'שקיעה',
        'w.kmh': 'קמ״ש', 'w.now': 'עכשיו', 'w.today': 'היום', 'w.todayShort': 'היום', 'w.hourly': 'תחזית שעתית',
        'st.fresh': 'עודכן ב־{time}', 'st.stale': 'לא מתעדכן · נתונים מ־{time}', 'st.loading': 'טוען…', 'st.failed': 'לא זמין כרגע', 'st.retry': 'ננסה שוב ב־{time}', 'st.retrySoon': 'ננסה שוב בקרוב', 'st.partStale': 'נתונים מ־{time}', 'st.noData': 'אין נתונים', 't.futureDetail': 'יש לבדוק את זמן הנתונים', 'src.met': 'MET נורווגיה',
        // batch 12: the air & UV block, the Shabbat & holidays screen; then the names of the data (holidays by Hebcal slug,
        // Hebrew months by Hebcal name, weekly parashot by Hebcal id; a missing one shows the Latin id)
        'screen.shabbat': 'שבת וחגים',
        'sh.candles': 'הדלקת נרות', 'sh.havdalah': 'הבדלה', 'sh.week': 'שבת · {name}',
        'sh.shabbat': 'שבת', 'sh.parashaOf': 'פרשת {name}', 'sh.greet.shabbat': 'שבת שלום',
        'sh.greet.yomtov': 'חג שמח', 'sh.greet.yomkippur': 'גמר חתימה טובה', 'sh.today': 'היום',
        'sh.tomorrow': 'מחר', 'sh.inDays': 'בעוד {n} ימים', 'sh.inHM': 'בעוד {h} שע׳ {m} דק׳',
        'sh.inM': 'בעוד {m} דק׳', 'sh.ongoing': 'מתקיים', 'sh.todayIs': 'היום: {name}',
        'sh.fastTimes': '{name} · תחילה {begins} · סיום {ends}', 'sh.upcoming': 'חגים וצומות', 'sh.hdate': '{day} ב{month} {year}',
        // the weekly reading on the Shabbat screen
        'sh.read.parasha': 'פרשת השבוע', 'sh.read.torah': 'קריאה בתורה', 'sh.read.haftarah': 'הפטרה', 'sh.read.special': 'שבת מיוחדת', 'sh.read.mevarchim': 'שבת מברכים', 'sh.read.rc': 'ראש חודש', 'sh.read.rcText': 'ראש חודש {month}', 'sh.read.omer': 'ספירת העומר', 'sh.read.omerDay': 'יום {n}',
        'sh.special.shabbat-shekalim': 'שבת שקלים', 'sh.special.shabbat-zachor': 'שבת זכור', 'sh.special.shabbat-parah': 'שבת פרה', 'sh.special.shabbat-hachodesh': 'שבת החודש', 'sh.special.shabbat-hagadol': 'שבת הגדול', 'sh.special.shabbat-chazon': 'שבת חזון', 'sh.special.shabbat-nachamu': 'שבת נחמו', 'sh.special.shabbat-shuva': 'שבת שובה', 'sh.special.shabbat-shirah': 'שבת שירה',
        'sh.book.Genesis': 'בראשית', 'sh.book.Exodus': 'שמות', 'sh.book.Leviticus': 'ויקרא', 'sh.book.Numbers': 'במדבר', 'sh.book.Deuteronomy': 'דברים', 'sh.book.Joshua': 'יהושע', 'sh.book.Judges': 'שופטים', 'sh.book.I Samuel': 'שמואל א', 'sh.book.II Samuel': 'שמואל ב', 'sh.book.I Kings': 'מלכים א', 'sh.book.II Kings': 'מלכים ב', 'sh.book.Isaiah': 'ישעיהו', 'sh.book.Jeremiah': 'ירמיהו', 'sh.book.Ezekiel': 'יחזקאל', 'sh.book.Hosea': 'הושע', 'sh.book.Joel': 'יואל', 'sh.book.Amos': 'עמוס', 'sh.book.Obadiah': 'עובדיה', 'sh.book.Jonah': 'יונה', 'sh.book.Micah': 'מיכה', 'sh.book.Nahum': 'נחום', 'sh.book.Habakkuk': 'חבקוק', 'sh.book.Zephaniah': 'צפניה', 'sh.book.Haggai': 'חגי', 'sh.book.Zechariah': 'זכריה', 'sh.book.Malachi': 'מלאכי', 'sh.book.Ruth': 'רות', 'sh.book.Esther': 'אסתר', 'sh.book.Lamentations': 'איכה', 'sh.book.Ecclesiastes': 'קהלת', 'sh.book.Song of Songs': 'שיר השירים',
        'w.uv': 'מדד UV מרבי', 'w.air': 'איכות האוויר',
        'w.dustLabel': 'אבק', 'w.thousand': '{n}K', 'w.airShort': 'אוויר:', 'w.dustUnit': 'מק״ג/מ״ק', 'w.uv.low': 'נמוך', 'w.uv.moderate': 'בינוני',
        'w.uv.high': 'גבוה', 'w.uv.veryHigh': 'גבוה מאוד', 'w.uv.extreme': 'קיצוני',
        'w.air.good': 'טובה', 'w.air.fair': 'סבירה', 'w.air.moderate': 'בינונית',
        'w.air.poor': 'ירודה', 'w.air.veryPoor': 'ירודה מאוד', 'w.air.extreme': 'מסוכנת',
        'w.air.khamsinWord': 'חמסין',
        'w.airShort.good': 'טוב', 'w.airShort.fair': 'סביר', 'w.airShort.moderate': 'בינוני',   // masculine: the Israel card's «אוויר:» (G4)
        'w.airShort.poor': 'ירוד', 'w.airShort.veryPoor': 'ירוד מאוד', 'w.airShort.extreme': 'מסוכן',
        'sh.h.rosh-hashana': 'ראש השנה', 'sh.h.yom-kippur': 'יום כיפור', 'sh.h.sukkot': 'סוכות', 'sh.h.shmini-atzeret': 'שמחת תורה',
        'sh.h.chanukah': 'חנוכה', 'sh.h.tu-bishvat': 'ט״ו בשבט', 'sh.h.purim': 'פורים', 'sh.h.shushan-purim': 'שושן פורים', 'sh.h.pesach': 'פסח',
        'sh.h.yom-hashoah': 'יום השואה', 'sh.h.yom-hazikaron': 'יום הזיכרון', 'sh.h.yom-haatzmaut': 'יום העצמאות', 'sh.h.lag-baomer': 'ל״ג בעומר',
        'sh.h.yom-yerushalayim': 'יום ירושלים', 'sh.h.shavuot': 'שבועות', 'sh.h.tisha-bav': 'תשעה באב', 'sh.h.tzom-gedaliah': 'צום גדליה',
        'sh.h.asara-btevet': 'עשרה בטבת', 'sh.h.taanit-esther': 'תענית אסתר', 'sh.h.tzom-tammuz': 'צום י״ז בתמוז',
        'sh.month.Nisan': 'ניסן', 'sh.month.Iyyar': 'אייר', 'sh.month.Sivan': 'סיון', 'sh.month.Tamuz': 'תמוז', 'sh.month.Av': 'אב',
        'sh.month.Elul': 'אלול', 'sh.month.Tishrei': 'תשרי', 'sh.month.Cheshvan': 'חשון', 'sh.month.Kislev': 'כסלו', 'sh.month.Tevet': 'טבת',
        'sh.month.Sh\'vat': 'שבט', 'sh.month.Adar': 'אדר', 'sh.month.Adar I': 'אדר א׳', 'sh.month.Adar II': 'אדר ב׳',
        'sh.parasha.Nitzavim-Vayeilech': 'נצבים־וילך', 'sh.parasha.Ha’azinu': 'האזינו', 'sh.parasha.Bereshit': 'בראשית', 'sh.parasha.Noach': 'נח', 'sh.parasha.Lech-Lecha': 'לך־לך',
        'sh.parasha.Vayera': 'וירא', 'sh.parasha.Chayei Sara': 'חיי שרה', 'sh.parasha.Toldot': 'תולדות', 'sh.parasha.Vayetzei': 'ויצא', 'sh.parasha.Vayishlach': 'וישלח',
        'sh.parasha.Vayeshev': 'וישב', 'sh.parasha.Miketz': 'מקץ', 'sh.parasha.Vayigash': 'ויגש', 'sh.parasha.Vayechi': 'ויחי', 'sh.parasha.Shemot': 'שמות',
        'sh.parasha.Vaera': 'וארא', 'sh.parasha.Bo': 'בא', 'sh.parasha.Beshalach': 'בשלח', 'sh.parasha.Yitro': 'יתרו', 'sh.parasha.Mishpatim': 'משפטים',
        'sh.parasha.Terumah': 'תרומה', 'sh.parasha.Tetzaveh': 'תצוה', 'sh.parasha.Ki Tisa': 'כי תשא', 'sh.parasha.Vayakhel': 'ויקהל', 'sh.parasha.Pekudei': 'פקודי',
        'sh.parasha.Vayikra': 'ויקרא', 'sh.parasha.Tzav': 'צו', 'sh.parasha.Shmini': 'שמיני', 'sh.parasha.Tazria': 'תזריע', 'sh.parasha.Metzora': 'מצרע',
        'sh.parasha.Achrei Mot': 'אחרי מות', 'sh.parasha.Kedoshim': 'קדשים', 'sh.parasha.Emor': 'אמור', 'sh.parasha.Behar': 'בהר', 'sh.parasha.Bechukotai': 'בחקתי',
        'sh.parasha.Bamidbar': 'במדבר', 'sh.parasha.Nasso': 'נשא', 'sh.parasha.Beha’alotcha': 'בהעלתך', 'sh.parasha.Sh’lach': 'שלח־לך', 'sh.parasha.Korach': 'קורח',
        'sh.parasha.Chukat': 'חוקת', 'sh.parasha.Balak': 'בלק', 'sh.parasha.Pinchas': 'פינחס', 'sh.parasha.Matot-Masei': 'מטות־מסעי', 'sh.parasha.Devarim': 'דברים',
        'sh.parasha.Vaetchanan': 'ואתחנן', 'sh.parasha.Eikev': 'עקב', 'sh.parasha.Re’eh': 'ראה', 'sh.parasha.Shoftim': 'שופטים', 'sh.parasha.Ki Teitzei': 'כי־תצא',
        'sh.parasha.Ki Tavo': 'כי־תבוא', 'sh.parasha.Vayakhel-Pekudei': 'ויקהל־פקודי', 'sh.parasha.Tazria-Metzora': 'תזריע־מצרע', 'sh.parasha.Achrei Mot-Kedoshim': 'אחרי מות־קדשים', 'sh.parasha.Behar-Bechukotai': 'בהר־בחקתי',
        'sh.parasha.Nitzavim': 'נצבים', 'sh.parasha.Vayeilech': 'וילך', 'sh.parasha.Matot': 'מטות', 'sh.parasha.Masei': 'מסעי',
        'screen.main': 'ראשי', 'screen.news': 'חדשות', 'screen.traffic': 'תנועה', 'screen.map': 'מפת תנועה',
        'n.col.il': 'ישראל', 'n.col.econ': 'כלכלה',
        'n.justNow': 'עכשיו', 'n.minAgo': 'לפני {n} דק׳', 'n.hAgo': 'לפני {n} שע׳', 'n.dAgo': 'לפני {n} ימים',
        't.col.cities': 'ערים', 't.col.near': 'בסביבה',
        't.min': '{n} דק׳', 't.hmin': '{h} שע׳ {m} דק׳', 't.delay': LRE + '+{n}' + PDF + ' דק׳', 't.km': '{n} ק״מ',
        't.level.ok': 'זורם', 't.level.slow': 'איטי', 't.level.jam': 'פקק',
        't.noKey': 'חברו טוקן Mapbox כדי לראות את מצב התנועה', 't.noKeySub': 'MAPBOX_TOKEN בקובץ build.local.env, ואז בנו את האפליקציה מחדש',
        't.cap': 'מכסת הבקשות היומית לתנועה נוצלה · עדכון אחרי {time}',
        't.refused': 'Mapbox דחה את הבקשה (גישה או מכסה) · ניסיון חוזר אוטומטי לא לפני {time}',
        't.storage': 'עדכוני התנועה הושהו: לא ניתן לבדוק או לשמור את מונה הבקשות',
        'a.kind.missiles': 'ירי רקטות וטילים', 'a.kind.aircraft': 'חדירת כלי טיס עוין', 'a.kind.infiltration': 'חדירת מחבלים',
        'a.kind.earthquake': 'רעידת אדמה', 'a.kind.tsunami': 'צונאמי', 'a.kind.hazmat': 'חומרים מסוכנים',
        'a.kind.radiological': 'אירוע רדיולוגי', 'a.kind.prealert': 'בדקות הקרובות צפויות להתקבל התרעות', 'a.generic': 'התרעה',
        'a.since': 'מ־{time}', 'a.shelter': 'היכנסו למרחב המוגן', 'a.shelterFor': 'היכנסו למרחב המוגן ושהו בו {n} דקות',
        'a.nearby': 'התרעה בסביבה: {areas}', 'a.nearbyMore': '{areas} ועוד {n}', 'a.offline': 'התרעות: אין חיבור',
        'a.offlineSince': 'התרעות: אין חיבור · תשובה אחרונה ב־{time}',
        'a.preview': 'בדיקת התרעה — זו אינה התרעה אמיתית',
        'city.title': 'עיר', 'city.sub': 'מזג אוויר, תנועה והתרעות — לעיר הזו', 'city.saved': 'עיר: {name}',
        'city.hint': '{ud} בחירה · {lr} לפי אות · OK — סיום · חזרה — ביטול', 'city.saveFailed': 'לא ניתן לשמור את העיר',
        'a.banner': 'אזעקה ב{place}', 'a.bannerSince': 'אזעקה ב{place} · מ־{time}',
        'screen.alerts': 'התרעות', 'a.home.quiet': 'אין התרעות', 'a.checked': 'נבדק ב־{time}', 'a.checking': 'בודקים…',
        'a.near.title': 'בסביבה', 'a.near.quiet': 'אין התרעות בסביבה', 'a.recent': 'התרעות אחרונות בישראל', 'a.col.when': 'שעה', 'a.col.what': 'התרעה', 'a.col.where': 'אזורים', 'a.col.whereHe': 'אזורים',
        'a.recent.none': 'לא היו התרעות ב־{n} הימים האחרונים',
        'screen.markets': 'שווקים',
        'markets.closed': 'סגור', 'markets.partlyClosed': 'סגור חלקית',
        'markets.group.fx': 'מטבעות', 'markets.group.us': 'מניות בארה״ב', 'markets.group.il': 'מניות בישראל',
        'markets.group.crypto': 'מטבעות קריפטו', 'markets.group.indices': 'מדדים בארה״ב', 'markets.group.commodities': 'סחורות',
        'markets.row.USDILS': 'שקלים לדולר', 'markets.row.EURILS': 'שקלים לאירו', 'markets.row.UAHperILS': 'הריבנה לשקל', 'markets.row.RUBperILS': 'רובל לשקל',
        'markets.row.EURUSD': 'דולר לאירו', 'markets.row.UAHperUSD': 'הריבנה לדולר',
        'markets.row.NVDA': 'אנבידיה', 'markets.row.MSFT': 'מיקרוסופט', 'markets.row.AAPL': 'אפל', 'markets.row.GOOGL': 'אלפבית',
        'markets.row.AMZN': 'אמזון', 'markets.row.INTU': 'אינטואיט',
        'markets.row.LUMI.TA': 'לאומי', 'markets.row.POLI.TA': 'הפועלים', 'markets.row.ESLT.TA': 'אלביט', 'markets.row.TEVA.TA': 'טבע',
        'markets.row.MZTF.TA': 'מזרחי טפחות',
        'markets.row.TSEM.TA': 'טאואר',
        'markets.row.BTC': 'ביטקוין', 'markets.row.ETH': 'את׳ריום', 'markets.row.XRP': 'ריפל', 'markets.row.BNB': 'בינאנס', 'markets.row.SOL': 'סולנה',
        'markets.row.TRX': 'טרון', 'markets.row.^GSPC': 'S&P 500', 'markets.row.^DJI': 'דאו ג׳ונס', 'markets.row.^IXIC': 'נאסד״ק', 'markets.row.^NDX': 'נאסד״ק 100', 'markets.row.^RUT': 'ראסל 2000',
        'markets.row.BZ=F': 'ברנט', 'markets.row.NG=F': 'גז', 'markets.row.GC=F': 'זהב', 'markets.row.SI=F': 'כסף', 'markets.row.HG=F': 'נחושת',
        'markets.row.^VIX': 'VIX', 'markets.row.CL=F': 'WTI',
        'markets.unit.barrel': 'חבית', 'markets.unit.mmbtu': 'מיליון BTU', 'markets.unit.ounce': 'אונקיה', 'markets.unit.pound': 'ליברה'
      }
    },
    uk: {
      dir: 'ltr',
      weekdays: ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П’ятниця', 'Субота'],
      weekdaysShort: ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
      monthsGen: ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'],
      dateLong: '{weekday}, {day} {month}',
      dateShort: '{weekday}, {day} {month}',   // with the short weekday (lists)
      dayMonth: '{day} {month}',              // no weekday («Сегодня, 10 апреля»)
      wmo: WMO_UK,
      num: { decimal: ',', group: '\u202f' },
      s: {
        'lang.name': 'Українська',
        'city.israel': 'Ізраїль', 'city.ukraine': 'Україна', 'city.sydney': 'Сідней',
        'place.kyiv': 'Київ', 'place.sydney': 'Сідней',
        'place.haifa': 'Хайфа', 'place.telaviv': 'Тель-Авів', 'place.beersheva': 'Беер-Шева',
        'r.north': 'Північ', 'r.center': 'Центр', 'r.south': 'Південь', 'w.days': 'Прогноз на {n} днів', 'screen.israel': 'Погода в Ізраїлі',
        'clock.same': 'Як тут', 'clock.ahead': '+{h} год', 'clock.behind': '−{h} год',
        'clock.unknown': 'Пояс невідомий',
        'w.feels': 'Відчувається як {t}',
        'w.wind': 'Вітер', 'w.humidity': 'Вологість', 'w.sunrise': 'Схід', 'w.sunset': 'Захід',
        'w.kmh': 'км/год', 'w.now': 'Зараз', 'w.today': 'Сьогодні', 'w.todayShort': 'Сьог.', 'w.hourly': 'Погодинний прогноз',
        'st.fresh': 'Оновлено о {time}', 'st.stale': 'Не оновлюється · дані від {time}', 'st.loading': 'Завантаження…', 'st.failed': 'Тимчасово недоступно', 'st.retry': 'Повторимо о {time}', 'st.retrySoon': 'Повторимо пізніше', 'st.partStale': 'дані від {time}', 'st.noData': 'немає даних', 't.futureDetail': 'час даних потребує перевірки', 'src.met': 'MET Norway',
        // batch 12: the air & UV block, the Shabbat & holidays screen; then the names of the data (holidays by Hebcal slug,
        // Hebrew months by Hebcal name, weekly parashot by Hebcal id; a missing one shows the Latin id)
        'screen.shabbat': 'Шабат і свята',
        'sh.candles': 'Засвічування свічок', 'sh.havdalah': 'Авдала', 'sh.week': 'Шабат · {name}',
        'sh.shabbat': 'Шабат', 'sh.parashaOf': 'Розділ {name}', 'sh.greet.shabbat': 'Шабат шалом',
        'sh.greet.yomtov': 'Хаг самеах', 'sh.greet.yomkippur': 'Гмар хатіма това', 'sh.today': 'Сьогодні',
        'sh.tomorrow': 'Завтра', 'sh.inDays': 'за {n} дн.', 'sh.inHM': 'за {h} год {m} хв',
        'sh.inM': 'за {m} хв', 'sh.ongoing': 'триває', 'sh.todayIs': 'Сьогодні: {name}',
        'sh.fastTimes': '{name} · початок {begins} · кінець {ends}', 'sh.upcoming': 'Свята та пости', 'sh.hdate': '{day} {month} {year}',
        // the weekly reading on the Shabbat screen
        'sh.read.parasha': 'Тижнева глава', 'sh.read.torah': 'Читання Тори', 'sh.read.haftarah': 'Гафтара', 'sh.read.special': 'Особливий шабат', 'sh.read.mevarchim': 'Шабат мевархім', 'sh.read.rc': 'Новий місяць', 'sh.read.rcText': 'Рош ходеш {month}', 'sh.read.omer': 'Лік омеру', 'sh.read.omerDay': 'день {n}',
        'sh.special.shabbat-shekalim': 'Шабат Шкалім', 'sh.special.shabbat-zachor': 'Шабат Захор', 'sh.special.shabbat-parah': 'Шабат Пара', 'sh.special.shabbat-hachodesh': 'Шабат га-Ходеш', 'sh.special.shabbat-hagadol': 'Шабат га-Гадоль', 'sh.special.shabbat-chazon': 'Шабат Хазон', 'sh.special.shabbat-nachamu': 'Шабат Нахаму', 'sh.special.shabbat-shuva': 'Шабат Шува', 'sh.special.shabbat-shirah': 'Шабат Шира',
        'sh.book.Genesis': 'Берешит', 'sh.book.Exodus': 'Шмот', 'sh.book.Leviticus': 'Ваїкра', 'sh.book.Numbers': 'Бемідбар', 'sh.book.Deuteronomy': 'Дварім', 'sh.book.Joshua': 'Єгошуа', 'sh.book.Judges': 'Шофтім', 'sh.book.I Samuel': 'Шмуель I', 'sh.book.II Samuel': 'Шмуель II', 'sh.book.I Kings': 'Мелахім I', 'sh.book.II Kings': 'Мелахім II', 'sh.book.Isaiah': 'Єшаягу', 'sh.book.Jeremiah': 'Ірмеягу', 'sh.book.Ezekiel': 'Єхезкель', 'sh.book.Hosea': 'Гошеа', 'sh.book.Joel': 'Йоель', 'sh.book.Amos': 'Амос', 'sh.book.Obadiah': 'Овадья', 'sh.book.Jonah': 'Йона', 'sh.book.Micah': 'Міха', 'sh.book.Nahum': 'Нахум', 'sh.book.Habakkuk': 'Хавакук', 'sh.book.Zephaniah': 'Цфанья', 'sh.book.Haggai': 'Хагай', 'sh.book.Zechariah': 'Зхарья', 'sh.book.Malachi': 'Малахі', 'sh.book.Ruth': 'Рут', 'sh.book.Esther': 'Естер', 'sh.book.Lamentations': 'Ейха', 'sh.book.Ecclesiastes': 'Когелет', 'sh.book.Song of Songs': 'Шір га-Шірім',
        'w.uv': 'УФ макс.', 'w.air': 'Якість повітря',
        'w.dustLabel': 'Пил', 'w.thousand': '{n}к', 'w.airShort': 'Повітря:', 'w.dustUnit': 'мкг/м³', 'w.uv.low': 'низький', 'w.uv.moderate': 'помірний',
        'w.uv.high': 'високий', 'w.uv.veryHigh': 'дуже високий', 'w.uv.extreme': 'екстремальний',
        'w.air.good': 'добра', 'w.air.fair': 'прийнятна', 'w.air.moderate': 'помірна',   // feminine: «Якість повітря» (G4)
        'w.air.poor': 'погана', 'w.air.veryPoor': 'дуже погана', 'w.air.extreme': 'небезпечна',
        'w.air.khamsinWord': 'хамсин',
        'w.airShort.good': 'добре', 'w.airShort.fair': 'прийнятне', 'w.airShort.moderate': 'помірне',   // neuter: the Israel card's «Повітря:»
        'w.airShort.poor': 'погане', 'w.airShort.veryPoor': 'дуже погане', 'w.airShort.extreme': 'небезпечне',
        'sh.h.rosh-hashana': 'Рош га-Шана', 'sh.h.yom-kippur': 'Йом Кіпур', 'sh.h.sukkot': 'Суккот', 'sh.h.shmini-atzeret': 'Сімхат Тора',
        'sh.h.chanukah': 'Ханука', 'sh.h.tu-bishvat': 'Ту бі-Шват', 'sh.h.purim': 'Пурім', 'sh.h.shushan-purim': 'Шушан Пурім', 'sh.h.pesach': 'Песах',
        'sh.h.yom-hashoah': 'День Катастрофи', 'sh.h.yom-hazikaron': 'День пам’яті полеглих', 'sh.h.yom-haatzmaut': 'День незалежності', 'sh.h.lag-baomer': 'Лаг ба-Омер',
        'sh.h.yom-yerushalayim': 'День Єрусалима', 'sh.h.shavuot': 'Шавуот', 'sh.h.tisha-bav': 'Дев’яте ава', 'sh.h.tzom-gedaliah': 'Піст Гедалії',
        'sh.h.asara-btevet': 'Піст 10 тевета', 'sh.h.taanit-esther': 'Піст Естер', 'sh.h.tzom-tammuz': 'Піст 17 тамуза',
        'sh.month.Nisan': 'нісана', 'sh.month.Iyyar': 'іяра', 'sh.month.Sivan': 'сівана', 'sh.month.Tamuz': 'тамуза', 'sh.month.Av': 'ава',
        'sh.month.Elul': 'елула', 'sh.month.Tishrei': 'тішрея', 'sh.month.Cheshvan': 'хешвана', 'sh.month.Kislev': 'кіслева', 'sh.month.Tevet': 'тевета',
        'sh.month.Sh\'vat': 'швата', 'sh.month.Adar': 'адара', 'sh.month.Adar I': 'адара I', 'sh.month.Adar II': 'адара II',
        'sh.parasha.Nitzavim-Vayeilech': 'Ніцавім-Ваєлех', 'sh.parasha.Ha’azinu': 'Аазіну', 'sh.parasha.Bereshit': 'Берешіт', 'sh.parasha.Noach': 'Ноах', 'sh.parasha.Lech-Lecha': 'Лех-Леха',
        'sh.parasha.Vayera': 'Ваєра', 'sh.parasha.Chayei Sara': 'Хаей Сара', 'sh.parasha.Toldot': 'Толдот', 'sh.parasha.Vayetzei': 'Ваєце', 'sh.parasha.Vayishlach': 'Ваїшлах',
        'sh.parasha.Vayeshev': 'Ваєшев', 'sh.parasha.Miketz': 'Мікец', 'sh.parasha.Vayigash': 'Ваїгаш', 'sh.parasha.Vayechi': 'Ваєхі', 'sh.parasha.Shemot': 'Шмот',
        'sh.parasha.Vaera': 'Ваера', 'sh.parasha.Bo': 'Бо', 'sh.parasha.Beshalach': 'Бешалах', 'sh.parasha.Yitro': 'Їтро', 'sh.parasha.Mishpatim': 'Мішпатім',
        'sh.parasha.Terumah': 'Трума', 'sh.parasha.Tetzaveh': 'Тецаве', 'sh.parasha.Ki Tisa': 'Кі Тіса', 'sh.parasha.Vayakhel': 'Ваякгель', 'sh.parasha.Pekudei': 'Пкудей',
        'sh.parasha.Vayikra': 'Ваїкра', 'sh.parasha.Tzav': 'Цав', 'sh.parasha.Shmini': 'Шміні', 'sh.parasha.Tazria': 'Тазріа', 'sh.parasha.Metzora': 'Мецора',
        'sh.parasha.Achrei Mot': 'Ахарей Мот', 'sh.parasha.Kedoshim': 'Кдошім', 'sh.parasha.Emor': 'Емор', 'sh.parasha.Behar': 'Беар', 'sh.parasha.Bechukotai': 'Бехукотай',
        'sh.parasha.Bamidbar': 'Бамідбар', 'sh.parasha.Nasso': 'Насо', 'sh.parasha.Beha’alotcha': 'Бегаалотха', 'sh.parasha.Sh’lach': 'Шлах', 'sh.parasha.Korach': 'Корах',
        'sh.parasha.Chukat': 'Хукат', 'sh.parasha.Balak': 'Балак', 'sh.parasha.Pinchas': 'Пінхас', 'sh.parasha.Matot-Masei': 'Матот-Масей', 'sh.parasha.Devarim': 'Дварім',
        'sh.parasha.Vaetchanan': 'Ваетханан', 'sh.parasha.Eikev': 'Ейкев', 'sh.parasha.Re’eh': 'Рее', 'sh.parasha.Shoftim': 'Шофтім', 'sh.parasha.Ki Teitzei': 'Кі Теце',
        'sh.parasha.Ki Tavo': 'Кі Таво', 'sh.parasha.Vayakhel-Pekudei': 'Ваякгель-Пкудей', 'sh.parasha.Tazria-Metzora': 'Тазріа-Мецора', 'sh.parasha.Achrei Mot-Kedoshim': 'Ахарей Мот-Кдошім', 'sh.parasha.Behar-Bechukotai': 'Беар-Бехукотай',
        'sh.parasha.Nitzavim': 'Ніцавім', 'sh.parasha.Vayeilech': 'Ваєлех', 'sh.parasha.Matot': 'Матот', 'sh.parasha.Masei': 'Масей',
        'screen.main': 'Головна', 'screen.news': 'Новини', 'screen.traffic': 'Затори', 'screen.map': 'Карта заторів',
        'n.col.il': 'Україна', 'n.col.econ': 'Економіка',
        'n.justNow': 'Щойно', 'n.minAgo': '{n} хв тому', 'n.hAgo': '{n} год тому', 'n.dAgo': '{n} дн. тому',
        't.col.cities': 'Міста', 't.col.near': 'Поруч',
        't.min': '{n} хв', 't.hmin': '{h} год {m} хв', 't.delay': '+{n} хв', 't.km': '{n} км',
        't.level.ok': 'Вільно', 't.level.slow': 'Ускладнено', 't.level.jam': 'Затор',
        't.noKey': 'Підключіть токен Mapbox, щоб бачити затори', 't.noKeySub': 'MAPBOX_TOKEN у build.local.env, потім перезберіть застосунок',
        't.cap': 'Денний ліміт запитів заторів вичерпано · оновлення після {time}',
        't.refused': 'Mapbox відхилив запит (доступ або ліміт) · автоматичний повтор не раніше {time}',
        't.storage': 'Оновлення заторів призупинено: не вдалося перевірити або зберегти лічильник запитів',
        'a.kind.missiles': 'Ракетний обстріл', 'a.kind.aircraft': 'Ворожий безпілотник', 'a.kind.infiltration': 'Проникнення терористів',
        'a.kind.earthquake': 'Землетрус', 'a.kind.tsunami': 'Загроза цунамі', 'a.kind.hazmat': 'Витік небезпечних речовин',
        'a.kind.radiological': 'Радіаційна загроза', 'a.kind.prealert': 'Незабаром можлива тривога', 'a.generic': 'Тривога',
        'a.since': 'Від {time}', 'a.shelter': 'Увійдіть до захищеного приміщення', 'a.shelterFor': 'Увійдіть до захищеного приміщення й залишайтеся там {n} хв',
        'a.nearby': 'Тривога поруч: {areas}', 'a.nearbyMore': '{areas} та ще {n}', 'a.offline': 'Тривоги: немає зв’язку',
        'a.offlineSince': 'Тривоги: немає зв’язку · остання відповідь {time}',
        'a.preview': 'Перевірка тривоги — це не справжня тривога',
        'city.title': 'Місто', 'city.sub': 'Погода, затори й тривоги — для цього міста', 'city.saved': 'Місто: {name}',
        'city.hint': '{ud} вибрати · {lr} за літерами · OK — готово · Назад — скасувати', 'city.saveFailed': 'Не вдалося зберегти місто',
        'a.banner': 'Тривога в {place}', 'a.bannerSince': 'Тривога в {place} · від {time}',
        'screen.alerts': 'Тривоги', 'a.home.quiet': 'Тривог немає', 'a.checked': 'Перевірено о {time}', 'a.checking': 'Перевіряємо…',
        'a.near.title': 'Поруч', 'a.near.quiet': 'Поруч тривог немає', 'a.recent': 'Останні тривоги в Ізраїлі', 'a.col.when': 'Час', 'a.col.what': 'Тривога', 'a.col.where': 'Райони', 'a.col.whereHe': 'Райони (івритом)',
        'a.recent.none': 'За останні {n} днів тривог не було',
        'screen.markets': 'Ринки',
        'markets.closed': 'закрито', 'markets.partlyClosed': 'частково закрито',
        'markets.group.fx': 'Валюти', 'markets.group.us': 'Акції США', 'markets.group.il': 'Акції Ізраїлю',
        'markets.group.crypto': 'Криптовалюти', 'markets.group.indices': 'Індекси США', 'markets.group.commodities': 'Сировина',
        'markets.row.USDILS': '₪ за 1 $', 'markets.row.EURILS': '₪ за 1 €', 'markets.row.UAHperILS': '₴ за 1 ₪', 'markets.row.RUBperILS': '₽ за 1 ₪',
        'markets.row.EURUSD': '$ за 1 €', 'markets.row.UAHperUSD': '₴ за 1 $',
        'markets.row.NVDA': 'NVIDIA', 'markets.row.MSFT': 'Microsoft', 'markets.row.AAPL': 'Apple', 'markets.row.GOOGL': 'Alphabet',
        'markets.row.AMZN': 'Amazon', 'markets.row.INTU': 'Intuit',
        'markets.row.LUMI.TA': 'Леумі', 'markets.row.POLI.TA': 'Апоалім', 'markets.row.ESLT.TA': 'Ельбіт', 'markets.row.TEVA.TA': 'Тева',
        'markets.row.MZTF.TA': 'Мізрахі',
        'markets.row.TSEM.TA': 'Tower',
        'markets.row.BTC': 'Біткоїн', 'markets.row.ETH': 'Ефіріум', 'markets.row.XRP': 'XRP', 'markets.row.BNB': 'BNB', 'markets.row.SOL': 'Солана',
        'markets.row.TRX': 'TRON', 'markets.row.^GSPC': 'S&P 500', 'markets.row.^DJI': 'Dow Jones', 'markets.row.^IXIC': 'Nasdaq', 'markets.row.^NDX': 'Nasdaq 100', 'markets.row.^RUT': 'Russell 2000',
        'markets.row.BZ=F': 'Brent', 'markets.row.NG=F': 'Газ', 'markets.row.GC=F': 'Золото', 'markets.row.SI=F': 'Срібло', 'markets.row.HG=F': 'Мідь',
        'markets.row.^VIX': 'VIX', 'markets.row.CL=F': 'WTI',
        'markets.unit.barrel': 'бар.', 'markets.unit.mmbtu': 'MMBtu', 'markets.unit.ounce': 'унц.', 'markets.unit.pound': 'фунт'
      }
    },
    en: {
      dir: 'ltr',
      weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      weekdaysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      monthsGen: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      dateLong: '{weekday}, {month} {day}',
      dateShort: '{weekday}, {month} {day}',   // with the short weekday (lists)
      dayMonth: '{month} {day}',              // no weekday («Сегодня, 10 апреля»)
      wmo: WMO_EN,
      num: { decimal: '.', group: ',' },
      s: {
        'lang.name': 'English',
        'city.israel': 'Israel', 'city.ukraine': 'Ukraine', 'city.sydney': 'Sydney',
        'place.kyiv': 'Kyiv', 'place.sydney': 'Sydney',
        'place.haifa': 'Haifa', 'place.telaviv': 'Tel Aviv', 'place.beersheva': 'Beer Sheva',
        'r.north': 'North', 'r.center': 'Centre', 'r.south': 'South', 'w.days': '{n}-day forecast', 'screen.israel': 'Weather in Israel',
        'clock.same': 'Same time', 'clock.ahead': '+{h} h', 'clock.behind': '−{h} h',
        'clock.unknown': 'Zone unknown',
        'w.feels': 'Feels like {t}',
        'w.wind': 'Wind', 'w.humidity': 'Humidity', 'w.sunrise': 'Sunrise', 'w.sunset': 'Sunset',
        'w.kmh': 'km/h', 'w.now': 'Now', 'w.today': 'Today', 'w.todayShort': 'Today', 'w.hourly': 'Hourly forecast',
        'st.fresh': 'Updated at {time}', 'st.stale': 'Not updating · data from {time}', 'st.loading': 'Loading…', 'st.failed': 'Temporarily unavailable', 'st.retry': 'Retrying at {time}', 'st.retrySoon': 'Will retry soon', 'st.partStale': 'data from {time}', 'st.noData': 'no data', 't.futureDetail': 'its time needs checking', 'src.met': 'MET Norway',
        // batch 12: the air & UV block, the Shabbat & holidays screen; then the names of the data (holidays by Hebcal slug,
        // Hebrew months by Hebcal name, weekly parashot by Hebcal id; a missing one shows the Latin id)
        'screen.shabbat': 'Shabbat & holidays',
        'sh.candles': 'Candle lighting', 'sh.havdalah': 'Havdalah', 'sh.week': 'Shabbat · {name}',
        'sh.shabbat': 'Shabbat', 'sh.parashaOf': 'Parashat {name}', 'sh.greet.shabbat': 'Shabbat shalom',
        'sh.greet.yomtov': 'Chag sameach', 'sh.greet.yomkippur': 'Gmar chatima tova', 'sh.today': 'Today',
        'sh.tomorrow': 'Tomorrow', 'sh.inDays': 'in {n} days', 'sh.inHM': 'in {h} h {m} min',
        'sh.inM': 'in {m} min', 'sh.ongoing': 'now', 'sh.todayIs': 'Today: {name}',
        'sh.fastTimes': '{name} · begins {begins} · ends {ends}', 'sh.upcoming': 'Holidays and fasts', 'sh.hdate': '{day} {month} {year}',
        // the weekly reading on the Shabbat screen
        'sh.read.parasha': 'Weekly portion', 'sh.read.torah': 'Torah reading', 'sh.read.haftarah': 'Haftarah', 'sh.read.special': 'Special Shabbat', 'sh.read.mevarchim': 'Shabbat Mevarchim', 'sh.read.rc': 'New month', 'sh.read.rcText': 'Rosh Chodesh {month}', 'sh.read.omer': 'Omer count', 'sh.read.omerDay': 'day {n}',
        'sh.special.shabbat-shekalim': 'Shabbat Shekalim', 'sh.special.shabbat-zachor': 'Shabbat Zachor', 'sh.special.shabbat-parah': 'Shabbat Parah', 'sh.special.shabbat-hachodesh': 'Shabbat HaChodesh', 'sh.special.shabbat-hagadol': 'Shabbat HaGadol', 'sh.special.shabbat-chazon': 'Shabbat Chazon', 'sh.special.shabbat-nachamu': 'Shabbat Nachamu', 'sh.special.shabbat-shuva': 'Shabbat Shuva', 'sh.special.shabbat-shirah': 'Shabbat Shirah',
        'sh.book.Genesis': 'Genesis', 'sh.book.Exodus': 'Exodus', 'sh.book.Leviticus': 'Leviticus', 'sh.book.Numbers': 'Numbers', 'sh.book.Deuteronomy': 'Deuteronomy', 'sh.book.Joshua': 'Joshua', 'sh.book.Judges': 'Judges', 'sh.book.I Samuel': 'I Samuel', 'sh.book.II Samuel': 'II Samuel', 'sh.book.I Kings': 'I Kings', 'sh.book.II Kings': 'II Kings', 'sh.book.Isaiah': 'Isaiah', 'sh.book.Jeremiah': 'Jeremiah', 'sh.book.Ezekiel': 'Ezekiel', 'sh.book.Hosea': 'Hosea', 'sh.book.Joel': 'Joel', 'sh.book.Amos': 'Amos', 'sh.book.Obadiah': 'Obadiah', 'sh.book.Jonah': 'Jonah', 'sh.book.Micah': 'Micah', 'sh.book.Nahum': 'Nahum', 'sh.book.Habakkuk': 'Habakkuk', 'sh.book.Zephaniah': 'Zephaniah', 'sh.book.Haggai': 'Haggai', 'sh.book.Zechariah': 'Zechariah', 'sh.book.Malachi': 'Malachi', 'sh.book.Ruth': 'Ruth', 'sh.book.Esther': 'Esther', 'sh.book.Lamentations': 'Lamentations', 'sh.book.Ecclesiastes': 'Ecclesiastes', 'sh.book.Song of Songs': 'Song of Songs',
        'w.uv': 'UV max', 'w.air': 'Air quality',
        'w.dustLabel': 'Dust', 'w.thousand': '{n}k', 'w.airShort': 'Air:', 'w.dustUnit': 'µg/m³', 'w.uv.low': 'low', 'w.uv.moderate': 'moderate',
        'w.uv.high': 'high', 'w.uv.veryHigh': 'very high', 'w.uv.extreme': 'extreme',
        'w.air.good': 'good', 'w.air.fair': 'fair', 'w.air.moderate': 'moderate',
        'w.air.poor': 'poor', 'w.air.veryPoor': 'very poor', 'w.air.extreme': 'extremely poor',
        'w.air.khamsinWord': 'khamsin',
        'w.airShort.good': 'good', 'w.airShort.fair': 'fair', 'w.airShort.moderate': 'moderate',   // the Israel card's «Air:» — English has one form
        'w.airShort.poor': 'poor', 'w.airShort.veryPoor': 'very poor', 'w.airShort.extreme': 'extremely poor',
        'sh.h.rosh-hashana': 'Rosh Hashana', 'sh.h.yom-kippur': 'Yom Kippur', 'sh.h.sukkot': 'Sukkot', 'sh.h.shmini-atzeret': 'Simchat Torah',
        'sh.h.chanukah': 'Chanukah', 'sh.h.tu-bishvat': 'Tu BiShvat', 'sh.h.purim': 'Purim', 'sh.h.shushan-purim': 'Shushan Purim', 'sh.h.pesach': 'Pesach',
        'sh.h.yom-hashoah': 'Holocaust Remembrance Day', 'sh.h.yom-hazikaron': 'Memorial Day', 'sh.h.yom-haatzmaut': 'Independence Day', 'sh.h.lag-baomer': 'Lag BaOmer',
        'sh.h.yom-yerushalayim': 'Jerusalem Day', 'sh.h.shavuot': 'Shavuot', 'sh.h.tisha-bav': 'Tisha B’Av', 'sh.h.tzom-gedaliah': 'Fast of Gedaliah',
        'sh.h.asara-btevet': 'Tenth of Tevet', 'sh.h.taanit-esther': 'Fast of Esther', 'sh.h.tzom-tammuz': 'Seventeenth of Tammuz',
        'sh.month.Nisan': 'Nisan', 'sh.month.Iyyar': 'Iyyar', 'sh.month.Sivan': 'Sivan', 'sh.month.Tamuz': 'Tamuz', 'sh.month.Av': 'Av',
        'sh.month.Elul': 'Elul', 'sh.month.Tishrei': 'Tishrei', 'sh.month.Cheshvan': 'Cheshvan', 'sh.month.Kislev': 'Kislev', 'sh.month.Tevet': 'Tevet',
        'sh.month.Sh\'vat': 'Sh\'vat', 'sh.month.Adar': 'Adar', 'sh.month.Adar I': 'Adar I', 'sh.month.Adar II': 'Adar II',
        'sh.parasha.Nitzavim-Vayeilech': 'Nitzavim-Vayeilech', 'sh.parasha.Ha’azinu': 'Ha’azinu', 'sh.parasha.Bereshit': 'Bereshit', 'sh.parasha.Noach': 'Noach', 'sh.parasha.Lech-Lecha': 'Lech-Lecha',
        'sh.parasha.Vayera': 'Vayera', 'sh.parasha.Chayei Sara': 'Chayei Sara', 'sh.parasha.Toldot': 'Toldot', 'sh.parasha.Vayetzei': 'Vayetzei', 'sh.parasha.Vayishlach': 'Vayishlach',
        'sh.parasha.Vayeshev': 'Vayeshev', 'sh.parasha.Miketz': 'Miketz', 'sh.parasha.Vayigash': 'Vayigash', 'sh.parasha.Vayechi': 'Vayechi', 'sh.parasha.Shemot': 'Shemot',
        'sh.parasha.Vaera': 'Vaera', 'sh.parasha.Bo': 'Bo', 'sh.parasha.Beshalach': 'Beshalach', 'sh.parasha.Yitro': 'Yitro', 'sh.parasha.Mishpatim': 'Mishpatim',
        'sh.parasha.Terumah': 'Terumah', 'sh.parasha.Tetzaveh': 'Tetzaveh', 'sh.parasha.Ki Tisa': 'Ki Tisa', 'sh.parasha.Vayakhel': 'Vayakhel', 'sh.parasha.Pekudei': 'Pekudei',
        'sh.parasha.Vayikra': 'Vayikra', 'sh.parasha.Tzav': 'Tzav', 'sh.parasha.Shmini': 'Shmini', 'sh.parasha.Tazria': 'Tazria', 'sh.parasha.Metzora': 'Metzora',
        'sh.parasha.Achrei Mot': 'Achrei Mot', 'sh.parasha.Kedoshim': 'Kedoshim', 'sh.parasha.Emor': 'Emor', 'sh.parasha.Behar': 'Behar', 'sh.parasha.Bechukotai': 'Bechukotai',
        'sh.parasha.Bamidbar': 'Bamidbar', 'sh.parasha.Nasso': 'Nasso', 'sh.parasha.Beha’alotcha': 'Beha’alotcha', 'sh.parasha.Sh’lach': 'Sh’lach', 'sh.parasha.Korach': 'Korach',
        'sh.parasha.Chukat': 'Chukat', 'sh.parasha.Balak': 'Balak', 'sh.parasha.Pinchas': 'Pinchas', 'sh.parasha.Matot-Masei': 'Matot-Masei', 'sh.parasha.Devarim': 'Devarim',
        'sh.parasha.Vaetchanan': 'Vaetchanan', 'sh.parasha.Eikev': 'Eikev', 'sh.parasha.Re’eh': 'Re’eh', 'sh.parasha.Shoftim': 'Shoftim', 'sh.parasha.Ki Teitzei': 'Ki Teitzei',
        'sh.parasha.Ki Tavo': 'Ki Tavo', 'sh.parasha.Vayakhel-Pekudei': 'Vayakhel-Pekudei', 'sh.parasha.Tazria-Metzora': 'Tazria-Metzora', 'sh.parasha.Achrei Mot-Kedoshim': 'Achrei Mot-Kedoshim', 'sh.parasha.Behar-Bechukotai': 'Behar-Bechukotai',
        'sh.parasha.Nitzavim': 'Nitzavim', 'sh.parasha.Vayeilech': 'Vayeilech', 'sh.parasha.Matot': 'Matot', 'sh.parasha.Masei': 'Masei',
        'screen.main': 'Home', 'screen.news': 'News', 'screen.traffic': 'Traffic', 'screen.map': 'Traffic map',
        'n.col.il': 'Israel', 'n.col.econ': 'Economy',
        'n.justNow': 'Just now', 'n.minAgo': '{n} min ago', 'n.hAgo': '{n} h ago', 'n.dAgo': '{n} d ago',
        't.col.cities': 'Cities', 't.col.near': 'Nearby',
        't.min': '{n} min', 't.hmin': '{h} h {m} min', 't.delay': '+{n} min', 't.km': '{n} km',
        't.level.ok': 'Clear', 't.level.slow': 'Slow', 't.level.jam': 'Jammed',
        't.noKey': 'Connect a Mapbox token to see the traffic', 't.noKeySub': 'MAPBOX_TOKEN in build.local.env, then rebuild the app',
        't.cap': 'Today\'s traffic request limit is used up · updating after {time}',
        't.refused': 'Mapbox refused the request (access or limit) · automatic retry not before {time}',
        't.storage': 'Traffic updates paused: could not check or save the request counter',
        'a.kind.missiles': 'Rocket and missile fire', 'a.kind.aircraft': 'Hostile aircraft intrusion', 'a.kind.infiltration': 'Terrorist infiltration',
        'a.kind.earthquake': 'Earthquake', 'a.kind.tsunami': 'Tsunami', 'a.kind.hazmat': 'Hazardous materials',
        'a.kind.radiological': 'Radiological event', 'a.kind.prealert': 'Alerts expected shortly', 'a.generic': 'Alert',
        'a.since': 'Since {time}', 'a.shelter': 'Enter the protected space', 'a.shelterFor': 'Enter the protected space and stay {n} min',
        'a.nearby': 'Alert nearby: {areas}', 'a.nearbyMore': '{areas} and {n} more', 'a.offline': 'Alerts: no connection',
        'a.offlineSince': 'Alerts: no connection · last answer {time}',
        'a.preview': 'Alert test — this is not a real alert',
        'city.title': 'City', 'city.sub': 'Weather, traffic and alerts for this city', 'city.saved': 'City: {name}',
        'city.hint': '{ud} choose · {lr} by letter · OK done · Back cancel', 'city.saveFailed': 'Could not save the city',
        'a.banner': 'Alert in {place}', 'a.bannerSince': 'Alert in {place} · since {time}',
        'screen.alerts': 'Alerts', 'a.home.quiet': 'No alerts', 'a.checked': 'Checked at {time}', 'a.checking': 'Checking…',
        'a.near.title': 'Nearby', 'a.near.quiet': 'No alerts nearby', 'a.recent': 'Recent alerts in Israel', 'a.col.when': 'Time', 'a.col.what': 'Alert', 'a.col.where': 'Areas', 'a.col.whereHe': 'Areas (in Hebrew)',
        'a.recent.none': 'No alerts in the last {n} days',
        'screen.markets': 'Markets',
        'markets.closed': 'closed', 'markets.partlyClosed': 'partly closed',
        'markets.group.fx': 'Currencies', 'markets.group.us': 'US stocks', 'markets.group.il': 'Israeli stocks',
        'markets.group.crypto': 'Crypto', 'markets.group.indices': 'US indices', 'markets.group.commodities': 'Commodities',
        'markets.row.USDILS': '₪ per $1', 'markets.row.EURILS': '₪ per €1', 'markets.row.UAHperILS': '₴ per ₪1', 'markets.row.RUBperILS': '₽ per ₪1',
        'markets.row.EURUSD': '$ per €1', 'markets.row.UAHperUSD': '₴ per $1',
        'markets.row.NVDA': 'NVIDIA', 'markets.row.MSFT': 'Microsoft', 'markets.row.AAPL': 'Apple', 'markets.row.GOOGL': 'Alphabet',
        'markets.row.AMZN': 'Amazon', 'markets.row.INTU': 'Intuit',
        'markets.row.LUMI.TA': 'Bank Leumi', 'markets.row.POLI.TA': 'Bank Hapoalim', 'markets.row.ESLT.TA': 'Elbit Systems', 'markets.row.TEVA.TA': 'Teva',
        'markets.row.MZTF.TA': 'Mizrahi Tefahot',
        'markets.row.TSEM.TA': 'Tower',
        'markets.row.BTC': 'Bitcoin', 'markets.row.ETH': 'Ethereum', 'markets.row.XRP': 'XRP', 'markets.row.BNB': 'BNB', 'markets.row.SOL': 'Solana',
        'markets.row.TRX': 'TRON', 'markets.row.^GSPC': 'S&P 500', 'markets.row.^DJI': 'Dow Jones', 'markets.row.^IXIC': 'Nasdaq', 'markets.row.^NDX': 'Nasdaq 100', 'markets.row.^RUT': 'Russell 2000',
        'markets.row.BZ=F': 'Brent', 'markets.row.NG=F': 'Natural gas', 'markets.row.GC=F': 'Gold', 'markets.row.SI=F': 'Silver', 'markets.row.HG=F': 'Copper',
        'markets.row.^VIX': 'VIX', 'markets.row.CL=F': 'WTI',
        'markets.unit.barrel': 'bbl', 'markets.unit.mmbtu': 'MMBtu', 'markets.unit.ounce': 'oz', 'markets.unit.pound': 'lb'
      }
    }
  };

  // News sources: names of their own, the same in every interface language.
  var SOURCES = {
    'n.src.newsru': 'NEWSru', 'n.src.newsrufin': 'NEWSru', 'n.src.ynet': 'Ynet', 'n.src.globes': 'Globes',
    'n.src.pravda': 'Українська правда', 'n.src.epravda': 'Економічна правда'
  };

  var lang = 'ru';

  function table() { return TABLES[lang] || TABLES.en; }
  function lookup(key) {
    var own = table().s[key];
    if (own !== undefined) return own;
    if (SOURCES[key] !== undefined) return SOURCES[key];
    return TABLES.en.s[key] !== undefined ? TABLES.en.s[key] : key;
  }

  // Which weekday names a date form uses (none: the form names no weekday).
  var WEEKDAYS_OF = { dateLong: 'weekdays', dateShort: 'weekdaysShort', dayMonth: null };
  // One filler for every date form of the table: d = { weekday (index, when the form names one), day, month (index) }.
  function dateWith(form, d) {
    var tb = table(), names = WEEKDAYS_OF[form];
    return fill(tb[form], { weekday: names ? tb[names][d.weekday] : '', day: d.day, month: tb.monthsGen[d.month] });
  }

  function fill(text, vars) {
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, function (all, k) { return vars.hasOwnProperty(k) ? String(vars[k]) : all; });
  }

  return {
    setLang: function (l) { lang = TABLES[l] ? l : 'en'; },
    lang: function () { return lang; },
    dir: function () { return table().dir; },
    t: function (key, vars) { return fill(lookup(key), vars); },
    // A name from the tables, or `fallback` when no table has the key (a source's id we have no name for: never the key).
    tOr: function (key, fallback, vars) { var s = lookup(key); return s === key ? fallback : fill(s, vars); },
    // A figure with a sign or a unit symbol ("−4°") kept left to right inside right-to-left text; unchanged otherwise.
    ltr: function (text) { return table().dir === 'rtl' ? LRE + text + PDF : text; },
    weekdayShort: function (i) { return table().weekdaysShort[i]; },
    // The dust band's day names (design C): a table's narrow forms where it has them, else its short weekdays.
    weekdayBand: function (i) { return (table().weekdaysBand || table().weekdaysShort)[i]; },
    // How long ago, for a headline: "Только что", "12 мин назад", "3 ч назад", "2 дн. назад" (no plural forms needed).
    ago: function (ms) {
      var min = Math.floor(Math.max(ms, 0) / 60000);
      if (min < 1) return this.t('n.justNow');
      if (min < 60) return this.t('n.minAgo', { n: min });
      if (min < 24 * 60) return this.t('n.hAgo', { n: Math.floor(min / 60) });
      return this.t('n.dAgo', { n: Math.floor(min / 1440) });
    },
    // "Пт, 4 декабря": a list's date, with the short weekday.
    dateShort: function (weekdayIndex, day, monthIndex) { return dateWith('dateShort', { weekday: weekdayIndex, day: day, month: monthIndex }); },
    dateLong: function (weekdayIndex, day, monthIndex) { return dateWith('dateLong', { weekday: weekdayIndex, day: day, month: monthIndex }); },
    // "10 апреля": the day and the month, no weekday.
    dayMonth: function (day, monthIndex) { return dateWith('dayMonth', { day: day, month: monthIndex }); },
    condition: function (code) {
      var w = table().wmo;
      return w[code] !== undefined ? w[code] : (TABLES.en.wmo[code] !== undefined ? TABLES.en.wmo[code] : '');
    },
    // A figure with `decimals` places in the interface language's own marks ("67 412", "3,7012", "1,234.50"): a typographic
    // minus, no Intl (the TV's Intl data is from 2015 and may be missing, see js/tz.js). The sign of a change is the caller's.
    number: function (value, decimals) {
      var nf = table().num, parts = Math.abs(value).toFixed(decimals).split('.');
      var whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, nf.group);
      return (value < 0 && Number(parts.join('.')) !== 0 ? '\u2212' : '') + whole + (parts[1] ? nf.decimal + parts[1] : '');
    },
    languages: function () { var out = []; for (var k in TABLES) if (TABLES.hasOwnProperty(k)) out.push(k); return out; }
  };
})();
