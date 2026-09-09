import { Survey, SurveyResponse } from '../models/survey.model';

export interface SurveyMockSeedContext {
  customerId: number;
  secondCustomerId?: number | null;
}

export function buildMockSurveys(ctx: SurveyMockSeedContext): {
  surveys: Survey[];
  responses: SurveyResponse[];
} {
  const now = new Date().toISOString();
  const surveys: Survey[] = [
    {
      id: 1,
      title: 'ความพึงพอใจหลังส่งมอบ',
      description: 'ประเมินประสบการณ์หลังรับมอบระบบ (mock — Q1 ลูกค้าไม่มีบัญชี บันทึกโดยพนักงาน)',
      status: 'ACTIVE',
      questions: [
        {
          id: 1,
          text: 'โดยรวมพึงพอใจแค่ไหน',
          type: 'RATING',
          required: true,
          options: [],
        },
        {
          id: 2,
          text: 'ทีมซัพพอร์ตอบได้รวดเร็วหรือไม่',
          type: 'RATING',
          required: true,
          options: [],
        },
        {
          id: 3,
          text: 'ช่องทางที่สะดวกติดต่อ',
          type: 'CHOICE',
          required: true,
          options: ['LINE', 'โทรศัพท์', 'อีเมล', 'เข้าพบ'],
        },
        {
          id: 4,
          text: 'ข้อเสนอแนะเพิ่มเติม',
          type: 'TEXT',
          required: false,
          options: [],
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 2,
      title: 'แบบร่าง — หลังปิดงาน MA',
      description: 'ยังไม่เปิดรับคำตอบ',
      status: 'DRAFT',
      questions: [
        {
          id: 1,
          text: 'คะแนนบริการ MA',
          type: 'RATING',
          required: true,
          options: [],
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];

  const responses: SurveyResponse[] = [
    {
      id: 1,
      surveyId: 1,
      customerId: ctx.customerId,
      answers: [
        { questionId: 1, value: 5 },
        { questionId: 2, value: 4 },
        { questionId: 3, value: 'LINE' },
        { questionId: 4, value: 'ทีมงานดูแลดีมาก' },
      ],
      submittedAt: now,
      submittedByName: 'พนักงาน (mock)',
      ratingAverage: 4.5,
    },
    {
      id: 2,
      surveyId: 1,
      customerId: ctx.secondCustomerId ?? ctx.customerId,
      answers: [
        { questionId: 1, value: 3 },
        { questionId: 2, value: 4 },
        { questionId: 3, value: 'โทรศัพท์' },
        { questionId: 4, value: '' },
      ],
      submittedAt: now,
      submittedByName: 'พนักงาน (mock)',
      ratingAverage: 3.5,
    },
  ];

  return { surveys, responses };
}
