export type SurveyStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';

export type QuestionType = 'RATING' | 'TEXT' | 'CHOICE';

export interface SurveyQuestion {
  id: number;
  text: string;
  type: QuestionType;
  required: boolean;
  /** ตัวเลือกสำหรับ CHOICE */
  options: string[];
}

export interface Survey {
  id: number;
  title: string;
  description: string;
  status: SurveyStatus;
  questions: SurveyQuestion[];
  createdAt: string;
  updatedAt: string;
}

export interface SurveyAnswer {
  questionId: number;
  /** คะแนน 1–5 สำหรับ RATING, ข้อความสำหรับ TEXT/CHOICE */
  value: string | number;
}

export interface SurveyResponse {
  id: number;
  surveyId: number;
  customerId: number;
  answers: SurveyAnswer[];
  submittedAt: string;
  submittedByName: string;
  /** ค่าเฉลี่ยคะแนน RATING ในใบนี้ (ถ้ามี) */
  ratingAverage: number | null;
}

export const SURVEY_STATUS_LABELS: Record<SurveyStatus, string> = {
  DRAFT: 'แบบร่าง',
  ACTIVE: 'เปิดรับคำตอบ',
  CLOSED: 'ปิดแล้ว',
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  RATING: 'คะแนน 1–5',
  TEXT: 'ข้อความอิสระ',
  CHOICE: 'เลือกข้อ',
};
