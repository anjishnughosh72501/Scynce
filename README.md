# SceneSync — Fire TV AI Watch-Party Companion

> **"Catch up together. Never spoil the moment."**

SceneSync is a Fire TV-first AI watch-party companion application that enables friends and families watching a TV series at different speeds to discuss the show safely, without spoiling it for the least-progressed participant.

---

## 1. System Architecture

```
                       ┌───────────────────────────────────────────────┐
                       │          Amazon Fire TV Application           │
                       │   - Native Fire OS APK (Android TV Leanback)  │
                       │   - 10-Foot 1920x1080 Remote Navigation UI    │
                       └──────────────────────┬────────────────────────┘
                                              │ HTTP & WebSockets
                                              ▼
┌──────────────────────────────┐        ┌───────────────────────────────┐
│ Smartphone Companion Website │◄──────►│       SceneSync Backend       │
│  - QR Code & Room Code Join  │        │  - Fastify REST & Socket.IO   │
│  - Progress Selector (S1-SN) │        │  - PostgreSQL Pool & Tx       │
│  - Live Safe Q&A & Recaps    │        │  - Authoritative Boundary Svc │
└──────────────────────────────┘        └──────────────┬────────────────┘
                                                       │ Filtered Retrieval
                                                       ▼
                                        ┌───────────────────────────────┐
                                        │     Spoiler-Safety Engine     │
                                        │  - Strict Canonical Min Order │
                                        │  - Pre-LLM Fact Filtering     │
                                        │  - Stage 2 Claim Verification │
                                        │  - Boundary-Scoped Cache Keys │
                                        └───────────────────────────────┘
```

### Monorepo Logical Structure

- `apps/fire-tv/android/`: Native Android TV application for Fire OS (minSdkVersion 28, compileSdkVersion 34, `LEANBACK_LAUNCHER`, D-Pad remote control handler, produces installable `app-debug.apk`).
- `apps/fire-tv/web/`: 10-foot 1920x1080 Fire TV application with high-contrast remote focus rings, D-Pad/Enter/Back keyboard listener, and an interactive floating Fire TV Remote controller for development and preview.
- `apps/companion-web/`: Mobile companion web application with QR join landing, room-code fallback, viewing progress selector, and real-time safe Q&A feed.
- `apps/api/`: Fastify + Socket.IO backend service with PostgreSQL transactions, QR generation, and boundary recalculation.
- `packages/shared-types/`: Shared TypeScript data contracts and Zod schemas.
- `packages/spoiler-policy/`: Core spoiler-safety policy engine (authoritative boundary calculation, evidence filtering, claim & citation verification, cache isolation).
- `services/ai/`: Provider-agnostic AI service (universal LLM adapter for OpenAI/Gemini + deterministic mock adapter for offline testing).
- `content/`: Curated show, episode, character, relationship, and fact database with known spoiler test cases.
- `database/migrations/`: SQL migration files (`001_initial_schema.sql`).
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

## 4. Getting Started

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

## 5. Running the Application

### Option A: Complete Web & TV Simulator Stack

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

### Option B: Building & Installing the Native Fire TV APK

To build the native Android TV APK:

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

## 6. Automated Test Suite

SceneSync includes 32 automated tests covering unit logic, adversarial spoiler attempts, REST API integration, and end-to-end flows:

```bash
# Run all tests
pnpm test

# Run boundary policy tests
pnpm test:unit

# Run adversarial spoiler safety tests
pnpm test:spoiler

# Run API integration tests
pnpm test:integration

# Run full E2E flow tests
pnpm test:e2e
```

### Test Coverage Highlights

- **Boundary Policy:** E6 + E8 + E10 -> E6 minimum; all reaching E7 -> advances to E7; regression from E8 to E5 -> lowers to E5; not-started participant fails closed; canonical cross-season ordering.
- **Spoiler Safety:** Prompt injection attacks refused; evidence retrieval excludes future episodes; stage 2 claim validator catches forged evidence IDs; cache keys isolated between E10 and E6.
- **Integration & E2E:** TV session creation with real QR code Data URL; phone joining with invitation token; live viewing progress updates; real-time recap & Q&A; member leave and host session end.

---

## 7. Verified Working Features

- [x] Authoritative viewing boundary calculation engine.
- [x] Pre-LLM evidence retrieval and Stage 2 claim & citation verification.
- [x] Adversarial prompt injection defense.
- [x] PostgreSQL database migrations and transaction safety.
- [x] Fastify REST API and Socket.IO real-time event bus.
- [x] Real QR code generation containing secure invitation tokens.
- [x] Smartphone companion website with viewing-progress selector and live Q&A feed.
- [x] 10-foot Fire TV UI with high-contrast remote focus rings and D-Pad remote navigation.
- [x] Native Fire OS Android TV APK build configured with Leanback launcher.
- [x] 32 automated tests passing with zero failures.
