import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type QuizStep = "setup" | "lobby" | "question" | "leaderboard" | "results";
export type AnswerStatus = "idle" | "pending" | "confirmed" | "rejected";

export interface QuizStoreState {
  activeStep: QuizStep;
  activeSessionId: string | null;
  activeQuestionId: string | null;
  selectedOptionIds: string[];
  answerStatus: AnswerStatus;
  syncedQuestionStartedAt: string | null;
  syncedQuestionDurationSeconds: number;
  localCountdownSeconds: number;
  isImportModalOpen: boolean;
  isLeaderboardOpen: boolean;
}

export interface QuizStoreActions {
  setActiveStep: (step: QuizStep) => void;
  setActiveSession: (sessionId: string | null) => void;
  setActiveQuestion: (questionId: string | null) => void;
  setSelectedOptionIds: (optionIds: string[]) => void;
  setAnswerStatus: (status: AnswerStatus) => void;
  setSyncedQuestionTimer: (
    startedAt: string | null,
    durationSeconds: number,
  ) => void;
  setLocalCountdownSeconds: (seconds: number) => void;
  setImportModalOpen: (isOpen: boolean) => void;
  setLeaderboardOpen: (isOpen: boolean) => void;
  resetQuizUi: () => void;
}

export type QuizStore = QuizStoreState & QuizStoreActions;

const initialState: QuizStoreState = {
  activeStep: "setup",
  activeSessionId: null,
  activeQuestionId: null,
  selectedOptionIds: [],
  answerStatus: "idle",
  syncedQuestionStartedAt: null,
  syncedQuestionDurationSeconds: 0,
  localCountdownSeconds: 0,
  isImportModalOpen: false,
  isLeaderboardOpen: false,
};

export const useQuizStore = create<QuizStore>()(
  devtools(
    (set) => ({
      ...initialState,
      setActiveStep: (activeStep) => set({ activeStep }),
      setActiveSession: (activeSessionId) => set({ activeSessionId }),
      setActiveQuestion: (activeQuestionId) =>
        set({ activeQuestionId, selectedOptionIds: [], answerStatus: "idle" }),
      setSelectedOptionIds: (selectedOptionIds) =>
        set({ selectedOptionIds, answerStatus: "pending" }),
      setAnswerStatus: (answerStatus) => set({ answerStatus }),
      setSyncedQuestionTimer: (
        syncedQuestionStartedAt,
        syncedQuestionDurationSeconds,
      ) =>
        set({
          syncedQuestionStartedAt,
          syncedQuestionDurationSeconds: Math.max(
            0,
            syncedQuestionDurationSeconds,
          ),
        }),
      setLocalCountdownSeconds: (localCountdownSeconds) =>
        set({ localCountdownSeconds: Math.max(0, localCountdownSeconds) }),
      setImportModalOpen: (isImportModalOpen) => set({ isImportModalOpen }),
      setLeaderboardOpen: (isLeaderboardOpen) => set({ isLeaderboardOpen }),
      resetQuizUi: () => set(initialState),
    }),
    { name: "quiz-ui-store" },
  ),
);
