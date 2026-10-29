#!/bin/zsh
# ES5 gate: every app script must parse as ECMAScript 5 (the 2017 TVs run Chromium 47).
#   ACORN=/path/to/node_modules/.bin/acorn tools/es5-gate.sh      (or an `acorn` on PATH)
# Prints one line per file and exits 1 if any file is not ES5, 2 if acorn is missing.
set -u
cd "${0:A:h}/.."
ACORN="${ACORN:-$(command -v acorn || true)}"
[[ -x "$ACORN" ]] || { echo "es5-gate: acorn not found (set ACORN=...)" >&2; exit 2; }
bad=0 n=0
for f in js/*.js; do
  n=$((n + 1))
  if "$ACORN" --ecma5 --silent "$f"; then echo "ES5 ok   $f"; else echo "NOT ES5  $f"; bad=$((bad + 1)); fi
done
(( n == 0 )) && { echo "es5-gate: no files checked" >&2; exit 2; }
echo "$n files, $bad not ES5"
(( bad == 0 ))
