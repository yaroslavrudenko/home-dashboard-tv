#!/bin/zsh
# Build, sign and install Home Dashboard on a Samsung TV (Tizen 3.0 or newer).
#   ./build.sh             package + sign + install on the TV + launch
#   ./build.sh --package   package + sign only: prints the .wgt path, never touches a TV
# Settings come from build.local.env (git-ignored; copy build.local.env.example):
#   CERT_PROFILE=...       Tizen security profile with your Samsung author + distributor certificates
#   DEVICE_PROFILE=...     device-profile.xml returned by Samsung with the distributor certificate
#   TV=<ip>:26101          the TV's last known address; when it does not answer, tools/find-tv.sh scans the
#                          local network for it (the router can give the TV another address)
# The sdb server must have local-network access: start it once from a normal terminal
# (`sdb kill-server; sdb connect $TV`), not from tmux. Full story: docs/DEPLOY.md.
set -eu
cd "${0:A:h}"
TIZEN=${TIZEN:-~/tizen-studio/tools/ide/bin/tizen}
SDB=${SDB:-~/tizen-studio/tools/sdb}
APP=HomeDash01.Dashboard
STAGE=/home/owner/share/tmp/sdk_tools
package_only=0
[[ "${1:-}" == "--package" ]] && package_only=1
[[ -f ./build.local.env ]] || { echo "build.local.env is missing: copy build.local.env.example and fill it in" >&2; exit 2; }
source ./build.local.env
: "${CERT_PROFILE:?set CERT_PROFILE in build.local.env}"

rm -rf .buildResult && mkdir .buildResult
cp -R config.xml index.html css js img .buildResult/
rm -f .buildResult/img/icon.svg            # the icon's source; only icon.png is packaged

$TIZEN package -t wgt -s "$CERT_PROFILE" -- .buildResult
mv .buildResult/*.wgt .buildResult/HomeDashboard.wgt
echo "signed package: $PWD/.buildResult/HomeDashboard.wgt"
(( package_only )) && exit 0

: "${DEVICE_PROFILE:?set DEVICE_PROFILE in build.local.env}"
TV=$(tools/find-tv.sh "${TV:-}")
# Samsung certificates are honoured only with the matching device profile on the TV;
# without it every install fails with a bare "install failed[118]".
$SDB connect "$TV" >/dev/null
$SDB -s "$TV" push "$DEVICE_PROFILE" "$STAGE/device-profile.xml"
$SDB -s "$TV" push .buildResult/HomeDashboard.wgt "$STAGE/package.wgt"
$SDB -s "$TV" shell 0 vd_appinstall "$APP" "$STAGE/package.wgt"
$SDB -s "$TV" shell 0 was_execute "$APP"
