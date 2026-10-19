-- Questions from the Transcript. The Transcript's text has no column: the
-- phone sends it only in each part's request to the `generate-lesson` Edge
-- Function, which passes it to the routine, and nothing stores it.
--
-- `transcript_digests` holds the SHA-256 (hex) of each part's text, in part
-- order; it is empty for a Lesson without a Transcript. A digest is not the
-- text. The routine's write script checks its copy of a part's text against
-- it, and a phone retrying a failed part checks a re-attached Transcript
-- against it.

alter table public.lessons add column transcript_digests text[] not null default '{}';

comment on column public.lessons.transcript_digests is
  'SHA-256 (hex) of each Transcript part''s text, in part order; the text itself is never stored.';
