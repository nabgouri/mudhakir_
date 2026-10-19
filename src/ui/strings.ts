import { MAX_LESSON_NUMBER } from '@/data/input';

// Every piece of interface text, in Arabic. Terms follow GLOSSARY.md:
// Subject = مادة, Lesson = درس.
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
  lessonCount: (n: number) => {
    if (n === 0) return 'لا دروس';
    if (n === 1) return 'درس واحد';
    if (n === 2) return 'درسان';
    const lastTwo = n % 100;
    if (lastTwo >= 3 && lastTwo <= 10) return `${n} دروس`;
    if (lastTwo >= 11) return `${n} درسًا`;
    return `${n} درس`;
  },
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
} as const;
