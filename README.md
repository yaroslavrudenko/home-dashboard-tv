# Home Dashboard for Samsung TV

A calm family dashboard for a Samsung Smart TV: the time in Israel, Ukraine and Sydney, the weather at home,
the news, the traffic, and the Israel Home Front Command alerts, in one glance from the sofa. Switch the TV on,
open the app, and leave it running.

![Home Dashboard at 1920×1080](docs/screenshot.png)

It is a real installed **Tizen web app** (a signed `.wgt` package), not a web page: the TV's browser is
slow and limited, while an installed app starts instantly, keeps the screen on and exits with Back.
It runs on Samsung Tizen TVs from 2017 on (Tizen 3.0 or newer; 2016 models run Tizen 2.x and refuse the
package). The oldest target is a 2017 UE50MU7000 (Tizen 3.0, Chromium 47), so the code is plain ES5 with
no framework, no bundler and no backend. The typeface, [Inter](https://rsms.me/inter/), ships inside the
app (static Light / Regular / Medium, Latin + Cyrillic, about 96 KB), so the TV shows the same type as the
screenshot instead of whatever system font it has.

## What it shows

Three screens, switched with the remote's ◀ ▶ and shown in turn every 45 seconds (page dots at the bottom
mark the current one). Any key pauses the rotation for two minutes; `rotation.enabled: false` in the config
turns it off. A screen that is not on view keeps its content and costs nothing: it is redrawn when it comes in.

**1 · Home**

- **World clocks**: Israel (Asia/Jerusalem), Ukraine (Europe/Kyiv) and Sydney (Australia/Sydney), in 24-hour
  time with the weekday, the date, the difference to Israel and each city's current temperature. A card is
  tinted for the night from that city's sunrise and sunset.
- **Weather** for Rehovot from [Open-Meteo](https://open-meteo.com/) (free, no API key): temperature, feels-like,
  condition, wind, humidity, today's high/low, chance of rain, sunrise/sunset, a 12-hour strip and a 7-day list.
- **Status**: "Updated at HH:MM". When a refresh fails, the last good data stays on screen and is marked as
  not updating, with the time it is from; every temperature from that data (the main card and each clock
  card) is dimmed and carries a small amber dot. With no data at all, the weather card says so once, with
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
- **Languages**: Russian (default) and English. Hebrew and Ukrainian slots are ready in `js/i18n.js`.

**2 · News**: the latest story large across the top, the next headlines below in rows of two, from three
Russian-language feeds: [NEWSru.co.il](https://www.newsru.co.il/info/rss) "Важные новости" (Israel),
[Українська правда, Russian edition](https://www.pravda.com.ua/rus/rss/) and
[BBC News Русская служба](https://feeds.bbci.co.uk/russian/rss.xml). Vesti (vesty.co.il) publishes no live
feed: every `/Integration/StoryRss*.xml` there is weeks old, so NEWSru.co.il stands in for Israel. All three
come in one parallel round every 10 minutes; stories are merged newest first, a story two feeds carry is
shown once, and feed text is reduced to plain text (no feed HTML ever reaches the screen). Headlines are
never cut: a long lead headline steps down in size and drops its summary, and when the headlines below are
long, fewer rows are shown. A feed that fails keeps its last stories and is named in the status line.

**3 · Traffic**: travel time now and without traffic from Rehovot to Tel Aviv (Azrieli), Rishon LeZion and
Jerusalem, with a soft green / amber / red delay chip and a time bar, plus a congestion line for the Ayalon
and Routes 4, 1 and 6. It comes from the [TomTom Routing API](https://developer.tomtom.com/routing-api) in
ONE batch request (summaries only), every 15 minutes, and every 5 while you keep the screen on view after
choosing it with ◀ ▶ (a rotation visit does not refresh it: quota). A failed round retries after 4½–15 minutes;
a refused key (403) or today's used-up limit (429) is said on the screen and waits the regular 15 minutes. It
needs a free TomTom key (see Build); without one the screen says how to connect it and sends nothing. The
client is written against TomTom's documented answers and tested on them; it has not yet run against a live key.

**Israel alerts (all screens)**: the [Home Front Command](https://www.oref.org.il/) alert feed is read every
5 seconds (one request at a time, 4-second timeout). When an alert covers Rehovot, a deep-red full-screen
notice appears over everything: the kind of alert, the area, the time it started and the instruction. It
never ends on a guess: it stays for the instruction's minutes after the area was last listed (10 minutes when
the instruction names none) and until the feed has answered without the area for a full minute; a failed or
malformed answer never counts as "not listed". Only Pikud HaOref's own end message for the area ("the event
has ended", "you may leave the protected space") clears it sooner. The remote cannot dismiss it (Back still
closes the app) and the rotation waits. An alert in a nearby town shows a quiet line in the bottom-right
corner (three names at most, "и ещё N" for the rest). If the feed cannot be reached three times in a row, the
corner says "Тревоги: нет связи" — and during an alert the alert itself says so, with the time of the last good
answer; the app never claims "all clear". The feed answers only inside Israel. Areas are configured by their
Hebrew names in `js/config.js` (`alerts.areas`, `alerts.nearby`), spelled as in Pikud HaOref's area list (a
test checks every name against a copy of it in `tests/fixtures/oref/`).

## Configure

Everything lives in [`js/config.js`](js/config.js): language, screens and rotation, clocks (zones and order),
weather places (the first is the main card), news feeds, traffic routes and roads, alert areas, refresh
intervals and burn-in timing. Names on screen are in `js/i18n.js`.

## Build, sign and install on any Samsung TV

You need a Samsung account, the Tizen CLI, and the TV in Developer Mode. The full walk-through, including
how to get Samsung certificates on a Mac and the `install failed[118]` trap, is in
[docs/DEPLOY.md](docs/DEPLOY.md). Short version:

```sh
cp build.local.env.example build.local.env   # fill in CERT_PROFILE, DEVICE_PROFILE, TV (and TOMTOM_KEY for traffic)
./build.sh --package                         # build + sign only → .buildResult/HomeDashboard.wgt
./build.sh                                   # build + sign + install on the TV + launch
```

`tools/find-tv.sh` finds the TV again when the router gives it a new address. It never guesses: when
several devices answer, it stops unless `TV_DUID` in `build.local.env` names the TV, and then it installs
only on the device that reports that DUID. `./build.sh` refuses any argument other than `--package` and
`--help` before it builds or connects to anything.

`TOMTOM_KEY` (letters and digits, from developer.tomtom.com) is put into the packaged copy of
`js/config.js` only; the repository keeps the `__TOMTOM_KEY__` placeholder and a test pins it. The free tier
allows 2,500 routing requests a day and each refresh counts 7 (3 routes + 4 roads): about 670 a day with the
rotation on, about 2,000 if the traffic screen stays on view all day, and at most about 2,240 on the worst day
(retries included) — a test simulates those days and fails if a change would cross 2,500. Remove roads from the
config to use less.

## Develop and test

Open `index.html` in desktop Chrome at 1920×1080 for development. Tests use Node 22's built-in runner and
have no dependencies in this repo:

```sh
tests/run.sh                         # unit tests: time zones, weather, news, traffic, alerts, screens, refresh/stale/back-off, i18n, packaging, build.sh / find-tv.sh
PUPPETEER_CORE_DIR=<dir with puppeteer-core> tests/run.sh --browser   # + every screen and the alert in headless Chrome at 1920×1080
ACORN=<path to acorn> tools/es5-gate.sh                               # every script must parse as ES5
PUPPETEER_CORE_DIR=... node tools/screenshot.mjs                      # regenerate docs/screenshot.png
PUPPETEER_CORE_DIR=... node tools/make-icon.mjs                       # img/icon.svg → img/icon.png (512×423)
```

The browser tests answer Open-Meteo, the news feeds, the alert feed and TomTom from `tests/fixtures/` (the
recorded shape of each source; the news stories in them are invented) and fail (never skip) without
puppeteer-core.

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
