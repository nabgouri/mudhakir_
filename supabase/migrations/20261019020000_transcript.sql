-- Questions from the Transcript. The Transcript's text has no column: the
-- phone sends it only in each part's request to the `generate-lesson` Edge
-- Function, which passes it to the routine, and nothing stores it.
--
-- `has_transcript` records that a Lesson's parts carry Transcript text, so a
-- phone retrying a failed part knows to ask the student for the PDF again
-- when the text is no longer on it.

alter table public.lessons add column has_transcript boolean not null default false;

comment on column public.lessons.has_transcript is
  'Whether the Lesson''s parts carry Transcript text (the text itself is never stored).';
