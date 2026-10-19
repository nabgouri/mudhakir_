import {
  Pressable,
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  type PressableProps,
  type TextInputProps,
  type TextProps,
} from 'react-native';

import { colors, fonts, space } from './theme';

// In a right-to-left layout React Native treats textAlign 'left' as the
// start of the line, so every Text sets it to sit on the right.
export function Text({ style, ...props }: TextProps) {
  return <RNText style={[styles.text, style]} {...props} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  return (
    <RNTextInput
      placeholderTextColor={colors.textSecondary}
      style={[styles.input, style]}
      {...props}
    />
  );
}

type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  title: string;
  variant?: 'primary' | 'plain' | 'danger';
};

export function Button({ title, variant = 'primary', ...props }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        pressed && styles.pressed,
      ]}
      {...props}
    >
      <Text
        style={[
          styles.buttonText,
          variant === 'primary' && styles.buttonTextPrimary,
          variant === 'danger' && styles.buttonTextDanger,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily: fonts.regular,
    fontSize: 18,
    lineHeight: 32,
    color: colors.text,
    textAlign: 'left',
  },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 18,
    color: colors.text,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  button: {
    borderRadius: 10,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
  },
  pressed: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.primary,
  },
  buttonTextPrimary: {
    color: colors.onPrimary,
  },
  buttonTextDanger: {
    color: colors.danger,
  },
});
