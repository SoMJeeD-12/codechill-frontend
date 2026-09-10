import { Survey, SurveyResponseDetail } from '../models/survey.model';

export interface SurveyMockSeedContext {
  customerId: number;
  secondCustomerId?: number | null;
}

/** Legacy mock seed — kept for reference; SurveyService no longer uses this. */
export function buildMockSurveys(ctx: SurveyMockSeedContext): {
  surveys: Survey[];
  responses: SurveyResponseDetail[];
} {
  const now = new Date().toISOString();
  const surveys: Survey[] = [
    {
      id: 1,
      title: 'ความพึงพอใจหลังส่งมอบ',
      description: 'ประเมินประสบการณ์หลังรับมอบระบบ',
      status: 'ACTIVE',
      isCurrentlyUsable: true,
      validFrom: null,
      validTo: null,
      questions: [
        {
          id: 1,
          questionText: 'โดยรวมพึงพอใจแค่ไหน',
          questionType: 'RATING',
          isRequired: true,
          options: null,
          minValue: 1,
          maxValue: 5,
          sortOrder: 1,
        },
        {
          id: 2,
          questionText: 'ช่องทางที่สะดวกติดต่อ',
          questionType: 'CHOICE',
          isRequired: true,
          options: ['LINE', 'โทรศัพท์', 'อีเมล', 'เข้าพบ'],
          minValue: null,
          maxValue: null,
          sortOrder: 2,
        },
      ],
      assignmentCount: 2,
      responseCount: 2,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const responses: SurveyResponseDetail[] = [
    {
      id: 1,
      assignmentId: 1,
      surveyId: 1,
      customerId: ctx.customerId,
      customerName: null,
      answers: [],
      submittedAt: now,
      overallScore: 4.5,
      comment: null,
      createdAt: now,
    },
    {
      id: 2,
      assignmentId: 2,
      surveyId: 1,
      customerId: ctx.secondCustomerId ?? ctx.customerId,
      customerName: null,
      answers: [],
      submittedAt: now,
      overallScore: 3.5,
      comment: null,
      createdAt: now,
    },
  ];

  return { surveys, responses };
}
