import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getLesson, markStudied, partsToRetry, queueRetry } from '@/data/lessons';
import { deleteQuestion, listLessonQuestions, type Question } from '@/data/questions';
import { Button, Text } from '@/ui/components';
import { syncNow } from '@/sync/sync';
import { pickProblem, useTranscriptPicker } from '@/transcript/extract';
import { confirmDeleteQuestion } from '@/ui/confirm';
import { t } from '@/ui/strings';
import { colors, space } from '@/ui/theme';
import { useDbQuery } from '@/ui/use-db-query';

export default function LessonQuestionsScreen() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const load = useCallback(
    async (db: SQLiteDatabase) => {
      const lesson = await getLesson(db, lessonId);
      const questions = lesson ? await listLessonQuestions(db, lessonId) : [];
      return { lesson, questions };
    },
    [lessonId],
  );
  const { db, data, reload } = useDbQuery(load);
  const { pickTranscript, extractor, reading } = useTranscriptPicker();
  const [retryMessage, setRetryMessage] = useState<string | null>(null);

  // Queues the failed parts again and syncs, which sends them. When their
  // Transcript text has already been sent, the student re-attaches the PDF.
  async function retry(transcriptText?: string) {
    const result = await queueRetry(db, lessonId, transcriptText);
    if (result.status === 'needs-transcript') {
      Alert.alert(t.reattachTitle, t.reattachMessage, [
        { text: t.cancel, style: 'cancel' },
        { text: t.chooseFile, onPress: reattach },
      ]);
      return;
    }
    if (result.status === 'different-transcript') return setRetryMessage(t.differentTranscript);
    setRetryMessage(result.status === 'queued' ? t.retryQueued : null);
    await reload();
    await syncNow(db);
    await reload();
  }

  async function reattach() {
    const picked = await pickTranscript();
    if (picked.status === 'canceled') return;
    if (picked.status === 'picked') return retry(picked.text);
    setRetryMessage(pickProblem(picked));
  }

  async function studied() {
    if (!data?.lesson) return;
    await markStudied(db, data.lesson);
    await reload();
    await syncNow(db);
  }

  function confirmDelete(question: Question) {
    confirmDeleteQuestion(async () => {
      await deleteQuestion(db, question.id);
      await reload();
    });
  }

  if (data && data.lesson === null) {
    return (
      <View style={styles.list}>
        <Stack.Screen options={{ title: t.lessons }} />
        <Text style={styles.empty}>{t.lessonNotFound}</Text>
      </View>
    );
  }

  const lesson = data?.lesson;
  return (
    <>
      <Stack.Screen options={{ title: lesson ? t.lessonTitle(lesson.subjectName, lesson.number) : t.lessons }} />
      <FlatList
        data={data?.questions ?? []}
        keyExtractor={(question) => question.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            {lesson?.title != null && <Text style={styles.lessonTitle}>{lesson.title}</Text>}
            {lesson != null && lesson.studiedAt === null && (
              <View style={styles.card}>
                <Text style={styles.status}>{t.notStudied}</Text>
                <Text style={styles.meta}>{t.notStudiedHint}</Text>
                <Button title={t.markStudied} onPress={studied} />
              </View>
            )}
            {lesson?.generationStatus != null && (
              <View style={styles.card}>
                <Text style={lesson.generationStatus === 'failed' ? styles.failed : styles.status}>
                  {t.generationStatus[lesson.generationStatus]}
                </Text>
                {lesson.generationStatus === 'waiting' && <Text style={styles.meta}>{t.waitingHint}</Text>}
                {lesson.generationStatus === 'generating' && <Text style={styles.meta}>{t.generatingHint}</Text>}
                {lesson.generationStatus === 'failed' && lesson.generationError !== null && (
                  <Text style={styles.meta}>{t.generationError(lesson.generationError)}</Text>
                )}
                {lesson.partCount > 1 && lesson.generationStatus !== 'ready' && (
                  <Text style={styles.meta}>{t.partsDone(lesson.partsDone.length, lesson.partCount)}</Text>
                )}
                {partsToRetry(lesson).length > 0 && (
                  <View style={styles.actions}>
                    <Button
                      title={reading ? t.readingTranscript : t.retryGeneration}
                      onPress={() => retry()}
                      disabled={reading}
                    />
                  </View>
                )}
                {retryMessage !== null && <Text style={styles.meta}>{retryMessage}</Text>}
              </View>
            )}
            <View style={styles.header}>
              <Text style={styles.meta}>{t.questionCount(data?.questions.length ?? 0)}</Text>
              <Link href={{ pathname: '/questions/new', params: { lessonId } }} asChild>
                <Button title={t.addQuestion} />
              </Link>
            </View>
          </>
        }
        ListEmptyComponent={data ? <Text style={styles.empty}>{t.noQuestions}</Text> : undefined}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.kind}>{item.kind === 'multiple-choice' ? t.multipleChoice : t.openQuestion}</Text>
            <Text style={styles.prompt}>{item.prompt}</Text>
            {item.kind === 'multiple-choice' ? (
              item.options.map((option, index) => (
                <Text key={index} style={index === item.correctOption ? styles.correct : styles.option}>
                  {index === item.correctOption ? `✓ ${option}` : `• ${option}`}
                </Text>
              ))
            ) : (
              <Text style={styles.answer}>{item.answer}</Text>
            )}
            <View style={styles.actions}>
              <Link href={{ pathname: '/questions/[questionId]', params: { questionId: item.id } }} asChild>
                <Button title={t.edit} variant="plain" />
              </Link>
              <Button title={t.delete} variant="danger" onPress={() => confirmDelete(item)} />
            </View>
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
  header: {
    marginTop: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: space.md,
    gap: space.xs,
  },
  kind: {
    fontSize: 14,
    lineHeight: 24,
    color: colors.textSecondary,
  },
  prompt: {
    fontSize: 20,
    lineHeight: 36,
  },
  lessonTitle: {
    fontSize: 20,
    lineHeight: 36,
    marginBottom: space.sm,
  },
  option: {
    color: colors.textSecondary,
  },
  correct: {
    color: colors.primary,
  },
  answer: {
    color: colors.primary,
  },
  meta: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  status: {
    color: colors.primary,
  },
  failed: {
    color: colors.danger,
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
  },
  empty: {
    color: colors.textSecondary,
    marginTop: space.lg,
  },
});
