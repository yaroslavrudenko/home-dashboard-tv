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
#   TOMTOM_KEY=...         optional: TomTom API key for the Traffic screen; it replaces the placeholder in the
#                          PACKAGED js/config.js only (the repository never holds it). Without it the screen says how
#                          to connect one.
# The sdb server must have local-network access: start it once from a normal terminal
# (`sdb kill-server; sdb connect $TV`), not from tmux. Full story: docs/DEPLOY.md.
set -eu
cd "${0:A:h}"
package_only=0
for arg in "$@"; do
  case "$arg" in
    --package) package_only=1 ;;
    --help|-h) sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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
TOMTOM_KEY=${TOMTOM_KEY:-}
[[ -z "$TOMTOM_KEY" || "$TOMTOM_KEY" =~ '^[A-Za-z0-9]+$' ]] || { echo "TOMTOM_KEY must be letters and digits only; nothing was built" >&2; exit 2; }

rm -rf .buildResult && mkdir .buildResult
cp -R config.xml index.html css js img fonts .buildResult/
rm -f .buildResult/img/icon.svg            # the icon's source; only icon.png is packaged
if [[ -n "$TOMTOM_KEY" ]]; then
  cfg=$(<.buildResult/js/config.js)
  [[ "$cfg" == *"'__TOMTOM_KEY__'"* ]] || { echo "build.sh: the TomTom key placeholder is missing from js/config.js" >&2; exit 2; }
  print -r -- "${cfg//__TOMTOM_KEY__/$TOMTOM_KEY}" > .buildResult/js/config.js
  echo "TomTom key: injected into the package"
else
  echo "TomTom key: not set (the Traffic screen shows how to connect one)"
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
