#!/bin/zsh
# Prints the TV's sdb address (ip:26101). The TV gets its address from the router, so it can change
# between sessions (2026-10-27: 192.168.1.175 → .176). Tries the given address first; when nothing
# answers there, scans the Mac's local /24 network for the Tizen debug port.
#   tools/find-tv.sh [ip:port]
#   TV_DUID=<duid>   only a device that reports this DUID (`sdb shell 0 getduid`, read-only) is accepted;
#                    set it in build.local.env so a second TV in Developer Mode can never get the install
#   SDB=<path>       the sdb binary (default ~/tizen-studio/tools/sdb)
# Exit 1 (nothing printed) when no TV answers, when several devices answer and TV_DUID cannot tell them
# apart, or when no device reports TV_DUID. It never guesses.
set -u
PORT=26101
SDB="${SDB:-$HOME/tizen-studio/tools/sdb}"
want="${1:-}"
duid="${TV_DUID:-}"

# Is the device at $1 (ip:port) the intended TV? Without TV_DUID any open debug port qualifies.
is_ours() {
  [[ -z "$duid" ]] && return 0
  "$SDB" connect "$1" >/dev/null 2>&1 || return 1
  [[ "$("$SDB" -s "$1" shell 0 getduid 2>/dev/null | tr -d '[:space:]')" == "$duid" ]]
}

if [[ -n "$want" ]] && nc -z -G 2 "${want%%:*}" "${want##*:}" 2>/dev/null && is_ours "$want"; then echo "$want"; exit 0; fi

me=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
[[ -z "$me" ]] && { echo "find-tv: the Mac has no local network address" >&2; exit 1; }
net="${me%.*}"
found=$(for i in {1..254}; do (nc -z -G 1 "$net.$i" $PORT 2>/dev/null && echo "$net.$i") & done; wait)
found=(${(f)"$(echo "$found" | grep -v '^$' | sort -t. -k4 -n)"})
(( ${#found} == 0 )) && { echo "find-tv: no TV with the debug port $PORT open on $net.0/24 (is it on, in Developer Mode?)" >&2; exit 1; }

ours=()
for ip in $found; do is_ours "$ip:$PORT" && ours+=("$ip:$PORT"); done
if (( ${#ours} == 0 )); then
  echo "find-tv: ${#found} device(s) answer on port $PORT ($found), none reports TV_DUID=$duid" >&2; exit 1
fi
if (( ${#ours} > 1 )); then
  echo "find-tv: ${#ours} devices answer on port $PORT (${ours[*]}); set TV_DUID in build.local.env to choose one" >&2; exit 1
fi
tv="${ours[1]}"
[[ -n "$want" && "$tv" != "$want" ]] && echo "find-tv: the TV moved from $want to $tv — update TV= in build.local.env" >&2
echo "$tv"
