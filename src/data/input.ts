// What the student types, turned into values the database accepts.
// Each parser returns null when the input can't be saved.

const MAX_LESSON_NUMBER = 9999;

// Arabic-Indic (٠١٢…) and Eastern Arabic-Indic (۰۱۲…) digits, so the
// number can be typed on an Arabic keyboard.
const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

function toLatinDigits(text: string): string {
  return text.replace(ARABIC_DIGITS, (digit) => String(digit.charCodeAt(0) & 0xf));
}

export function parseSubjectName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  return name === '' ? null : name;
}

export function parseLessonNumber(raw: string): number | null {
  const text = toLatinDigits(raw.trim());
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return number >= 1 && number <= MAX_LESSON_NUMBER ? number : null;
}
