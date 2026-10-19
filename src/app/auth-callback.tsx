import { router, Stack } from 'expo-router';
import { useEffect } from 'react';

// Google sign-in comes back to the app through mudhakir://auth-callback
// (src/sync/auth.ts), and the router opens this screen for that link. The
// Settings screen finishes signing in, so this one just goes back to it.
export default function AuthCallbackScreen() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  }, []);
  return <Stack.Screen options={{ headerShown: false }} />;
}
