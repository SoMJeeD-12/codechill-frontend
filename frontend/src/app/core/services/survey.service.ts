import { Injectable, computed, signal } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import { buildMockSurveys } from '../mock/survey.mock';
import {
  QuestionType,
  Survey,
  SurveyAnswer,
  SurveyQuestion,
  SurveyResponse,
  SurveyStatus,
} from '../models/survey.model';

export interface SurveyInput {
  title: string;
  description: string;
  status: SurveyStatus;
  questions: Array<{
    text: string;
    type: QuestionType;
    required: boolean;
    options: string[];
  }>;
}

export interface SurveyResponseInput {
  customerId: number;
  answers: SurveyAnswer[];
  submittedByName: string;
}

export interface SurveySummary {
  responseCount: number;
  averageRating: number | null;
  ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface SurveyListParams {
  status?: SurveyStatus;
  search?: string;
}

/**
 * Surveys M8 — mock จนกว่าจะมี /api/surveys
 * ลูกค้าไม่มีบัญชี → พนักงานบันทึกคำตอบแทน (ตาม Q1 ในเอกสาร)
 */
@Injectable({ providedIn: 'root' })
export class SurveyService {
  private readonly surveysSignal = signal<Survey[]>([]);
  private readonly responsesSignal = signal<SurveyResponse[]>([]);
  private nextSurveyId = 1;
  private nextResponseId = 1;
  private demoSeeded = false;

  readonly surveys = this.surveysSignal.asReadonly();
  readonly activeCount = computed(
    () => this.surveysSignal().filter((s) => s.status === 'ACTIVE').length
  );

  list(params: SurveyListParams = {}): Observable<Survey[]> {
    let rows = this.surveysSignal();
    if (params.status) {
      rows = rows.filter((s) => s.status === params.status);
    }
    if (params.search?.trim()) {
      const q = params.search.trim().toLowerCase();
      rows = rows.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
      );
    }
    return of(structuredClone(rows)).pipe(delay(180));
  }

  getById(id: number): Survey | undefined {
    return this.surveysSignal().find((s) => s.id === id);
  }

  get(id: number): Observable<Survey> {
    const row = this.getById(id);
    if (!row) {
      return throwError(() => new Error('ไม่พบแบบประเมิน'));
    }
    return of(structuredClone(row)).pipe(delay(100));
  }

  getResponses(surveyId: number): SurveyResponse[] {
    return this.responsesSignal()
      .filter((r) => r.surveyId === surveyId)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }

  listResponses(surveyId: number): Observable<SurveyResponse[]> {
    return of(structuredClone(this.getResponses(surveyId))).pipe(delay(100));
  }

  summarize(surveyId: number): SurveySummary {
    const responses = this.getResponses(surveyId);
    const distribution: SurveySummary['ratingDistribution'] = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    const averages = responses
      .map((r) => r.ratingAverage)
      .filter((v): v is number => v != null);
    for (const r of responses) {
      for (const a of r.answers) {
        if (typeof a.value === 'number' && a.value >= 1 && a.value <= 5) {
          distribution[a.value as 1 | 2 | 3 | 4 | 5] += 1;
        }
      }
    }
    const averageRating =
      averages.length > 0
        ? Math.round((averages.reduce((s, n) => s + n, 0) / averages.length) * 10) / 10
        : null;
    return {
      responseCount: responses.length,
      averageRating,
      ratingDistribution: distribution,
    };
  }

  create(input: SurveyInput): Observable<Survey> {
    if (!input.title.trim()) {
      return throwError(() => new Error('กรุณาระบุชื่อแบบประเมิน'));
    }
    if (!input.questions.length) {
      return throwError(() => new Error('ต้องมีอย่างน้อย 1 คำถาม'));
    }
    const questions: SurveyQuestion[] = input.questions.map((q, i) => ({
      id: i + 1,
      text: q.text.trim(),
      type: q.type,
      required: q.required,
      options: q.type === 'CHOICE' ? q.options.filter((o) => o.trim()) : [],
    }));
    if (questions.some((q) => !q.text)) {
      return throwError(() => new Error('คำถามต้องไม่ว่าง'));
    }
    const now = new Date().toISOString();
    const row: Survey = {
      id: this.nextSurveyId++,
      title: input.title.trim(),
      description: input.description.trim(),
      status: input.status,
      questions,
      createdAt: now,
      updatedAt: now,
    };
    this.surveysSignal.update((list) => [row, ...list]);
    return of(structuredClone(row)).pipe(delay(220));
  }

  updateStatus(id: number, status: SurveyStatus): Observable<Survey> {
    const current = this.getById(id);
    if (!current) {
      return throwError(() => new Error('ไม่พบแบบประเมิน'));
    }
    const updated: Survey = { ...current, status, updatedAt: new Date().toISOString() };
    this.surveysSignal.update((list) => list.map((s) => (s.id === id ? updated : s)));
    return of(structuredClone(updated)).pipe(delay(150));
  }

  submitResponse(surveyId: number, input: SurveyResponseInput): Observable<SurveyResponse> {
    const survey = this.getById(surveyId);
    if (!survey) {
      return throwError(() => new Error('ไม่พบแบบประเมิน'));
    }
    if (survey.status !== 'ACTIVE') {
      return throwError(() => new Error('แบบประเมินนี้ยังไม่เปิดรับคำตอบ'));
    }
    if (!input.customerId) {
      return throwError(() => new Error('กรุณาเลือกลูกค้า'));
    }
    for (const q of survey.questions) {
      if (!q.required) {
        continue;
      }
      const ans = input.answers.find((a) => a.questionId === q.id);
      if (ans == null || ans.value === '' || ans.value == null) {
        return throwError(() => new Error(`กรุณาตอบ: ${q.text}`));
      }
    }
    const ratingValues = input.answers
      .filter((a) => typeof a.value === 'number')
      .map((a) => Number(a.value));
    const ratingAverage =
      ratingValues.length > 0
        ? Math.round(
            (ratingValues.reduce((s, n) => s + n, 0) / ratingValues.length) * 10
          ) / 10
        : null;

    const row: SurveyResponse = {
      id: this.nextResponseId++,
      surveyId,
      customerId: input.customerId,
      answers: input.answers,
      submittedAt: new Date().toISOString(),
      submittedByName: input.submittedByName || 'ไม่ระบุ',
      ratingAverage,
    };
    this.responsesSignal.update((list) => [row, ...list]);
    return of(structuredClone(row)).pipe(delay(220));
  }

  ensureDemoSeed(
    customerId: number,
    secondCustomerId?: number | null
  ): Observable<Survey[]> {
    if (this.demoSeeded || this.surveysSignal().length > 0) {
      return this.list();
    }
    const { surveys, responses } = buildMockSurveys({
      customerId,
      secondCustomerId,
    });
    this.surveysSignal.set(surveys);
    this.responsesSignal.set(responses);
    this.nextSurveyId = Math.max(...surveys.map((s) => s.id)) + 1;
    this.nextResponseId = Math.max(...responses.map((r) => r.id)) + 1;
    this.demoSeeded = true;
    return of(structuredClone(surveys)).pipe(delay(160));
  }
}
