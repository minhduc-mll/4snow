# Quiz Feature Requirements

## 1. Purpose

Build a Kahoot-like Quiz feature where an admin imports questions from an Excel file, creates a room code, allows players to join the room, runs the quiz in real time, and shows live rankings during and after the game.

The Quiz feature must support:

- Admin-managed quiz setup.
- Excel-based question import.
- Room code generation.
- Player join flow by code or QR link.
- Waiting room with visible participants.
- Real-time quiz start and question progression.
- Real-time answers and scoring.
- Per-question top 3 leaderboard.
- Shared `/quiz-leaderboard` page with top 10 ranking.
- Final podium display for ranks 1, 2, and 3.

---

## 2. Routes and Screens

### 2.1 `/admin`

The existing `/admin` page is the shared admin configuration area.

It should include a Quiz admin section alongside the Lucky Draw admin section.

The Quiz admin section must allow the admin to:

- Upload an Excel file.
- Preview imported questions.
- Validate imported questions.
- Configure quiz settings.
- Create or reset a quiz room.
- Generate a room code.
- Show a join URL and QR code.
- Start the quiz.
- Move to the next question.
- End the quiz.
- View current participants.
- View live ranking.

### 2.2 `/quiz`

The `/quiz` page is the player entry and gameplay page.

Supported URLs:

```txt
/quiz
/quiz?code=ABC123
```

Behavior:

- If no `code` query parameter exists, show a room-code input form.
- If `code` exists, attempt to join that quiz room.
- After a valid code is entered, the player enters the waiting room.
- When the admin starts the quiz, the player transitions into gameplay.
- After the quiz ends, the player sees the final ranking or podium result.

### 2.3 `/quiz-leaderboard`

The `/quiz-leaderboard` page is a shared display page for live ranking.

Supported URLs:

```txt
/quiz-leaderboard
/quiz-leaderboard?code=ABC123
```

Behavior:

- If no `code` query parameter exists, show a room-code input form.
- If `code` exists, subscribe to that room's leaderboard.
- During the quiz, show the top 10 players in real time.
- After the quiz ends, show a final podium layout for ranks 1, 2, and 3, plus the remaining top 10 list.

---

## 3. Excel Import

### 3.1 Excel Upload

The admin must be able to upload an Excel file containing quiz questions.

Use `xlsx` for browser-side Excel parsing.

Do not require a server to parse the Excel file.

### 3.2 Admin-Defined Columns

The admin should be able to define or map the required columns from the uploaded file.

Minimum required logical fields:

```ts
type QuizQuestionImportMapping = {
  question: string;
  optionA: string;
  optionB: string;
  optionC?: string;
  optionD?: string;
  correctAnswer: string;
  timeLimitSeconds?: string;
  points?: string;
  imageUrl?: string;
  explanation?: string;
};
```

The actual Excel column names may be different.

Example Excel columns:

```txt
Question | A | B | C | D | Answer | Time | Points
```

or:

```txt
question_text | answer_1 | answer_2 | answer_3 | answer_4 | correct | duration | score
```

The admin must be able to map those columns to the internal fields.

### 3.3 Question Types

This version should support single-choice questions.

Each question must have:

- Question text.
- At least 2 options.
- At most 4 options.
- Exactly 1 correct answer.
- Time limit.
- Points.

Optional fields:

- Image URL.
- Explanation shown after answering or after the question ends.

Out of scope for this version:

- Multiple correct answers.
- Open text answers.
- Reordering answers.
- Polls.
- Surveys.
- Team mode.

### 3.4 Import Validation

The import flow must validate:

- File exists.
- File type is `.xlsx` or `.xls`.
- Required mapped columns exist.
- Every question has text.
- Every question has at least 2 non-empty options.
- Every question has exactly 1 valid correct answer.
- Correct answer must match one of the available options or a valid option key.
- Time limit must be a positive number.
- Points must be a positive number.
- Empty rows should be ignored if safe.
- Invalid rows should be reported clearly.

The admin must see an import summary:

- Total rows found.
- Valid questions.
- Invalid rows.
- Validation errors per row.

### 3.5 File Storage Note

The admin requested that the uploaded Excel file may be saved under the `public` folder using the room code as the file name.

Important implementation constraint:

- A browser-only app cannot write uploaded files into the project `public` folder at runtime.
- Do not implement a fake browser write to `/public`.
- If the project has a build-time or developer-only import script later, it may export a copy to `public/quiz/{roomCode}.xlsx` or `public/quiz/{roomCode}.json`.
- For runtime gameplay, the app must use parsed quiz data stored in the chosen client-accessible persistence layer.

The room code should still be used as the stable identifier for the imported quiz room.

---

## 4. Room Creation

After a valid Excel import, the admin can create a quiz room.

Room creation must generate a short, readable room code.

Recommended code format:

```txt
6 uppercase characters
Example: K8Q2MZ
```

Room code rules:

- Code must be unique among active rooms.
- Code should avoid confusing characters where practical, such as `O`, `0`, `I`, and `1`.
- Code should be easy to type from a shared screen.

A created room must store:

```ts
type QuizRoom = {
  code: string;
  title: string;
  status: QuizRoomStatus;
  questions: QuizQuestion[];
  settings: QuizSettings;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  endedAt?: string;
};
```

Room status:

```ts
type QuizRoomStatus =
  | "draft"
  | "waiting"
  | "active"
  | "between_questions"
  | "completed";
```

---

## 5. QR Code and Join Link

After room creation, the admin screen must show:

- Room code.
- Join URL.
- QR code.

Join URL format:

```txt
/quiz?code=ABC123
```

Leaderboard URL format:

```txt
/quiz-leaderboard?code=ABC123
```

The QR code should encode the join URL.

Players scanning the QR code should open `/quiz?code=ABC123` directly.

---

## 6. Waiting Room

### 6.1 Player Join

A player enters the waiting room by:

- Typing a room code at `/quiz`.
- Opening `/quiz?code=ABC123`.
- Scanning the QR code.

Before joining, the player must enter a display name.

Recommended fields:

```ts
type QuizPlayer = {
  id: string;
  roomCode: string;
  name: string;
  avatar: QuizAvatar;
  score: number;
  joinedAt: string;
  lastSeenAt: string;
};
```

### 6.2 Avatar

Each player should receive a fun avatar.

Avatar may be generated randomly from a predefined icon list.

Recommended avatar data:

```ts
type QuizAvatar = {
  icon: string;
  color: string;
};
```

Avatar requirements:

- Use fun and friendly icons.
- Avatar can be randomly assigned.
- Avatar should remain stable for the player during the session.
- The player list should show avatar and name.

### 6.3 Waiting Room UI

The waiting room must show:

- Room title.
- Room code.
- Player's own name and avatar.
- List/grid of joined players.
- Friendly "Waiting for host to start" state.
- Live updates when players join or leave.

Players must not see question content before the admin starts the quiz.

---

## 7. Real-Time Flow

The Quiz feature requires real-time synchronization.

Recommended channels:

- Room channel: room state and current question state.
- Participant channel: player join/leave and answer submissions.
- Leaderboard channel: aggregated ranking updates.

Realtime rules:

- Do not broadcast every low-level UI interaction.
- Broadcast meaningful aggregated state.
- Throttle leaderboard updates where needed.
- Avoid animation spam.

### 7.1 Admin Flow

```txt
Admin imports Excel
-> Admin validates questions
-> Admin creates room code
-> Players join waiting room
-> Admin clicks Start Quiz
-> All players move from waiting room to first question
-> Admin advances question by question
-> After each question, top 3 leaderboard is shown
-> Admin continues until all questions are completed
-> Final leaderboard and podium are shown
```

### 7.2 Player Flow

```txt
Player opens /quiz or /quiz?code=ABC123
-> Player enters code if needed
-> Player enters display name
-> Player receives avatar
-> Player enters waiting room
-> Player sees other waiting players
-> Admin starts quiz
-> Player answers each question within time limit
-> Player sees feedback after each question
-> Player sees top 3 after each question
-> Player sees final podium/ranking after quiz ends
```

### 7.3 Leaderboard Display Flow

```txt
Display opens /quiz-leaderboard?code=ABC123
-> Display subscribes to leaderboard for room
-> During quiz, display shows top 10 in real time
-> After quiz ends, display shows podium for ranks 1, 2, 3
-> Remaining top 10 stays visible below podium
```

---

## 8. Question Gameplay

### 8.1 Question Display

Each player should see:

- Current question number.
- Total question count.
- Question text.
- Optional image.
- Answer options.
- Countdown timer.
- Score value or points.
- Answer submission state.

### 8.2 Answer Submission

Each player can submit only one answer per question.

After submission:

- Disable answer options.
- Show "Answer submitted" state.
- Do not allow changing answer unless explicitly supported later.

If time expires:

- The player cannot submit an answer.
- The question is counted as unanswered.

### 8.3 Question Timing

Each question must have a time limit.

The timer must be based on:

```ts
startedAt;
durationSeconds;
```

Do not rely only on local `setTimeout`.

The UI may use local timers for display, but scoring should compare timestamps against the question start time and duration.

---

## 9. Scoring

### 9.1 Base Scoring

Each question has a point value.

Default:

```ts
points = 1000;
```

A correct answer receives points.

An incorrect answer receives 0 points.

No answer receives 0 points.

### 9.2 Speed Bonus

To feel similar to Kahoot, faster correct answers should receive more points.

Recommended scoring formula:

```ts
score = round(points * (0.5 + 0.5 * timeRemainingRatio));
```

Where:

```ts
timeRemainingRatio = max(0, timeRemainingMs / totalQuestionMs);
```

This means:

- Correct answer near the start gets close to full points.
- Correct answer near the end gets at least 50% of base points.
- Incorrect or missing answer gets 0.

Alternative formulas are allowed if documented, but the system must reward faster correct answers.

### 9.3 Score Aggregation

The player's total score is the sum of question scores.

Leaderboard ranking should sort by:

1. Highest total score.
2. More correct answers.
3. Faster total response time.
4. Earlier join time as final tie-breaker.

---

## 10. Leaderboard

### 10.1 Per-Question Top 3

After each question ends, players should see a top 3 leaderboard.

The top 3 should include:

- Rank.
- Player avatar.
- Player name.
- Current total score.

### 10.2 `/quiz-leaderboard` Top 10

The `/quiz-leaderboard` page should show the top 10 players in real time.

During the quiz:

- Show room title.
- Show room code.
- Show quiz progress.
- Show top 10 list.
- Update as aggregated scores change.

### 10.3 Final Podium

After all questions are completed, the player page and `/quiz-leaderboard` page must show a final podium for ranks 1, 2, and 3.

Podium requirements:

- Rank 1 should be visually highest or most prominent.
- Rank 2 should be second.
- Rank 3 should be third.
- Show avatar, player name, and score.
- Show remaining top 10 below the podium.

---

## 11. Admin Controls

The admin must be able to:

- Import Excel.
- Map Excel columns.
- Preview questions.
- Create room.
- Copy room code.
- Copy join link.
- Show QR code.
- Start quiz.
- Move to next question.
- End quiz.
- Reset room if needed.
- View joined players.
- View current question.
- View current top scores.

Admin should not be able to start the quiz if:

- There is no valid room.
- There are no valid questions.
- No players have joined, unless the admin explicitly confirms starting empty.
- A quiz is already active.

---

## 12. Persistence and State

The Quiz feature needs shared room state across admin, players, and leaderboard pages.

The implementation must choose a client-accessible shared persistence/realtime mechanism compatible with the project constraints.

Required persisted data:

- Room metadata.
- Parsed questions.
- Room status.
- Participants.
- Current question index.
- Question start time.
- Player answers.
- Player scores.
- Leaderboard snapshots or computed ranking.
- Timestamps.

Zustand may be used for local UI state, but it must not be the only source of shared quiz room state because multiple players and pages must synchronize.

---

## 13. Data Models

Recommended types:

```ts
type QuizOption = {
  id: string;
  text: string;
};

type QuizQuestion = {
  id: string;
  question: string;
  options: QuizOption[];
  correctOptionId: string;
  timeLimitSeconds: number;
  points: number;
  imageUrl?: string;
  explanation?: string;
  order: number;
};

type QuizSettings = {
  showCorrectAnswerAfterQuestion: boolean;
  showLeaderboardAfterQuestion: boolean;
  randomizeQuestionOrder: boolean;
  randomizeOptionOrder: boolean;
};

type QuizRoomStatus =
  | "draft"
  | "waiting"
  | "active"
  | "between_questions"
  | "completed";

type QuizRoom = {
  code: string;
  title: string;
  status: QuizRoomStatus;
  questions: QuizQuestion[];
  settings: QuizSettings;
  currentQuestionIndex: number;
  currentQuestionStartedAt?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  endedAt?: string;
};

type QuizPlayer = {
  id: string;
  roomCode: string;
  name: string;
  avatar: QuizAvatar;
  score: number;
  correctAnswers: number;
  totalResponseTimeMs: number;
  joinedAt: string;
  lastSeenAt: string;
};

type QuizAnswer = {
  id: string;
  roomCode: string;
  questionId: string;
  playerId: string;
  selectedOptionId: string;
  isCorrect: boolean;
  scoreAwarded: number;
  responseTimeMs: number;
  submittedAt: string;
};
```

---

## 14. Validation Requirements

### Room Validation

- Room code is required.
- Room code must exist before players can join.
- Completed rooms should not allow new gameplay unless reset.
- Active rooms should allow reconnecting players.

### Player Validation

- Player name is required.
- Player name must have a reasonable max length.
- Duplicate names may be allowed, but player IDs must be unique.
- Avatar must be assigned before entering the waiting room.

### Answer Validation

- Player must belong to the room.
- Room must be active.
- Question must be current.
- Player can only submit once per question.
- Submitted option must exist.
- Submission after timeout should be rejected or marked as late.

### Import Validation

- Excel file must be parseable.
- Required mapped columns must exist.
- Invalid rows must be reported.
- Quiz cannot start with zero valid questions.

---

## 15. Error Handling

The UI must show clear errors for:

- Invalid room code.
- Room not found.
- Room already completed.
- Failed Excel import.
- Invalid Excel mapping.
- No valid questions.
- Player name required.
- Failed to join room.
- Failed to submit answer.
- Answer submitted too late.
- Realtime connection lost.
- Admin attempted to start invalid room.

The app should allow safe retry where practical.

---

## 16. UX Requirements Inspired by Kahoot

Add the following Kahoot-like behavior where practical:

- Large room code display on admin screen.
- QR code for quick joining.
- Friendly waiting room.
- Fun randomized avatars.
- Countdown before quiz starts.
- Per-question countdown timer.
- Large answer buttons.
- Clear answer submitted state.
- Correct/incorrect feedback after each question.
- Top 3 reveal after each question.
- Final podium animation for ranks 1, 2, and 3.
- Shared leaderboard screen for projector display.
- Smooth transitions, but avoid heavy animations with many players.
- Mobile-friendly player UI.
- Big-screen-friendly admin and leaderboard UI.

---

## 17. Performance Requirements

- Waiting room should handle many players without heavy re-renders.
- Leaderboard should update using aggregated ranking rather than broadcasting every small UI change.
- Throttle leaderboard updates if needed.
- Avoid expensive animations for large player counts.
- Keep player answer submission fast and reliable.
- Avoid sending full question payload repeatedly when only state changes.

---

## 18. Out of Scope

The following are not required in this version:

- Team mode.
- Paid accounts.
- User authentication for players.
- Question bank management beyond Excel import.
- Editing individual questions after import, unless simple preview corrections are already easy.
- Multiple simultaneous quizzes controlled by one admin screen, unless room code separation already supports it.
- Complex anti-cheat.
- Audio/music.
- Advanced analytics export.
- Persistent player accounts.

---

## 19. Acceptance Criteria

### Admin

- Admin can upload an Excel file.
- Admin can map Excel columns.
- Admin can preview and validate imported questions.
- Admin can create a room code.
- Admin can see join link and QR code.
- Admin can see waiting players.
- Admin can start the quiz.
- Admin can advance through questions.
- Admin can end the quiz.
- Admin can see current ranking.

### Player

- Player can open `/quiz`.
- Player can enter a room code.
- Player can open `/quiz?code=ABC123` directly.
- Player can join with a display name.
- Player receives a fun avatar.
- Player sees other waiting players.
- Player starts gameplay when admin starts quiz.
- Player can answer each question once.
- Player sees feedback and top 3 after each question.
- Player sees final podium/ranking after quiz ends.

### Leaderboard

- `/quiz-leaderboard?code=ABC123` shows the room leaderboard.
- During the quiz, it shows the top 10 in real time.
- After the quiz ends, it shows a final podium for ranks 1, 2, and 3.
- Remaining top 10 appears below the podium.

### Gameplay

- Questions come from the imported Excel file.
- Each question has options, correct answer, time limit, and points.
- Scores reward correctness and speed.
- Leaderboard ranking is deterministic and tie-broken.
- Realtime state stays synchronized across admin, player, and leaderboard pages.

---

## 20. Recommended Implementation Flow

```txt
Admin opens /admin
-> Admin uploads Excel file
-> Browser parses Excel with xlsx
-> Admin maps columns
-> App validates questions
-> Admin creates quiz room
-> App generates room code
-> App stores room and question data
-> Admin shares /quiz?code=ROOMCODE or QR code
-> Players join waiting room
-> Waiting room shows live player list
-> Admin starts quiz
-> Players receive first question
-> Players submit answers
-> App scores answers based on correctness and speed
-> App updates leaderboard
-> Players see top 3 after each question
-> /quiz-leaderboard shows top 10 in real time
-> Admin advances through all questions
-> Quiz completes
-> Player and leaderboard pages show final podium
```

---

## 21. Non-Negotiable Rules

1. Admin imports quiz questions from Excel.
2. Admin can define or map the Excel columns.
3. Room code is generated after a valid import.
4. Players can join through `/quiz` by entering code.
5. Players can join directly through `/quiz?code=ROOMCODE`.
6. QR code must point to `/quiz?code=ROOMCODE`.
7. Waiting room must show joined players with fun avatars.
8. Admin starts the quiz; players cannot start it themselves.
9. Each player can answer only once per question.
10. Scores must reward correctness and speed.
11. Top 3 must be shown after each question.
12. `/quiz-leaderboard` must show top 10 in real time.
13. Final result must show podium ranks 1, 2, and 3.
14. The app must not rely on runtime browser writes to the project `public` folder.
15. Keep Lucky Draw behavior separate from Quiz behavior.
