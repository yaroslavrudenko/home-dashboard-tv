/* The home-city catalogue (SSOT): every city the dashboard can be set to (the picker on the OK key, or HOME_CITY at
 * build time; js/homecity.js derives the weather place, the traffic routes, the map and the alert areas from it). Data
 * only, no logic. ES5.
 *   list    { id, he (the display name, as Pikud HaOref writes it), ru, uk, en, ruIn / ukIn (the name after "в": «Тревога
 *           в Реховоте»; Hebrew prefixes ב to he), at: [lat, lon] (the city centre), match (the Oref area names the city's
 *           alerts are matched against with Alerts.covers: a name itself or "name - district"; default [he]) }
 *   pois    route destinations that are not cities (the airport: in every home city's «Города»; Glilot: in Rehovot's own near)
 *   order   the picker's order per language (written by tools/cities.mjs --order with Node's full-ICU Intl.Collator; never
 *           sorted on the TV)
 * Coordinates: GeoNames city centres via Open-Meteo geocoding (CC BY 4.0, https://www.geonames.org); six centroids of
 * Oref area points from oref_alert (MIT, https://github.com/amitfin/oref_alert) where geocoding has none or the wrong
 * place (Modi'in Illit, Beitar Illit, Umm al-Fahm, El'ad, Tayibe, Tira); Rehovot and the owner's route destinations kept from config.js
 * 5df4e33. The Ukrainian names (and every ruIn / ukIn form) await a native speaker's check.
 * geo: the city's GeoNames id, for Hebcal's candle-lighting custom of the city (js/shabbat.js): GeoNames via Open-Meteo
 * geocoding (Hebrew name, then English), kept where the match lies ≤ 2 km from `at` and Hebcal answers it (checked
 * 2026-11-02, 78 of 83). Without it (Modi'in Illit, Beitar Illit, Umm al-Fahm, Tayibe; Ma'ale Adumim's match is 6.4 km
 * away) Hebcal is asked by `at`.
 * candleMins: candle lighting this many minutes before sunset, for a city asked by `at` (Hebcal's b=): Modi'in Illit and
 * Beitar Illit keep the Jerusalem custom of 40 (a city with `geo` gets its custom from Hebcal itself, Jerusalem included).
 * shushanPurim: the city keeps Purim on the 15th of Adar (Jerusalem). */
var Cities = {
  list: [
    { id: 'jlm', he: 'ירושלים', ru: 'Иерусалим', uk: 'Єрусалим', en: 'Jerusalem', ruIn: 'Иерусалиме', ukIn: 'Єрусалимі', at: [31.7816, 35.2186], geo: 281184, shushanPurim: true },
    { id: 'tlv', he: 'תל אביב', ru: 'Тель-Авив', uk: 'Тель-Авів', en: 'Tel Aviv', ruIn: 'Тель-Авиве', ukIn: 'Тель-Авіві', at: [32.0853, 34.7818], geo: 293397 },
    { id: 'haifa', he: 'חיפה', ru: 'Хайфа', uk: 'Хайфа', en: 'Haifa', ruIn: 'Хайфе', ukIn: 'Хайфі', at: [32.8185, 34.9988], geo: 294801 },
    { id: 'rishon', he: 'ראשון לציון', ru: 'Ришон-ле-Цион', uk: 'Рішон-ле-Ціон', en: 'Rishon LeZion', ruIn: 'Ришон-ле-Ционе', ukIn: 'Рішон-ле-Ціоні', at: [31.964, 34.8044], geo: 293703 },
    { id: 'petahtikva', he: 'פתח תקווה', ru: 'Петах-Тиква', uk: 'Петах-Тіква', en: 'Petah Tikva', ruIn: 'Петах-Тикве', ukIn: 'Петах-Тікві', at: [32.0888, 34.8867], geo: 293918 },
    { id: 'ashdod', he: 'אשדוד', ru: 'Ашдод', uk: 'Ашдод', en: 'Ashdod', ruIn: 'Ашдоде', ukIn: 'Ашдоді', at: [31.7921, 34.6497], geo: 295629 },
    { id: 'netanya', he: 'נתניה', ru: 'Нетания', uk: 'Нетанія', en: 'Netanya', ruIn: 'Нетании', ukIn: 'Нетанії', at: [32.3329, 34.8592], geo: 294071 },
    { id: 'bneibrak', he: 'בני ברק', ru: 'Бней-Брак', uk: 'Бней-Брак', en: 'Bnei Brak', ruIn: 'Бней-Браке', ukIn: 'Бней-Браку', at: [32.0807, 34.8338], geo: 295514 },
    { id: 'beersheva', he: 'באר שבע', ru: 'Беэр-Шева', uk: 'Беер-Шева', en: 'Beer Sheva', ruIn: 'Беэр-Шеве', ukIn: 'Беер-Шеві', at: [31.2518, 34.7913], geo: 295530 },
    { id: 'holon', he: 'חולון', ru: 'Холон', uk: 'Холон', en: 'Holon', ruIn: 'Холоне', ukIn: 'Холоні', at: [32.0158, 34.7874], geo: 294751 },
    { id: 'ramatgan', he: 'רמת גן', ru: 'Рамат-Ган', uk: 'Рамат-Ган', en: 'Ramat Gan', ruIn: 'Рамат-Гане', ukIn: 'Рамат-Гані', at: [32.0823, 34.8107], geo: 293788 },
    { id: 'beitshemesh', he: 'בית שמש', ru: 'Бейт-Шемеш', uk: 'Бейт-Шемеш', en: 'Beit Shemesh', ruIn: 'Бейт-Шемеше', ukIn: 'Бейт-Шемеші', at: [31.7307, 34.9929], geo: 295432 },
    { id: 'ashkelon', he: 'אשקלון', ru: 'Ашкелон', uk: 'Ашкелон', en: 'Ashkelon', ruIn: 'Ашкелоне', ukIn: 'Ашкелоні', at: [31.6688, 34.5743], geo: 295620 },
    { id: 'rehovot', he: 'רחובות', ru: 'Реховот', uk: 'Реховот', en: 'Rehovot', ruIn: 'Реховоте', ukIn: 'Реховоті', at: [31.8928, 34.8113], geo: 293725,
      // The owner's hand-tuned setup (5df4e33), kept exactly; every other city derives these (js/homecity.js).
      near: ['modiin', 'rishon', 'airport', 'holon', 'glilot'],
      alertsNearby: ['nessziona', 'rishon', 'yavne', 'gedera', 'mazkeretbatya', 'kiryatekron', 'beeryaakov', 'ramla', 'lod', 'ashdod', 'tlv'],
      map: { center: [31.93, 34.94], zoom: 9.6 } },
    { id: 'batyam', he: 'בת ים', ru: 'Бат-Ям', uk: 'Бат-Ям', en: 'Bat Yam', ruIn: 'Бат-Яме', ukIn: 'Бат-Ямі', at: [32.018, 34.75], geo: 295548 },
    { id: 'herzliya', he: 'הרצליה', ru: 'Герцлия', uk: 'Герцлія', en: 'Herzliya', ruIn: 'Герцлии', ukIn: 'Герцлії', at: [32.1663, 34.8254], geo: 294778 },
    { id: 'kfarsaba', he: 'כפר סבא', ru: 'Кфар-Саба', uk: 'Кфар-Саба', en: 'Kfar Saba', ruIn: 'Кфар-Сабе', ukIn: 'Кфар-Сабі', at: [32.175, 34.9069], geo: 294514 },
    { id: 'hadera', he: 'חדרה', ru: 'Хадера', uk: 'Хадера', en: 'Hadera', ruIn: 'Хадере', ukIn: 'Хадері', at: [32.4419, 34.9039], geo: 294946 },
    { id: 'modiin', he: 'מודיעין', ru: 'Модиин', uk: 'Модіїн', en: 'Modi\'in', ruIn: 'Модиине', ukIn: 'Модіїні', at: [31.8986, 35.0076], geo: 282926, match: ['מודיעין מכבים רעות', 'מודיעין'] },
    { id: 'modiinillit', he: 'מודיעין עילית', ru: 'Модиин-Илит', uk: 'Модіїн-Іліт', en: 'Modi\'in Illit', ruIn: 'Модиин-Илите', ukIn: 'Модіїн-Іліті', at: [31.9308, 35.045], candleMins: 40 },
    { id: 'lod', he: 'לוד', ru: 'Лод', uk: 'Лод', en: 'Lod', ruIn: 'Лоде', ukIn: 'Лоді', at: [31.9526, 34.8917], geo: 294421 },
    { id: 'ramla', he: 'רמלה', ru: 'Рамла', uk: 'Рамла', en: 'Ramla', ruIn: 'Рамле', ukIn: 'Рамлі', at: [31.9262, 34.8635], geo: 293768 },
    { id: 'nazareth', he: 'נצרת', ru: 'Назарет', uk: 'Назарет', en: 'Nazareth', ruIn: 'Назарете', ukIn: 'Назареті', at: [32.7009, 35.2972], geo: 294098 },
    { id: 'raanana', he: 'רעננה', ru: 'Раанана', uk: 'Раанана', en: 'Ra\'anana', ruIn: 'Раанане', ukIn: 'Раанані', at: [32.1836, 34.8739], geo: 293807 },
    { id: 'beitarillit', he: 'ביתר עילית', ru: 'Бейтар-Илит', uk: 'Бейтар-Іліт', en: 'Beitar Illit', ruIn: 'Бейтар-Илите', ukIn: 'Бейтар-Іліті', at: [31.7014, 35.1162], candleMins: 40 },
    { id: 'rosshaayin', he: 'ראש העין', ru: 'Рош-ха-Аин', uk: 'Рош-га-Аїн', en: 'Rosh HaAyin', ruIn: 'Рош-ха-Аине', ukIn: 'Рош-га-Аїні', at: [32.0955, 34.9544], geo: 293690 },
    { id: 'rahat', he: 'רהט', ru: 'Рахат', uk: 'Рахат', en: 'Rahat', ruIn: 'Рахате', ukIn: 'Рахаті', at: [31.3955, 34.757], geo: 8184212 },
    { id: 'hodhasharon', he: 'הוד השרון', ru: 'Ход-ха-Шарон', uk: 'Ход-га-Шарон', en: 'Hod HaSharon', ruIn: 'Ход-ха-Шароне', ukIn: 'Ход-га-Шароні', at: [32.1591, 34.8928], geo: 294760 },
    { id: 'kiryatgat', he: 'קריית גת', ru: 'Кирьят-Гат', uk: 'Кір’ят-Гат', en: 'Kiryat Gat', ruIn: 'Кирьят-Гате', ukIn: 'Кір’ят-Гаті', at: [31.61, 34.7642], geo: 293842, match: ['קריית גת, כרמי גת'] },
    { id: 'nahariya', he: 'נהריה', ru: 'Нагария', uk: 'Нагарія', en: 'Nahariya', ruIn: 'Нагарии', ukIn: 'Нагарії', at: [33.0089, 35.0981], geo: 294117 },
    { id: 'ummalfahm', he: 'אום אל פחם', ru: 'Умм-эль-Фахм', uk: 'Умм-ель-Фахм', en: 'Umm al-Fahm', ruIn: 'Умм-эль-Фахме', ukIn: 'Умм-ель-Фахмі', at: [32.5264, 35.1556] },
    { id: 'kiryatata', he: 'קריית אתא', ru: 'Кирьят-Ата', uk: 'Кір’ят-Ата', en: 'Kiryat Ata', ruIn: 'Кирьят-Ате', ukIn: 'Кір’ят-Аті', at: [32.8115, 35.1132], geo: 293845 },
    { id: 'givatayim', he: 'גבעתיים', ru: 'Гиватаим', uk: 'Гіватаїм', en: 'Givatayim', ruIn: 'Гиватаиме', ukIn: 'Гіватаїмі', at: [32.0722, 34.8125], geo: 294999 },
    { id: 'afula', he: 'עפולה', ru: 'Афула', uk: 'Афула', en: 'Afula', ruIn: 'Афуле', ukIn: 'Афулі', at: [32.6091, 35.2892], geo: 295740 },
    { id: 'eilat', he: 'אילת', ru: 'Эйлат', uk: 'Ейлат', en: 'Eilat', ruIn: 'Эйлате', ukIn: 'Ейлаті', at: [29.5581, 34.9482], geo: 295277 },
    { id: 'yavne', he: 'יבנה', ru: 'Явне', uk: 'Явне', en: 'Yavne', ruIn: 'Явне', ukIn: 'Явне', at: [31.8781, 34.7398], geo: 293222 },
    { id: 'nessziona', he: 'נס ציונה', ru: 'Нес-Циона', uk: 'Нес-Ціона', en: 'Ness Ziona', ruIn: 'Нес-Ционе', ukIn: 'Нес-Ціоні', at: [31.9293, 34.7987], geo: 294074 },
    { id: 'kiryatyam', he: 'קריית ים', ru: 'Кирьят-Ям', uk: 'Кір’ят-Ям', en: 'Kiryat Yam', ruIn: 'Кирьят-Яме', ukIn: 'Кір’ят-Ямі', at: [32.8497, 35.0697], geo: 293822 },
    { id: 'akko', he: 'עכו', ru: 'Акко', uk: 'Акко', en: 'Acre', ruIn: 'Акко', ukIn: 'Акко', at: [32.9281, 35.0765], geo: 295721 },
    { id: 'kiryatmotzkin', he: 'קריית מוצקין', ru: 'Кирьят-Моцкин', uk: 'Кір’ят-Моцкін', en: 'Kiryat Motzkin', ruIn: 'Кирьят-Моцкине', ukIn: 'Кір’ят-Моцкіні', at: [32.8371, 35.0776], geo: 293831 },
    { id: 'elad', he: 'אלעד', ru: 'Эльад', uk: 'Ельад', en: 'El\'ad', ruIn: 'Эльаде', ukIn: 'Ельаді', at: [32.0511, 34.9564], geo: 8428480 },
    { id: 'tiberias', he: 'טבריה', ru: 'Тверия', uk: 'Тверія', en: 'Tiberias', ruIn: 'Тверии', ukIn: 'Тверії', at: [32.794, 35.5315], geo: 293322 },
    { id: 'ramathasharon', he: 'רמת השרון', ru: 'Рамат-ха-Шарон', uk: 'Рамат-га-Шарон', en: 'Ramat HaSharon', ruIn: 'Рамат-ха-Шароне', ukIn: 'Рамат-га-Шароні', at: [32.1459, 34.8386], geo: 293783 },
    { id: 'kiryatbialik', he: 'קריית ביאליק', ru: 'Кирьят-Бялик', uk: 'Кір’ят-Бялік', en: 'Kiryat Bialik', ruIn: 'Кирьят-Бялике', ukIn: 'Кір’ят-Бяліку', at: [32.8275, 35.0858], geo: 293844 },
    { id: 'kiryatono', he: 'קריית אונו', ru: 'Кирьят-Оно', uk: 'Кір’ят-Оно', en: 'Kiryat Ono', ruIn: 'Кирьят-Оно', ukIn: 'Кір’ят-Оно', at: [32.0612, 34.8562], geo: 12031840 },
    { id: 'dimona', he: 'דימונה', ru: 'Димона', uk: 'Дімона', en: 'Dimona', ruIn: 'Димоне', ukIn: 'Дімоні', at: [31.0708, 35.0327], geo: 295328 },
    { id: 'tayibe', he: 'טייבה', ru: 'Тайбе', uk: 'Тайбе', en: 'Tayibe', ruIn: 'Тайбе', ukIn: 'Тайбе', at: [32.2635, 35.0061] },
    { id: 'safed', he: 'צפת', ru: 'Цфат', uk: 'Цфат', en: 'Safed', ruIn: 'Цфате', ukIn: 'Цфаті', at: [32.9647, 35.496], geo: 293100 },
    { id: 'netivot', he: 'נתיבות', ru: 'Нетивот', uk: 'Нетівот', en: 'Netivot', ruIn: 'Нетивоте', ukIn: 'Нетівоті', at: [31.4231, 34.5891], geo: 294068 },
    { id: 'oryehuda', he: 'אור יהודה', ru: 'Ор-Йехуда', uk: 'Ор-Єгуда', en: 'Or Yehuda', ruIn: 'Ор-Йехуде', ukIn: 'Ор-Єгуді', at: [32.0294, 34.8528], geo: 293962 },
    { id: 'kiryatshmona', he: 'קריית שמונה', ru: 'Кирьят-Шмона', uk: 'Кір’ят-Шмона', en: 'Kiryat Shmona', ruIn: 'Кирьят-Шмоне', ukIn: 'Кір’ят-Шмоні', at: [33.212, 35.5704], geo: 293825 },
    { id: 'sderot', he: 'שדרות', ru: 'Сдерот', uk: 'Сдерот', en: 'Sderot', ruIn: 'Сдероте', ukIn: 'Сдероті', at: [31.525, 34.5969], geo: 293619, match: ['שדרות, איבים'] },
    { id: 'ofakim', he: 'אופקים', ru: 'Офаким', uk: 'Офакім', en: 'Ofakim', ruIn: 'Офакиме', ukIn: 'Офакімі', at: [31.3141, 34.6203], geo: 293992 },
    { id: 'yehud', he: 'יהוד מונוסון', ru: 'Иехуд-Моноссон', uk: 'Єгуд-Моноссон', en: 'Yehud-Monosson', ruIn: 'Иехуд-Моноссоне', ukIn: 'Єгуд-Моноссоні', at: [32.0284, 34.8796], geo: 10227184 },
    { id: 'nofhagalil', he: 'נוף הגליל', ru: 'Ноф-ха-Галиль', uk: 'Ноф-га-Галіль', en: 'Nof HaGalil', ruIn: 'Ноф-ха-Галиле', ukIn: 'Ноф-га-Галілі', at: [32.7082, 35.3247], geo: 294097 },
    { id: 'maaleadumim', he: 'מעלה אדומים', ru: 'Маале-Адумим', uk: 'Маале-Адумім', en: 'Ma\'ale Adumim', ruIn: 'Маале-Адумиме', ukIn: 'Маале-Адумімі', at: [31.7823, 35.3075] },
    { id: 'ariel', he: 'אריאל', ru: 'Ариэль', uk: 'Аріель', en: 'Ariel', ruIn: 'Ариэле', ukIn: 'Аріелі', at: [32.1065, 35.1845], geo: 8199394 },
    { id: 'karmiel', he: 'כרמיאל', ru: 'Кармиэль', uk: 'Карміель', en: 'Karmiel', ruIn: 'Кармиэле', ukIn: 'Карміелі', at: [32.9095, 35.2977], geo: 294577 },
    { id: 'tiratcarmel', he: 'טירת כרמל', ru: 'Тират-Кармель', uk: 'Тірат-Кармель', en: 'Tirat Carmel', ruIn: 'Тират-Кармеле', ukIn: 'Тірат-Кармелі', at: [32.7603, 34.9687], geo: 293308 },
    { id: 'givatshmuel', he: 'גבעת שמואל', ru: 'Гиват-Шмуэль', uk: 'Гіват-Шмуель', en: 'Givat Shmuel', ruIn: 'Гиват-Шмуэле', ukIn: 'Гіват-Шмуелі', at: [32.0782, 34.8486], geo: 294981 },
    { id: 'kiryatmalakhi', he: 'קריית מלאכי', ru: 'Кирьят-Малахи', uk: 'Кір’ят-Малахі', en: 'Kiryat Malakhi', ruIn: 'Кирьят-Малахи', ukIn: 'Кір’ят-Малахі', at: [31.7289, 34.7463], geo: 293835 },
    { id: 'migdalhaemek', he: 'מגדל העמק', ru: 'Мигдаль-ха-Эмек', uk: 'Мігдаль-га-Емек', en: 'Migdal HaEmek', ruIn: 'Мигдаль-ха-Эмеке', ukIn: 'Мігдаль-га-Емеку', at: [32.6779, 35.2416], geo: 294210 },
    { id: 'beitshean', he: 'בית שאן', ru: 'Бейт-Шеан', uk: 'Бейт-Шеан', en: 'Beit She\'an', ruIn: 'Бейт-Шеане', ukIn: 'Бейт-Шеані', at: [32.4966, 35.4965], geo: 295435 },
    { id: 'arad', he: 'ערד', ru: 'Арад', uk: 'Арад', en: 'Arad', ruIn: 'Араде', ukIn: 'Араді', at: [31.2588, 35.2128], geo: 295657 },
    { id: 'nesher', he: 'נשר', ru: 'Нешер', uk: 'Нешер', en: 'Nesher', ruIn: 'Нешере', ukIn: 'Нешері', at: [32.7662, 35.0443], geo: 294078 },
    { id: 'orakiva', he: 'אור עקיבא', ru: 'Ор-Акива', uk: 'Ор-Аківа', en: 'Or Akiva', ruIn: 'Ор-Акиве', ukIn: 'Ор-Аківі', at: [32.5064, 34.9209], geo: 293969 },
    { id: 'shefaram', he: 'שפרעם', ru: 'Шфарам', uk: 'Шфарам', en: 'Shefa-\'Amr', ruIn: 'Шфараме', ukIn: 'Шфарамі', at: [32.8058, 35.169], geo: 293539 },
    { id: 'tamra', he: 'טמרה', ru: 'Тамра', uk: 'Тамра', en: 'Tamra', ruIn: 'Тамре', ukIn: 'Тамрі', at: [32.853, 35.1987], geo: 293426 },
    { id: 'kfaryona', he: 'כפר יונה', ru: 'Кфар-Йона', uk: 'Кфар-Йона', en: 'Kfar Yona', ruIn: 'Кфар-Йоне', ukIn: 'Кфар-Йоні', at: [32.3152, 34.9357], geo: 294492 },
    { id: 'gedera', he: 'גדרה', ru: 'Гедера', uk: 'Гедера', en: 'Gedera', ruIn: 'Гедере', ukIn: 'Гедері', at: [31.8146, 34.78], geo: 295064 },
    { id: 'mazkeretbatya', he: 'מזכרת בתיה', ru: 'Мазкерет-Батья', uk: 'Мазкерет-Батья', en: 'Mazkeret Batya', ruIn: 'Мазкерет-Батье', ukIn: 'Мазкерет-Батьї', at: [31.8536, 34.8465], geo: 294303 },
    { id: 'kiryatekron', he: 'קריית עקרון', ru: 'Кирьят-Экрон', uk: 'Кір’ят-Екрон', en: 'Kiryat Ekron', ruIn: 'Кирьят-Экроне', ukIn: 'Кір’ят-Екроні', at: [31.8612, 34.8228], geo: 294552 },
    { id: 'beeryaakov', he: 'באר יעקב', ru: 'Беэр-Яаков', uk: 'Беер-Яаков', en: 'Be\'er Ya\'akov', ruIn: 'Беэр-Яакове', ukIn: 'Беер-Яакові', at: [31.9443, 34.839], geo: 295525 },
    { id: 'zichron', he: 'זכרון יעקב', ru: 'Зихрон-Яаков', uk: 'Зіхрон-Яаков', en: 'Zikhron Ya\'akov', ruIn: 'Зихрон-Яакове', ukIn: 'Зіхрон-Яакові', at: [32.5688, 34.9543], geo: 293067 },
    { id: 'yokneam', he: 'יקנעם עילית', ru: 'Йокнеам-Илит', uk: 'Йокнеам-Іліт', en: 'Yokneam Illit', ruIn: 'Йокнеам-Илите', ukIn: 'Йокнеам-Іліті', at: [32.6466, 35.092], geo: 293153 },
    { id: 'shoham', he: 'שוהם', ru: 'Шохам', uk: 'Шохам', en: 'Shoham', ruIn: 'Шохаме', ukIn: 'Шохамі', at: [31.9987, 34.9462], geo: 8428283 },
    { id: 'ganyavne', he: 'גן יבנה', ru: 'Ган-Явне', uk: 'Ган-Явне', en: 'Gan Yavne', ruIn: 'Ган-Явне', ukIn: 'Ган-Явне', at: [31.7874, 34.7066], geo: 295080 },
    { id: 'sakhnin', he: 'סכנין', ru: 'Сахнин', uk: 'Сахнін', en: 'Sakhnin', ruIn: 'Сахнине', ukIn: 'Сахніні', at: [32.8651, 35.2977], geo: 293655 },
    { id: 'kafrqasim', he: 'כפר קאסם', ru: 'Кафр-Касем', uk: 'Кафр-Касем', en: 'Kafr Qasim', ruIn: 'Кафр-Касеме', ukIn: 'Кафр-Касемі', at: [32.1144, 34.9756], geo: 294604 },
    { id: 'tira', he: 'טירה', ru: 'Тира', uk: 'Тіра', en: 'Tira', ruIn: 'Тире', ukIn: 'Тірі', at: [32.2343, 34.958], geo: 295127 },
    { id: 'baqa', he: 'באקה אל גרבייה', ru: 'Бака-эль-Гарбия', uk: 'Бака-ель-Гарбія', en: 'Baqa al-Gharbiyye', ruIn: 'Бака-эль-Гарбии', ukIn: 'Бака-ель-Гарбії', at: [32.4206, 35.0427], geo: 295571 },
    { id: 'qalansawe', he: 'קלנסווה', ru: 'Калансуа', uk: 'Калансуа', en: 'Qalansawe', ruIn: 'Калансуа', ukIn: 'Калансуа', at: [32.2849, 34.9811], geo: 293896 },
    { id: 'maalot', he: 'מעלות תרשיחא', ru: 'Маалот-Таршиха', uk: 'Маалот-Таршиха', en: 'Ma\'alot-Tarshiha', ruIn: 'Маалот-Таршихе', ukIn: 'Маалот-Таршисі', at: [33.0167, 35.2667], geo: 293420 }
  ],
  pois: [
    { id: 'airport', he: 'נתב״ג', ru: 'Аэропорт', uk: 'Аеропорт', en: 'Airport', at: [32.0004, 34.8706] },
    { id: 'glilot', he: 'גלילות', ru: 'Глилот', uk: 'Глілот', en: 'Glilot', at: [32.1449, 34.8073] }
  ],
  order: {
    ru: ['akko', 'arad', 'ariel', 'afula', 'ashdod', 'ashkelon', 'baqa', 'batyam', 'beitshean', 'beitshemesh', 'beitarillit', 'beersheva', 'beeryaakov', 'bneibrak', 'ganyavne', 'gedera', 'herzliya', 'givatshmuel', 'givatayim', 'dimona', 'zichron', 'jlm', 'yehud', 'yokneam', 'qalansawe', 'karmiel', 'kafrqasim', 'kiryatata', 'kiryatbialik', 'kiryatgat', 'kiryatmalakhi', 'kiryatmotzkin', 'kiryatono', 'kiryatshmona', 'kiryatekron', 'kiryatyam', 'kfaryona', 'kfarsaba', 'lod', 'maaleadumim', 'maalot', 'mazkeretbatya', 'migdalhaemek', 'modiin', 'modiinillit', 'nahariya', 'nazareth', 'nessziona', 'netanya', 'netivot', 'nesher', 'nofhagalil', 'orakiva', 'oryehuda', 'ofakim', 'petahtikva', 'raanana', 'ramatgan', 'ramathasharon', 'ramla', 'rahat', 'rehovot', 'rishon', 'rosshaayin', 'sakhnin', 'sderot', 'tayibe', 'tamra', 'tiberias', 'tlv', 'tira', 'tiratcarmel', 'ummalfahm', 'hadera', 'haifa', 'hodhasharon', 'holon', 'safed', 'shoham', 'shefaram', 'eilat', 'elad', 'yavne'],
    he: ['ummalfahm', 'ofakim', 'oryehuda', 'orakiva', 'eilat', 'elad', 'ariel', 'ashdod', 'ashkelon', 'baqa', 'beeryaakov', 'beersheva', 'beitshean', 'beitshemesh', 'beitarillit', 'bneibrak', 'batyam', 'givatshmuel', 'givatayim', 'gedera', 'ganyavne', 'dimona', 'hodhasharon', 'herzliya', 'zichron', 'hadera', 'holon', 'haifa', 'tiberias', 'tayibe', 'tira', 'tiratcarmel', 'tamra', 'yavne', 'yehud', 'yokneam', 'jlm', 'kfaryona', 'kfarsaba', 'kafrqasim', 'karmiel', 'lod', 'migdalhaemek', 'modiin', 'modiinillit', 'mazkeretbatya', 'maaleadumim', 'maalot', 'nahariya', 'nofhagalil', 'nessziona', 'nazareth', 'nesher', 'netivot', 'netanya', 'sakhnin', 'akko', 'afula', 'arad', 'petahtikva', 'safed', 'qalansawe', 'kiryatono', 'kiryatata', 'kiryatbialik', 'kiryatgat', 'kiryatyam', 'kiryatmotzkin', 'kiryatmalakhi', 'kiryatekron', 'kiryatshmona', 'rosshaayin', 'rishon', 'rahat', 'rehovot', 'ramla', 'ramatgan', 'ramathasharon', 'raanana', 'sderot', 'shoham', 'shefaram', 'tlv'],
    uk: ['akko', 'arad', 'ariel', 'afula', 'ashdod', 'ashkelon', 'baqa', 'batyam', 'beersheva', 'beeryaakov', 'beitshean', 'beitshemesh', 'beitarillit', 'bneibrak', 'ganyavne', 'gedera', 'herzliya', 'givatshmuel', 'givatayim', 'dimona', 'eilat', 'elad', 'yehud', 'jlm', 'zichron', 'yokneam', 'qalansawe', 'karmiel', 'kafrqasim', 'kiryatata', 'kiryatbialik', 'kiryatgat', 'kiryatekron', 'kiryatmalakhi', 'kiryatmotzkin', 'kiryatono', 'kiryatshmona', 'kiryatyam', 'kfaryona', 'kfarsaba', 'lod', 'maaleadumim', 'maalot', 'mazkeretbatya', 'migdalhaemek', 'modiin', 'modiinillit', 'nahariya', 'nazareth', 'nessziona', 'netanya', 'netivot', 'nesher', 'nofhagalil', 'orakiva', 'oryehuda', 'ofakim', 'petahtikva', 'raanana', 'ramathasharon', 'ramatgan', 'ramla', 'rahat', 'rehovot', 'rishon', 'rosshaayin', 'sakhnin', 'sderot', 'tayibe', 'tamra', 'tiberias', 'tlv', 'tira', 'tiratcarmel', 'ummalfahm', 'hadera', 'haifa', 'hodhasharon', 'holon', 'safed', 'shoham', 'shefaram', 'yavne'],
    en: ['akko', 'afula', 'arad', 'ariel', 'ashdod', 'ashkelon', 'baqa', 'batyam', 'beeryaakov', 'beersheva', 'beitshean', 'beitshemesh', 'beitarillit', 'bneibrak', 'dimona', 'eilat', 'elad', 'ganyavne', 'gedera', 'givatshmuel', 'givatayim', 'hadera', 'haifa', 'herzliya', 'hodhasharon', 'holon', 'jlm', 'kafrqasim', 'karmiel', 'kfarsaba', 'kfaryona', 'kiryatata', 'kiryatbialik', 'kiryatekron', 'kiryatgat', 'kiryatmalakhi', 'kiryatmotzkin', 'kiryatono', 'kiryatshmona', 'kiryatyam', 'lod', 'maaleadumim', 'maalot', 'mazkeretbatya', 'migdalhaemek', 'modiin', 'modiinillit', 'nahariya', 'nazareth', 'nesher', 'nessziona', 'netanya', 'netivot', 'nofhagalil', 'ofakim', 'orakiva', 'oryehuda', 'petahtikva', 'qalansawe', 'raanana', 'rahat', 'ramatgan', 'ramathasharon', 'ramla', 'rehovot', 'rishon', 'rosshaayin', 'safed', 'sakhnin', 'sderot', 'shefaram', 'shoham', 'tamra', 'tayibe', 'tlv', 'tiberias', 'tira', 'tiratcarmel', 'ummalfahm', 'yavne', 'yehud', 'yokneam', 'zichron']
  }
};
