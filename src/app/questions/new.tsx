import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ScrollView } from 'react-native';

import { addQuestion } from '@/data/questions';
import { QuestionForm } from '@/ui/question-form';
import { t } from '@/ui/strings';

export default function NewQuestionScreen() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const db = useSQLiteContext();

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: t.newQuestion }} />
      <QuestionForm
        onSave={async (content) => {
          await addQuestion(db, lessonId, content);
          router.back();
        }}
      />
    </ScrollView>
  );
}
