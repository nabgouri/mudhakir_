import { InteractiveReviewUrl } from '../../shared/generation';

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

export type QuestionDraft =
  | { kind: 'multiple-choice'; prompt: string; options: string[]; correctOption: number | null }
  | { kind: 'open'; prompt: string; answer: string };

export type QuestionContent =
  | { kind: 'multiple-choice'; prompt: string; options: string[]; correctOption: number }
  | { kind: 'open'; prompt: string; answer: string };

export type QuestionProblem = 'promptRequired' | 'twoOptionsRequired' | 'correctOptionRequired' | 'answerRequired';

// Keeps line breaks, since a prompt or answer may quote several lines.
function cleanText(raw: string): string {
  return raw.normalize('NFC').replace(INVISIBLE_MARKS, '').trim();
}

// Empty options are dropped; the correct option keeps pointing at the same
// text.
export function parseQuestion(
  draft: QuestionDraft,
): { ok: true; value: QuestionContent } | { ok: false; problem: QuestionProblem } {
  const prompt = cleanText(draft.prompt);
  if (prompt === '') return { ok: false, problem: 'promptRequired' };

  if (draft.kind === 'open') {
    const answer = cleanText(draft.answer);
    if (answer === '') return { ok: false, problem: 'answerRequired' };
    return { ok: true, value: { kind: 'open', prompt, answer } };
  }

  const kept = draft.options.map((text, index) => ({ text: cleanText(text), index })).filter((o) => o.text !== '');
  if (kept.length < 2) return { ok: false, problem: 'twoOptionsRequired' };
  const correctOption = kept.findIndex((o) => o.index === draft.correctOption);
  if (correctOption === -1) return { ok: false, problem: 'correctOptionRequired' };
  return { ok: true, value: { kind: 'multiple-choice', prompt, options: kept.map((o) => o.text), correctOption } };
}

export const MAX_DELAY_MINUTES = 180;

export function parseDelayMinutes(raw: string): number | null {
  const text = toLatinDigits(raw.trim());
  if (!/^\d+$/.test(text)) return null;
  const minutes = Number(text);
  return minutes <= MAX_DELAY_MINUTES ? minutes : null;
}

// A latitude or longitude in decimal degrees, as a maps app copies it. The
// Arabic decimal separator (٫) and comma are accepted as a decimal point.
export function parseCoordinate(raw: string, limit: 90 | 180): number | null {
  const text = toLatinDigits(raw.trim()).replace(/[٫,]/, '.');
  if (!/^[-+]?\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Math.abs(value) <= limit ? value : null;
}

// The address of a Lesson's Interactive Review, as pasted from the browser.
// An address with no scheme gets https. Empty input means the Lesson has
// none, which is `undefined`; null means it can't be used.
export function parseInteractiveReviewUrl(raw: string): string | undefined | null {
  const text = raw.replace(INVISIBLE_MARKS, '').trim();
  if (text === '') return undefined;
  const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  return InteractiveReviewUrl.safeParse(url).success ? url : null;
}
