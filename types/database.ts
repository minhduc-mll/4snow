import type {
  LuckyDrawPrize,
  LuckyDrawSettingsSnapshot,
  LuckyDrawTicketConfig,
  PrizeCategory,
} from "./lucky-draw";

export type JsonPrimitive = string | number | boolean | null;
export type Json = JsonPrimitive | { [key: string]: Json | undefined } | Json[];
export type UUID = string;
export type IsoDateTime = string;

export interface SupabaseRecord {
  [key: string]: unknown;
}

export type QuizSessionStatus =
  | "draft"
  | "lobby"
  | "active"
  | "paused"
  | "completed";

export type QuestionType = "single_choice" | "multiple_choice" | "true_false";

export interface QuizOption {
  id: string;
  label: string;
  value: string;
}

export interface QuizSession extends SupabaseRecord {
  id: UUID;
  title: string;
  status: QuizSessionStatus;
  join_code: string;
  current_question_id: UUID | null;
  current_question_started_at: IsoDateTime | null;
  started_at: IsoDateTime | null;
  stopped_at: IsoDateTime | null;
  question_index: number;
  total_questions: number;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface QuizQuestion extends SupabaseRecord {
  id: UUID;
  session_id: UUID;
  prompt: string;
  type: QuestionType;
  options: QuizOption[];
  correct_option_ids: string[];
  time_limit_seconds: number;
  base_points: number;
  order_index: number;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface QuizSubmission extends SupabaseRecord {
  id: UUID;
  session_id: UUID;
  question_id: UUID;
  participant_id: UUID | null;
  selected_option_ids: string[];
  is_correct: boolean;
  time_remaining_ms: number;
  score: number;
  submitted_at: IsoDateTime;
  created_at: IsoDateTime;
}

export interface Donation extends SupabaseRecord {
  id: UUID;
  display_name: string;
  donor_name: string | null;
  amount: number;
  ticket_number: number | null;
  is_eligible: boolean;
  metadata: Json;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface Participant extends SupabaseRecord {
  id: UUID;
  session_id: UUID;
  display_name: string;
  avatar_url: string | null;
  score: number;
  is_connected: boolean;
  last_seen_at: IsoDateTime;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface Winner extends SupabaseRecord {
  id: UUID;
  draw_id: UUID;
  participant_id: UUID | null;
  display_name: string | null;
  winning_number: number;
  prize_id: UUID;
  prize_name: string;
  prize_category: PrizeCategory;
  metadata: Json;
  created_at: IsoDateTime;
}

export interface DrawConfig extends SupabaseRecord {
  id: UUID;
  name: string;
  prizes: LuckyDrawPrize[];
  ticket_config: LuckyDrawTicketConfig;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface DrawResult extends SupabaseRecord {
  id: UUID;
  config_id: UUID;
  prize_id: string;
  prize_name: string;
  winners: string[];
  draw_settings_snapshot: LuckyDrawSettingsSnapshot;
  created_by: UUID | null;
  created_at: IsoDateTime;
}

export type QuizSessionInsert = Omit<
  QuizSession,
  "id" | "created_at" | "updated_at"
> &
  Partial<Pick<QuizSession, "id" | "created_at" | "updated_at">>;

export type QuizSessionUpdate = Partial<QuizSessionInsert>;

export type QuizQuestionInsert = Omit<
  QuizQuestion,
  "id" | "created_at" | "updated_at"
> &
  Partial<Pick<QuizQuestion, "id" | "created_at" | "updated_at">>;

export type QuizQuestionUpdate = Partial<QuizQuestionInsert>;

export type QuizSubmissionInsert = Omit<
  QuizSubmission,
  "id" | "created_at"
> &
  Partial<Pick<QuizSubmission, "id" | "created_at">>;

export type QuizSubmissionUpdate = Partial<QuizSubmissionInsert>;

export type DonationInsert = Omit<Donation, "id" | "created_at" | "updated_at"> &
  Partial<Pick<Donation, "id" | "created_at" | "updated_at">>;

export type DonationUpdate = Partial<DonationInsert>;

export type ParticipantInsert = Omit<
  Participant,
  "id" | "created_at" | "updated_at"
> &
  Partial<Pick<Participant, "id" | "created_at" | "updated_at">>;

export type ParticipantUpdate = Partial<ParticipantInsert>;

export type WinnerInsert = Omit<Winner, "id" | "created_at"> &
  Partial<Pick<Winner, "id" | "created_at">>;

export type WinnerUpdate = Partial<WinnerInsert>;

export type DrawConfigInsert = Omit<
  DrawConfig,
  "id" | "created_at" | "updated_at"
> &
  Partial<Pick<DrawConfig, "id" | "created_at" | "updated_at">>;

export type DrawConfigUpdate = Partial<DrawConfigInsert>;

export type DrawResultInsert = Omit<DrawResult, "id" | "created_at"> &
  Partial<Pick<DrawResult, "id" | "created_at">>;

export type DrawResultUpdate = Partial<DrawResultInsert>;

interface TableDefinition<
  Row extends SupabaseRecord,
  Insert extends SupabaseRecord,
  Update extends SupabaseRecord,
> {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
}

export interface Database {
  public: {
    Tables: {
      [key: string]: TableDefinition<
        SupabaseRecord,
        SupabaseRecord,
        SupabaseRecord
      >;
      quiz_sessions: TableDefinition<
        QuizSession,
        QuizSessionInsert,
        QuizSessionUpdate
      >;
      quiz_questions: TableDefinition<
        QuizQuestion,
        QuizQuestionInsert,
        QuizQuestionUpdate
      >;
      quiz_submissions: TableDefinition<
        QuizSubmission,
        QuizSubmissionInsert,
        QuizSubmissionUpdate
      >;
      donations: TableDefinition<Donation, DonationInsert, DonationUpdate>;
      participants: TableDefinition<
        Participant,
        ParticipantInsert,
        ParticipantUpdate
      >;
      winners: TableDefinition<Winner, WinnerInsert, WinnerUpdate>;
      draw_configs: TableDefinition<DrawConfig, DrawConfigInsert, DrawConfigUpdate>;
      draw_results: TableDefinition<DrawResult, DrawResultInsert, DrawResultUpdate>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      prize_category: PrizeCategory;
      question_type: QuestionType;
      quiz_session_status: QuizSessionStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
