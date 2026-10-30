#!/bin/zsh
# Build, sign and install Home Dashboard on a Samsung TV (Tizen 3.0 or newer).
#   ./build.sh             package + sign + install on the TV + launch
#   ./build.sh --package   package + sign only: prints the .wgt path, never touches a TV
#   ./build.sh --help      this text
# Any other argument is refused before anything runs (a typo must never fall through to an install).
# Settings come from build.local.env (git-ignored; copy build.local.env.example):
#   CERT_PROFILE=...       Tizen security profile with your Samsung author + distributor certificates
#   DEVICE_PROFILE=...     device-profile.xml returned by Samsung with the distributor certificate
#   TV=<ip>:26101          the TV's last known address; when it does not answer, tools/find-tv.sh scans the
#                          local network for it (the router can give the TV another address)
#   TV_DUID=...            optional: the TV's DUID (`sdb shell 0 getduid`); when set, find-tv.sh installs only
#                          on the device that reports it
#   MAPBOX_TOKEN=...       optional: Mapbox public token (pk.…) for the Traffic screen; it replaces the placeholder
#                          in the PACKAGED js/config.js only (the repository never holds it). Without it the screen
#                          says how to connect one.
#   HOME_CITY=...          optional: the home city's id in js/cities.js (e.g. haifa) for a TV in another city; it
#                          replaces 'rehovot' in the PACKAGED js/config.js only. A city chosen on the TV (the OK key)
#                          wins over it.
# The sdb server must have local-network access: start it once from a normal terminal
# (`sdb kill-server; sdb connect $TV`), not from tmux. Full story: docs/DEPLOY.md.
set -eu
cd "${0:A:h}"
package_only=0
for arg in "$@"; do
  case "$arg" in
    --package) package_only=1 ;;
    --help|-h) sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "build.sh: unknown argument '$arg' (use --package or --help); nothing was built or installed" >&2; exit 2 ;;
  esac
done
TIZEN=${TIZEN:-~/tizen-studio/tools/ide/bin/tizen}
SDB=${SDB:-~/tizen-studio/tools/sdb}
APP=HomeDash01.Dashboard
STAGE=/home/owner/share/tmp/sdk_tools
[[ -f ./build.local.env ]] || { echo "build.local.env is missing: copy build.local.env.example and fill it in" >&2; exit 2; }
source ./build.local.env
: "${CERT_PROFILE:?set CERT_PROFILE in build.local.env}"
MAPBOX_TOKEN=${MAPBOX_TOKEN:-}
[[ -z "$MAPBOX_TOKEN" || "$MAPBOX_TOKEN" =~ '^pk\.[A-Za-z0-9._-]+$' ]] || { echo "MAPBOX_TOKEN must be a public token (pk. then letters, digits, . _ -); nothing was built" >&2; exit 2; }
HOME_CITY=${HOME_CITY:-}
if [[ -n "$HOME_CITY" ]]; then
  [[ "$HOME_CITY" =~ '^[a-z]+$' ]] || { echo "HOME_CITY must be a city id from js/cities.js (lower-case letters only); nothing was built" >&2; exit 2; }
  # exactly one entry in the city list (Cities.list; a route destination in Cities.pois is not a city)
  (( $(sed -n '/^  list: \[/,/^  \],/p' js/cities.js | grep -c "{ id: '$HOME_CITY',") == 1 )) || { echo "HOME_CITY '$HOME_CITY' is not a city in js/cities.js; nothing was built" >&2; exit 2; }
fi

rm -rf .buildResult && mkdir .buildResult
cp -R config.xml index.html css js img fonts sounds .buildResult/
rm -f .buildResult/img/icon.svg            # the icon's source; only icon.png is packaged
if [[ -n "$MAPBOX_TOKEN" ]]; then
  cfg=$(<.buildResult/js/config.js)
  [[ "$cfg" == *"'__MAPBOX_TOKEN__'"* ]] || { echo "build.sh: the Mapbox token placeholder is missing from js/config.js" >&2; exit 2; }
  print -r -- "${cfg//__MAPBOX_TOKEN__/$MAPBOX_TOKEN}" > .buildResult/js/config.js
  echo "Mapbox token: injected into the package"
else
  echo "Mapbox token: not set (the Traffic screen shows how to connect one)"
fi
if [[ -n "$HOME_CITY" ]]; then
  cfg=$(<.buildResult/js/config.js)
  sentinel="  homeCity: 'rehovot',"
  n=$(grep -c "^$sentinel" .buildResult/js/config.js || true)
  (( n == 1 )) || { echo "build.sh: the homeCity line is missing from js/config.js (found $n); nothing was built" >&2; exit 2; }
  print -r -- "${cfg/$sentinel/  homeCity: '$HOME_CITY',}" > .buildResult/js/config.js
  echo "Home city: $HOME_CITY"
fi

$TIZEN package -t wgt -s "$CERT_PROFILE" -- .buildResult
mv .buildResult/*.wgt .buildResult/HomeDashboard.wgt
echo "signed package: $PWD/.buildResult/HomeDashboard.wgt"
(( package_only )) && exit 0

: "${DEVICE_PROFILE:?set DEVICE_PROFILE in build.local.env}"
TV=$(TV_DUID="${TV_DUID:-}" SDB="$SDB" tools/find-tv.sh "${TV:-}")
# Samsung certificates are honoured only with the matching device profile on the TV;
# without it every install fails with a bare "install failed[118]".
$SDB connect "$TV" >/dev/null
$SDB -s "$TV" push "$DEVICE_PROFILE" "$STAGE/device-profile.xml"
$SDB -s "$TV" push .buildResult/HomeDashboard.wgt "$STAGE/package.wgt"
$SDB -s "$TV" shell 0 vd_appinstall "$APP" "$STAGE/package.wgt"
$SDB -s "$TV" shell 0 was_execute "$APP"
