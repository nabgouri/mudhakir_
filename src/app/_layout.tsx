import { NotoNaskhArabic_400Regular, NotoNaskhArabic_700Bold, useFonts } from '@expo-google-fonts/noto-naskh-arabic';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { DATABASE_NAME, migrate } from '@/data/database';
import { registerBackgroundReschedule } from '@/reminders/background';
import { REMINDER_URL, rescheduleReminders } from '@/reminders/schedule';
import { Sync } from '@/sync/triggers';
import { colors, fonts } from '@/ui/theme';

SplashScreen.preventAutoHideAsync();

// A Reminder that fires while the app is open still shows.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function openNotificationLink(response: Notifications.NotificationResponse) {
  if (response.notification.request.content.data?.url === REMINDER_URL) router.push(REMINDER_URL);
}

// Keeps Reminders scheduled: when the app opens, comes back to the
// foreground, or goes to the background (catching Questions added or
// deleted meanwhile), and from the periodic background task. Tapping a
// Reminder opens the screen its link names.
function Reminders() {
  const db = useSQLiteContext();

  useEffect(() => {
    rescheduleReminders(db);
    registerBackgroundReschedule().catch((error) => console.warn('Registering the background task failed', error));

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active' || state === 'background') rescheduleReminders(db);
    });
    return () => appState.remove();
  }, [db]);

  useEffect(() => {
    // The tap that opened the app from closed.
    const launch = Notifications.getLastNotificationResponse();
    if (launch) {
      Notifications.clearLastNotificationResponse();
      openNotificationLink(launch);
    }
    const taps = Notifications.addNotificationResponseReceivedListener((response) => {
      Notifications.clearLastNotificationResponse();
      openNotificationLink(response);
    });
    return () => taps.remove();
  }, []);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ NotoNaskhArabic_400Regular, NotoNaskhArabic_700Bold });
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate} options={{ enableChangeListener: true }}>
      <StatusBar style="light" />
      <Reminders />
      <Sync />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.onPrimary,
          headerTitleStyle: { fontFamily: fonts.bold },
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </SQLiteProvider>
  );
}
