import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../http/api-error';
import { asList, pruneUndefined, toHttpParams, upsertById } from '../http/api.util';
import {
  QuestionType,
  Survey,
  SurveyAnswerInput,
  SurveyAssignment,
  SurveyResponseDetail,
  SurveyScoreBreakdown,
  SurveyStatus,
  SurveySummary,
} from '../models/survey.model';

export interface SurveyQuestionInput {
  questionText: string;
  questionType: QuestionType;
  isRequired?: boolean;
  options?: string[];
  minValue?: number | null;
  maxValue?: number | null;
}

export interface SurveyCreateInput {
  title: string;
  description?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  questions?: SurveyQuestionInput[];
}

export interface SurveyUpdateInput {
  title?: string;
  description?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  questions?: SurveyQuestionInput[];
}

export interface SurveyListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: SurveyStatus;
}

export interface CreateAssignmentInput {
  customerId: number;
  contactId?: number | null;
  projectId?: number | null;
  sentAt?: string;
}

export interface SubmitAssignmentResponseInput {
  answers: SurveyAnswerInput[];
  comment?: string | null;
  submittedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class SurveyService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/surveys`;
  private readonly assignmentsBase = `${environment.apiBaseUrl}/survey-assignments`;
  private readonly items = signal<Survey[]>([]);

  readonly surveys = this.items.asReadonly();
  readonly activeCount = computed(
    () => this.items().filter((s) => s.isCurrentlyUsable).length
  );

  list(params: SurveyListParams = {}): Observable<Survey[]> {
    return this.http
      .get<Survey[] | { items: Survey[] }>(this.base, {
        params: toHttpParams({ limit: 100, ...params }),
      })
      .pipe(
        map(asList),
        tap((rows) => this.items.set(rows)),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  getById(id: number): Survey | undefined {
    return this.items().find((s) => s.id === id);
  }

  get(id: number): Observable<Survey> {
    return this.http.get<Survey>(`${this.base}/${id}`).pipe(
      tap((row) => this.items.update((list) => upsertById(list, row))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  create(input: SurveyCreateInput): Observable<Survey> {
    if (!input.title.trim()) {
      return throwError(() => new Error('กรุณาระบุชื่อแบบประเมิน'));
    }
    return this.http
      .post<Survey>(
        this.base,
        pruneUndefined({
          title: input.title.trim(),
          description: input.description?.trim() || null,
          validFrom: input.validFrom || null,
          validTo: input.validTo || null,
          questions: input.questions,
        })
      )
      .pipe(
        tap((row) => this.items.update((list) => upsertById(list, row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  update(id: number, input: SurveyUpdateInput): Observable<Survey> {
    return this.http
      .patch<Survey>(`${this.base}/${id}`, pruneUndefined(input))
      .pipe(
        tap((row) => this.items.update((list) => upsertById(list, row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  updateStatus(id: number, status: SurveyStatus): Observable<Survey> {
    return this.http
      .patch<Survey>(`${this.base}/${id}/status`, { status })
      .pipe(
        tap((row) => this.items.update((list) => upsertById(list, row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`).pipe(
      tap(() => this.items.update((list) => list.filter((s) => s.id !== id))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  getSummary(id: number): Observable<SurveySummary> {
    return this.http
      .get<SurveySummary>(`${this.base}/${id}/summary`)
      .pipe(catchError((err) => throwError(() => new Error(apiErrorMessage(err)))));
  }

  /** GET /surveys/:id/score-breakdown — ตามลูกค้าและรายเดือน */
  getScoreBreakdown(
    id: number,
    params?: { dateFrom?: string; dateTo?: string }
  ): Observable<SurveyScoreBreakdown> {
    return this.http
      .get<SurveyScoreBreakdown>(`${this.base}/${id}/score-breakdown`, {
        params: toHttpParams(params ?? {}),
      })
      .pipe(catchError((err) => throwError(() => new Error(apiErrorMessage(err)))));
  }

  listAssignments(surveyId: number): Observable<SurveyAssignment[]> {
    return this.http
      .get<SurveyAssignment[] | { items: SurveyAssignment[] }>(
        `${this.base}/${surveyId}/assignments`
      )
      .pipe(
        map(asList),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  createAssignment(
    surveyId: number,
    input: CreateAssignmentInput
  ): Observable<SurveyAssignment> {
    return this.http
      .post<SurveyAssignment>(
        `${this.base}/${surveyId}/assignments`,
        pruneUndefined(input)
      )
      .pipe(catchError((err) => throwError(() => new Error(apiErrorMessage(err)))));
  }

  listResponses(surveyId: number): Observable<SurveyResponseDetail[]> {
    return this.http
      .get<SurveyResponseDetail[] | { items: SurveyResponseDetail[] }>(
        `${this.base}/${surveyId}/responses`
      )
      .pipe(
        map(asList),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  submitAssignmentResponse(
    assignmentId: number,
    input: SubmitAssignmentResponseInput
  ): Observable<SurveyResponseDetail> {
    return this.http
      .post<SurveyResponseDetail>(
        `${this.assignmentsBase}/${assignmentId}/response`,
        pruneUndefined(input)
      )
      .pipe(catchError((err) => throwError(() => new Error(apiErrorMessage(err)))));
  }
}
