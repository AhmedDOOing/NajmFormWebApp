# Najm — Expo Go shell

A thin Expo app that runs the (phone-tailored) Najm web app full-screen inside a
native WebView, so you can use it in **Expo Go**. All the real logic — forms, the
server-side Sonnet 5 photo analysis, RTL, i18n, camera capture — stays in the
Next.js app; this shell just displays it.

> The Anthropic API key never touches the phone: the vision call runs on the
> Next.js server, which the phone talks to over your LAN.

## One-time setup

1. **Same Wi-Fi.** Phone and Mac must be on the same network.

2. **Set the server URL.** Edit `SERVER_URL` at the top of `App.tsx` to your Mac's
   LAN IP (currently `http://192.168.100.195:3000`). Find it with:
   ```sh
   ipconfig getifaddr en0
   ```

3. **Allow the dev server through the macOS firewall** (blocks LAN access to
   `node` otherwise — the phone can't connect until this is done). Either:
   - System Settings → Network → Firewall → Options → add **node** / allow it, or
   - run once:
     ```sh
     sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/local/bin/node
     sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp /usr/local/bin/node
     ```
   (Or temporarily: `sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate off`.)

## Run

**Terminal 1 — the backend** (from the repo root, binds LAN IP into minted links):
```sh
npm run dev:lan
```

**Terminal 2 — the Expo app**:
```sh
cd mobile
npx expo start
```
Open **Expo Go** on your phone (install from the App Store / Play Store — must
support Expo SDK 57) and scan the QR code. If your network blocks LAN, run
`npx expo start --tunnel` (that tunnels the JS bundle; the WebView still needs the
Mac reachable at `SERVER_URL`).

In the app: tap **Simulate the call → open the causer link** to walk the driver
flow, add accident photos, and see the live AI analysis under the upload.

## Notes

- If the screen shows "Can't reach the server", the firewall step or a wrong
  `SERVER_URL` is almost always the cause.
- Camera / photo picker works through the WebView's native file chooser
  (`<input type="file" capture>`); grant the camera permission when prompted.
