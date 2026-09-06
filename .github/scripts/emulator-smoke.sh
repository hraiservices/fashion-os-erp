#!/usr/bin/env bash
# Smoke test for the packaged Android app, run inside a booted emulator by
# .github/workflows/android-build.yml.
#
# This exists because the shell loads a REMOTE url (capacitor.config.ts → server.url), so
# "the Gradle build succeeded" says nothing about whether the app actually renders or even
# opens. It notably would not have caught the net::ERR_FAILED that shipped in the first build.
#
# Note what this does and does not prove: the emulator hits the real, deployed
# app.fashionflow.app, so it validates whatever is live at that moment — not the code in the
# branch being tested. It is a check on the shell plus production together.
set -uo pipefail

PKG=app.fashionflow.mobile
OUT=artifacts
mkdir -p "$OUT"

launch() {
  adb shell am start -n "$PKG/.MainActivity" \
    -a android.intent.action.MAIN -c android.intent.category.LAUNCHER > /dev/null
}

echo "::group::Install"
adb install -r apk/app-debug.apk
echo "::endgroup::"

adb logcat -c

echo "::group::First launch"
launch
# The WebView has to do DNS + TLS + a full Next.js page load over the emulator's NAT, which is
# slower than a real device on wifi; be generous rather than screenshotting a blank frame.
sleep 30
adb exec-out screencap -p > "$OUT/01-first-launch.png"
echo "::endgroup::"

echo "::group::Force-stop and reopen"
# The exact reported failure: the app worked once, then refused to open again. A force-stop is
# what "swipe it away from recents" does, so this reproduces that path rather than a warm resume.
adb shell am force-stop "$PKG"
sleep 5
launch
sleep 30
adb exec-out screencap -p > "$OUT/02-after-reopen.png"
echo "::endgroup::"

echo "::group::Drive the WebView over CDP"
# A debug APK is debuggable, so Capacitor turns on WebView contents debugging — that exposes a
# devtools socket we can forward and drive with a real automation client. Far more reliable than
# blind coordinate taps, and it lets us assert on the DOM instead of eyeballing screenshots.
SOCKET=$(adb shell cat /proc/net/unix | grep -o "webview_devtools_remote_[0-9]*" | head -1)
if [ -n "$SOCKET" ]; then
  echo "Forwarding $SOCKET"
  adb forward tcp:9222 "localabstract:$SOCKET"
  node .github/scripts/webview-ui-check.mjs || UI_FAILED=1
else
  echo "::warning::No WebView devtools socket found — skipping the UI audit"
fi
echo "::endgroup::"

adb logcat -d > "$OUT/logcat.txt"

FAILED=${UI_FAILED:-0}

# 1. The process must still be alive — a crash or a dead WebView both show up here.
if adb shell pidof "$PKG" > /dev/null 2>&1; then
  echo "PASS: app is still running after reopen"
else
  echo "::error::App is not running after being force-stopped and relaunched"
  FAILED=1
fi

# 2. No hard network failure. ERR_FAILED is the specific sticky, unrecoverable one this test was
#    written for; other net::ERR_* codes are printed for context but are not treated as fatal,
#    since a single failed beacon or favicon shouldn't fail the build.
if grep -q "ERR_FAILED" "$OUT/logcat.txt"; then
  echo "::error::WebView reported net::ERR_FAILED — the app failed to load"
  grep -n "ERR_FAILED" "$OUT/logcat.txt" | head -10
  FAILED=1
else
  echo "PASS: no net::ERR_FAILED in logcat"
fi

if grep -qE "net::ERR_" "$OUT/logcat.txt"; then
  echo "Other network errors seen (informational):"
  grep -oE "net::ERR_[A-Z_]+" "$OUT/logcat.txt" | sort | uniq -c
fi

# 3. The offline fallback should NOT be showing — if it is, the remote site never loaded.
if grep -q "Can.t reach Fashion Flow" "$OUT/logcat.txt"; then
  echo "::warning::The bundled offline error page appears to have been shown"
fi

echo "Screenshots and logcat saved to $OUT/"
exit $FAILED
