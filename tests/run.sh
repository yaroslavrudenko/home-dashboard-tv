#!/bin/zsh
# Runs the behaviour suite (tests/*.test.js) with Node 22's built-in test runner.
# Prints one line per test name (ok / not ok), the counts, and exits non-zero on any failure.
#   tests/run.sh                 the whole suite
#   tests/run.sh --junit FILE    also write a JUnit report (per-test names, for by-name regression diffs)
#   tests/run.sh --browser       also run tests/browser/*.test.mjs (layout in headless Chrome; needs
#                                PUPPETEER_CORE_DIR — they fail, never skip, without it); one browser run at a time (exit 3)
#   tests/run.sh --readme-count N   only check that README.md says N tests (its badge and its «Tested and reviewed» row)
# FIX-BATCH-19 2: a FULL run (--browser) that passes also checks README.md's count against the tests it ran — a mismatch
# exits 4 with both numbers, so the count cannot drift again.
# Options combine in any order.
# N4 (batch 5): started by another shell (sh tests/run.sh, bash tests/run.sh), it runs itself again under zsh, before set -u
# and the cd (under sh the zsh-only ${0:A:h} stopped it with no test run and exit 0). A run that reports no tests exits 2
# (NO TESTS RAN); an emptied test file still counts as one passing test in Node 22: the by-name diff catches that.
[ -n "${ZSH_VERSION:-}" ] || exec zsh "$0" "$@"
set -u
cd "${0:A:h}/.."
NODE="${NODE:-/Users/yaroslavr/.nvm/versions/node/v22.22.0/bin/node}"
[[ -x "$NODE" ]] || NODE="$(command -v node)"

# README.md's test count, both places (the badge, the «Tested and reviewed» row), against N: exit 4 with both numbers.
readme_count() {
  local badge row
  badge="$(sed -nE 's/.*tests-([0-9]+)%20passing.*/\1/p' README.md | head -1)"
  row="$(sed -nE 's/.*Tested and reviewed\*\* \| ([0-9]+) automated tests.*/\1/p' README.md | head -1)"
  if [[ "$badge" != "$1" || "$row" != "$1" ]]; then
    echo "README.md says ${badge:-?} tests (badge) and ${row:-?} (Tested and reviewed); the suite ran $1: update README.md" >&2; return 4
  fi
  return 0
}
junit="" browser=0
while (( $# )); do
  case "$1" in
    --junit) junit="${2:-}"; shift 2 ;;
    --browser) browser=1; shift ;;
    --readme-count) readme_count "${2:-}"; exit $? ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

# FIX-BATCH-18 part B / FIX-18B 4 / FIX-18D 2: two browser runs at once hang (headless Chromes fight over the CPU and the
# timeouts fire), so a browser run holds a lock. The lock is a symbolic link whose target IS the runner's pid: `ln -s` makes it
# with the pid in one atomic step and fails when it exists; a second run refuses with exit 3 while the holder lives. A lock
# whose pid is dead is taken over only under a second lock, "$lock.takeover" (made the same way): its holder re-reads the
# lock, and only if it still names that same dead pid removes it and makes its own — so a contender that paused after its
# check can never remove a lock a live run took meanwhile (Codex's FIX-18B repro); a fresh run that wins the path between
# the removal and the new link keeps it (the taker exits 3). A lock or takeover lock without a readable pid is busy: exit 3,
# with how to clear it. DASH_TEST_LOCK overrides the path; DASH_TEST_LOCK_ONLY=<s> holds the lock <s> s and exits 0;
# DASH_TEST_LOCK_PAUSE=<base> stops at two points — after the dead-pid check ("check") and after the takeover's first step
# ("taken") — saying so in <base>.<point>.reached and going on when <base>.<point> exists (tests only: an exact interleaving).
busy() { echo "$1" >&2; exit 3; }
pause_at() { [[ -n "${DASH_TEST_LOCK_PAUSE:-}" ]] || return 0; : > "$DASH_TEST_LOCK_PAUSE.$1.reached"; while [[ ! -e "$DASH_TEST_LOCK_PAUSE.$1" ]]; do sleep 0.05; done; }
if (( browser )); then
  lock="${DASH_TEST_LOCK:-${TMPDIR:-/tmp}/home-dashboard-tv-browser-tests.lock}"
  clear_it="if no browser test run is going, remove it (rm -rf '$lock' '$lock.takeover')"
  # a directory (the old lock form, or anything not ours) is busy: `ln -s` would put the link inside it instead of failing
  [[ -e "$lock" && ! -L "$lock" ]] && busy "the browser test lock $lock has no readable pid: $clear_it"
  if ! ln -s "$$" "$lock" 2>/dev/null; then
    holder="$(readlink "$lock" 2>/dev/null)"
    [[ "$holder" == <-> ]] || busy "the browser test lock $lock has no readable pid: $clear_it"
    kill -0 "$holder" 2>/dev/null && busy "another browser test run is in progress (pid $holder, lock $lock): run the suites one at a time"
    pause_at check
    ln -s "$$" "$lock.takeover" 2>/dev/null || busy "another browser test run is taking over the lock $lock (or a takeover lock was left behind: $clear_it)"
    pause_at taken
    if [[ "$(readlink "$lock" 2>/dev/null)" == "$holder" ]]; then rm -f "$lock"; fi
    if ! ln -s "$$" "$lock" 2>/dev/null; then rm -f "$lock.takeover"; busy "another browser test run took the lock $lock first"; fi
    rm -f "$lock.takeover"
  fi
  trap '[[ "$(readlink "$lock" 2>/dev/null)" == "$$" ]] && rm -f "$lock"' EXIT INT TERM
  if [[ -n "${DASH_TEST_LOCK_ONLY:-}" ]]; then sleep "$DASH_TEST_LOCK_ONLY"; exit 0; fi
fi

files=(tests/*.test.js)
(( browser )) && files+=(tests/browser/*.test.mjs)
if (( ${#files} == 0 )); then echo "no test files found in tests/" >&2; exit 2; fi
echo "node $("$NODE" --version) · ${#files} test files$( (( browser )) && echo ' (with browser layout)')"

reporters=(--test-reporter=tap --test-reporter-destination=stdout)
[[ -n "$junit" ]] && reporters+=(--test-reporter=junit "--test-reporter-destination=$junit")

out="$("$NODE" --test --test-concurrency=4 "${reporters[@]}" "${files[@]}" 2>&1)"
rc=$?
# Per-test lines (top-level tests only) and the summary.
print -r -- "$out" | grep -E '^(not )?ok [0-9]+ - ' | sed -E 's/^(not ok|ok) [0-9]+ - /\1 · /'
print -r -- "$out" | grep -E '^# (tests|pass|fail|cancelled|skipped|todo|duration_ms) '
# Collected nothing = not a pass.
tests="$(print -r -- "$out" | sed -nE 's/^# tests ([0-9]+)$/\1/p')"
if [[ -z "$tests" || "$tests" == "0" ]]; then echo "NO TESTS RAN" >&2; exit 2; fi
if (( rc != 0 )); then
  echo "--- failure details ---"
  print -r -- "$out" | grep -E -A12 '^not ok [0-9]+ - ' | grep -E '^not ok|error:|expected|actual|^\s+[A-Za-z].*: ' | head -200
fi
if (( rc == 0 && browser )); then readme_count "$tests" || exit 4; echo "README.md count: $tests (matches)"; fi
exit $rc
