import { NotoNaskhArabic_400Regular, NotoNaskhArabic_700Bold, useFonts } from '@expo-google-fonts/noto-naskh-arabic';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Network from 'expo-network';
import { addDatabaseChangeListener, SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { DATABASE_NAME, migrate } from '@/data/database';
import { registerBackgroundReschedule } from '@/reminders/background';
import { REMINDER_URL, rescheduleReminders } from '@/reminders/schedule';
import { supabase } from '@/sync/client';
import { hasPendingChanges, syncNow } from '@/sync/sync';
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

// How long after a local change to sync, so a burst of changes (a Review
// Session) goes up together.
const SYNC_DELAY_MS = 5000;

// Keeps the cloud backup in step: syncs when the app opens or comes back to
// the foreground, a little after local changes, and when the phone comes
// back online with changes still to send. The background task also syncs.
function Sync() {
  const db = useSQLiteContext();

  useEffect(() => {
    const auth = supabase?.auth;
    if (auth === undefined) return;
    syncNow(db);
    auth.startAutoRefresh();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const syncSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const online = (await Network.getNetworkStateAsync()).isInternetReachable !== false;
        if (online && (await hasPendingChanges(db))) syncNow(db);
      }, SYNC_DELAY_MS);
    };

    // Sync's own writes leave nothing pending, so they don't start another.
    const changes = addDatabaseChangeListener((event) => {
      if (event.tableName !== 'sync_state') syncSoon();
    });
    const network = Network.addNetworkStateListener((state) => {
      if (state.isInternetReachable) syncSoon();
    });
    // The session's token is refreshed only while the app is in front.
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        auth.startAutoRefresh();
        syncNow(db);
      } else {
        auth.stopAutoRefresh();
      }
    });
    return () => {
      clearTimeout(timer);
      changes.remove();
      network.remove();
      appState.remove();
      auth.stopAutoRefresh();
    };
  }, [db]);

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
