import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { parseQuestion, type QuestionContent, type QuestionDraft } from '@/data/input';

import { Button, Text, TextInput } from './components';
import { t } from './strings';
import { colors, space } from './theme';

type Props = {
  initial?: QuestionContent;
  onSave: (content: QuestionContent) => Promise<void>;
};

// Adds or edits a Question: a Multiple-Choice Question with two or more
// options and one correct, or an Open Question with its answer.
export function QuestionForm({ initial, onSave }: Props) {
  const [kind, setKind] = useState<QuestionDraft['kind']>(initial?.kind ?? 'multiple-choice');
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const [options, setOptions] = useState<string[]>(initial?.kind === 'multiple-choice' ? initial.options : ['', '']);
  const [correctOption, setCorrectOption] = useState<number | null>(
    initial?.kind === 'multiple-choice' ? initial.correctOption : null,
  );
  const [answer, setAnswer] = useState(initial?.kind === 'open' ? initial.answer : '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function setOption(index: number, text: string) {
    setOptions(options.map((option, i) => (i === index ? text : option)));
  }

  function removeOption(index: number) {
    setOptions(options.filter((_, i) => i !== index));
    if (correctOption === index) setCorrectOption(null);
    else if (correctOption !== null && correctOption > index) setCorrectOption(correctOption - 1);
  }

  async function save() {
    if (saving) return;
    const draft: QuestionDraft =
      kind === 'multiple-choice' ? { kind, prompt, options, correctOption } : { kind, prompt, answer };
    const parsed = parseQuestion(draft);
    if (!parsed.ok) return setError(t.questionProblems[parsed.problem]);
    setSaving(true);
    try {
      await onSave(parsed.value);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.form}>
      <View style={styles.row}>
        <Choice label={t.multipleChoice} selected={kind === 'multiple-choice'} onPress={() => setKind('multiple-choice')} />
        <Choice label={t.openQuestion} selected={kind === 'open'} onPress={() => setKind('open')} />
      </View>

      <Text style={styles.label}>{t.promptLabel}</Text>
      <TextInput value={prompt} onChangeText={setPrompt} placeholder={t.promptPlaceholder} multiline style={styles.multiline} />

      {kind === 'multiple-choice' ? (
        <>
          <Text style={styles.label}>{t.optionsLabel}</Text>
          {options.map((option, index) => (
            <View key={index} style={styles.row}>
              <Choice label={t.correct} selected={correctOption === index} onPress={() => setCorrectOption(index)} />
              <TextInput
                value={option}
                onChangeText={(text) => setOption(index, text)}
                placeholder={t.optionPlaceholder(index + 1)}
                multiline
              />
              {options.length > 2 && <Button title={t.removeOption} variant="danger" onPress={() => removeOption(index)} />}
            </View>
          ))}
          <View style={styles.start}>
            <Button title={t.addOption} variant="plain" onPress={() => setOptions([...options, ''])} />
          </View>
        </>
      ) : (
        <>
          <Text style={styles.label}>{t.answerLabel}</Text>
          <TextInput value={answer} onChangeText={setAnswer} placeholder={t.answerPlaceholder} multiline style={styles.multiline} />
        </>
      )}

      {error !== null && <Text style={styles.error}>{error}</Text>}
      <Button title={t.save} onPress={save} disabled={saving} />
    </View>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  form: {
    padding: space.md,
    gap: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  start: {
    alignItems: 'flex-start',
  },
  label: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: space.sm,
  },
  multiline: {
    flex: 0,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  choice: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    backgroundColor: colors.surface,
  },
  choiceSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  choiceText: {
    fontSize: 15,
  },
  choiceTextSelected: {
    color: colors.onPrimary,
  },
  error: {
    color: colors.danger,
    fontSize: 15,
  },
});
