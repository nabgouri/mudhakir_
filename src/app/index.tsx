import { Link, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { parseSubjectName } from '@/data/input';
import { createSubject, deleteSubject, listSubjects, renameSubject, type Subject } from '@/data/subjects';
import { Button, Text, TextInput } from '@/ui/components';
import { t } from '@/ui/strings';
import { colors, space } from '@/ui/theme';
import { useDbQuery } from '@/ui/use-db-query';

export default function SubjectsScreen() {
  const { db, data: subjects, reload } = useDbQuery(listSubjects);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function add() {
    const name = parseSubjectName(newName);
    if (name === null) return setError(t.subjectNameRequired);
    const result = await createSubject(db, name);
    if (!result.ok) return setError(t.subjectNameTaken);
    setNewName('');
    setError(null);
    await reload();
  }

  function confirmDelete(subject: Subject) {
    Alert.alert(t.deleteSubjectTitle, t.deleteSubjectMessage(subject.name), [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete,
        style: 'destructive',
        onPress: async () => {
          await deleteSubject(db, subject.id);
          await reload();
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: t.subjects }} />
      <FlatList
        data={subjects ?? []}
        keyExtractor={(subject) => subject.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.form}>
            <View style={styles.row}>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder={t.newSubjectPlaceholder}
                returnKeyType="done"
                onSubmitEditing={add}
              />
              <Button title={t.addSubject} onPress={add} />
            </View>
            {error !== null && <Text style={styles.error}>{error}</Text>}
          </View>
        }
        ListEmptyComponent={subjects ? <Text style={styles.empty}>{t.noSubjects}</Text> : undefined}
        renderItem={({ item }) =>
          item.id === editingId ? (
            <RenameRow
              subject={item}
              onDone={async () => {
                setEditingId(null);
                await reload();
              }}
            />
          ) : (
            <View style={styles.card}>
              <Link href={{ pathname: '/subjects/[subjectId]', params: { subjectId: item.id } }} asChild>
                <Pressable style={styles.cardBody}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>{t.lessonCount(item.lessonCount)}</Text>
                </Pressable>
              </Link>
              <View style={styles.actions}>
                <Button title={t.rename} variant="plain" onPress={() => setEditingId(item.id)} />
                <Button title={t.delete} variant="danger" onPress={() => confirmDelete(item)} />
              </View>
            </View>
          )
        }
      />
    </>
  );
}

function RenameRow({ subject, onDone }: { subject: Subject; onDone: () => void }) {
  const db = useSQLiteContext();
  const [name, setName] = useState(subject.name);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const parsed = parseSubjectName(name);
    if (parsed === null) return setError(t.subjectNameRequired);
    const result = await renameSubject(db, subject.id, parsed);
    if (!result.ok) return setError(t.subjectNameTaken);
    onDone();
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <TextInput value={name} onChangeText={setName} autoFocus returnKeyType="done" onSubmitEditing={save} />
      </View>
      {error !== null && <Text style={styles.error}>{error}</Text>}
      <View style={styles.actions}>
        <Button title={t.save} onPress={save} />
        <Button title={t.cancel} variant="plain" onPress={onDone} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: space.md,
    gap: space.sm,
  },
  form: {
    marginBottom: space.sm,
    gap: space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: space.md,
    gap: space.xs,
  },
  cardBody: {
    gap: space.xs,
  },
  name: {
    fontSize: 22,
    lineHeight: 38,
  },
  meta: {
    fontSize: 15,
    lineHeight: 26,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
  },
  error: {
    color: colors.danger,
    fontSize: 15,
  },
  empty: {
    color: colors.textSecondary,
    marginTop: space.lg,
  },
});
