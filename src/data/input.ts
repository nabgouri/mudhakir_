// What the student types, turned into values the database accepts.
// Each parser returns null when the input can't be saved.

export const MAX_LESSON_NUMBER = 9999;

// Arabic-Indic (٠١٢…) and Eastern Arabic-Indic (۰۱۲…) digits, so the
// number can be typed on an Arabic keyboard.
const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

// Zero-width and direction marks: invisible, and easily pasted along with
// Arabic text, so a name made only of them would look empty.
const INVISIBLE_MARKS = /[​-‏‪-‮⁦-⁩؜﻿]/g;

function toLatinDigits(text: string): string {
  return text.replace(ARABIC_DIGITS, (digit) => String(digit.charCodeAt(0) & 0xf));
}

// NFC puts stacked diacritics (shadda with a vowel) in one order, so the
// same name typed twice is the same string.
export function parseSubjectName(raw: string): string | null {
  const name = raw.normalize('NFC').replace(INVISIBLE_MARKS, '').trim().replace(/\s+/g, ' ');
  return name === '' ? null : name;
}

export function parseLessonNumber(raw: string): number | null {
  const text = toLatinDigits(raw.trim());
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return number >= 1 && number <= MAX_LESSON_NUMBER ? number : null;
}
