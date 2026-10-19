import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getQuestion, updateQuestion } from '@/data/questions';
import { Text } from '@/ui/components';
import { QuestionForm } from '@/ui/question-form';
import { t } from '@/ui/strings';
import { colors, space } from '@/ui/theme';
import { useDbQuery } from '@/ui/use-db-query';

export default function EditQuestionScreen() {
  const { questionId } = useLocalSearchParams<{ questionId: string }>();
  const load = useCallback((db: SQLiteDatabase) => getQuestion(db, questionId), [questionId]);
  const { db, data: question } = useDbQuery(load);

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: t.editQuestion }} />
      {question === null && <Text style={styles.empty}>{t.questionNotFound}</Text>}
      {question && (
        <>
          <QuestionForm
            // Remount when the Question loads, so the form starts from it.
            key={question.id}
            initial={question}
            onSave={async (content) => {
              await updateQuestion(db, question.id, content);
              router.back();
            }}
          />
          {question.sourcePassage !== null && (
            <View style={styles.passage}>
              <Text style={styles.label}>{t.sourcePassage}</Text>
              <Text>{question.sourcePassage}</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  empty: {
    color: colors.textSecondary,
    padding: space.md,
  },
  passage: {
    paddingHorizontal: space.md,
    paddingBottom: space.lg,
  },
  label: {
    fontSize: 16,
    color: colors.textSecondary,
  },
});
