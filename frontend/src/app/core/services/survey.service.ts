import { Injectable, computed, signal } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import {
  QuestionType,
  Survey,
  SurveyAnswer,
  SurveyQuestion,
  SurveyResponse,
  SurveyStatus,
} from '../models/survey.model';

const SURVEYS_KEY = 'cpams_mock_surveys';
const RESPONSES_KEY = 'cpams_mock_survey_responses';

const SEED_SURVEYS: Survey[] = [
  {
    id: 1,
    title: 'ความพึงพอใจหลังส่งมอบ',
    description: 'ประเมินคุณภาพงานและการสื่อสารหลังส่งมอบโครงการ',
    status: 'ACTIVE',
    questions: [
      {
        id: 1,
        text: 'ความพึงพอใจโดยรวมต่อผลงาน',
        type: 'RATING',
        required: true,
        options: [],
      },
      {
        id: 2,
        text: 'ความชัดเจนของการสื่อสารทีม',
        type: 'RATING',
        required: true,
        options: [],
      },
      {
        id: 3,
        text: 'จะแนะนำเราให้ผู้อื่นหรือไม่',
        type: 'CHOICE',
        required: true,
        options: ['แน่นอน', 'น่าจะใช่', 'ยังไม่แน่ใจ', 'ไม่แนะนำ'],
      },
      {
        id: 4,
        text: 'ข้อเสนอแนะเพิ่มเติม',
        type: 'TEXT',
        required: false,
        options: [],
      },
    ],
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
  },
  {
    id: 2,
    title: 'ประเมินบริการซัพพอร์ต',
    description: 'หลังปิดใบปัญหา',
    status: 'ACTIVE',
    questions: [
      {
        id: 1,
        text: 'ความรวดเร็วในการตอบรับ',
        type: 'RATING',
        required: true,
        options: [],
      },
      {
        id: 2,
        text: 'คุณภาพการแก้ไข',
        type: 'RATING',
        required: true,
        options: [],
      },
    ],
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
  },
  {
    id: 3,
    title: 'แบบร่าง — ประเมิน MA',
    description: 'ยังไม่เปิดรับคำตอบ',
    status: 'DRAFT',
    questions: [
      {
        id: 1,
        text: 'ความคุ้มค่าของสัญญา MA',
        type: 'RATING',
        required: true,
        options: [],
      },
    ],
    createdAt: '2026-09-05T09:00:00.000Z',
    updatedAt: '2026-09-05T09:00:00.000Z',
  },
];

const SEED_RESPONSES: SurveyResponse[] = [
  {
    id: 1,
    surveyId: 1,
    customerId: 1,
    answers: [
      { questionId: 1, value: 5 },
      { questionId: 2, value: 4 },
      { questionId: 3, value: 'แน่นอน' },
      { questionId: 4, value: 'ทีมตอบเร็ว ดีมาก' },
    ],
    submittedAt: '2026-08-15T10:00:00.000Z',
    submittedByName: 'วิชัย ซัพพอร์ต',
    ratingAverage: 4.5,
  },
  {
    id: 2,
    surveyId: 1,
    customerId: 2,
    answers: [
      { questionId: 1, value: 4 },
      { questionId: 2, value: 3 },
      { questionId: 3, value: 'น่าจะใช่' },
      { questionId: 4, value: '' },
    ],
    submittedAt: '2026-08-20T11:00:00.000Z',
    submittedByName: 'นภา ดูแลหลายด้าน',
    ratingAverage: 3.5,
  },
  {
    id: 3,
    surveyId: 2,
    customerId: 1,
    answers: [
      { questionId: 1, value: 5 },
      { questionId: 2, value: 5 },
    ],
    submittedAt: '2026-09-02T14:00:00.000Z',
    submittedByName: 'วิชัย ซัพพอร์ต',
    ratingAverage: 5,
  },
];

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

@Injectable({ providedIn: 'root' })
export class SurveyService {
  private readonly surveysSignal = signal<Survey[]>(this.load(SURVEYS_KEY, SEED_SURVEYS));
  private readonly responsesSignal = signal<SurveyResponse[]>(
    this.load(RESPONSES_KEY, SEED_RESPONSES)
  );
  private nextSurveyId = this.maxId(this.surveysSignal()) + 1;
  private nextResponseId = this.maxId(this.responsesSignal()) + 1;

  readonly surveys = this.surveysSignal.asReadonly();
  readonly activeCount = computed(
    () => this.surveysSignal().filter((s) => s.status === 'ACTIVE').length
  );

  list(): Observable<Survey[]> {
    return of(structuredClone(this.surveysSignal())).pipe(delay(180));
  }

  getById(id: number): Survey | undefined {
    return this.surveysSignal().find((s) => s.id === id);
  }

  getResponses(surveyId: number): SurveyResponse[] {
    return this.responsesSignal()
      .filter((r) => r.surveyId === surveyId)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
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
    this.surveysSignal.update((list) => {
      const next = [row, ...list];
      this.save(SURVEYS_KEY, next);
      return next;
    });
    return of(structuredClone(row)).pipe(delay(220));
  }

  updateStatus(id: number, status: SurveyStatus): Observable<Survey> {
    const current = this.getById(id);
    if (!current) {
      return throwError(() => new Error('ไม่พบแบบประเมิน'));
    }
    const updated: Survey = { ...current, status, updatedAt: new Date().toISOString() };
    this.surveysSignal.update((list) => {
      const next = list.map((s) => (s.id === id ? updated : s));
      this.save(SURVEYS_KEY, next);
      return next;
    });
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
    this.responsesSignal.update((list) => {
      const next = [row, ...list];
      this.save(RESPONSES_KEY, next);
      return next;
    });
    return of(structuredClone(row)).pipe(delay(220));
  }

  private load<T>(key: string, seed: T[]): T[] {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        return JSON.parse(raw) as T[];
      }
    } catch {
      /* ignore */
    }
    const data = structuredClone(seed);
    this.save(key, data);
    return data;
  }

  private save<T>(key: string, data: T[]): void {
    localStorage.setItem(key, JSON.stringify(data));
  }

  private maxId(items: { id: number }[]): number {
    return items.reduce((max, i) => Math.max(max, i.id), 0);
  }
}
