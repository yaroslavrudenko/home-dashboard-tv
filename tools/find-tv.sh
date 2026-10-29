#!/bin/zsh
# Prints the TV's sdb address (ip:26101). The TV gets its address from the router, so it can change
# between sessions (2026-10-27: 192.168.1.175 → .176). Tries the given address first; when nothing
# answers there, scans the Mac's local /24 network for the Tizen debug port and prints what it finds.
#   tools/find-tv.sh [ip:port]        exit 1 when no TV answers anywhere
set -u
PORT=26101
want="${1:-}"
if [[ -n "$want" ]] && nc -z -G 2 "${want%%:*}" "${want##*:}" 2>/dev/null; then echo "$want"; exit 0; fi
me=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
[[ -z "$me" ]] && { echo "find-tv: the Mac has no local network address" >&2; exit 1; }
net="${me%.*}"
found=$(for i in {1..254}; do (nc -z -G 1 "$net.$i" $PORT 2>/dev/null && echo "$net.$i") & done; wait)
found=$(echo "$found" | grep -v '^$' | sort -t. -k4 -n)
[[ -z "$found" ]] && { echo "find-tv: no TV with the debug port $PORT open on $net.0/24 (is it on, in Developer Mode?)" >&2; exit 1; }
n=$(echo "$found" | wc -l | tr -d ' ')
(( n > 1 )) && echo "find-tv: $n devices answer on port $PORT: $(echo $found | tr '\n' ' ') — using the first" >&2
tv="$(echo "$found" | head -1):$PORT"
[[ -n "$want" && "$tv" != "$want" ]] && echo "find-tv: the TV moved from $want to $tv — update TV= in build.local.env" >&2
echo "$tv"
