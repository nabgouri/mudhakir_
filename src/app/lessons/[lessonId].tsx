import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getLesson } from '@/data/lessons';
import { deleteQuestion, listLessonQuestions, type Question } from '@/data/questions';
import { Button, Text } from '@/ui/components';
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

  function confirmDelete(question: Question) {
    Alert.alert(t.deleteQuestionTitle, t.deleteQuestionMessage, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete,
        style: 'destructive',
        onPress: async () => {
          await deleteQuestion(db, question.id);
          await reload();
        },
      },
    ]);
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
          <View style={styles.header}>
            <Text style={styles.meta}>{t.questionCount(data?.questions.length ?? 0)}</Text>
            <Link href={{ pathname: '/questions/new', params: { lessonId } }} asChild>
              <Button title={t.addQuestion} />
            </Link>
          </View>
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
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: space.md,
    gap: space.sm,
  },
  header: {
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
  actions: {
    flexDirection: 'row',
    gap: space.sm,
  },
  empty: {
    color: colors.textSecondary,
    marginTop: space.lg,
  },
});
