import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";

let configured = false;

// Returns a Google ID token, or null if the person closed the Google screen.
export async function getGoogleIdToken() {
  if (!configured) {
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    });
    configured = true;
  }
  try {
    await GoogleSignin.hasPlayServices();
    const r = await GoogleSignin.signIn();
    return r.idToken ?? r.data?.idToken ?? null;
  } catch (e) {
    if (e?.code === statusCodes.SIGN_IN_CANCELLED) return null;
    throw new Error("Google sign-in failed. Please try again.");
  }
}
