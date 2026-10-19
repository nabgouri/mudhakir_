import { MAX_DELAY_MINUTES, MAX_LESSON_NUMBER } from '@/data/input';
import type { CalculationMethodName, Prayer } from '@/engine/reminders';

// Arabic counted nouns: the form depends on the number (1, 2, 3–10, 11–99,
// and 100s), e.g. سؤال واحد، سؤالان، ٣ أسئلة، ١١ سؤالًا، ١٠٠ سؤال.
function counted(n: number, forms: { zero: string; one: string; two: string; few: string; many: string; hundred: string }) {
  if (n === 0) return forms.zero;
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  const lastTwo = n % 100;
  if (lastTwo >= 3 && lastTwo <= 10) return `${n} ${forms.few}`;
  if (lastTwo >= 11) return `${n} ${forms.many}`;
  return `${n} ${forms.hundred}`;
}

// Every piece of interface text, in Arabic. Terms follow GLOSSARY.md:
// Subject = مادة, Lesson = درس, Question = سؤال, Review Session = جلسة مراجعة,
// Source Passage = النص المصدر, Reminder = تذكير.
export const t = {
  subjects: 'المواد',
  noSubjects: 'لا توجد مواد بعد. أضف أول مادة لتبدأ.',
  newSubjectPlaceholder: 'اسم المادة الجديدة',
  addSubject: 'أضف مادة',
  rename: 'تعديل الاسم',
  save: 'حفظ',
  cancel: 'إلغاء',
  delete: 'حذف',
  subjectNameRequired: 'اكتب اسم المادة.',
  subjectNameTaken: 'توجد مادة بهذا الاسم.',
  lessonCount: (n: number) =>
    counted(n, { zero: 'لا دروس', one: 'درس واحد', two: 'درسان', few: 'دروس', many: 'درسًا', hundred: 'درس' }),
  dueCount: (n: number) =>
    counted(n, {
      zero: 'لا أسئلة مستحقة',
      one: 'سؤال واحد مستحق',
      two: 'سؤالان مستحقان',
      few: 'أسئلة مستحقة',
      many: 'سؤالًا مستحقًا',
      hundred: 'سؤال مستحق',
    }),
  questionCount: (n: number) =>
    counted(n, { zero: 'لا أسئلة', one: 'سؤال واحد', two: 'سؤالان', few: 'أسئلة', many: 'سؤالًا', hundred: 'سؤال' }),
  reviewAll: 'ابدأ جلسة مراجعة',
  reviewSubject: 'راجع هذه المادة',
  edit: 'تعديل',
  deleteSubjectTitle: 'حذف المادة',
  deleteSubjectMessage: (name: string) => `هل تريد حذف مادة «${name}» وكل دروسها؟`,

  lessons: 'الدروس',
  noLessons: 'لا توجد دروس في هذه المادة بعد.',
  lessonNumberPlaceholder: 'رقم الدرس',
  addLesson: 'أضف درسًا',
  lesson: (n: number) => `الدرس ${n}`,
  lessonNumberInvalid: `اكتب رقم الدرس، عددًا صحيحًا من 1 إلى ${MAX_LESSON_NUMBER}.`,
  lessonNumberTaken: 'يوجد درس بهذا الرقم في هذه المادة.',
  deleteLessonTitle: 'حذف الدرس',
  deleteLessonMessage: (n: number) => `هل تريد حذف الدرس ${n}؟`,
  subjectNotFound: 'لم يتم العثور على هذه المادة.',
  lessonNotFound: 'لم يتم العثور على هذا الدرس.',
  lessonTitle: (subjectName: string, n: number) => `${subjectName}: الدرس ${n}`,

  noQuestions: 'لا توجد أسئلة في هذا الدرس بعد.',
  addQuestion: 'أضف سؤالًا',
  newQuestion: 'سؤال جديد',
  editQuestion: 'تعديل السؤال',
  questionNotFound: 'لم يتم العثور على هذا السؤال.',
  multipleChoice: 'اختيار من متعدد',
  openQuestion: 'سؤال مفتوح',
  promptLabel: 'السؤال',
  promptPlaceholder: 'نص السؤال',
  optionsLabel: 'الخيارات (اختر الصحيح منها)',
  optionPlaceholder: (n: number) => `الخيار ${n}`,
  addOption: 'أضف خيارًا',
  removeOption: 'إزالة',
  correct: 'صحيح',
  answerLabel: 'الإجابة',
  answerPlaceholder: 'نص الإجابة',
  sourcePassage: 'النص المصدر',
  questionProblems: {
    promptRequired: 'اكتب نص السؤال.',
    twoOptionsRequired: 'اكتب خيارين على الأقل.',
    correctOptionRequired: 'اختر الخيار الصحيح.',
    answerRequired: 'اكتب الإجابة.',
  },
  deleteQuestionTitle: 'حذف السؤال',
  deleteQuestionMessage: 'هل تريد حذف هذا السؤال؟',

  showAnswer: 'أظهر الإجابة',
  ratings: { again: 'مرة أخرى', hard: 'صعب', good: 'جيد', easy: 'سهل' },
  right: 'إجابة صحيحة',
  wrong: 'إجابة خاطئة',
  next: 'التالي',
  close: 'إغلاق',
  continueReview: 'تابع المراجعة',
  sessionProgress: (current: number, total: number) => `${current} من ${total}`,
  sessionDone: 'أحسنت، انتهت جلسة المراجعة.',
  nothingDue: 'لا توجد أسئلة مستحقة الآن.',

  settings: 'الإعدادات',
  remindersSection: 'التذكير بعد الصلوات',
  noPlaceHint: 'اختر مدينتك في الإعدادات ليصلك التذكير بالمراجعة بعد كل صلاة.',
  placeLabel: 'المدينة',
  noPlace: 'لم تختر مدينة بعد.',
  citySearchPlaceholder: 'ابحث عن مدينتك بالعربية أو اللاتينية',
  noCityFound: 'لا توجد مدينة بهذا الاسم. يمكنك إدخال الإحداثيات يدويًا.',
  typeCoordinates: 'أدخل الإحداثيات يدويًا',
  latitudePlaceholder: 'خط العرض (مثل 21.4225)',
  longitudePlaceholder: 'خط الطول (مثل 39.8262)',
  useCoordinates: 'استخدم هذه الإحداثيات',
  coordinatesInvalid: 'اكتب خط عرض بين ‎-90 و90 وخط طول بين ‎-180 و180، بالدرجات العشرية.',
  coordinates: (latitude: number, longitude: number) => `الإحداثيات: ${latitude}، ${longitude}`,
  methodLabel: 'طريقة حساب مواقيت الصلاة',
  methods: {
    MuslimWorldLeague: 'رابطة العالم الإسلامي',
    Egyptian: 'الهيئة المصرية العامة للمساحة',
    Karachi: 'جامعة العلوم الإسلامية بكراتشي',
    UmmAlQura: 'تقويم أم القرى',
    Dubai: 'دبي',
    MoonsightingCommittee: 'لجنة رؤية الهلال',
    NorthAmerica: 'الجمعية الإسلامية لأمريكا الشمالية',
    Kuwait: 'الكويت',
    Qatar: 'قطر',
    Singapore: 'سنغافورة',
    Tehran: 'معهد الجيوفيزياء بجامعة طهران',
    Turkey: 'رئاسة الشؤون الدينية التركية',
  } satisfies Record<CalculationMethodName, string>,
  delayLabel: 'التذكير بعد الأذان بـ (دقائق)',
  delayInvalid: `اكتب عدد الدقائق، من 0 إلى ${MAX_DELAY_MINUTES}.`,
  prayersLabel: 'الصلوات التي يصلك بعدها تذكير',
  prayers: {
    fajr: 'الفجر',
    dhuhr: 'الظهر',
    asr: 'العصر',
    maghrib: 'المغرب',
    isha: 'العشاء',
  } satisfies Record<Prayer, string>,
  settingsSaved: 'حُفظت الإعدادات.',
  notificationsDenied: 'الإشعارات متوقفة لهذا التطبيق، فلن يصلك التذكير. فعّلها من إعدادات الهاتف.',
  remindersChannel: 'التذكير بالمراجعة',
  reminderTitle: 'حان وقت المراجعة',
  reminderBody: (prayer: Prayer) => `بعد صلاة ${t.prayers[prayer]}: راجع أسئلتك المستحقة.`,
} as const;
