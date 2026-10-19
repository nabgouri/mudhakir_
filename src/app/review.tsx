import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { deleteQuestion, getQuestion, listStudyQuestions, recordReview, type Question } from '@/data/questions';
import { DEFAULT_SESSION_SIZE, nextSession, ratingForChoice, type Rating } from '@/engine/study';
import { Button, Text } from '@/ui/components';
import { t } from '@/ui/strings';
import { colors, space } from '@/ui/theme';

const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy'];

// `chosen`: a Multiple-Choice option was tapped and its Review recorded.
// `revealed`: an Open Question's answer is showing, waiting for a Rating.
type Phase = { step: 'asking' } | { step: 'chosen'; option: number } | { step: 'revealed' };

// A Review Session, full screen: one Question at a time. Each Review is
// recorded the moment it is given, so leaving part-way keeps them.
export default function ReviewSessionScreen() {
  const { subjectId } = useLocalSearchParams<{ subjectId?: string }>();
  const db = useSQLiteContext();
  const [queue, setQueue] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [question, setQuestion] = useState<Question | null>(null);
  const [phase, setPhase] = useState<Phase>({ step: 'asking' });
  const [moreDue, setMoreDue] = useState(false);
  const [saving, setSaving] = useState(false);

  const findDue = useCallback(
    async () => nextSession(await listStudyQuestions(db), new Date(), DEFAULT_SESSION_SIZE, { subjectId }),
    [db, subjectId],
  );

  // The session's Questions are fixed when it starts, so a Question rated
  // Again comes back in a later session, not straight away.
  const begin = useCallback((session: { id: string }[]) => {
    setQueue(session.map((q) => q.id));
    setIndex(0);
    setQuestion(null);
    setPhase({ step: 'asking' });
    setMoreDue(false);
  }, []);

  useEffect(() => {
    findDue().then(begin);
  }, [findDue, begin]);

  const currentId = queue?.[index];
  const finished = queue !== null && currentId === undefined;

  const advance = useCallback(() => {
    setIndex((i) => i + 1);
    setQuestion(null);
    setPhase({ step: 'asking' });
  }, []);

  // Loads the current Question, and reloads it on coming back from editing.
  useFocusEffect(
    useCallback(() => {
      if (currentId === undefined) return;
      let active = true;
      getQuestion(db, currentId).then((loaded) => {
        if (!active) return;
        if (loaded === null) return advance();
        setQuestion(loaded);
        // An edit turned an unrated Open Question into a Multiple-Choice one.
        setPhase((p) => (p.step === 'revealed' && loaded.kind === 'multiple-choice' ? { step: 'asking' } : p));
      });
      return () => {
        active = false;
      };
    }, [db, currentId, advance]),
  );

  useEffect(() => {
    if (finished) findDue().then((session) => setMoreDue(session.length > 0));
  }, [finished, findDue]);

  async function record(rating: Rating) {
    if (currentId === undefined) return;
    setSaving(true);
    try {
      await recordReview(db, currentId, rating, new Date());
    } finally {
      setSaving(false);
    }
  }

  async function choose(option: number) {
    if (question?.kind !== 'multiple-choice' || phase.step !== 'asking' || saving) return;
    setPhase({ step: 'chosen', option });
    await record(ratingForChoice(option === question.correctOption));
  }

  async function rateOpen(rating: Rating) {
    if (saving) return;
    await record(rating);
    advance();
  }

  function confirmDelete(id: string) {
    Alert.alert(t.deleteQuestionTitle, t.deleteQuestionMessage, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete,
        style: 'destructive',
        onPress: async () => {
          await deleteQuestion(db, id);
          advance();
        },
      },
    ]);
  }

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topBar}>
        <Button title={t.close} variant="plain" onPress={close} />
        <View style={styles.spacer} />
        {queue !== null && !finished && <Text style={styles.meta}>{t.sessionProgress(index + 1, queue.length)}</Text>}
      </View>

      {finished && (
        <View style={styles.center}>
          <Text style={styles.message}>{queue.length === 0 ? t.nothingDue : t.sessionDone}</Text>
          {moreDue && <Button title={t.continueReview} onPress={() => findDue().then(begin)} />}
          <Button title={t.close} variant="plain" onPress={close} />
        </View>
      )}

      {question !== null && !finished && (
        <>
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.kind}>{t.lesson(question.lessonNumber)}</Text>
            <Text style={styles.prompt}>{question.prompt}</Text>

            {question.kind === 'multiple-choice' &&
              question.options.map((option, i) => {
                const chosen = phase.step === 'chosen';
                const isCorrect = i === question.correctOption;
                const isPicked = chosen && phase.option === i;
                return (
                  <Pressable
                    key={i}
                    accessibilityRole="button"
                    disabled={chosen}
                    onPress={() => choose(i)}
                    style={[
                      styles.option,
                      chosen && isCorrect && styles.optionRight,
                      isPicked && !isCorrect && styles.optionWrong,
                    ]}
                  >
                    <Text style={styles.optionText}>{option}</Text>
                  </Pressable>
                );
              })}

            {phase.step === 'chosen' && question.kind === 'multiple-choice' && (
              <Text style={phase.option === question.correctOption ? styles.right : styles.wrong}>
                {phase.option === question.correctOption ? t.right : t.wrong}
              </Text>
            )}

            {question.kind === 'open' && phase.step !== 'asking' && (
              <View style={styles.answer}>
                <Text style={styles.label}>{t.answerLabel}</Text>
                <Text style={styles.answerText}>{question.answer}</Text>
              </View>
            )}

            {phase.step !== 'asking' && question.sourcePassage !== null && (
              <View style={styles.passage}>
                <Text style={styles.label}>{t.sourcePassage}</Text>
                <Text>{question.sourcePassage}</Text>
              </View>
            )}

            <View style={styles.row}>
              <Button
                title={t.edit}
                variant="plain"
                onPress={() => router.push({ pathname: '/questions/[questionId]', params: { questionId: question.id } })}
              />
              <Button title={t.delete} variant="danger" onPress={() => confirmDelete(question.id)} />
            </View>
          </ScrollView>

          <View style={styles.bottomBar}>
            {question.kind === 'open' && phase.step === 'asking' && (
              <Button title={t.showAnswer} onPress={() => setPhase({ step: 'revealed' })} />
            )}
            {question.kind === 'open' && phase.step === 'revealed' && (
              <View style={styles.row}>
                {RATINGS.map((rating) => (
                  <View key={rating} style={styles.spacer}>
                    <Button
                      title={t.ratings[rating]}
                      variant={rating === 'again' ? 'danger' : 'primary'}
                      disabled={saving}
                      onPress={() => rateOpen(rating)}
                    />
                  </View>
                ))}
              </View>
            )}
            {phase.step === 'chosen' && <Button title={t.next} onPress={advance} disabled={saving} />}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
  },
  spacer: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.md,
  },
  message: {
    fontSize: 20,
    textAlign: 'center',
  },
  body: {
    padding: space.md,
    gap: space.md,
  },
  kind: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  prompt: {
    fontSize: 24,
    lineHeight: 44,
  },
  option: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: space.md,
  },
  optionRight: {
    backgroundColor: colors.rightSurface,
    borderColor: colors.primary,
  },
  optionWrong: {
    backgroundColor: colors.wrongSurface,
    borderColor: colors.danger,
  },
  optionText: {
    fontSize: 20,
    lineHeight: 36,
  },
  right: {
    color: colors.primary,
    fontSize: 18,
  },
  wrong: {
    color: colors.danger,
    fontSize: 18,
  },
  answer: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: space.md,
  },
  answerText: {
    fontSize: 20,
    lineHeight: 36,
  },
  passage: {
    borderColor: colors.border,
    borderStartWidth: 3,
    paddingStart: space.md,
  },
  label: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  meta: {
    fontSize: 15,
    color: colors.textSecondary,
    paddingHorizontal: space.sm,
  },
  bottomBar: {
    padding: space.md,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
});
