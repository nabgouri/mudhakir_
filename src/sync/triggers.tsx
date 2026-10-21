import * as Network from 'expo-network';
import { addDatabaseChangeListener, useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { supabase } from './client';
import { registerPushToken } from './push';
import { hasPendingChanges, syncNow } from './sync';

// How long after a local change to sync, so a burst of changes (a Review
// Session) goes up together.
const SYNC_DELAY_MS = 5000;

// Keeps the cloud backup in step: syncs when the app opens or comes back to
// the foreground, a little after local changes, and when the phone comes
// back online with changes still to send. The background task also syncs,
// and so does a push from the cloud, for which the signed-in phone
// registers its push token.
export function Sync() {
  const db = useSQLiteContext();

  useEffect(() => {
    const auth = supabase?.auth;
    if (auth === undefined) return;
    syncNow(db);
    auth.startAutoRefresh();

    // Deferred: Supabase must not be called from inside this callback.
    const signIns = auth.onAuthStateChange((event, session) => {
      if (session !== null && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) {
        setTimeout(() => registerPushToken().catch((error) => console.warn('Registering for pushes failed', error)));
      }
    });

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
      signIns.data.subscription.unsubscribe();
      changes.remove();
      network.remove();
      appState.remove();
      auth.stopAutoRefresh();
    };
  }, [db]);

  return null;
}
