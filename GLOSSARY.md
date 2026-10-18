# Ma'had Review

A personal study companion for a student of an online ma'had (Sharia institute). It turns each lesson's material into questions and brings them back over time so the student memorizes what was taught.

## Language

### Study material

**Subject** (مادة):
A course of study at the ma'had, such as Fiqh, Aqeedah or Muojaz, made up of numbered lessons.
_Avoid_: Course, book, category

**Lesson** (درس):
One numbered class within a Subject, together with the material the student adds for it.
_Avoid_: Lecture, class, session

**Transcript** (تفريغ):
The ma'had's PDF write-up of a Lesson's audio, containing the full detailed explanation.
_Avoid_: Notes, PDF, document

**Interactive Review** (مذاكرة تفاعلية):
The ma'had's web page for a Lesson, made of Concept Cards followed by practice questions.
_Avoid_: Link, website, page

**Concept Card**:
One card on an Interactive Review page that states a definition or a division (تقسيم) of a concept.
_Avoid_: Flashcard, slide

**Ma'had Material**:
Any Transcript or Interactive Review content; it belongs to the ma'had, not to the student.

### Practice

**Question**:
A prompt about one point of a Lesson, drawn only from that Lesson's Ma'had Material, with its correct answer.
_Avoid_: Card, quiz item

**Source Passage**:
The short quotation from a Transcript that a generated Question was drawn from, shown with its answer.
_Avoid_: Reference, citation

**Multiple-Choice Question**:
A Question answered by picking one option, graded automatically.
_Avoid_: MCQ (in UI text)

**Open Question**:
A Question answered from memory, then graded by the student comparing with the shown answer.
_Avoid_: Essay question, written question

**Rating**:
The student's judgement of one answer: Again, Hard, Good or Easy.
_Avoid_: Score, grade, mark

**Review**:
One attempt at one Question, producing a Rating that decides when the Question comes back.
_Avoid_: Test, quiz, attempt

**Review Session**:
A short run of due Questions answered one after another.
_Avoid_: Quiz, test

**Reminder**:
A phone notification shortly after one of the five daily prayers that opens a Review Session.
_Avoid_: Alert, push

## Relationships

- A **Subject** has many numbered **Lessons**
- A **Lesson** has at most one **Transcript** and at most one **Interactive Review**
- An **Interactive Review** contains many **Concept Cards** and its own practice questions
- A **Lesson** has many **Questions**; each **Question** is either a **Multiple-Choice Question** or an **Open Question**
- A **Question** has many **Reviews** over time; each **Review** has one **Rating**
- A generated **Question** has one **Source Passage**; a **Question** copied from an **Interactive Review** has none
- A **Reminder** opens one **Review Session** of a few due **Questions**
