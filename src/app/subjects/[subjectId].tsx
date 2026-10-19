import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View, type TextInputInstance } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import { parseInteractiveReviewUrl, parseLessonNumber } from '@/data/input';
import { addLesson, deleteLesson, listLessons, type Lesson } from '@/data/lessons';
import { listStudyQuestions } from '@/data/questions';
import { getSubject } from '@/data/subjects';
import { due } from '@/engine/study';
import { requestReminderPermission } from '@/reminders/schedule';
import { pickProblem, useTranscriptPicker } from '@/transcript/extract';
import { Button, Text, TextInput } from '@/ui/components';
import { t } from '@/ui/strings';
import { colors, space } from '@/ui/theme';
import { useDbQuery } from '@/ui/use-db-query';

export default function SubjectLessonsScreen() {
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();
  const load = useCallback(
    async (db: SQLiteDatabase) => {
      const subject = await getSubject(db, subjectId);
      const lessons = subject ? await listLessons(db, subjectId) : [];
      const dueCount = subject ? due(await listStudyQuestions(db), new Date(), { subjectId }).length : 0;
      return { subject, lessons, dueCount };
    },
    [subjectId],
  );
  const { db, data, reload } = useDbQuery(load);
  const [numberText, setNumberText] = useState('');
  const [reviewUrlText, setReviewUrlText] = useState('');
  const reviewUrlInput = useRef<TextInputInstance>(null);
  const [error, setError] = useState<string | null>(null);
  // The attached Transcript's text, held only until the Lesson is added.
  const [transcript, setTranscript] = useState<{ name: string; text: string } | null>(null);
  const { pickTranscript, extractor, reading } = useTranscriptPicker();

  async function attachTranscript() {
    const picked = await pickTranscript();
    if (picked.status === 'picked') {
      setTranscript({ name: picked.name, text: picked.text });
      setError(null);
    } else if (picked.status !== 'canceled') {
      setError(pickProblem(picked));
    }
  }

  async function add() {
    const number = parseLessonNumber(numberText);
    if (number === null) return setError(t.lessonNumberInvalid);
    const reviewUrl = parseInteractiveReviewUrl(reviewUrlText);
    if (reviewUrl === null) return setError(t.interactiveReviewUrlInvalid);
    const result = await addLesson(db, subjectId, number, {
      interactiveReviewUrl: reviewUrl,
      transcriptText: transcript?.text,
    });
    if (!result.ok) return setError(t.lessonNumberTaken);
    setNumberText('');
    setReviewUrlText('');
    setTranscript(null);
    setError(null);
    await reload();
    // So the "Questions ready" notification can show.
    if (reviewUrl !== undefined || transcript !== null) requestReminderPermission().catch(() => {});
  }

  function confirmDelete(lesson: Lesson) {
    Alert.alert(t.deleteLessonTitle, t.deleteLessonMessage(lesson.number), [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete,
        style: 'destructive',
        onPress: async () => {
          await deleteLesson(db, lesson.id);
          await reload();
        },
      },
    ]);
  }

  if (data && data.subject === null) {
    return (
      <View style={styles.list}>
        <Stack.Screen options={{ title: t.lessons }} />
        <Text style={styles.empty}>{t.subjectNotFound}</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: data?.subject?.name ?? t.lessons }} />
      <FlatList
        data={data?.lessons ?? []}
        keyExtractor={(lesson) => lesson.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.form}>
            <View style={[styles.card, styles.row]}>
              <Text style={styles.meta}>{t.dueCount(data?.dueCount ?? 0)}</Text>
              <View style={styles.spacer} />
              <Link href={{ pathname: '/review', params: { subjectId } }} asChild>
                <Button title={t.reviewSubject} />
              </Link>
            </View>
            <View style={styles.row}>
              <TextInput
                value={numberText}
                onChangeText={setNumberText}
                placeholder={t.lessonNumberPlaceholder}
                keyboardType="number-pad"
                returnKeyType="next"
                onSubmitEditing={() => reviewUrlInput.current?.focus()}
              />
              <Button title={t.addLesson} onPress={add} disabled={reading} />
            </View>
            <TextInput
              ref={reviewUrlInput}
              value={reviewUrlText}
              onChangeText={setReviewUrlText}
              placeholder={t.interactiveReviewUrlPlaceholder}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={add}
              style={styles.urlInput}
            />
            {transcript === null ? (
              <Button
                title={reading ? t.readingTranscript : t.attachTranscript}
                variant="plain"
                onPress={attachTranscript}
                disabled={reading}
              />
            ) : (
              <View style={styles.card}>
                <View style={styles.row}>
                  <Text style={[styles.meta, styles.spacer]}>
                    {t.transcriptAttached(transcript.name, transcript.text.length)}
                  </Text>
                  <Button title={t.removeTranscript} variant="plain" onPress={() => setTranscript(null)} />
                </View>
                {/* The opening lines, so a PDF whose text comes out garbled is noticed before it is sent. */}
                <Text style={styles.preview} numberOfLines={3}>
                  {transcript.text.slice(0, 300)}
                </Text>
              </View>
            )}
            {error !== null && <Text style={styles.error}>{error}</Text>}
          </View>
        }
        ListEmptyComponent={data ? <Text style={styles.empty}>{t.noLessons}</Text> : undefined}
        renderItem={({ item }) => (
          <View style={[styles.card, styles.row]}>
            <Link href={{ pathname: '/lessons/[lessonId]', params: { lessonId: item.id } }} asChild>
              <Pressable style={styles.spacer}>
                <Text style={styles.name}>{t.lesson(item.number)}</Text>
                {item.generationStatus !== null && (
                  <Text style={item.generationStatus === 'failed' ? styles.failed : styles.meta}>
                    {t.generationStatus[item.generationStatus]}
                  </Text>
                )}
              </Pressable>
            </Link>
            <Button title={t.delete} variant="danger" onPress={() => confirmDelete(item)} />
          </View>
        )}
      />
      {extractor}
    </>
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
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  name: {
    fontSize: 20,
    lineHeight: 34,
  },
  spacer: {
    flex: 1,
  },
  meta: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  urlInput: {
    flex: 0,
  },
  preview: {
    fontSize: 15,
    lineHeight: 26,
    color: colors.textSecondary,
  },
  error: {
    color: colors.danger,
    fontSize: 15,
  },
  failed: {
    fontSize: 16,
    color: colors.danger,
  },
  empty: {
    color: colors.textSecondary,
    marginTop: space.lg,
  },
});
