# SceneSync — Complete Setup & Run Instructions

> Comprehensive step-by-step guide for setting up, running, and testing the **Amazon Fire TV Application**, **Chrome-Compatible Browser Extension**, **Smartphone Companion Controller**, and **Shared Backend**.

---

## Table of Contents

1. [Prerequisites & Environment Setup](#1-prerequisites--environment-setup)
2. [Starting the Shared Backend & Database](#2-starting-the-shared-backend--database)
3. [Amazon Fire TV Instructions](#3-amazon-fire-tv-instructions)
   - [Method A: Physical Fire TV Stick / Cube via ADB Wi-Fi](#method-a-physical-fire-tv-stick--cube-via-adb-wi-fi)
   - [Method B: Android Studio TV Emulator](#method-b-android-studio-tv-emulator)
   - [Method C: 10-Foot Web TV Simulator (Zero Android Setup)](#method-c-10-foot-web-tv-simulator-zero-android-setup)
   - [Method D: Standalone Command-Line APK Build & Install](#method-d-standalone-command-line-apk-build--install)
4. [Desktop Browser Extension Instructions](#4-desktop-browser-extension-instructions)
   - [Step 1: Building the Extension](#step-1-building-the-extension)
   - [Step 2: Loading Unpacked in Chrome / Chromium](#step-2-loading-unpacked-in-chrome--chromium)
   - [Step 3: Connecting Extension to a Watch Party](#step-3-connecting-extension-to-a-watch-party)
   - [Step 4: Using on Streaming Sites (Netflix, Prime Video, JioHotstar)](#step-4-using-on-streaming-sites)
   - [Step 5: Using Side Panel and Floating Badge](#step-5-using-side-panel-and-floating-badge)
5. [Smartphone Companion Instructions](#5-smartphone-companion-instructions)
   - [Step 1: Joining the Session via QR or Code](#step-1-joining-the-session-via-qr-or-code)
   - [Step 2: Setting Viewing Progress](#step-2-setting-viewing-progress)
   - [Step 3: Remotely Controlling Desktop Extensions](#step-3-remotely-controlling-desktop-extensions)
   - [Step 4: Submitting Spoiler-Safe Questions](#step-4-submitting-spoiler-safe-questions)
6. [End-to-End Multi-Surface Demo Flow](#6-end-to-end-multi-surface-demo-flow)
7. [Troubleshooting & FAQ](#7-troubleshooting--faq)

---

## 1. Prerequisites & Environment Setup

Ensure the following tools are installed on your workstation:

| Requirement | Supported Version | Purpose |
|---|---|---|
| **Node.js** | v20+ (tested on Node v22 and v24) | Monorepo runtime & package scripts |
| **pnpm** | v9+ or v10+ | Workspace dependency management |
| **PostgreSQL** | v15+ (running on `localhost:5432`) | Curated catalog, sessions, and facts storage |
| **Google Chrome / Chromium / Brave / Edge** | Current version | Desktop streaming extension host |
| **Android Studio** *(Optional for native TV)* | Ladybug / Koala / Jellyfish | Building native Fire OS APK & TV emulator |
| **JDK** *(Optional for native TV)* | JDK 17 or 21 | Android Gradle build tooling |

### Configuration File (`.env`)

In the repository root (`SceneSync/`), verify or create a `.env` file:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/scenesync
PORT=4000
HOST=0.0.0.0
COMPANION_BASE_URL=http://localhost:3000

# Optional: Live LLM Provider (falls back to deterministic AI adapter if omitted)
# AI_API_KEY=your_gemini_or_openai_api_key
# AI_BASE_URL=https://api.openai.com/v1
# AI_MODEL=gpt-4o-mini
```

---

## 2. Starting the Shared Backend & Database

The backend coordinates all surfaces (Fire TV, Browser Extension, Phone Companion) and maintains the authoritative viewing boundary in PostgreSQL.

Open your terminal in the root `SceneSync` directory:

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Run database migrations (creates sessions, facts, and extension tables)
pnpm run db:migrate

# 3. Seed curated shows, episodes, characters, and evidence facts
pnpm run db:seed

# 4. Start the API server (Runs on http://localhost:4000)
pnpm run dev:api
```

Keep this terminal running. The API server provides:
- Fastify REST API endpoints at `http://localhost:4000/api/*`
- Socket.IO real-time pub/sub synchronization at `ws://localhost:4000`

---

## 3. Amazon Fire TV Instructions

You have multiple practical ways to run the Fire TV experience depending on your equipment:

### Method A: Physical Fire TV Stick / Cube via ADB Wi-Fi

Use this to deploy the native app directly to a physical Fire TV device in your living room.

#### 1. Enable Developer Options on Fire TV:
1. Turn on your Fire TV device.
2. Navigate to **Settings (Gear icon) > My Fire TV > About**.
3. Highlight your device name (e.g., *Fire TV Stick 4K*) and press the **Center/Select button on your remote 7 times** until the toast message appears: *"No need, you are already a developer."*
4. Go back one screen to **Settings > My Fire TV > Developer Options**.
5. Turn **ON** both:
   - **ADB Debugging**
   - **Apps from Unknown Sources**

#### 2. Connect via ADB over Wi-Fi:
1. Check your Fire TV IP address under **Settings > My Fire TV > About > Network** (e.g. `192.168.1.45`).
2. On your computer terminal, connect ADB:
   ```bash
   adb connect 192.168.1.45:5555
   ```
3. A prompt will appear on your TV: **"Allow USB debugging?"**.
4. Check **"Always allow from this computer"** and select **OK** with your remote.
5. Verify connection:
   ```bash
   adb devices
   # Should output: 192.168.1.45:5555    device
   ```

#### 3. Configure Local IP in Android Code:
Because your physical TV is an external network device, open:
`apps/fire-tv/android/app/src/main/java/com/scenesync/firetv/MainActivity.kt` (line 49):
```kotlin
// Change 10.0.2.2 to your computer's local LAN IP (e.g. 192.168.1.15):
webView.loadUrl("http://192.168.1.15:5173")
```

#### 4. Build and Install:
From the root directory:
```bash
# Start the TV web bundle server
pnpm run dev:tv

# In another terminal, build and install the APK
cd apps/fire-tv/android
./gradlew.bat installDebug
```
The SceneSync app will launch on your television!

---

### Method B: Android Studio TV Emulator

If you do not have a physical Fire TV device, Android Studio includes a TV emulator with full D-Pad remote control.

1. Open **Android Studio**.
2. Select **File > Open...** and browse to:
   ```text
   SceneSync/apps/fire-tv/android
   ```
3. Let Gradle sync complete.
4. Open **Tools > Device Manager** and click **Create Virtual Device** (`+`).
5. Select category **TV** and pick **Television (1080p)** (1920 × 1080).
6. Select system image **API 30** (Fire OS 8 compatible) or **API 34**, then click **Finish**.
7. In the top toolbar, select `app` and choose your TV emulator.
8. Start the web bundle in your terminal: `pnpm run dev:tv`.
9. Click **Run** (`Shift + F10`) in Android Studio.
10. Use the emulator's D-Pad controller on the right side to navigate!

---

### Method C: 10-Foot Web TV Simulator (Zero Android Setup)

If you do not want to install Android Studio or the Android SDK, SceneSync provides a full 10-foot Fire TV web application with high-contrast remote focus rings and an interactive on-screen Fire TV Remote controller!

1. Start the TV simulator:
   ```bash
   pnpm run dev:tv
   ```
2. Open your browser to:
   [http://localhost:5173](http://localhost:5173)
3. **Controls:**
   - **Keyboard Remote Navigation:**
     - `Arrow Up` / `Arrow Down` / `Arrow Left` / `Arrow Right`: Move D-Pad focus.
     - `Enter` or `Space`: Select / Activate focused card.
     - `Escape` or `Backspace`: Go Back.
   - **Interactive Floating Remote:** Click the buttons on the visual Fire TV Remote on the right side of the screen.

---

### Method D: Standalone Command-Line APK Build & Install

To compile the release/debug `.apk` file without opening Android Studio:

```bash
cd apps/fire-tv/android
./gradlew.bat assembleDebug
```

The APK is generated at:
```text
apps/fire-tv/android/app/build/outputs/apk/debug/app-debug.apk
```

To sideload to any Fire TV connected via ADB:
```bash
adb install -r apps/fire-tv/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 4. Desktop Browser Extension Instructions

The SceneSync browser extension allows users watching series on desktop streaming websites to stay synchronized with the Fire TV party without spoilers.

### Step 1: Building the Extension

Before loading into Chrome, build the extension distribution bundle:

```bash
# Build the extension (or run pnpm build at the root)
pnpm --filter @scenesync/extension run build
```

This compiles:
- Background Service Worker (`dist/background.js`)
- Content Scripts (`dist/bootstrap.js`, `dist/overlay.js`)
- Extension Popup (`dist/popup.html`)
- Side Panel (`dist/sidepanel.html`)
- Manifest V3 specification (`dist/manifest.json`)

---

### Step 2: Loading Unpacked in Chrome / Chromium

1. Open **Google Chrome** (or Microsoft Edge, Brave, Opera, Chromium).
2. In the URL address bar, enter:
   ```text
   chrome://extensions
   ```
3. In the top-right corner, toggle the switch for **Developer mode** to **ON**.
4. In the top-left corner, click the **Load unpacked** button.
5. In the file picker dialog, navigate to your repository and select the folder:
   ```text
   SceneSync/apps/extension/dist
   ```
   *(Note: You can also select `SceneSync/apps/extension` directly)*.
6. The extension **"SceneSync — AI Watch-Party Companion"** will appear in your installed extensions list.

---

### Step 3: Connecting Extension to a Watch Party

1. Click the **Extensions puzzle icon** in Chrome's top toolbar and click the **Pin** icon next to SceneSync.
2. Click the SceneSync icon to open the **Popup UI**.
3. You will see:
   - **Backend Status:** Connected to `http://localhost:4000` (green indicator).
   - **Active Session:** Shows connected room code or an input field to enter a Room Code.
   - **Auto-Sync:** If you created a party on the Fire TV, enter the 6-character Room Code (e.g. `ABC123`) and click **Link Extension**.

---

### Step 4: Using on Streaming Sites

Open a supported streaming website in a Chrome tab:

| Streaming Provider | Supported URLs & Detection Method |
|---|---|
| **Netflix** | `https://www.netflix.com/watch/*`<br>Automatically detects show title, season, and episode from player title card. |
| **Amazon Prime Video** | `https://www.primevideo.com/detail/*` or `https://www.amazon.com/gp/video/*`<br>Automatically detects title, subtitle, and season/episode. |
| **JioHotstar / Hotstar** | `https://www.hotstar.com/in/shows/*` or `https://www.jiostar.com/*`<br>Automatically detects show and episode metadata. |
| **Custom / Fallback Sites** | Any video streaming page.<br>Extracts OpenGraph `og:title` or `document.title` and prompts for one-click manual confirmation. |

#### Automatic vs. Manual Detection:
- When a video begins playback, SceneSync identifies the show and episode.
- If automatic detection is ambiguous (e.g. custom video player), the extension popup and side panel provide a simple dropdown allowing you to select the exact show, season, and episode manually.

---

### Step 5: Using Side Panel and Floating Badge

1. **Floating Badge Overlay:**
   - When browsing a streaming site, a subtle, draggable **SceneSync badge** appears in the bottom-left corner of the viewport.
   - It shows the current session boundary (e.g., `Boundary: S1 E6 • Safe`).
   - Clicking the badge opens the Side Panel or centers the companion controls.
2. **Side Panel Companion (`sidepanel.html`):**
   - Click the SceneSync extension icon and select **"Open Side Panel"** (or use the Chrome Side Panel toolbar icon).
   - The side panel docks alongside your video player without resizing or disrupting full-screen playback.
   - Displays:
     - **Authoritative Boundary Banner:** Shows what episode is safe for the group.
     - **Safe Recap Tab:** Episode-by-episode catch-up summary strictly restricted to the boundary.
     - **Character Guide Tab:** Character motivations and relationships safely filtered to current viewing progress.
     - **Live Q&A:** Submit questions directly from the side panel and receive instant, grounded answers.

---

## 5. Smartphone Companion Instructions

The smartphone companion web app acts as the personal controller for each viewer and can remotely control the desktop extension.

### Step 1: Joining the Session via QR or Code

1. Start the companion web app:
   ```bash
   pnpm run dev:companion
   ```
2. Open your smartphone browser to `http://<YOUR_COMPUTER_LAN_IP>:3000` or scan the **QR code** shown on the Fire TV screen.
3. Enter your **Display Name** (e.g., `Sarah`).
4. Enter the **Room Code** shown on the TV (e.g. `XY9876`).
5. Click **Join Watch Party**.

---

### Step 2: Setting Viewing Progress

1. Once joined, use the episode picker to declare the last episode you have fully watched:
   - Example: Select **Season 1, Episode 6**.
2. Click **Update Progress**.
3. The Fire TV and all connected extensions will instantly recalculate the group's shared viewing boundary in real time:
   $$\text{Shared Boundary} = \min(\text{Participant A}, \text{Participant B}, \dots)$$

---

### Step 3: Remotely Controlling Desktop Extensions

If someone is watching on a desktop PC with the Chrome extension:
1. In the phone companion app, look for the **"Connected Desktop Extension"** card.
2. It displays:
   - Extension provider badge (e.g. `NETFLIX`, `PRIME-VIDEO`).
   - Detected playback context (e.g. `S1 E6 The Siege of Ravenfall`).
3. **Override Playback Remotely:**
   - Tap **Override** on your phone.
   - Change the Season or Episode number.
   - Tap **Apply Override**.
   - The desktop browser extension immediately syncs to the selected episode!
4. **Remote Commands:**
   - Tap **Resync Session** to force the extension to re-query the latest boundary.
   - Tap **Disconnect** to remotely unlink the extension from the session.

---

### Step 4: Submitting Spoiler-Safe Questions

1. In the phone app, scroll to the **"Ask About the Show"** box.
2. Type any question (e.g., *"Why did Commander Kael betray the citadel?"*).
3. **Targeted Question Routing:**
   - Choose where the answer should be displayed:
     - **All Surfaces (Default):** Broadcasts answer to TV, Phone, and Extension Side Panel.
     - **Extension Sidepanel Only:** Sends the answer privately to the desktop viewer.
     - **Fire TV Display Only:** Broadcasts directly to the main living room screen.
     - **Phone Only:** Displays privately on your phone screen.
4. Tap **Ask Question**.
5. The answer appears in real time, verified by the Stage 2 spoiler filter citing only facts from Episode 6 or earlier!

---

## 6. End-to-End Multi-Surface Demo Flow

Try this complete test scenario to see all surfaces interacting:

```
[Fire TV] ───────────────► 1. Launch TV App & Click "Start Watch Party"
                           - Displays Room Code: "S7K2P9" & QR Code.
                           - Boundary starts as: "Calculating Boundary..."

[Phone Companion] ───────► 2. Scan QR Code or open http://localhost:3000
                           - Join as "Alice", select watched: S1 E6.

[Fire TV] ───────────────► 3. TV updates in real time:
                           - "1 Watching: Alice (S1 E6)".
                           - Authoritative Boundary: "Season 1, Episode 6".

[Chrome Extension] ──────► 4. Open Netflix / Prime Video on desktop
                           - Open Extension popup, enter Room Code "S7K2P9".
                           - Extension links and opens Side Panel.
                           - Boundary banner reads: "S1 E6 • Authoritative Boundary".

[Phone Companion] ───────► 5. Join second viewer: "Bob" (watched: S1 E10)
                           - Boundary remains S1 E6 (Alice is at E6!).

[Phone Companion] ───────► 6. Ask question: "Who survives the citadel attack in S1 E8?"
                           - Result: Spoiler Refused!
                           - "I can't answer that because it involves plot developments beyond S1 E6."

[Phone Companion] ───────► 7. Alice advances watched progress to S1 E8
                           - Instantly, TV, Phone, and Extension advance to S1 E8!
                           - Resubmitting the question now safely answers with verified citations!
```

---

## 7. Troubleshooting & FAQ

### Browser Extension Issues

- **"Could not establish connection. Receiving end does not exist."**
  - Make sure you refreshed the streaming webpage (e.g. Netflix or Prime Video) after loading or reloading the unpacked extension in `chrome://extensions`.
- **Extension does not detect show automatically:**
  - Streaming sites frequently update their DOM class names. Click the extension icon in your Chrome toolbar and use the manual dropdown to select your show and episode. The phone companion can also remotely set the episode for you.
- **Side Panel does not open:**
  - Ensure you are running Chrome version 114 or higher (which natively supports the Manifest V3 Side Panel API). You can also click the Chrome side panel icon at the top right of the browser window.

### Fire TV Issues

- **ADB command `adb connect` fails:**
  - Verify that your Fire TV device and your computer are connected to the exact same Wi-Fi network and subnet (e.g. both on `192.168.1.x`).
  - Toggle **ADB Debugging** OFF and ON again in Fire TV Settings.
  - Restart the ADB daemon on your computer:
    ```bash
    adb kill-server
    adb start-server
    adb connect <FIRE_TV_IP>:5555
    ```
- **Remote control not moving focus on TV web simulator:**
  - Click anywhere inside the TV web page once to ensure the browser tab has keyboard focus. Use the Arrow Keys, Enter, and Escape.

### Backend & Database Issues

- **Database migration fails:**
  - Verify PostgreSQL is running on port 5432:
    ```bash
    # Test connection
    psql -U postgres -h localhost -d scenesync
    ```
  - If database `scenesync` does not exist:
    ```sql
    CREATE DATABASE scenesync;
    ```
  - Re-run migrations: `pnpm run db:migrate`.
