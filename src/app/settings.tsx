import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { getCity, searchCities, type City } from '@/data/cities';
import { parseCoordinate, parseDelayMinutes } from '@/data/input';
import { getSettings, saveSettings, type Place, type Settings } from '@/data/settings';
import { CALCULATION_METHODS, PRAYERS } from '@/engine/reminders';
import { requestReminderPermission, rescheduleReminders } from '@/reminders/schedule';
import { BackupSection } from '@/ui/backup-section';
import { Button, Text, TextInput } from '@/ui/components';
import { t } from '@/ui/strings';
import { colors, space } from '@/ui/theme';

const MAX_RESULTS = 20;

function cityLabel(city: City): string {
  return `${city.name}، ${city.country}`;
}

function placeLabel(place: Place): string {
  const city = place.cityId === null ? undefined : getCity(place.cityId);
  return city ? cityLabel(city) : t.coordinates(place.latitude, place.longitude);
}

// Sign-in and backup, then where and when Reminders fire: the place and
// calculation method that give the prayer times, the delay after the adhan,
// and which prayers to use. Nothing is saved until "حفظ".
export default function SettingsScreen() {
  const db = useSQLiteContext();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [delayText, setDelayText] = useState('');
  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState(false);
  const [latitudeText, setLatitudeText] = useState('');
  const [longitudeText, setLongitudeText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    getSettings(db).then((loaded) => {
      setSettings(loaded);
      setDelayText(String(loaded.delayMinutes));
    });
  }, [db]);

  // A sync brought changes, perhaps these settings restored from the backup
  // on a new phone: show them, and ask for the notification permission the
  // restored Reminders need.
  async function synced() {
    const loaded = await getSettings(db);
    setSettings(loaded);
    setDelayText(String(loaded.delayMinutes));
    setTyping(false);
    setError(null);
    setNotice(null);
    if (loaded.place !== null && (await requestReminderPermission())) await rescheduleReminders(db);
  }

  if (settings === null) return <Stack.Screen options={{ title: t.settings }} />;

  function update(change: Partial<Settings>) {
    setSettings((current) => (current === null ? current : { ...current, ...change }));
    setNotice(null);
  }

  function pickCity(city: City) {
    update({ place: { cityId: city.id, latitude: city.latitude, longitude: city.longitude } });
    setQuery('');
  }

  function typedPlace(): Place | null {
    const latitude = parseCoordinate(latitudeText, 90);
    const longitude = parseCoordinate(longitudeText, 180);
    return latitude === null || longitude === null ? null : { cityId: null, latitude, longitude };
  }

  function applyCoordinates() {
    const place = typedPlace();
    if (place === null) return setError(t.coordinatesInvalid);
    setError(null);
    update({ place });
    setTyping(false);
  }

  // Coordinates still being typed are saved too, as if applied first.
  async function save() {
    if (settings === null) return;
    const place = typing ? typedPlace() : settings.place;
    if (place === null && typing) return setError(t.coordinatesInvalid);
    const delayMinutes = parseDelayMinutes(delayText);
    if (delayMinutes === null) return setError(t.delayInvalid);
    setError(null);
    setTyping(false);
    const saved = { ...settings, place, delayMinutes };
    await saveSettings(db, saved);
    setSettings(saved);
    const allowed = saved.place === null || (await requestReminderPermission());
    await rescheduleReminders(db);
    setNotice(allowed ? t.settingsSaved : t.notificationsDenied);
  }

  const results = searchCities(query).slice(0, MAX_RESULTS);

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: t.settings }} />
      <BackupSection onChanged={synced} />
      <Text style={styles.heading}>{t.remindersSection}</Text>

      <View style={styles.section}>
        <Text style={styles.label}>{t.placeLabel}</Text>
        <Text style={styles.value}>{settings.place === null ? t.noPlace : placeLabel(settings.place)}</Text>
        <View style={styles.row}>
          <TextInput value={query} onChangeText={setQuery} placeholder={t.citySearchPlaceholder} />
        </View>
        {query.trim() !== '' && results.length === 0 && <Text style={styles.meta}>{t.noCityFound}</Text>}
        {results.map((city) => (
          <Pressable key={city.id} style={styles.choice} onPress={() => pickCity(city)}>
            <Text>{cityLabel(city)}</Text>
            <Text style={styles.meta}>{city.nameLatin}</Text>
          </Pressable>
        ))}
        {typing ? (
          <View style={styles.section}>
            <View style={styles.row}>
              <TextInput
                value={latitudeText}
                onChangeText={setLatitudeText}
                placeholder={t.latitudePlaceholder}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={styles.row}>
              <TextInput
                value={longitudeText}
                onChangeText={setLongitudeText}
                placeholder={t.longitudePlaceholder}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={styles.row}>
              <Button title={t.useCoordinates} onPress={applyCoordinates} />
              <Button title={t.cancel} variant="plain" onPress={() => setTyping(false)} />
            </View>
          </View>
        ) : (
          <Button title={t.typeCoordinates} variant="plain" onPress={() => setTyping(true)} />
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>{t.methodLabel}</Text>
        {CALCULATION_METHODS.map((method) => (
          <Pressable
            key={method}
            accessibilityRole="radio"
            accessibilityState={{ checked: settings.method === method }}
            style={[styles.choice, settings.method === method && styles.chosen]}
            onPress={() => update({ method })}
          >
            <Text>{t.methods[method]}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>{t.delayLabel}</Text>
        <View style={styles.row}>
          <TextInput
            value={delayText}
            onChangeText={(text) => {
              setDelayText(text);
              setNotice(null);
            }}
            keyboardType="number-pad"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>{t.prayersLabel}</Text>
        {PRAYERS.map((prayer) => (
          <View key={prayer} style={styles.switchRow}>
            <Text style={styles.spacer}>{t.prayers[prayer]}</Text>
            <Switch
              value={settings.prayers[prayer]}
              onValueChange={(on) => update({ prayers: { ...settings.prayers, [prayer]: on } })}
              trackColor={{ true: colors.primary }}
            />
          </View>
        ))}
      </View>

      {error !== null && <Text style={styles.error}>{error}</Text>}
      {notice !== null && <Text style={styles.meta}>{notice}</Text>}
      <Button title={t.save} onPress={save} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: space.md,
    gap: space.lg,
  },
  heading: {
    fontSize: 22,
    lineHeight: 38,
  },
  section: {
    gap: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: space.md,
  },
  spacer: {
    flex: 1,
  },
  label: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  value: {
    fontSize: 20,
  },
  choice: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  chosen: {
    backgroundColor: colors.rightSurface,
    borderColor: colors.primary,
  },
  meta: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  error: {
    color: colors.danger,
    fontSize: 15,
  },
});
