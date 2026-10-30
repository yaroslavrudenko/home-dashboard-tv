<p align="center">
  <img src="img/icon.png" width="160" alt="Home Dashboard icon: four widget tiles on graphite: a white clock, a blue sky with a sun, a red news card and a green route">
</p>

<h1 align="center">Home Dashboard</h1>

<p align="center">
  <b>Your family's morning glance, on the TV you already own.</b><br>
  A calm, always-on dashboard for Samsung Smart TVs — even a 2017 one.<br>
  Clocks for Israel, Ukraine and Sydney · weather at home and across Israel · news · live traffic times and a live traffic map · Home Front Command alerts.<br>
  In Russian, Hebrew or Ukrainian — one key on the remote.
</p>

<p align="center">
  <img alt="Samsung Tizen 3.0+ (2017)" src="https://img.shields.io/badge/Samsung%20Tizen-3.0%2B%20·%202017%20TVs-1428A0?style=for-the-badge">
  <img alt="Chromium 47 engine, plain ES5" src="https://img.shields.io/badge/Chromium%2047-plain%20ES5-2f7ee8?style=for-the-badge">
  <img alt="A real installed app, not a web page" src="https://img.shields.io/badge/installed%20Tizen%20app-.wgt-34a853?style=for-the-badge"><br>
  <img alt="Five screens with auto-rotation" src="https://img.shields.io/badge/screens-5%20·%20auto--rotation-8e44ad?style=for-the-badge">
  <img alt="Israel alerts checked every 5 seconds" src="https://img.shields.io/badge/Pikud%20HaOref%20alerts-every%205%20s-c0392b?style=for-the-badge">
  <img alt="Live traffic: Mapbox routes and map, inside the free tier" src="https://img.shields.io/badge/live%20traffic-Mapbox%20routes%20·%20map-f39c12?style=for-the-badge">
  <img alt="Русский, עברית, Українська" src="https://img.shields.io/badge/languages-RU%20·%20HE%20·%20UK-16a085?style=for-the-badge"><br>
  <img alt="216 automated tests" src="https://img.shields.io/badge/tests-216%20passing-brightgreen?style=for-the-badge">
  <img alt="No backend, no sign-up, no analytics" src="https://img.shields.io/badge/no%20backend%20·%20no%20sign--up%20·%20no%20analytics-555555?style=for-the-badge">
</p>

<p align="center">
  <img src="docs/screenshots/main.png" width="900" alt="Home screen at 1920×1080 in Russian: clocks for Israel, Ukraine and Sydney, the weather in Rehovot with a 12-hour strip, and a 7-day forecast">
</p>

## See it in action

<table>
  <tr>
    <td><img src="docs/screenshots/israel-weather.png" alt="Weather in Israel: North (Haifa), Centre (Tel Aviv) and South (Beer Sheva), each with the weather now and a 5-day forecast"></td>
    <td><img src="docs/screenshots/news.png" alt="News in Russian: two columns, Israel and Economy from NEWSru, five headlines each, newest first"></td>
  </tr>
  <tr><td align="center"><b>Weather in Israel</b> — North, Centre, South, five days ahead</td><td align="center"><b>News</b> — the sources follow the interface language</td></tr>
  <tr>
    <td><img src="docs/screenshots/traffic.png" alt="Traffic: ten routes from Rehovot in two columns, each with the live travel time from Mapbox, the delay against a typical day in colour, and the distance"></td>
    <td><img src="docs/screenshots/traffic-map.png" alt="Traffic map: a Mapbox live-traffic image from Tel Aviv to Ashdod and Jerusalem, coloured road lines, a dot on Rehovot"></td>
  </tr>
  <tr><td align="center"><b>Traffic</b> — ten routes, live, refreshed the moment you open the screen</td><td align="center"><b>Traffic map</b> — live road colours around home</td></tr>
  <tr>
    <td><img src="docs/screenshots/main-hebrew.png" alt="The home screen in Hebrew, mirrored right to left"></td>
    <td><img src="docs/screenshots/news-ukrainian.png" alt="News in Ukrainian: Ukraine and Economy columns from Ukrainska Pravda and Ekonomichna Pravda"></td>
  </tr>
  <tr><td align="center"><b>עברית</b> — the whole layout mirrors</td><td align="center"><b>Українська</b> — news about Ukraine</td></tr>
</table>

<sub>Screenshots at 1920×1080 in desktop Chrome. The traffic map is a real Mapbox image (Friday afternoon); the other screens use the test fixtures, so the headlines, temperatures and travel times are sample data.</sub>

It is a real installed **Tizen web app** (a signed `.wgt` package), not a web page: the TV's browser is
slow and limited, while an installed app starts instantly, keeps the screen on and exits with Back.
It runs on Samsung Tizen TVs from 2017 on (Tizen 3.0 or newer; 2016 models run Tizen 2.x and refuse the
package). The oldest target is a 2017 UE50MU7000 (Tizen 3.0, Chromium 47), so the code is plain ES5 with
no framework, no bundler and no backend. The typeface, [Inter](https://rsms.me/inter/), ships inside the
app (static Light / Regular / Medium, Latin + Cyrillic, about 96 KB), so the TV shows the same type as the
screenshot instead of whatever system font it has.

## What it shows

Five screens, switched with the remote's ◀ ▶ and shown in turn every 45 seconds (page dots at the bottom
mark the current one). Any key pauses the rotation for two minutes; `rotation.enabled: false` in the config
turns it off. A screen that is not on view keeps its content and costs nothing: it is redrawn when it comes in.
A screen opened with ◀ ▶ refreshes its data at once (the owner's rule, 2026-10-30): the weather for the home and Israel
screens, both news feeds, the traffic round (within its daily cap), a new map image (within its own). A request already running is
never started twice, and a rotation arrival keeps each screen's own schedule.

**1 · Home**

- **World clocks**: Israel (Asia/Jerusalem), Ukraine (Europe/Kyiv) and Sydney (Australia/Sydney), in 24-hour
  time with the weekday, the date, the difference to Israel and each city's current temperature. A card is
  tinted for the night from that city's sunrise and sunset.
- **Weather** for Rehovot from [Open-Meteo](https://open-meteo.com/) (free, no API key): temperature, feels-like,
  condition, wind, humidity, today's high/low, chance of rain, sunrise/sunset, a 12-hour strip and a 7-day list.
- **Status**: "Updated at HH:MM". When a refresh fails, the last good data stays on screen and is marked as
  not updating, with the time it is from; every temperature from that data (the main card and each clock
  card) is dimmed, and the amber status line says it once. With no data at all, the weather card says so once, with
  the time of the next attempt, and the forecast rows stay in place as quiet placeholders.

### Behaviour worth knowing

- **The time is never silently wrong.** The TV's own time-zone setting is not trusted: each clock takes UTC
  from the device and converts it with the zone's rules. Old TVs ship a 2015 time-zone database that does
  not know "Europe/Kyiv", so the app falls back to "Europe/Kiev". If the TV has no usable time-zone support
  at all, built-in daylight-saving rules for Israel, the EU and Sydney are used and the clock shows a small
  "≈". When the TV's time-zone data and the built-in rule disagree, the rule wins (it is tested against the
  real time-zone database for every hour of 2025–2030) and the disagreement is logged. If neither works,
  the clock says "Zone unknown" instead of a time.
- **Weather refresh**: every 15 minutes, ONE request for all places (Open-Meteo takes comma-separated
  coordinates), about 1.5 KB compressed. After a failure it waits a random time between 30 seconds and
  1, 2, 4 and 8 minutes, then up to 15 minutes, so it never loops tightly and never synchronises. Data
  older than 45 minutes is marked stale even if no request failed. "Now" and "Today" follow the clock, not
  the age of the data.
- **Burn-in care**: the whole layout drifts by a few pixels every 3 minutes, slowly (6 s), so static text
  never sits on the same pixels for hours. The layout is its own GPU layer, so a drift repaints nothing.
- **Screen saver**: switched off while the app runs (the result is logged); **Back** closes the app.
  The TV's own **Eco "Auto Power Off"** is separate and an app cannot override it: it switches the TV off
  after about 4 hours without a remote key press. For an always-on dashboard turn it off in
  *Settings → General → Eco Solution → Auto Power Off*. Not yet verified on the TV for a run longer than 4 hours.
- **Languages**: Russian, Hebrew and Ukrainian, switched with one key (see Languages below).

**2 · Weather in Israel**: three cards side by side — North (Haifa), Centre (Tel Aviv), South (Beer Sheva) — each
with the temperature now, its condition, feels-like and wind, and a 5-day list with the same range bars as the
main card. The regions ride the main weather's single Open-Meteo request (six places, one request), so this screen
costs no request of its own; a failed refresh dims every card and the header says it once.

**3 · News**: two columns, five headlines each, newest first, with how long ago. The interface language picks the
sources (see Languages): in Russian «Израиль» and «Экономика» from [NEWSru.co.il](https://www.newsru.co.il/) (its Israel
and Economy sections), in Hebrew «ישראל» from [Ynet](https://www.ynet.co.il/Integration/StoryRss2.xml) and «כלכלה» from
[Globes](https://www.globes.co.il/) (Calcalist's feeds answer 403, TheMarker's stopped in May 2026), in Ukrainian
«Україна» from [Українська правда](https://www.pravda.com.ua/) and «Економіка» from [Економічна правда](https://epravda.com.ua/)
(every feed checked live on 2026-10-30). Only the language's two feeds are fetched, in one parallel round every 10 minutes;
a story a feed repeats is shown once, and feed text is reduced to plain text (no feed HTML ever reaches the screen). A
headline takes at most two lines (a fixed two-line box; a longer one ends with an ellipsis), and row n of both columns
sits on one line. Both columns are always there: while a feed loads its own column says «Загружаем новости…»; a feed that
fails with nothing yet says so in amber in its own column, with when it is tried again («Не удалось загрузить · повторим в
HH:MM»). A feed that fails keeps its last stories and says "not updating" in its own column
only, while the header stays "Updated at"; when nothing came at all the header says «Новости временно недоступны · повторим
в HH:MM». Hebrew is drawn in a bundled Noto Sans Hebrew (Regular, the Hebrew block only, about 7 KB, OFL) so the TV does not
depend on its system fonts for it.

**4 · Traffic**: ten widgets in two columns of five. «Города»: from Rehovot to the centres of Tel Aviv, Jerusalem, Haifa,
Beer Sheva and Ashkelon; «Рядом»: to Modi'in, Rishon LeZion, Ben Gurion Airport (Terminal 3), Holon and Glilot (Cinema
City). Each widget: the name and a soft green / amber / red chip with the delay, the travel time now and the length, and a
time bar (bars compare within a column). The times are LIVE traffic from the
[Mapbox Directions API](https://docs.mapbox.com/api/navigation/directions/) (profile `driving-traffic`): one GET per route,
the ten started together, no geometry. The delay is the time now over the usual time at this hour (`duration_typical`);
a trip faster than usual says «Свободно». TomTom, used before, has no live traffic for Israel (its flow tiles are blank
there and its routing answered live == historic, measured 2026-10-30), so it is gone. Mapbox's free tier is 100,000
Directions requests a **month**, so one rule decides when a round is sent (`Config.traffic.schedule`; one function,
`Traffic.decide`, for every path), at any hour of the day:

- only while the traffic screen is on view and the TV shows it (a hidden screen costs nothing, nothing is sent at boot),
  and one round at a time (20-second deadline per request);
- opened with ◀ ▶: at once, every time, however old the data is;
- arrived with the rotation, staying open, or the TV waking: at most once every 10 minutes since the last attempt
  (`minIntervalMs`), failures and refusals included (no separate retry path, no catch-up);
- never past 3,000 requests (300 rounds) on a UTC date (`dailyRequestCap`): before every round the app writes
  `{utcDate, used + 10, lastAttemptAt}` to the TV's localStorage (`tt-quota`), reads it back, and sends only if it was
  stored; nothing is refunded (a failure, a timeout, a refusal, a restart). Any 31 days (with arbitrary alignment they
  touch 32 UTC dates) stay ≤ 32 × 3,000 = 96,000 requests; parked on the screen it is 144 rounds a UTC date (1,440
  requests), and pressing ◀ ▶ every minute all day stops at exactly 3,000 (`tests/build-config.test.js` simulates these,
  restarts and the 25-hour DST date included).
- A deadline Mapbox gives (`Retry-After` on a 403, 429 or 503 of any of the ten answers, in seconds or as a date) is
  written into the same record (`retryNotBefore`, read back) and holds for every path, ◀ ▶ opens and restarts included;
  the refusal line shows the later of "last attempt + 10 min" and that deadline («автоматический повтор не раньше HH:MM»).
- A clock that went back is corrected without sending: a last attempt in the future becomes "now" (the next round 10
  minutes later), a counter date in the future becomes today's UTC date with its count kept. If localStorage fails or the
  counter is corrupt, nothing is sent and the screen says «Обновления пробок приостановлены: не удалось проверить или
  сохранить счётчик запросов».

The rows and their times are kept in localStorage (`tt-cache`) and shown at once after a restart. The header says when the
data on screen is from, always the OLDEST row: «Обновлено 20:32 · 3 мин назад», while a round runs «Обновляется… · данные
от 20:32», after 30 minutes or a failed update «Данные устарели · обновлено 20:32 · 41 мин назад» (a date «29.10» before
the time when it is not today), and data timed in the future «Данные устарели · время данных требует проверки» (never a
negative age). Why it cannot update is a second line under it, never in its place: «Дневной лимит запросов пробок исчерпан
· обновление после 30.10 02:00», «Mapbox отклонил запрос (доступ или лимит) · автоматический повтор не раньше 20:42» (401/403/429), or the
storage pause. With nothing to show, the card says «Обновляется…», «Не удалось обновить пробки» or the same message. A
place Mapbox cannot route (NoRoute / NoSegment) says «Нет данных» in its own widget and never marks the screen as not
current. It needs a Mapbox token (see Build); without one the screen says how to connect it and sends nothing. The routes
were checked live by the coordinator on 2026-10-30 16:28 (e.g. Tel Aviv 32.0 min vs a usual 39.3, Jerusalem 44.9 vs 56.4);
the tests run on Mapbox's documented answer shape.

**5 · Traffic map**: the live traffic of the centre of Israel — Tel Aviv, Rehovot, Ashdod and Jerusalem — as ONE picture from
the [Mapbox Static Images API](https://docs.mapbox.com/api/maps/static-images/) in Mapbox's live-traffic style
(`traffic-night-v2`: green, orange and red lines over a night map), with the same Mapbox token as the routes. A white dot
marks Rehovot (placed by Web Mercator, so it sits exactly on the town), and the card carries the attribution Mapbox requires,
«© Mapbox © OpenStreetMap». The picture is asked for at half the card's size `@2x`, so it fills the card pixel for pixel.
It is refreshed while it is shown (the same one-gate rule as the routes, `Config.map`): at once on every ◀ ▶ open, every
5 minutes while the map is on view and the TV shows it, never while hidden (leaving the screen or the TV hiding the page stops
the image in flight), one image at a time with a 20-second deadline. A failed image keeps the last one on screen and the
header says «Карта недоступна · данные от HH:MM». Each image is reserved in the TV's localStorage (`map-quota`) before it is
asked for and never refunded, at most 600 a UTC date: Static Images' free tier is 50,000 a month, and any 31 days touch at
most 32 UTC dates, so ≤ 32 × 600 = 19,200. (Batch 6 embedded Waze's live map instead; on the TV that frame opened the TV's
browser, so it is gone. The map's place names come from Mapbox, in English.)

**Israel alerts (all screens)**: the [Home Front Command](https://www.oref.org.il/) alert feed is read every
5 seconds (one request at a time, 4-second timeout). When an alert covers Rehovot, a deep-red full-screen
notice appears over everything: the kind of alert, the area, the time it started and the instruction. It
never ends on a guess: it stays for the instruction's minutes after the area was last listed (10 minutes when
the instruction names none) and until the feed has answered without the area for a full minute; a failed or
malformed answer never counts as "not listed". An end message ("the event has ended") never clears or shortens
it: end messages are recognised by exact title only so that they never raise one. The remote cannot dismiss it (Back still
closes the app) and the rotation waits. An alert in a nearby town shows a quiet line in the bottom-right
corner (bottom-left in Hebrew; three names at most, "и ещё N" for the rest). If the feed cannot be reached three times in a row, the
corner says "Тревоги: нет связи" — and during an alert the alert itself says so, with the time of the last good
answer; the app never claims "all clear". The feed answers only inside Israel. Areas are configured by their
Hebrew names in `js/config.js` (`alerts.areas`, `alerts.nearby`), spelled as in Pikud HaOref's area list (a
test checks every name against a copy of it in `tests/fixtures/oref/`), each with its Russian and Ukrainian name.

## Languages

Русский · עברית · Українська. On the remote, **▼** switches to the next language and **▲** to the previous one
(ru → he → uk → ru); the **yellow** key (the red one if the TV refuses yellow) works like ▼. A short toast names the language
in its own words and every screen changes at once, with no reload; holding ▲ / ▼ never sends a burst of requests — only the
language you land on fetches its news, 0.6 s after the last press. The choice is remembered on the TV (localStorage); `lang`
in the config is only the first start's language, `languages` the order of the switch.

- **News follows the language**: Russian — Israeli news in Russian (NEWSru.co.il); Hebrew — the top Hebrew outlets (Ynet,
  Globes); Ukrainian — news about Ukraine in Ukrainian (Українська правда, Економічна правда). Only the active language's
  two feeds are fetched; a switch fetches the new ones at once (the columns say «Загружаем новости…» until they answer) and
  asks the network for nothing else.
- **Everything else is translated and laid out for the language**: clocks, dates and weekdays, weather words, the Israel
  regions, routes, statuses, the map, the alerts. Hebrew mirrors the whole layout right to left (Israel's clock on the
  right, the forecast bars filling from the right), while times, temperatures and signed figures («+9 שע׳», «−4°») stay
  left to right; the page dots and ◀ ▶ stay physical (◀ is the previous screen, on the left).
- **Alerts**: in Hebrew the alert's own Hebrew words from Pikud HaOref are the main line (nothing translated twice); in
  Russian and Ukrainian the screen's own words, with the Hebrew original under them when the kind is unknown. Areas are
  named in the language.
- Hebrew uses the bundled Noto Sans Hebrew (every Hebrew character in the strings is in it); Ukrainian letters (і, ї, є, ґ,
  ’) are in the bundled Inter.

## Configure

Everything lives in [`js/config.js`](js/config.js): language, screens and rotation, clocks (zones and order),
weather places (the first is the main card), news feeds per language, traffic routes and when they are refreshed
(`traffic.schedule`), the traffic map, alert areas, refresh intervals and burn-in timing. Names on screen are in `js/i18n.js`.

## Build, sign and install on any Samsung TV

You need a Samsung account, the Tizen CLI, and the TV in Developer Mode. The full walk-through, including
how to get Samsung certificates on a Mac and the `install failed[118]` trap, is in
[docs/DEPLOY.md](docs/DEPLOY.md). Short version:

```sh
cp build.local.env.example build.local.env   # fill in CERT_PROFILE, DEVICE_PROFILE, TV (and MAPBOX_TOKEN for traffic)
./build.sh --package                         # build + sign only → .buildResult/HomeDashboard.wgt
./build.sh                                   # build + sign + install on the TV + launch
```

`tools/find-tv.sh` finds the TV again when the router gives it a new address. It never guesses: when
several devices answer, it stops unless `TV_DUID` in `build.local.env` names the TV, and then it installs
only on the device that reports that DUID. `./build.sh` refuses any argument other than `--package` and
`--help` before it builds or connects to anything.

`MAPBOX_TOKEN` (a public token, `pk.…`, from account.mapbox.com) is put into the packaged copy of `js/config.js` only;
the repository keeps the `__MAPBOX_TOKEN__` placeholder and a test pins it. Mapbox's free tier is 100,000 Directions
requests a month; the traffic screen reserves every round before it sends it and stops at 3,000 requests a UTC date
(`Config.traffic.schedule.dailyRequestCap`), so any 31 days stay under 96,000 — see screen 4.

**Owner note (TomTom account; TomTom is no longer used since batch 6, the note is kept for the record).** The routing allowance is shared by every key on the account: another key or app on the
same account spends the same 20,000 items. Do not add prepaid credit or top-ups to the account. The terms behind the
account's "Evaluation" label have not been verified.

## Develop and test

Open `index.html` in desktop Chrome at 1920×1080 for development. Tests use Node 22's built-in runner and
have no dependencies in this repo:

```sh
tests/run.sh                         # unit tests: time zones, weather, news, traffic, alerts, screens, refresh/stale/back-off, i18n (three languages), packaging, build.sh / find-tv.sh
PUPPETEER_CORE_DIR=<dir with puppeteer-core> tests/run.sh --browser   # + every screen in every language and the alert in headless Chrome at 1920×1080
ACORN=<path to acorn> tools/es5-gate.sh                               # every script must parse as ES5
PUPPETEER_CORE_DIR=... node tools/screenshot.mjs                      # regenerate docs/screenshot.png
PUPPETEER_CORE_DIR=... node tools/make-icon.mjs                       # img/icon.svg → img/icon.png (512×423)
```

The browser tests answer Open-Meteo, the news feeds, the alert feed and Mapbox from `tests/fixtures/` (the
recorded or documented shape of each source; the batch-2 news stories in them are invented, the batch-6 ones recorded, the
map image a real traffic-night-v2 picture made smaller); they fail (never skip) without puppeteer-core.

## Roadmap

- Air-raid alerts in Ukraine (needs a token)
- Currency: Bank of Israel and National Bank of Ukraine rates
- Shabbat times and holidays (Hebcal)
- Family birthdays and reminders
- Photo frame mode
- Night mode (dimmer, warmer, clocks only)

## License

MIT © Yaroslav Rudenko. See [LICENSE](LICENSE). The same licence covers the sibling project [Настин кинозал](https://github.com/yaroslavrudenko/nastin-kinozal), an IPTV player for the same TVs.
The bundled Inter font is © The Inter Project Authors, under the SIL Open Font License 1.1
([fonts/OFL.txt](fonts/OFL.txt)).
