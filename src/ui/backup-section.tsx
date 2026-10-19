import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { signedInEmail, signInWithGoogle } from '@/sync/auth';
import { supabase } from '@/sync/client';
import { lastSyncedAt, syncNow } from '@/sync/sync';

import { Button, Text } from './components';
import { t } from './strings';
import { colors, space } from './theme';

type Props = {
  // Called after a sync that brought changes, such as settings restored on
  // a new phone.
  onChanged: () => void;
};

// The Settings screen's sign-in and backup section. Signing in starts a
// sync at once, which on a fresh install restores everything.
export function BackupSection({ onChanged }: Props) {
  const db = useSQLiteContext();
  const [email, setEmail] = useState<string | null>(null);
  const [synced, setSynced] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    signedInEmail().then(setEmail);
    lastSyncedAt(db).then(setSynced);
  }, [db]);

  if (supabase === null) {
    return (
      <View style={styles.section}>
        <Text style={styles.heading}>{t.backupSection}</Text>
        <Text style={styles.meta}>{t.backupNotConfigured}</Text>
      </View>
    );
  }

  async function sync() {
    setMessage(t.syncing);
    const result = await syncNow(db);
    setSynced(await lastSyncedAt(db));
    setMessage(result.status === 'synced' ? t.synced : t.syncFailed);
    if (result.status === 'synced' && result.changed) onChanged();
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  }

  async function signIn() {
    setMessage(null);
    try {
      if ((await signInWithGoogle()) === 'cancelled') return;
    } catch (error) {
      console.warn('Sign-in failed', error);
      setMessage(t.signInFailed);
      return;
    }
    setEmail(await signedInEmail());
    await sync();
  }

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{t.backupSection}</Text>
      {email === null ? (
        <>
          <Text style={styles.meta}>{t.backupHint}</Text>
          <Button title={t.signIn} disabled={busy} onPress={() => run(signIn)} />
        </>
      ) : (
        <>
          <Text>{t.signedInAs(email)}</Text>
          <Text style={styles.meta}>{synced === null ? t.neverSynced : t.lastSynced(synced)}</Text>
          <Button title={t.syncNow} variant="plain" disabled={busy} onPress={() => run(sync)} />
        </>
      )}
      {message !== null && <Text style={styles.meta}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.sm,
  },
  heading: {
    fontSize: 22,
    lineHeight: 38,
  },
  meta: {
    fontSize: 15,
    color: colors.textSecondary,
  },
});
