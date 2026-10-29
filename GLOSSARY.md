# مُذاكر (Mudhakir)

A personal study companion for a student of an online ma'had (Sharia institute). It turns each lesson's material into questions and brings them back over time so the student memorizes what was taught.

## Language

### Study material

**Subject** (مادة):
A course of study at the ma'had, such as Fiqh, Aqeedah or Muojaz, made up of numbered lessons.
_Avoid_: Course, book, category

**Lesson** (درس):
One numbered class within a Subject, together with the material the student adds for it or the Channel Reader imports.
_Avoid_: Lecture, class, session

**Studied Lesson**:
A Lesson the student has studied: added by hand, or reacted to in the Ma'had Channel. Only a Studied Lesson's new Questions are introduced into Review Sessions.
_Avoid_: Read, done, completed

**Lesson Title**:
The name the ma'had gives a Lesson, taken from the caption of its audio post, such as «الشرك الأكبر المنافي لتوحيد الألوهية».
_Avoid_: Topic, heading

**Ma'had Channel**:
The ma'had's Telegram channel, where each Lesson is posted as its audio, its Transcript PDF and its Interactive Review link, all tagged with the Subject's hashtag.
_Avoid_: Group, chat

**Supplement** (المواد الإثرائية):
Extra reading the Ma'had Channel posts under `#المواد_الإثرائية`; it is not a Lesson and never becomes Questions.
_Avoid_: Bonus lesson

**Channel Reader**:
The scheduled script that checks the Ma'had Channel every hour and sends each new Lesson to question generation. It is plain code; it uses no AI.
_Avoid_: Bot, agent, scraper

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
The short quotation from a Transcript, or the text of a Concept Card, that a generated Question was drawn from, shown with its answer.
_Avoid_: Reference, citation

**Core Question**:
A Question on one of a Lesson's main points: a definition, a division (تقسيم), a ruling (حكم) or its evidence. A Lesson has about five to eight; they are introduced before Detail Questions.
_Avoid_: Important question, key question

**Detail Question**:
Any Question that is not a Core Question, such as one part of a division or a condition explained in passing. It is introduced only when Review Sessions have room.
_Avoid_: Minor question, extra question

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
- A **Question** generated from a **Transcript** or a **Concept Card** has one **Source Passage**; a **Question** copied from an **Interactive Review**'s practice questions has none
- A **Reminder** opens one **Review Session** of a few due **Questions**
- A **Lesson** has at most one **Lesson Title**
- A **Lesson** imported by the **Channel Reader** is not a **Studied Lesson** until the student reacts to one of its posts, which also makes every earlier **Lesson** of its **Subject** studied
- Each **Question** is either a **Core Question** or a **Detail Question**
- The **Channel Reader** reads one **Ma'had Channel**; each **Subject** there has its own hashtag, and **Supplements** are skipped
