# Cartwell mobile app (Android + iOS)

React Native (Expo) app that talks to `cartwell-api`.

## Run
1. `npm install`
2. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to your API (https in production).
3. Razorpay uses native code, so Expo Go will not work. Build a development app:
   - Android: `npx expo run:android` (needs Android Studio)
   - iOS: `npx expo run:ios` (needs a Mac and Xcode)
   - or cloud builds: `npx eas build --profile development`
4. Use Razorpay **test** keys on the API until everything works.

## Release
- Change `ios.bundleIdentifier` and `android.package` in `app.json` to your own ids.
- `npx eas build --platform android` (AAB for Play Store) and `--platform ios`.
- Add an icon and splash screen in `app.json`.

## Security notes
- No secrets in the app. Only the public Razorpay key id is received from your server per order.
- Prices are never sent from the app; the server decides them.
- Card details are entered only in Razorpay’s screen.
- The API address must be https in release builds.
- Cart is stored locally and re-validated on load.

## Accounts
Three ways to sign in: email + password, phone OTP (Indian mobile numbers), and Google. Checkout still works as a guest.
Orders placed while signed in appear under the Account tab. The refresh token is kept in the device's secure storage
(Keychain / Keystore); the short-lived access token is kept in memory only.

### Google sign-in setup
1. In Google Cloud Console create OAuth clients: a **Web** client, an **Android** client (package name + your signing key's SHA-1),
   and an **iOS** client (bundle id).
2. Put the Web client id in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and the iOS one in `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
3. In `app.json` replace `REPLACE_WITH_IOS_CLIENT_ID` in `iosUrlScheme` with your iOS client id (the reversed form Google shows).
4. On the API set `GOOGLE_CLIENT_IDS` to the Web client id (plus the others, comma separated).
5. Rebuild the development app (`npx expo run:android` / `run:ios`), since this adds native code.

Phone OTP in development: with no SMS provider configured the API prints the code in its server log.
