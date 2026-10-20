# SceneSync — Fire TV AI Watch-Party Companion

> **"Catch up together. Never spoil the moment."**

SceneSync is a Fire TV-first AI watch-party companion application that enables friends and families watching a TV series at different speeds to discuss the show safely, without spoiling it for the least-progressed participant.

---

## 1. System Architecture

```
┌────────────────────────────────┐         ┌───────────────────────────────────────────────┐
│ Chrome-Compatible Extension    │         │          Amazon Fire TV Application           │
│  - Manifest V3 Service Worker  │         │   - Native Fire OS APK (Android TV Leanback)  │
│  - Streaming Adapters (Netflix,│         │   - 10-Foot 1920x1080 Remote Navigation UI    │
│    Prime, JioHotstar, Fallback)│         │   - Active Extension & Phone Member Roster    │
│  - Side Panel & Popup UI       │         └──────────────────────┬────────────────────────┘
└──────────────┬─────────────────┘                                │ HTTP & WebSockets
               │ HTTP & Socket.IO                                 ▼
               ▼                                   ┌───────────────────────────────┐
┌──────────────────────────────┐                   │       SceneSync Backend       │
│ Smartphone Companion Website │◄─────────────────►│  - Fastify REST & Socket.IO   │
│  - Remote Controller for Ext │                   │  - PostgreSQL Pool & Tx       │
│  - Progress Selector (S1-SN) │                   │  - Extension Linking Service  │
│  - Targeted Q&A & Recaps     │                   │  - Authoritative Boundary Svc │
└──────────────────────────────┘                   └──────────────┬────────────────┘
                                                                  │ Filtered Retrieval
                                                                  ▼
                                                   ┌───────────────────────────────┐
                                                   │     Spoiler-Safety Engine     │
                                                   │  - Strict Canonical Min Order │
                                                   │  - Pre-LLM Fact Filtering     │
                                                   │  - Stage 2 Claim Verification │
                                                   │  - Multi-Surface Boundary Sync│
                                                   └───────────────────────────────┘
```

### Monorepo Logical Structure

- `apps/extension/`: Real Chrome Manifest V3 browser extension with background service worker, side panel, popup, and streaming provider adapters (Netflix, Amazon Prime Video, JioHotstar, and Fallback).
- `apps/fire-tv/android/`: Native Android TV application for Fire OS (minSdkVersion 28, compileSdkVersion 34, `LEANBACK_LAUNCHER`, D-Pad remote control handler, produces installable `app-debug.apk`).
- `apps/fire-tv/web/`: 10-foot 1920x1080 Fire TV application with high-contrast remote focus rings, D-Pad/Enter/Back keyboard listener, active extension status badges, and an interactive floating Fire TV Remote controller for development and preview.
- `apps/companion-web/`: Mobile companion web application with QR join landing, room-code fallback, viewing progress selector, desktop extension remote controller, and targeted Q&A feed.
- `apps/api/`: Fastify + Socket.IO backend service with PostgreSQL transactions, QR generation, extension linking, remote command dispatch, and boundary recalculation.
- `packages/shared-types/`: Shared TypeScript data contracts and Zod schemas for multi-surface syncing.
- `packages/spoiler-policy/`: Core spoiler-safety policy engine (authoritative boundary calculation, evidence filtering, claim & citation verification, cache isolation).
- `services/ai/`: Provider-agnostic AI service (universal LLM adapter for OpenAI/Gemini + deterministic mock adapter for offline testing).
- `content/`: Curated show, episode, character, relationship, and fact database with known spoiler test cases.
- `database/migrations/`: SQL migration files (`001_initial_schema.sql`, `002_extension_support.sql`).
- `database/seeds/`: Seed script populating the catalog.
- `tests/`: Automated unit, spoiler safety, API integration, and E2E test suites.

---

## 2. Amazon Fire TV Platform Target

- **Operating System:** Amazon Fire OS 7 (Android 9 / API 28) and Fire OS 8 (Android 11 / API 30).
- **Package Format:** Android Leanback APK (`.apk`).
- **Hardware Flags:**
  - `<uses-feature android:name="android.software.leanback" android:required="false" />`
  - `<uses-feature android:name="android.hardware.touchscreen" android:required="false" />`
- **Remote Control Navigation:**
  - `KEYCODE_DPAD_UP`, `KEYCODE_DPAD_DOWN`, `KEYCODE_DPAD_LEFT`, `KEYCODE_DPAD_RIGHT`
  - `KEYCODE_DPAD_CENTER`, `KEYCODE_ENTER` (Select action)
  - `KEYCODE_BACK` (Back navigation)
- **Viewing Distance:** 10-foot design standard with 1920×1080 baseline, high-contrast violet focus rings (`ring-4 ring-purple-400 scale-105`), and large typography.

---

## 3. Authoritative Spoiler-Safety Subsystem

SceneSync **never relies solely on an LLM prompt** to prevent spoilers. Spoiler prevention is enforced at three distinct architectural layers:

1. **Authoritative Boundary Calculation:**
   - Evaluates integer `canonicalOrder` across all active, eligible session members.
   - If any active member has not started (null progress), the boundary fails safe to `Not Started`.
   - Regressions in progress automatically lower the shared viewing boundary.
   - Disconnected members are protected by a 5-minute grace period.

2. **Pre-LLM Evidence Filtering:**
   - Only facts with `canonicalOrder <= boundary.canonicalOrder` are retrieved from PostgreSQL.
   - Future plot developments, upcoming character relationships, and finale synopses are physically excluded from the LLM prompt context.

3. **Stage 2 Claim & Evidence Validation:**
   - All AI structured outputs must cite valid evidence IDs from the authorized retrieval package.
   - Citing unverified or future evidence IDs causes instant rejection and safe fallback:
     *"I can't verify an answer using information your group has watched so far."*
   - Responses generated under older boundary versions are revalidated before delivery.

4. **Cache Key Isolation:**
   - Cache keys incorporate `showId`, `canonicalOrder`, and `contentVersion`. Content generated at Episode 10 can never be served to a party bounded at Episode 6.

---

## 4. Chrome Browser Extension & Companion Remote Control

SceneSync includes a real, first-class desktop browser extension built on **Chrome Manifest V3**, allowing participants watching shows on desktop streaming providers to synchronize with the Fire TV watch party.

### Extension Architecture

- **Manifest V3 Specification:** Implements `side_panel`, `background.service_worker`, content scripts, and reactive popup.
- **Provider Adapters (`apps/extension/src/adapters/`):**
  - **Netflix Adapter:** Matches `netflix.com/watch/*`, inspects player title card `[data-uia="video-title"]`, extracts season, episode, and title with fallback to page metadata.
  - **Prime Video Adapter:** Matches `primevideo.com` and `amazon.com/gp/video/*`, parses player title/subtitle automation attributes and canonical ASIN/detail IDs.
  - **Hotstar Adapter:** Matches `hotstar.com` and `jiostar.com` watch routes and video title elements.
  - **Generic Fallback Adapter:** Matches any streaming URL, inspects OpenGraph `og:title` or `document.title`, and requests manual confirmation if ambiguous.
- **Content Overlay (`src/content/overlay.ts`):** Lightweight, draggable floating status badge indicating watch-party connection and authoritative boundary state directly over the streaming page.
- **Side Panel (`src/sidepanel/`):** Displays the authoritative viewing boundary banner, safe recaps, character guide, and live watch-party Q&A without obstructing the video player.

### Loading Unpacked in Chrome / Chromium

1. Build all packages and extension assets:
   ```bash
   pnpm build
   ```
2. Open Google Chrome (or Brave, Edge, Chromium) and navigate to:
   ```text
   chrome://extensions
   ```
3. Enable **Developer mode** via the toggle switch in the top-right corner.
4. Click **Load unpacked** in the top-left corner.
5. Select the folder:
   ```text
   <path-to-repository>/apps/extension/dist
   ```
   *(Alternatively, selecting `apps/extension` also loads unpacked via the root `manifest.json`)*.
6. The SceneSync icon will appear in your Chrome toolbar. Click it to open the connection popup or side panel.

### Security and Streaming Compliance

- **No DRM Interference:** The extension **never** touches encrypted media extensions (EME), protected audio/video decoders, DRM keys, or playback streams.
- **No Player Manipulation:** The extension does not alter advertisements, inject player controls, or modify playback speed.
- **Minimal Permissions:** Only requests `sidePanel`, `storage`, and specific streaming host permissions (`*://*.netflix.com/*`, `*://*.primevideo.com/*`, `*://*.hotstar.com/*`, etc.).

### Companion Remote Controller

The smartphone companion web app acts as the remote controller for both the Fire TV party and any linked desktop browser extensions:
- **Automatic Discovery:** The phone companion detects desktop extensions linked to the watch party session.
- **Remote Context Sync:** Companion can confirm or override what the extension is playing (show title, season, and episode).
- **Targeted Question Routing:** Questions submitted from any client can be routed to:
  - `All Surfaces`: Broadcasted to Fire TV, Phone, and Extension Side Panel.
  - `Extension Sidepanel Only`: Displayed privately on the desktop streaming screen.
  - `Fire TV Display Only`: Broadcasted to the main living room screen.
  - `Phone Only`: Answered privately on the companion device.

---

## 5. Getting Started

### Prerequisites

- **Node.js:** v20+ (tested on Node v24)
- **pnpm:** v9+ / v11+
- **PostgreSQL 15+:** running on `localhost:5432`
- **Android SDK & JDK 17/21:** (for building native Android TV APK)

### Environment Configuration

Create `.env` in the project root:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/scenesync
PORT=4000
HOST=0.0.0.0
COMPANION_BASE_URL=http://localhost:3000

# Optional: Live LLM Provider (Falls back to deterministic adapter if omitted)
# AI_API_KEY=your_gemini_or_openai_api_key
# AI_BASE_URL=https://api.openai.com/v1
# AI_MODEL=gpt-4o-mini
```

### Installation & Database Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Run PostgreSQL migrations
pnpm run db:migrate

# 3. Seed curated TV shows and episode facts
pnpm run db:seed
```

---

## 6. Running the Application

### Option A: Complete Web, Extension & TV Simulator Stack

Run the API, Fire TV 10-foot app, and Companion web app concurrently:

```bash
# Terminal 1: Start API server (port 4000)
pnpm run dev:api

# Terminal 2: Start Fire TV 10-Foot Leanback UI (port 5173)
pnpm run dev:tv

# Terminal 3: Start Smartphone Companion Website (port 3000)
pnpm run dev:companion
```

Open:
- **Fire TV UI:** [http://localhost:5173](http://localhost:5173) (Use Arrow Keys + Enter + Esc, or the floating On-Screen Fire TV Remote!)
- **Phone Companion:** [http://localhost:3000](http://localhost:3000) (Or scan the QR code displayed on the TV!)
### Detailed Setup Instructions & Run Guides

👉 **[INSTRUCTIONS.md](INSTRUCTIONS.md)**: Complete step-by-step instructions for Amazon Fire TV (Physical TV, Emulator, and Web Simulator) and the Chrome Browser Extension (Building, Loading Unpacked, Streaming Provider Integration).  
👉 **[ANDROID_STUDIO_GUIDE.md](ANDROID_STUDIO_GUIDE.md)**: Dedicated step-by-step guide for building and debugging the native Android TV app in Android Studio.

### Option B: Building & Installing the Native Fire TV APK

To build and run from **Android Studio** or on a physical Amazon Fire TV Stick, please see the complete step-by-step guide:
👉 **[ANDROID_STUDIO_GUIDE.md](ANDROID_STUDIO_GUIDE.md)**

To build from command line:

```bash
cd apps/fire-tv/android
./gradlew.bat assembleDebug
```

The APK will be generated at:
`apps/fire-tv/android/app/build/outputs/apk/debug/app-debug.apk`

To install on a connected Fire TV device or emulator via ADB:

```bash
adb connect <FIRE_TV_IP_ADDRESS>:5555
adb install -r apps/fire-tv/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 7. Automated Test Suite

SceneSync includes **55 automated tests** covering unit logic, streaming provider adapters, adversarial spoiler attempts, REST API integration, cross-device extension syncing, and end-to-end flows:

```bash
# Run all tests
pnpm test

# Run boundary policy & adapter unit tests
pnpm test:unit

# Run adversarial spoiler safety tests
pnpm test:spoiler

# Run API & extension sync integration tests
pnpm test:integration

# Run full E2E flow tests
pnpm test:e2e
```

### Test Coverage Highlights

- **Streaming Adapters (15 tests):** URL regex resolution, Netflix/Prime/Hotstar DOM player detection, subtitle parsing, graceful fallback for missing DOM elements, and observer safety.
- **Cross-Device Extension Sync (8 tests):** Extension linking to watch party session, real-time context reporting, companion remote override, typed command dispatch, and boundary-enforced question routing.
- **Boundary Policy (8 tests):** E6 + E8 + E10 -> E6 minimum; all reaching E7 -> advances to E7; regression from E8 to E5 -> lowers to E5; not-started participant fails closed; canonical cross-season ordering.
- **Spoiler Safety (8 tests):** Prompt injection attacks refused; evidence retrieval excludes future episodes; stage 2 claim validator catches forged evidence IDs; cache keys isolated between E10 and E6.
- **Integration & E2E (16 tests):** TV session creation with real QR code Data URL; phone joining with invitation token; live viewing progress updates; real-time recap & Q&A; member leave and host session end.

---

## 8. Verified Working Features

- [x] Real Chrome Manifest V3 browser extension with Service Worker, Side Panel, and Popup.
- [x] Streaming provider adapters for Netflix, Prime Video, JioHotstar, and generic fallback.
- [x] Smartphone companion remote controller for browser extension.
- [x] Multi-surface question routing (`All Surfaces`, `Sidepanel Only`, `TV Only`, `Phone Only`).
- [x] Authoritative viewing boundary calculation engine.
- [x] Pre-LLM evidence retrieval and Stage 2 claim & citation verification.
- [x] Adversarial prompt injection defense.
- [x] PostgreSQL database migrations and transaction safety (including `002_extension_support.sql`).
- [x] Fastify REST API and Socket.IO real-time event bus.
- [x] Real QR code generation containing secure invitation tokens.
- [x] Smartphone companion website with viewing-progress selector and live Q&A feed.
- [x] 10-foot Fire TV UI with high-contrast remote focus rings, D-Pad remote navigation, and extension status.
- [x] Native Fire OS Android TV APK build configured with Leanback launcher.
- [x] 55 automated tests passing with zero failures.
