// Every piece of interface text, in Arabic. Terms follow GLOSSARY.md:
// Subject = مادة, Lesson = درس.
export const t = {
  appName: 'مُذاكر',

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
    n === 0 ? 'لا دروس' : n === 1 ? 'درس واحد' : n === 2 ? 'درسان' : n <= 10 ? `${n} دروس` : `${n} درسًا`,
  deleteSubjectTitle: 'حذف المادة',
  deleteSubjectMessage: (name: string) => `هل تريد حذف مادة «${name}» وكل دروسها؟`,

  lessons: 'الدروس',
  noLessons: 'لا توجد دروس في هذه المادة بعد.',
  lessonNumberPlaceholder: 'رقم الدرس',
  addLesson: 'أضف درسًا',
  lesson: (n: number) => `الدرس ${n}`,
  lessonNumberInvalid: 'اكتب رقم الدرس، عددًا صحيحًا من 1 فما فوق.',
  lessonNumberTaken: 'يوجد درس بهذا الرقم في هذه المادة.',
  deleteLessonTitle: 'حذف الدرس',
  deleteLessonMessage: (n: number) => `هل تريد حذف الدرس ${n}؟`,
  subjectNotFound: 'لم يتم العثور على هذه المادة.',
} as const;
