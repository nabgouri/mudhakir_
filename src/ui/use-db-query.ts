import { useFocusEffect } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useState } from 'react';

// Loads data from the local database each time the screen comes into view.
// Call `reload` after changing the data.
export function useDbQuery<T>(load: (db: SQLiteDatabase) => Promise<T>) {
  const db = useSQLiteContext();
  const [data, setData] = useState<T | undefined>(undefined);

  const reload = useCallback(async () => {
    setData(await load(db));
  }, [db, load]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { db, data, reload };
}
