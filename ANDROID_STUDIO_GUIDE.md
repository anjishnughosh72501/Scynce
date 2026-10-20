# SceneSync — Android Studio & Fire TV Setup Guide

This guide walks you step-by-step through opening, building, running, and debugging the **SceneSync Fire TV Application** using **Android Studio**, targeting either a Fire TV Virtual Device (Emulator) or a physical Amazon Fire TV Stick / Cube.

> [!TIP]
> For complete end-to-end instructions covering the **Chrome Browser Extension**, **Smartphone Companion Controller**, and **Web TV Simulator**, see **[INSTRUCTIONS.md](INSTRUCTIONS.md)**.

---

## 1. Prerequisites

1. **Android Studio**: Installed (Ladybug, Koala, Jellyfish, Iguana, or newer).
2. **JDK**: Version 17 or 21 (Android Studio's bundled JetBrains Runtime / JBR is fully supported).
3. **Android SDK Platform**:
   - `compileSdk: 34`
   - `minSdk: 28` (Matches Fire OS 7 [Android 9] and Fire OS 8 [Android 11]).
4. **Node.js & PostgreSQL**: Running for the SceneSync backend API and real-time WebSocket sync.

---

## 2. Opening the Project in Android Studio

> [!IMPORTANT]
> Make sure to open the dedicated Android directory, **not** the root monorepo directory.

1. Launch **Android Studio**.
2. Click **File > Open...** (or click **Open** on the Welcome screen).
3. Browse to the project location and select the folder:
   ```
   SceneSync/apps/fire-tv/android
   ```
4. Click **OK**.
5. Android Studio will initialize Gradle and download any required plugins/dependencies automatically.
6. When Gradle sync finishes, you will see `app` in the project explorer tree.

---

## 3. Starting the Backend Services

The TV application communicates with the SceneSync API server and live socket bus. Before launching the app on your TV or emulator, start the backend services from your terminal (in the root `SceneSync` directory):

```bash
# 1. Ensure database is migrated and seeded
pnpm run db:migrate
pnpm run db:seed

# 2. Start the API server (Port 4000)
pnpm run dev:api

# 3. Start the TV web bundle server (Port 5173)
pnpm run dev:tv
```

---

## 4. Option A: Running on an Android TV Emulator

If you don't have a physical Fire TV plugged in, Android Studio's TV emulator provides an identical 10-foot experience with full D-Pad remote control.

### Creating the TV Virtual Device:
1. In Android Studio, open **Tools > Device Manager** (or click the phone/tablet icon in the top toolbar).
2. Click **Create Virtual Device** (`+`).
3. In the left panel under **Category**, select **TV**.
4. Choose **Television (1080p)** (1920 × 1080: tvdpi) and click **Next**.
5. Select a System Image:
   - Recommended: **API 30** (Fire OS 8 compatible) or **API 34** (Google TV / Android TV).
   - If not yet downloaded, click the download icon next to the release name.
6. Click **Next**, name your AVD (e.g. `Fire_TV_1080p`), and click **Finish**.

### Running the App on the Emulator:
1. In the top toolbar, ensure the run configuration is set to **`app`**.
2. Select your TV emulator from the device dropdown list.
3. Click the green **Run** button (or press `Shift + F10`).
4. Android Studio will build the APK, launch the emulator, install the app, and open SceneSync!

> [!NOTE]
> The native app is pre-configured with `http://10.0.2.2:5173`, which routes directly from the Android Emulator to your computer's `localhost:5173`.

---

## 5. Option B: Running on a Physical Amazon Fire TV Device

You can deploy and debug directly onto any Fire TV Stick, Fire TV 4K Max, or Fire TV Cube over Wi-Fi using ADB.

### Step 1: Enable Developer Options on Fire TV
1. Turn on your Fire TV.
2. Go to **Settings (Gear icon) > My Fire TV > About**.
3. If **Developer Options** is not visible:
   - Highlight the device name (e.g., *Fire TV Stick 4K*) and press the **Select** button on your remote **7 times**.
   - A toast message will announce: *"No need, you are already a developer."*
4. Go back to **Settings > My Fire TV > Developer Options**.
5. Turn **ON**:
   - **ADB Debugging**
   - **Apps from Unknown Sources**

### Step 2: Find Fire TV IP Address
1. Go to **Settings > My Fire TV > About > Network**.
2. Note the **IP Address** (e.g., `192.168.1.45`).

### Step 3: Connect Android Studio via ADB over Wi-Fi
1. In Android Studio, open the **Terminal** tab at the bottom.
2. Run:
   ```bash
   adb connect <YOUR_FIRE_TV_IP>:5555
   ```
   *(Example: `adb connect 192.168.1.45:5555`)*
3. A dialog will pop up on your TV screen: **"Allow USB debugging?"**
4. Check **"Always allow from this computer"** and select **OK** with your remote.
5. In your terminal, run:
   ```bash
   adb devices
   ```
   You will see your Fire TV listed as `192.168.1.45:5555 device`.

### Step 4: Point App to your Machine's LAN IP
Because a physical Fire TV is an external device on your Wi-Fi network (unlike the emulator which uses `10.0.2.2`), update the host address in:
`apps/fire-tv/android/app/src/main/java/com/scenesync/firetv/MainActivity.kt` (line 49):

```kotlin
// Replace 10.0.2.2 with your computer's local Wi-Fi IP address:
webView.loadUrl("http://192.168.1.XXX:5173")
```

### Step 5: Click Run in Android Studio
1. In Android Studio's device dropdown, your Fire TV device will appear.
2. Click **Run** (`Shift + F10`).
3. SceneSync will install and launch on your television!

---

## 6. Remote Control Navigation

SceneSync is designed for touch-independent Fire TV remote control:

| Remote Button | Physical Keyboard (Emulator) | Action |
|---|---|---|
| **D-Pad Up** | `Arrow Up` | Move focus up |
| **D-Pad Down** | `Arrow Down` | Move focus down |
| **D-Pad Left** | `Arrow Left` | Move focus left |
| **D-Pad Right** | `Arrow Right` | Move focus right |
| **Center / Select** | `Enter` or `Space` | Select / Activate focused card |
| **Back** | `Escape` or `Backspace` | Navigate back / Return to previous view |
| **Home** | `Home` key | Return to SceneSync Home screen |

---

## 7. Building the Installable APK from Android Studio

If you want to generate a standalone `.apk` to distribute or sideload without running from source:

1. In Android Studio, go to the top menu: **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
2. When the build completes, click the **locate** link in the balloon notification at the bottom right.
3. The APK will be saved at:
   ```
   apps/fire-tv/android/app/build/outputs/apk/debug/app-debug.apk
   ```

To install this APK on any Fire TV device using command-line ADB:
```bash
adb install -r apps/fire-tv/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 8. Troubleshooting

- **Gradle Sync Fails:** Ensure your Android Studio JDK is set to Version 17 or 21: **Settings > Build, Execution, Deployment > Build Tools > Gradle > Gradle JDK**.
- **Device Not Detected:** Run `adb kill-server && adb start-server`, then retry `adb connect <IP>:5555`. Ensure both your computer and Fire TV are on the same Wi-Fi subnet.
- **Connection Refused in WebView:** Verify that `pnpm run dev:tv` is actively running on port 5173 and your firewall allows inbound connections on ports 4000 and 5173.
