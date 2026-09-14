import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../http/api-error';
import { asList, pruneUndefined, toHttpParams, upsertById } from '../http/api.util';
import {
  CommunicationChannel,
  CommunicationLog,
  Contact,
  Customer,
  CustomerStatus,
} from '../models/customer.model';
import { CustomerOverview } from '../models/customer-overview.model';

/** CreateCustomerDto / UpdateCustomerDto — `code` ออกโดย Backend ห้ามส่งจาก FE */
export interface CustomerInput {
  name: string;
  taxId?: string;
  businessType?: string;
  address?: string;
  province?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  website?: string;
  lineOfficialId?: string;
  facebookUrl?: string;
  status?: CustomerStatus;
  source?: string;
  ownerUserId?: number;
  note?: string;
}

export interface CustomerListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  status?: CustomerStatus;
  ownerUserId?: number;
  businessType?: string;
  province?: string;
  /** จำนวนวันที่ไม่ได้ติดต่อ (API ใช้ idleDays) */
  idleDays?: number;
}

/** CreateContactDto (customerId เติมโดย service) / UpdateContactDto */
export interface ContactInput {
  name: string;
  nickname?: string;
  position?: string;
  phone?: string;
  email?: string;
  lineId?: string;
  isPrimary?: boolean;
  note?: string;
}

/** CreateCommunicationLogDto (customerId เติมโดย service) */
export interface LogInput {
  channel: CommunicationChannel;
  occurredAt: string;
  contactId?: number;
  subject?: string;
  content?: string;
  handledByUserId?: number;
}

export interface LogListParams {
  page?: number;
  limit?: number;
  search?: string;
  customerId?: number;
  contactId?: number;
  channel?: CommunicationChannel;
  handledByUserId?: number;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly http = inject(HttpClient);
  private readonly customersBase = `${environment.apiBaseUrl}/customers`;
  private readonly contactsBase = `${environment.apiBaseUrl}/contacts`;
  private readonly logsBase = `${environment.apiBaseUrl}/communication-logs`;

  private readonly customersSignal = signal<Customer[]>([]);
  private readonly contactsSignal = signal<Contact[]>([]);
  private readonly logsSignal = signal<CommunicationLog[]>([]);

  readonly customers = this.customersSignal.asReadonly();
  readonly customerCount = computed(() => this.customersSignal().length);

  listCustomers(params?: CustomerListParams): Observable<Customer[]> {
    return this.http
      .get<Customer[] | { items: Customer[] }>(this.customersBase, {
        params: toHttpParams({ ...params }),
      })
      .pipe(
        map(asList),
        tap((list) => this.customersSignal.set(list)),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  getCustomer(id: number): Customer | undefined {
    return this.customersSignal().find((c) => c.id === id);
  }

  fetchCustomer(id: number): Observable<Customer> {
    return this.http.get<Customer>(`${this.customersBase}/${id}`).pipe(
      tap((row) => this.customersSignal.update((list) => upsertById(list, row))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /** GET /customers/:id/overview — ข้อมูล 360 + lifetimeValue */
  getOverview(id: number): Observable<CustomerOverview> {
    return this.http
      .get<CustomerOverview>(`${this.customersBase}/${id}/overview`)
      .pipe(catchError((err) => throwError(() => new Error(apiErrorMessage(err)))));
  }

  createCustomer(input: CustomerInput): Observable<Customer> {
    return this.http.post<Customer>(this.customersBase, pruneUndefined(input)).pipe(
      tap((row) => this.customersSignal.update((list) => upsertById(list, row))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  updateCustomer(id: number, input: CustomerInput): Observable<Customer> {
    return this.http
      .put<Customer>(`${this.customersBase}/${id}`, pruneUndefined(input))
      .pipe(
        tap((row) => this.customersSignal.update((list) => upsertById(list, row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  removeCustomer(id: number): Observable<void> {
    return this.http.delete<void>(`${this.customersBase}/${id}`).pipe(
      tap(() => this.customersSignal.update((list) => list.filter((c) => c.id !== id))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /* ——— ผู้ติดต่อ ——— */

  getContacts(customerId: number): Contact[] {
    return this.contactsSignal().filter((c) => c.customerId === customerId);
  }

  listContacts(customerId: number): Observable<Contact[]> {
    return this.http
      .get<Contact[] | { items: Contact[] }>(this.contactsBase, {
        params: toHttpParams({ customerId }),
      })
      .pipe(
        map(asList),
        tap((rows) => {
          this.contactsSignal.update((all) => [
            ...all.filter((c) => c.customerId !== customerId),
            ...rows,
          ]);
        }),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  saveContact(
    customerId: number,
    input: ContactInput,
    contactId?: number
  ): Observable<Contact> {
    const req$ = contactId
      ? this.http.put<Contact>(`${this.contactsBase}/${contactId}`, pruneUndefined(input))
      : this.http.post<Contact>(this.contactsBase, {
          ...pruneUndefined(input),
          customerId,
        });

    return req$.pipe(
      tap((row) => {
        this.contactsSignal.update((list) => {
          let next = upsertById(list, row);
          if (row.isPrimary) {
            next = next.map((c) =>
              c.customerId === customerId && c.id !== row.id ? { ...c, isPrimary: false } : c
            );
          }
          return next;
        });
      }),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  removeContact(contactId: number): Observable<void> {
    return this.http.delete<void>(`${this.contactsBase}/${contactId}`).pipe(
      tap(() => this.contactsSignal.update((list) => list.filter((c) => c.id !== contactId))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /* ——— ประวัติการติดต่อ ——— */

  getLogs(customerId: number): CommunicationLog[] {
    return this.logsSignal()
      .filter((l) => l.customerId === customerId)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  listLogs(customerId: number, params?: LogListParams): Observable<CommunicationLog[]> {
    return this.http
      .get<CommunicationLog[] | { items: CommunicationLog[] }>(this.logsBase, {
        params: toHttpParams({ ...params, customerId }),
      })
      .pipe(
        map(asList),
        tap((rows) => {
          this.logsSignal.update((all) => [
            ...all.filter((l) => l.customerId !== customerId),
            ...rows,
          ]);
        }),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  addLog(customerId: number, input: LogInput): Observable<CommunicationLog> {
    return this.http
      .post<CommunicationLog>(this.logsBase, { ...pruneUndefined(input), customerId })
      .pipe(
        tap((row) => this.logsSignal.update((list) => [row, ...list])),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  updateLog(logId: number, input: Partial<LogInput>): Observable<CommunicationLog> {
    return this.http
      .put<CommunicationLog>(`${this.logsBase}/${logId}`, pruneUndefined(input))
      .pipe(
        tap((row) => this.logsSignal.update((list) => upsertById(list, row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  removeLog(logId: number): Observable<void> {
    return this.http.delete<void>(`${this.logsBase}/${logId}`).pipe(
      tap(() => this.logsSignal.update((list) => list.filter((l) => l.id !== logId))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }
}
