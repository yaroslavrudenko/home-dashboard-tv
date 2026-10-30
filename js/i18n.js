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
      wmo: WMO_RU,
      s: {
        'lang.name': 'Русский',
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
        'm.loading': 'Загружаем карту…', 'm.unavailable': 'Карта недоступна', 'm.staleFrom': 'Карта недоступна · данные от {time}',
        'n.col.il': 'Израиль', 'n.col.econ': 'Экономика',
        'n.justNow': 'Только что', 'n.minAgo': '{n} мин назад', 'n.hAgo': '{n} ч назад', 'n.dAgo': '{n} дн. назад',
        'n.loading': 'Загружаем новости…', 'n.failed': 'Новости временно недоступны',
        'n.colFailed': 'Не удалось загрузить', 'n.colFailedRetry': 'Не удалось загрузить · повторим в {time}', 'n.failedRetry': 'Новости временно недоступны · повторим в {time}',
        't.col.cities': 'Города', 't.col.near': 'Рядом',
        't.route.tlv': 'Тель-Авив', 't.route.jlm': 'Иерусалим', 't.route.haifa': 'Хайфа', 't.route.beersheva': 'Беэр-Шева',
        't.route.ashkelon': 'Ашкелон', 't.route.modiin': 'Модиин', 't.route.rishon': 'Ришон-ле-Цион',
        't.route.airport': 'Аэропорт', 't.route.holon': 'Холон', 't.route.glilot': 'Глилот',
        't.min': '{n} мин', 't.hmin': '{h} ч {m} мин', 't.delay': '+{n} мин', 't.km': '{n} км',
        't.level.ok': 'Свободно', 't.level.slow': 'Затруднено', 't.level.jam': 'Пробка', 't.noData': 'Нет данных',
        't.noKey': 'Подключите токен Mapbox, чтобы видеть пробки', 't.noKeySub': 'MAPBOX_TOKEN в build.local.env, затем пересоберите приложение',
        't.updated': 'Обновлено {time} · {n} мин назад', 't.updating': 'Обновляется…', 't.updatingFrom': 'Обновляется… · данные от {time}',
        't.failed': 'Не удалось обновить пробки', 't.future': 'Данные устарели · время данных требует проверки',
        't.stale': 'Данные устарели · обновлено {time} · {n} мин назад',
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
        'screen.alerts': 'Тревоги', 'a.home.quiet': 'Тревог нет', 'a.checked': 'Проверено в {time}', 'a.checking': 'Проверяем…',
        'a.near.title': 'Рядом', 'a.near.quiet': 'Рядом тревог нет', 'a.recent': 'Последние тревоги в Израиле',
        'a.recent.none': 'За последние {n} дней тревог не было', 'a.recent.loading': 'Загружаем…', 'a.recent.failed': 'Список тревог недоступен'
      }
    },
    he: {
      dir: 'rtl',
      weekdays: ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת'],
      weekdaysShort: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'],
      monthsGen: ['בינואר', 'בפברואר', 'במרץ', 'באפריל', 'במאי', 'ביוני', 'ביולי', 'באוגוסט', 'בספטמבר', 'באוקטובר', 'בנובמבר', 'בדצמבר'],
      dateLong: '{weekday}, {day} {month}',
      wmo: WMO_HE,
      s: {
        'lang.name': 'עברית',
        'city.israel': 'ישראל', 'city.ukraine': 'אוקראינה', 'city.sydney': 'סידני',
        'place.rehovot': 'רחובות', 'place.kyiv': 'קייב', 'place.sydney': 'סידני',
        'place.haifa': 'חיפה', 'place.telaviv': 'תל אביב', 'place.beersheva': 'באר שבע',
        'r.north': 'צפון', 'r.center': 'מרכז', 'r.south': 'דרום', 'w.days': 'תחזית ל־{n} ימים', 'screen.israel': 'מזג האוויר בישראל',
        'clock.same': 'כמו כאן', 'clock.ahead': LRE + '+{h}' + PDF + ' שע׳', 'clock.behind': LRE + '−{h}' + PDF + ' שע׳',
        'clock.unknown': 'אזור הזמן לא ידוע',
        'w.feels': 'מרגיש כמו {t}', 'w.high': 'מקס׳', 'w.low': 'מינ׳',
        'w.wind': 'רוח', 'w.humidity': 'לחות', 'w.rain': 'משקעים', 'w.sunrise': 'זריחה', 'w.sunset': 'שקיעה',
        'w.kmh': 'קמ״ש', 'w.now': 'עכשיו', 'w.today': 'היום', 'w.hourly': 'תחזית שעתית', 'w.daily': 'תחזית ל־7 ימים',
        'w.updated': 'עודכן ב־{time}', 'w.stale': 'לא מתעדכן · נתונים מ־{time}', 'w.loading': 'טוען את מזג האוויר…',
        'w.failed': 'מזג האוויר אינו זמין כרגע', 'w.retry': 'ננסה שוב ב־{time}', 'w.retrySoon': 'ננסה שוב בקרוב',
        'screen.main': 'ראשי', 'screen.news': 'חדשות', 'screen.traffic': 'תנועה', 'screen.map': 'מפת תנועה',
        'm.loading': 'טוען את המפה…', 'm.unavailable': 'המפה אינה זמינה', 'm.staleFrom': 'המפה אינה זמינה · נתונים מ־{time}',
        'n.col.il': 'ישראל', 'n.col.econ': 'כלכלה',
        'n.justNow': 'עכשיו', 'n.minAgo': 'לפני {n} דק׳', 'n.hAgo': 'לפני {n} שע׳', 'n.dAgo': 'לפני {n} ימים',
        'n.loading': 'טוען חדשות…', 'n.failed': 'החדשות אינן זמינות כרגע',
        'n.colFailed': 'הטעינה נכשלה', 'n.colFailedRetry': 'הטעינה נכשלה · ננסה שוב ב־{time}', 'n.failedRetry': 'החדשות אינן זמינות כרגע · ננסה שוב ב־{time}',
        't.col.cities': 'ערים', 't.col.near': 'בסביבה',
        't.route.tlv': 'תל אביב', 't.route.jlm': 'ירושלים', 't.route.haifa': 'חיפה', 't.route.beersheva': 'באר שבע',
        't.route.ashkelon': 'אשקלון', 't.route.modiin': 'מודיעין', 't.route.rishon': 'ראשון לציון',
        't.route.airport': 'נתב״ג', 't.route.holon': 'חולון', 't.route.glilot': 'גלילות',
        't.min': '{n} דק׳', 't.hmin': '{h} שע׳ {m} דק׳', 't.delay': LRE + '+{n}' + PDF + ' דק׳', 't.km': '{n} ק״מ',
        't.level.ok': 'זורם', 't.level.slow': 'איטי', 't.level.jam': 'פקק', 't.noData': 'אין נתונים',
        't.noKey': 'חברו טוקן Mapbox כדי לראות את מצב התנועה', 't.noKeySub': 'MAPBOX_TOKEN בקובץ build.local.env, ואז בנו את האפליקציה מחדש',
        't.updated': 'עודכן {time} · לפני {n} דק׳', 't.updating': 'מתעדכן…', 't.updatingFrom': 'מתעדכן… · נתונים מ־{time}',
        't.failed': 'לא ניתן לעדכן את מצב התנועה', 't.future': 'הנתונים אינם עדכניים · יש לבדוק את זמן הנתונים',
        't.stale': 'הנתונים אינם עדכניים · עודכן {time} · לפני {n} דק׳',
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
        'screen.alerts': 'התרעות', 'a.home.quiet': 'אין התרעות', 'a.checked': 'נבדק ב־{time}', 'a.checking': 'בודקים…',
        'a.near.title': 'בסביבה', 'a.near.quiet': 'אין התרעות בסביבה', 'a.recent': 'התרעות אחרונות בישראל',
        'a.recent.none': 'לא היו התרעות ב־{n} הימים האחרונים', 'a.recent.loading': 'טוענים…', 'a.recent.failed': 'רשימת ההתרעות אינה זמינה'
      }
    },
    uk: {
      dir: 'ltr',
      weekdays: ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П’ятниця', 'Субота'],
      weekdaysShort: ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
      monthsGen: ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'],
      dateLong: '{weekday}, {day} {month}',
      wmo: WMO_UK,
      s: {
        'lang.name': 'Українська',
        'city.israel': 'Ізраїль', 'city.ukraine': 'Україна', 'city.sydney': 'Сідней',
        'place.rehovot': 'Реховот', 'place.kyiv': 'Київ', 'place.sydney': 'Сідней',
        'place.haifa': 'Хайфа', 'place.telaviv': 'Тель-Авів', 'place.beersheva': 'Беер-Шева',
        'r.north': 'Північ', 'r.center': 'Центр', 'r.south': 'Південь', 'w.days': 'Прогноз на {n} днів', 'screen.israel': 'Погода в Ізраїлі',
        'clock.same': 'Як тут', 'clock.ahead': '+{h} год', 'clock.behind': '−{h} год',
        'clock.unknown': 'Пояс невідомий',
        'w.feels': 'Відчувається як {t}', 'w.high': 'Макс.', 'w.low': 'Мін.',
        'w.wind': 'Вітер', 'w.humidity': 'Вологість', 'w.rain': 'Опади', 'w.sunrise': 'Схід', 'w.sunset': 'Захід',
        'w.kmh': 'км/год', 'w.now': 'Зараз', 'w.today': 'Сьогодні', 'w.hourly': 'Погодинний прогноз', 'w.daily': 'Прогноз на 7 днів',
        'w.updated': 'Оновлено о {time}', 'w.stale': 'Не оновлюється · дані від {time}', 'w.loading': 'Завантажуємо погоду…',
        'w.failed': 'Погода тимчасово недоступна', 'w.retry': 'Повторимо о {time}', 'w.retrySoon': 'Повторимо пізніше',
        'screen.main': 'Головна', 'screen.news': 'Новини', 'screen.traffic': 'Затори', 'screen.map': 'Карта заторів',
        'm.loading': 'Завантажуємо карту…', 'm.unavailable': 'Карта недоступна', 'm.staleFrom': 'Карта недоступна · дані від {time}',
        'n.col.il': 'Україна', 'n.col.econ': 'Економіка',
        'n.justNow': 'Щойно', 'n.minAgo': '{n} хв тому', 'n.hAgo': '{n} год тому', 'n.dAgo': '{n} дн. тому',
        'n.loading': 'Завантажуємо новини…', 'n.failed': 'Новини тимчасово недоступні',
        'n.colFailed': 'Не вдалося завантажити', 'n.colFailedRetry': 'Не вдалося завантажити · повторимо о {time}', 'n.failedRetry': 'Новини тимчасово недоступні · повторимо о {time}',
        't.col.cities': 'Міста', 't.col.near': 'Поруч',
        't.route.tlv': 'Тель-Авів', 't.route.jlm': 'Єрусалим', 't.route.haifa': 'Хайфа', 't.route.beersheva': 'Беер-Шева',
        't.route.ashkelon': 'Ашкелон', 't.route.modiin': 'Модіїн', 't.route.rishon': 'Рішон-ле-Ціон',
        't.route.airport': 'Аеропорт', 't.route.holon': 'Холон', 't.route.glilot': 'Глілот',
        't.min': '{n} хв', 't.hmin': '{h} год {m} хв', 't.delay': '+{n} хв', 't.km': '{n} км',
        't.level.ok': 'Вільно', 't.level.slow': 'Ускладнено', 't.level.jam': 'Затор', 't.noData': 'Немає даних',
        't.noKey': 'Підключіть токен Mapbox, щоб бачити затори', 't.noKeySub': 'MAPBOX_TOKEN у build.local.env, потім перезберіть застосунок',
        't.updated': 'Оновлено {time} · {n} хв тому', 't.updating': 'Оновлюється…', 't.updatingFrom': 'Оновлюється… · дані від {time}',
        't.failed': 'Не вдалося оновити затори', 't.future': 'Дані застаріли · час даних потребує перевірки',
        't.stale': 'Дані застаріли · оновлено {time} · {n} хв тому',
        't.cap': 'Денний ліміт запитів заторів вичерпано · оновлення після {time}',
        't.refused': 'Mapbox відхилив запит (доступ або ліміт) · автоматичний повтор не раніше {time}',
        't.storage': 'Оновлення заторів призупинено: не вдалося перевірити або зберегти лічильник запитів',
        'a.kind.missiles': 'Ракетний обстріл', 'a.kind.aircraft': 'Ворожий безпілотник', 'a.kind.infiltration': 'Проникнення терористів',
        'a.kind.earthquake': 'Землетрус', 'a.kind.tsunami': 'Загроза цунамі', 'a.kind.hazmat': 'Витік небезпечних речовин',
        'a.kind.radiological': 'Радіаційна загроза', 'a.kind.prealert': 'Незабаром можлива тривога', 'a.generic': 'Тривога',
        'a.since': 'З {time}', 'a.shelter': 'Увійдіть до захищеного приміщення', 'a.shelterFor': 'Увійдіть до захищеного приміщення й залишайтеся там {n} хв',
        'a.nearby': 'Тривога поруч: {areas}', 'a.nearbyMore': '{areas} та ще {n}', 'a.offline': 'Тривоги: немає зв’язку',
        'a.offlineSince': 'Тривоги: немає зв’язку · остання відповідь {time}',
        'a.preview': 'Перевірка тривоги — це не справжня тривога',
        'screen.alerts': 'Тривоги', 'a.home.quiet': 'Тривог немає', 'a.checked': 'Перевірено о {time}', 'a.checking': 'Перевіряємо…',
        'a.near.title': 'Поруч', 'a.near.quiet': 'Поруч тривог немає', 'a.recent': 'Останні тривоги в Ізраїлі',
        'a.recent.none': 'За останні {n} днів тривог не було', 'a.recent.loading': 'Завантажуємо…', 'a.recent.failed': 'Список тривог недоступний'
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
        'lang.name': 'English',
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
        'm.loading': 'Loading the map…', 'm.unavailable': 'The map is unavailable', 'm.staleFrom': 'The map is unavailable · data from {time}',
        'n.col.il': 'Israel', 'n.col.econ': 'Economy',
        'n.justNow': 'Just now', 'n.minAgo': '{n} min ago', 'n.hAgo': '{n} h ago', 'n.dAgo': '{n} d ago',
        'n.loading': 'Loading the news…', 'n.failed': 'News is temporarily unavailable',
        'n.colFailed': 'Could not load', 'n.colFailedRetry': 'Could not load · retrying at {time}', 'n.failedRetry': 'News is temporarily unavailable · retrying at {time}',
        't.col.cities': 'Cities', 't.col.near': 'Nearby',
        't.route.tlv': 'Tel Aviv', 't.route.jlm': 'Jerusalem', 't.route.haifa': 'Haifa', 't.route.beersheva': 'Beer Sheva',
        't.route.ashkelon': 'Ashkelon', 't.route.modiin': 'Modi\'in', 't.route.rishon': 'Rishon LeZion',
        't.route.airport': 'Airport', 't.route.holon': 'Holon', 't.route.glilot': 'Glilot',
        't.min': '{n} min', 't.hmin': '{h} h {m} min', 't.delay': '+{n} min', 't.km': '{n} km',
        't.level.ok': 'Clear', 't.level.slow': 'Slow', 't.level.jam': 'Jammed', 't.noData': 'No data',
        't.noKey': 'Connect a Mapbox token to see the traffic', 't.noKeySub': 'MAPBOX_TOKEN in build.local.env, then rebuild the app',
        't.updated': 'Updated {time} · {n} min ago', 't.updating': 'Updating…', 't.updatingFrom': 'Updating… · data from {time}',
        't.failed': 'Could not update the traffic', 't.future': 'Data is out of date · its time needs checking',
        't.stale': 'Data is out of date · updated {time} · {n} min ago',
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
        'screen.alerts': 'Alerts', 'a.home.quiet': 'No alerts', 'a.checked': 'Checked at {time}', 'a.checking': 'Checking…',
        'a.near.title': 'Nearby', 'a.near.quiet': 'No alerts nearby', 'a.recent': 'Recent alerts in Israel',
        'a.recent.none': 'No alerts in the last {n} days', 'a.recent.loading': 'Loading…', 'a.recent.failed': 'The alert list is unavailable'
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

  function fill(text, vars) {
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, function (all, k) { return vars.hasOwnProperty(k) ? String(vars[k]) : all; });
  }

  return {
    setLang: function (l) { lang = TABLES[l] ? l : 'en'; },
    lang: function () { return lang; },
    dir: function () { return table().dir; },
    t: function (key, vars) { return fill(lookup(key), vars); },
    // A figure with a sign or a unit symbol ("−4°") kept left to right inside right-to-left text; unchanged otherwise.
    ltr: function (text) { return table().dir === 'rtl' ? LRE + text + PDF : text; },
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
