# Antidote+ — AI Snakebite Emergency Network

A mobile-first app for rural India that gets a snakebite victim to **treatment**
fast. The differentiator: it routes the victim not to the *nearest* facility, but
to the nearest facility that **actually has anti-snake-venom (ASV) in stock** —
monitors symptoms along the way so the receiving hospital is ready, and now lets
the victim **just talk to it** hands-free.

Trilingual (తెలుగు · हिंदी · English, default Telugu), offline-resilient, ships
as an **Android APK** (Capacitor) and an installable PWA, and is designed at
430px for the phones people actually carry.

Built for the VYNEDAM Talent Hunt 2K26 hackathon by **Team Nxyen** (Reya Doshi ·
Vaishnavi Patil).

---

## The three pillars

1. **Nearest ≠ Equipped.** Stock-aware routing sends the victim past the empty
   PHC to the hospital that actually has antivenom, using a live, timestamped
   inventory — not a hardcoded list.
2. **Talk to it.** A voice assistant (🎤 speak → transcribe → reason → speak
   back) answers first-aid questions *and acts* — "take me to a hospital" opens
   the routing screen; "how many vials are nearby?" is answered from live stock.
3. **Two apps, one backend.** The victim's phone app and a separate **hospital
   staff web dashboard** share one FastAPI backend, so a confirmed case on the
   phone appears on the hospital's incoming-patients board in seconds.

---

## Demo flow (one unbroken loop)

> Tap **"I've been bitten"** → read **First aid** (no tourniquet, immobilise) →
> *(optional)* snake photo → start the **Severity tracker**, mark *blurred
> vision* so severity rises to **severe** → tap **Find antivenom now** → the
> **Routing** screen sends you past the empty *Basti Dawakhana* (0 vials) to
> **Malla Reddy Narayana** (22 vials) → tap **Confirm & alert hospital** → the
> case pops onto the **hospital dashboard's** LIVE incoming board → **SOS**
> relays worsening symptoms + a Maps link to family. Finale: drop signal to show
> the **offline banner** keep everything running.

**Voice path:** from Home → **Voice Assistant** → tap the mic → say *"take me to
a hospital"* / *"how many antivenom vials are nearby?"* / *"which snake is this?"*
— it replies aloud in your language and navigates you to the right screen.

Prevention lives separately behind **Home → Learn**, never in the victim's
emergency path.

---

## Voice assistant pipeline

```
🎤 User speaks
      │  (MediaRecorder → webm/opus)
      ▼
POST /api/voice-chat  ─────────────────────────────┐
      │                                             │  API keys stay server-side
      ├── Sarvam STT (saarika:v2.5, auto-detect) ── │  — the app only talks to
      │        → transcript + language              │  our FastAPI backend
      ▼                                             │
Gemini (2.5 flash-lite): reply text + intent + live hospital data
      │        → { reply, action }                  │
      ├── Sarvam TTS (bulbul:v3, speaker "priya") ──┘
      ▼
🔊 audio + text + action  → app speaks the reply AND navigates on the action
```

- **Intents:** `route_hospital`, `hospital_stock`, `sos`, `identify_snake`,
  `track_symptoms`, `first_aid`, `none`. Navigation intents open the matching
  screen; `hospital_stock` answers with real vial counts and does not navigate.
- **Quota-proof fallback.** Gemini's free tier is ~20 requests/day/model. If it's
  exhausted, the assistant still transcribes (Sarvam), detects the intent by
  keyword, **answers stock questions directly from the live hospital feed**, and
  speaks a matching confirmation — the flow never dead-ends on a canned line.

---

## Tech stack

| Layer        | Choice |
|--------------|--------|
| Victim app   | React 18 + Vite + Tailwind CSS + `lucide-react` + `react-router-dom` v6 |
| Mobile shell | **Capacitor 8** Android APK (`@capacitor/geolocation`, `@capacitor-community/text-to-speech`) |
| Dashboard    | Separate Vite + React app (plain CSS, no Tailwind), own auth |
| State        | One lightweight React Context (`EmergencyContext`) + `localStorage` + IndexedDB |
| Backend      | Thin **FastAPI** service — proxies AI + holds in-memory stores, no database |
| AI (vision)  | Google **Gemini 2.5 Flash-Lite** — snake ID, severity, handover summary, voice brain |
| AI (voice)   | **Sarvam AI** — `saarika:v2.5` STT (in-language) + `bulbul:v3` TTS |
| Maps         | Leaflet + `react-leaflet` + OSRM routing + Haversine distances |
| Auth         | stdlib HMAC-signed opaque tokens (no JWT lib, no DB) |

---

## Project structure

```
Antidote+/
├── index.html                  # Vite entry (Telugu default, safe-area viewport)
├── package.json · vite.config.js · tailwind.config.js · capacitor.config.json
├── android/                    # Capacitor Android project (APK build)
│   └── app/src/main/
│       ├── AndroidManifest.xml # INTERNET · location · RECORD_AUDIO permissions
│       └── res/xml/network_security_config.xml  # cleartext for local API
├── public/                     # PWA manifest + service worker + icons
├── src/                        # ── VICTIM APP ──
│   ├── main.jsx · App.jsx      # Router (lazy routes incl. /assistant) + Shell
│   ├── theme.js · i18n.js      # `C` palette + `T` trilingual strings (shared)
│   ├── context/EmergencyContext.jsx   # shared-state contract + persistence
│   ├── components/             # Shell · TopBar · BottomNav · BackButton · maps …
│   ├── lib/
│   │   ├── api.js · hospitals.js       # AI proxy + live stock feed + submitCase
│   │   ├── gemini.js · image.js        # direct snake-ID (demo) + compression
│   │   ├── ttsService.js               # native first-aid TTS (Capacitor)
│   │   ├── voiceChatService.js         # mic record → /api/voice-chat → playback
│   │   ├── geo.js · risk.js · handover.js · db.js …
│   └── pages/
│       ├── Home.jsx            # Landing + GPS + Voice Assistant + Learn entries
│       ├── FirstAid.jsx        # DO/DON'T + live time-since-bite (native voice)
│       ├── Snake.jsx           # Optional photo → Gemini ID (safe default)
│       ├── Tracker.jsx         # 15-min monitoring loop (medical core)
│       ├── Routing.jsx         # HERO — stock-aware routing + Confirm & alert
│       ├── VoiceAssistant.jsx  # NEW — talk-and-go voice chatbot
│       ├── SOS.jsx             # Family/hospital alert (SMS + Maps link + call)
│       ├── HandoverViewer.jsx  # QR clinician handover (offline)
│       ├── Demo.jsx            # Hackathon demo scenario seeder
│       └── Learn.jsx           # High-risk indicator (prevention)
├── hospital-dashboard/         # ── HOSPITAL STAFF WEB APP (port 5174) ──
│   └── src/
│       ├── auth.jsx · api.js   # login + token, calls shared backend
│       └── pages/ Login · Stock · Cases (LIVE) · Analytics
├── backend/                    # ── SHARED FASTAPI BACKEND (port 8000) ──
│   ├── requirements.txt · .env.example
│   └── app/
│       ├── main.py · config.py · models.py · auth.py · logging_config.py
│       ├── routes/  health · identify · summarize · severity · hospitals
│       │             · auth · cases · voice_chat · test_sarvam
│       └── services/ gemini.py · sarvam.py · hospitals.py · cases.py
├── scripts/android-runtime-verify.sh
└── docs/  JUDGE_CHEATSHEET.md · PROJECT_REVIEW.md · routing-reference.jsx
```

---

## Setup

### Prerequisites
- Node.js 18+
- Python 3.10–3.12
- (APK only) JDK 21 + Android SDK — Capacitor 8 needs a Java 21 toolchain

### 1. Backend (shared by both apps)
```bash
cd backend
python -m venv .venv
# Windows:  .\.venv\Scripts\activate      macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env         # paste GEMINI_API_KEY + SARVAM_API_KEY
uvicorn app.main:app --reload --port 8000
```
With **no `GEMINI_API_KEY`** the backend runs in safe-fallback mode (identify →
"assume venomous", summarize/severity → local sentence). With **no
`SARVAM_API_KEY`** the voice assistant is disabled; everything else is unaffected.

### 2. Victim app
```bash
npm install
npm run dev                  # http://localhost:5173  (proxies /api → :8000)
npm run build                # → dist/
```

### 3. Hospital dashboard
```bash
cd hospital-dashboard
npm install
npm run dev                  # http://localhost:5174  (proxies /api → :8000)
```
Demo logins (username / password): `mrn`/`mrn123`, `gandhi`/`gandhi123`,
`slg`/`slg123`, `reach`/`reach123`, `arundathi`/`arun123`, `basti`/`basti123`,
and `admin`/`admin123` (District Health Office — sees every facility).

### 4. Android APK
```bash
npm run build && npx cap sync android
npx cap open android         # build/run from Android Studio
```
> **Phone → laptop backend:** the APK's `localhost:8000` is the *phone's* own
> localhost. Bridge it over USB with `adb reverse tcp:8000 tcp:8000`, or set
> `VITE_API_BASE=http://<laptop-LAN-IP>:8000` and rebuild (cleartext is already
> allowed via `network_security_config.xml`).

---

## API documentation

Interactive docs (backend running): `http://localhost:8000/docs`.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET  | `/health` | — | Liveness + whether Gemini is configured |
| POST | `/api/identify` | — | Snake photo → species (safety-first fallback) |
| POST | `/api/summarize` | — | Monitoring log → one clinician handover sentence |
| POST | `/api/severity` | — | Symptoms → triage severity (Gemini or fallback) |
| GET  | `/api/hospitals` | — | Live timestamped antivenom inventory |
| POST | `/api/hospitals/{id}/stock` | 🔒 hospital | Update vials/beds (own facility; admin = all) |
| POST | `/api/auth/login` | — | Hospital staff login → token |
| GET  | `/api/auth/me` | 🔒 | Validate token → identity |
| POST | `/api/cases` | — | **Victim app → alert a hospital** of an incoming patient |
| GET  | `/api/cases` | 🔒 hospital | Staff read their scoped incoming patients |
| POST | `/api/voice-chat` | — | Audio → STT → Gemini → TTS → `{transcript, ai_response, audio, action}` |
| POST | `/api/tts` · `/api/stt` | — | Standalone Sarvam text-to-speech / speech-to-text |

Cross-hospital stock edits are rejected with **403**; a victim's `POST /api/cases`
is public by design (the victim is not a hospital user).

---

## Architecture notes

- **One state contract.** `EmergencyContext` holds `language, biteTime,
  victimLocation, snake, severity, symptomLog, emergencyContacts,
  recommendedHospital`. Routing reads `victimLocation` + `severity`, writes back
  the chosen hospital; SOS, the handover, and the voice assistant consume it.
- **The app↔dashboard bridge.** "Confirm & alert hospital" POSTs a case; the
  dashboard's **Cases** page polls every 4s (pulsing **LIVE** badge) so it
  appears without a refresh.
- **Offline-first & honest.** Core flow runs from local state; stock shows a
  **live → cached → seeded** source badge, never fake "live" data; SOS queues
  offline and auto-sends on reconnect.
- **Safety defaults everywhere.** Low-confidence snake ID → assume venomous;
  backend down → local summary; Gemini over quota → keyword intent + data-backed
  stock answers.
- **Keys never leave the server.** `GEMINI_API_KEY` / `SARVAM_API_KEY` /
  `AUTH_SECRET` live only in `backend/app/config.py`.

---

## Known limits (hackathon build)

- **Gemini free tier ≈ 20 requests/day/model.** Shared across snake ID,
  severity, and voice. `gemini-2.5-flash-lite` has a separate bucket; for a busy
  demo, enable billing on the key (or rotate keys). The voice assistant degrades
  gracefully when exhausted.
- **Voice input format.** The browser/WebView records `webm/opus`; Sarvam's SDK
  whitelists it, but verify on the first live mic tap.
- **In-memory stores.** Cases and stock live in memory (+ a JSON snapshot); a
  backend restart reseeds them. Fine for a demo, not production.
- Hospital coordinates near Malla Reddy University (Maisammaguda, Hyderabad) come
  from the team's field survey; a couple are approximate (`~`) pins.

---

## Verification

- `npm run build` (victim app) and `hospital-dashboard/ npm run build` compile.
- Backend: `uvicorn` smoke test exercises `/health`, `/api/hospitals`,
  `/api/auth/login`, scoped `/api/cases` (POST→GET), `/api/severity`, and the
  full `/api/voice-chat` loop (STT → intent → TTS).
