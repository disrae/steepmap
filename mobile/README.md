# Steepmap phone app

A [Capacitor](https://capacitorjs.com) shell around https://steepmap.ca. Over the website it adds:
- **Background GPS:** recordings keep going with the screen locked. It uses `@capacitor-community/background-geolocation`. Android shows a "Recording" notification while it runs, and iOS shows the blue location pill.
- **A full-screen app:** an app icon, no browser bars, and app storage for the offline maps.

The app loads the live site (`server.url` in `capacitor.config.json`), so every `npm run deploy` reaches it at once. There's nothing to rebuild unless native settings or plugins change. Offline works the same as on the website: the service worker keeps the app, the region packs and your tracks on the phone.
- iOS only allows service workers for an app's own listed domains, so `steepmap.ca` is in `WKAppBoundDomains`.
- If the app is opened with no signal before it has ever loaded, it shows `www/offline.html`.

The web code finds the native GPS through `web/vendor/capacitor-8.5.2.js`. When the page is running inside the app, `gps.start()` in `web/index.html` switches from the browser's `watchPosition` to the plugin. The position dot uses the plugin too, so the app only asks for location once instead of WebKit asking again on every launch.

## Build

```bash
cd mobile
npm install
npx cap sync                     # after changing capacitor.config.json or plugins
```

**Android:**
- Debug APK:
  ```bash
  JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./android/gradlew -p android assembleDebug
  ```
  It lands in `android/app/build/outputs/apk/debug/app-debug.apk`. Send that file to an Android phone and open it (allow "install unknown apps").
- Store-ready build: `npm run android` opens Android Studio, then use Build → Generate Signed App Bundle.
- Capacitor 8 needs Java 21. Android Studio includes it, which is why the command above sets `JAVA_HOME`.

**iPhone:**
1. Accept Xcode's licence once: `sudo xcodebuild -license accept`.
2. `npm run ios` opens Xcode.
3. Under Signing & Capabilities, pick your Apple Developer team.
4. Plug in your phone and press Run.
5. To share with friends, use Product → Archive, then upload to TestFlight.

To try it in the simulator without signing:
```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -derivedDataPath build/ios CODE_SIGNING_ALLOWED=NO build
xcrun simctl install booted build/ios/Build/Products/Debug-iphonesimulator/App.app
```

Without a paid developer account, Xcode can still install it on your own phone, but the install expires after 7 days.

## Permissions
- **iOS:** "When in use" location, plus "Always" for recording with the screen off. Background mode is `location`. The wording is in `ios/App/App/Info.plist`.
- **Android:** fine location, plus a foreground service of type location. The plugin's manifest adds these. On Android 13 and later, allow notifications so the "Recording" notice shows.
