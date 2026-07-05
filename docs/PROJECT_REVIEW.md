# Antidote+ — Production Review

_Release readiness review. Code-quality only; no functionality or UI changed._

---

## 1. Architecture overview

**Frontend** — React 18 + Vite SPA, mobile-first at 430px.

- **Routing & shell.** `App.jsx` defines lazy-loaded routes in two layout groups:
  a shared `Shell` (top bar + bottom nav + offline banner, 430px frame) for the
  flow screens, and a full-bleed `/routing` hero rendered outside the shell so
  its self-contained design stays untouched.
- **State.** One `EmergencyContext` is the single source of truth (the §3
  contract: `language, biteTime, victimLocation, snake, severity, symptomLog,
  emergencyContact, recommendedHospital`). It persists to `localStorage` so the
  emergency survives reloads / lost signal. Each screen reads/writes only its
  slice via intention-revealing setters.
- **Shared logic in `src/lib/`.** `handover.js` (summary + alert message +
  vials), `risk.js` (transparent risk model), `api.js` (graceful backend
  client). Screens stay thin; cross-cutting logic is centralised and reused by
  Tracker, SOS, Hospital and Learn.
- **Design tokens.** `theme.js` (`C` palette) and `i18n.js` (`T` trilingual
  strings) are the one source for colour and copy across the app.

**Backend** — thin FastAPI proxy (`backend/app/`), layered:

```
routes/ (HTTP)  →  services/gemini.py (integration)  →  Gemini 1.5 Flash
config.py (settings/secret)   models.py (Pydantic)   logging_config.py (JSON)
```

Its only job is to keep `GEMINI_API_KEY` server-side. No database, no business
logic beyond safe fallbacks. Endpoints: `GET /health`, `POST /api/identify`,
`POST /api/summarize`.

**Data flow (one loop):** Home stamps `biteTime`+`victimLocation` → First Aid →
optional Snake (`/api/identify` → `snake`) → Tracker (15-min loop → `severity` +
`symptomLog` + `/api/summarize`) → Routing (reads `victimLocation`+`severity`,
writes `recommendedHospital`) → SOS (builds the alert from context) → Hospital
view (mirrors the same handoff).

---

## 2. Feature checklist

| Module | Status | Notes |
|--------|:--:|-------|
| Shared theme + i18n (te/hi/en) | ✅ | Extracted, imported everywhere |
| EmergencyContext + persistence | ✅ | localStorage, slice setters |
| App shell + bottom nav + offline banner | ✅ | Lazy routes, reduced-motion, focus rings |
| Home / emergency landing | ✅ | GPS + manual fallback, Learn entry |
| First aid (DO/DON'T, live timer) | ✅ | Spec copy verbatim |
| Snake photo (optional) | ✅ | Safe assume-venomous default |
| **Severity tracker** | ✅ | 15-min loop, transparent rules, trend, summary |
| **Routing (hero)** | ✅ | Reads context, writes recommendedHospital; UI/algorithm unchanged |
| SOS / family alert | ✅ | Context-built editable message, simulated send, offline queue |
| Hospital incoming view | ✅ | One read-only screen |
| Risk indicator (prevention) | ✅ | Behind Home→Learn, no AI |
| FastAPI Gemini proxy | ✅ | 3 endpoints, key server-side, graceful fallbacks |
| Frontend ↔ backend integration | ✅ | `src/lib/api.js`, graceful degradation |
| Help tab content | ⚠️ | Routes to a placeholder — intentionally out of MVP scope |

**Quality-pass results:** no `console.*` statements; no commented-out/dead code
blocks; unused imports removed (`Languages`/`ChevronRight`/`ArrowRight` in
Routing, `SEVERITY_PALE` in SOS); unused `resetEmergency` context method removed;
naming consistent (`*.jsx` screens in `pages/`, shared logic in `lib/`,
camelCase context keys matching the §3 contract).

---

## 3. Known limitations

- **Help nav tab** renders the dev `Placeholder` (a loading state). It is a nav
  affordance with no MVP screen behind it — left as-is to avoid adding a feature.
- **SOS send is simulated** by design (demo-safe; no SMS/WhatsApp/phone APIs).
- **AI paths verified in safe-fallback mode only.** Without a `GEMINI_API_KEY`,
  `/api/identify` returns "assume venomous" and `/api/summarize` returns the
  local sentence. The live Gemini path is wired and contract-tested but not
  exercised end-to-end here (no key in CI).
- **Seeded demo data.** Hospital inventory, distances, the manual-location
  districts and the `DEMO_RECOMMENDED` fallback are seeded; there is no live
  stock feed. The Marpally auto-fallback is gated behind `DEMO_MODE`.
- **Offline hospital stock** (§2.9) is described conceptually; the routing screen
  shows seeded "stock updated" ages rather than a real cached-with-timestamp
  fetch layer.
- **Intentional duplication:** the summary composer exists in both JS
  (`handover.js`) and Python (`gemini.py`) so offline parity holds across client
  and server; `C`/`T` are duplicated inline in `Routing.jsx` to keep the hero
  untouched. Both are deliberate, documented trade-offs.
- **No automated test suite** (verification is build + compile + smoke tests).
- **Original `Antidoteplus_routing.jsx`** remains at the repo root as a reference;
  it is not imported by the build (the app uses `src/pages/Routing.jsx`).
- **Python 3.13+** may lack prebuilt wheels for some pinned deps; 3.10–3.12 is
  the tested range.

---

## 4. Security considerations

- **Secret isolation.** `GEMINI_API_KEY` is read only in `backend/app/config.py`,
  never serialised to a response, never logged (structured logging redacts by
  omission — no key, no raw image bytes).
- **No raw error leakage.** `/api/identify` swallows provider exceptions and
  returns the safe default; clients never see upstream error text.
- **CORS** is restricted to configured origins (`ALLOWED_ORIGINS`), not `*`.
- **Input validation** via Pydantic models on every request body.
- **Client storage.** Emergency data lives in `localStorage` only (on-device,
  unencrypted) — acceptable for an offline-first demo; for production consider
  scoping retention and clearing after resolution.
- **Production hardening (recommended, not in MVP):** request-size limits on the
  base64 image upload, rate limiting / abuse protection on the AI endpoints,
  HTTPS termination, and secret management via a vault rather than `.env`.

---

## 5. Performance notes

- **Code-splitting:** every screen is a lazy chunk. Main bundle ≈ **68.9 kB
  gzip**; per-screen chunks 0.5–8.8 kB gzip (Routing the largest at ~8.8 kB).
- **Timers:** 1-second intervals (First Aid, Tracker, SOS, Hospital) are cheap
  and cleaned up on unmount; the tracker countdown is derived from a persisted
  timestamp, not a running timer.
- **Summary regeneration** fires only when a check is appended (log length
  change), not on every tick; the network call falls back instantly to local.
- **Persistence:** one small `localStorage` write per context change.
- **Backend** is stateless; the only latency is the Gemini call, and every path
  has an instant deterministic fallback.
- **Motion** honours `prefers-reduced-motion` globally.

**Accessibility:** visible `:focus-visible` rings, `aria-label`s on icon-only
buttons, `role="status"` on the offline banner, `sr-only` labels on inputs,
16px base text, ≥48px tap targets, `<html lang>` synced to the active language.

---

## 6. Future improvements (v2)

- Real hospital stock integration (ASHA-worker live updates / inventory feed).
- SMS/WhatsApp gateway for the SOS (replace the simulated send).
- Installable PWA + service-worker for true offline caching and a real
  cached-with-timestamp stock view.
- Reverse-geocoding for manual location entry (replace seeded districts).
- A real Help screen and an automated test suite (unit + e2e).
- Backend hardening: rate limiting, upload-size caps, observability.
- Live Gemini validation harness and prompt evaluation.

---

## 7. Verification (this review)

| Check | Result |
|-------|:--:|
| `npm run build` | ✅ passes (all chunks emitted) |
| Backend `py_compile` | ✅ clean |
| Backend live start (`uvicorn`) + `/health` | ✅ 200 OK |
| `/api/identify`, `/api/summarize` (safe-fallback) | ✅ 200, correct shapes |
| Broken imports / dangling refs | ✅ none |
| `console.*` / dead code | ✅ none |
| All routes resolve | ✅ (Help → placeholder, by design) |
