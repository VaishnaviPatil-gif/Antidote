#!/usr/bin/env bash
# Antidote+ — on-device runtime verification.
# Prereq: an emulator/device is connected (`adb devices` lists one) and the
# backend is running:  cd backend && .venv/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
set -uo pipefail

ANDROID_HOME="${ANDROID_HOME:-$HOME/AppData/Local/Android/Sdk}"
ADB="$ANDROID_HOME/platform-tools/adb.exe"
APK="android/app/build/outputs/apk/debug/app-debug.apk"
PKG="com.nxyen.antidote"
OUT="${TEMP:-/tmp}/antidote-verify"; mkdir -p "$OUT"

echo "== 0. device present? =="
"$ADB" devices | grep -qw "device" || { echo "NO DEVICE — connect an emulator/phone first"; exit 1; }

echo "== 1. install fresh APK =="
"$ADB" install -r "$APK" || exit 1

echo "== 2. emulator can reach the host backend (10.0.2.2)? =="
"$ADB" shell curl -s -m 5 http://10.0.2.2:8000/health || echo "  (curl may be absent on the image; the app fetch is the real test)"

echo "== 3. clear old logcat, launch app =="
"$ADB" logcat -c
"$ADB" shell am start -n "$PKG/.MainActivity"

echo "== 4. streaming WebView console + network for 90s to $OUT/logcat.txt =="
echo "   --> NOW: in the app go to Snake Identification, upload a snake photo,"
echo "       then exercise Severity, Analytics, Offline Sync, QR Handover, Tracker, Demo Mode."
timeout 90 "$ADB" logcat chromium:V Capacitor:V "Capacitor/Console:V" "*:E" > "$OUT/logcat.txt"

echo "== 5. scan captured log for the failure modes we fixed =="
for pat in "Mixed Content" "ERR_CLEARTEXT" "Access-Control-Allow-Origin" "blocked by CORS" \
           "Uncaught" "TypeError" "React"; do
  n=$(grep -c "$pat" "$OUT/logcat.txt")
  echo "  $pat: $n hit(s)"
done
echo "== 6. confirm the identify call actually fired from the device =="
grep -iE "10.0.2.2:8000/api/(identify|severity)" "$OUT/logcat.txt" || echo "  (none seen — did you upload a photo?)"

echo "Done. Full log: $OUT/logcat.txt"
