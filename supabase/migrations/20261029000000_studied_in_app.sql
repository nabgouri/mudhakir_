-- The student marks a Lesson studied in the app, not by reacting to it in
-- the Ma'had Channel: the channel has reactions turned off (docs/adr/0002).
-- The phone's change syncs up like any edit of a Lesson.

drop function public.mark_lessons_studied(uuid, uuid, integer);

comment on column public.lessons.studied_at is
  'When the student studied the Lesson: when added by hand, or when marked studied in the app (with every earlier Lesson of its Subject). Null for an imported Lesson not yet studied.';
