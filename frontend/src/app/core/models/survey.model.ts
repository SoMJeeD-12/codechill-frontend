export type SurveyStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';

export type QuestionType = 'RATING' | 'CHOICE' | 'MULTI_CHOICE' | 'TEXT';

export type AssignmentStatus = 'PENDING' | 'SENT' | 'ANSWERED' | 'EXPIRED';

/** SurveyQuestionResponseDto */
export interface SurveyQuestion {
  id: number;
  questionText: string;
  questionType: QuestionType;
  isRequired: boolean;
  options: string[] | null;
  minValue: number | null;
  maxValue: number | null;
  sortOrder: number;
}

/** SurveyResponseDto */
export interface Survey {
  id: number;
  title: string;
  description: string | null;
  status: SurveyStatus;
  /** ใช้ตัดสินว่าส่ง/บันทึกคำตอบได้ตอนนี้ — อย่าอ่าน status อย่างเดียว */
  isCurrentlyUsable: boolean;
  validFrom: string | null;
  validTo: string | null;
  questions: SurveyQuestion[];
  assignmentCount: number;
  responseCount: number;
  createdAt: string;
  updatedAt: string;
}

/** AssignmentResponseDto */
export interface SurveyAssignment {
  id: number;
  surveyId: number;
  customerId: number;
  customerName: string | null;
  contactId: number | null;
  contactName: string | null;
  projectId: number | null;
  projectName: string | null;
  status: AssignmentStatus;
  sentAt: string | null;
  answeredAt: string | null;
  filledByUserId: number | null;
  filledByName: string | null;
  responseId: number | null;
  createdAt: string;
}

/** SurveyAnswerDto — ตอนส่งคำตอบ
 * RATING → answerNumber | CHOICE/TEXT → answerText | MULTI_CHOICE → answerChoices
 */
export interface SurveyAnswerInput {
  questionId: number;
  answerText?: string | null;
  answerNumber?: number | null;
  answerChoices?: string[] | null;
}

/** ResponseDetailDto */
export interface SurveyResponseDetail {
  id: number;
  assignmentId: number;
  surveyId: number;
  customerId: number;
  customerName: string | null;
  submittedAt: string;
  /** null → แสดง "—" ห้ามแสดง 0 */
  overallScore: number | null;
  comment: string | null;
  answers: unknown[];
  createdAt: string;
}

export interface QuestionSummary {
  questionId: number;
  questionText: string;
  questionType: QuestionType;
  answeredCount: number;
  averageScore?: number | null;
  choiceCounts?: Record<string, number>;
  textAnswers?: string[];
}

/** SurveySummaryDto */
export interface SurveySummary {
  surveyId: number;
  title: string;
  assignmentCount: number;
  responseCount: number;
  responseRate: number;
  averageScore: number | null;
  questions: QuestionSummary[];
}

export interface SurveyScoreBucket {
  responseCount: number;
  scoredCount: number;
  averageScore: number | null;
}

export interface SurveyScoreByCustomer extends SurveyScoreBucket {
  customerId: number;
  customerName: string | null;
  lastSubmittedAt: string | null;
}

export interface SurveyScoreByMonth extends SurveyScoreBucket {
  month: string;
}

/** GET /surveys/:id/score-breakdown */
export interface SurveyScoreBreakdown {
  surveyId: number;
  title: string;
  dateFrom: string | null;
  dateTo: string | null;
  overall: SurveyScoreBucket;
  byCustomer: SurveyScoreByCustomer[];
  byMonth: SurveyScoreByMonth[];
}

export const SURVEY_STATUS_LABELS: Record<SurveyStatus, string> = {
  DRAFT: 'แบบร่าง',
  ACTIVE: 'เปิดรับคำตอบ',
  CLOSED: 'ปิดแล้ว',
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  RATING: 'ให้คะแนน',
  CHOICE: 'เลือกข้อเดียว',
  MULTI_CHOICE: 'เลือกได้หลายข้อ',
  TEXT: 'ข้อความอิสระ',
};

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  PENDING: 'รอดำเนินการ',
  SENT: 'ส่งแล้ว',
  ANSWERED: 'ได้คำตอบแล้ว',
  EXPIRED: 'หมดอายุ',
};
