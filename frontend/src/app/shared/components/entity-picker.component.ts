import {
  Component,
  DestroyRef,
  OnInit,
  effect,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Observable, Subject, merge, of } from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  switchMap,
  tap,
} from 'rxjs/operators';

/** ตัวเลือกที่แสดงในช่องค้นหา — label เป็นชื่อหลัก, meta เป็นบรรทัดรอง */
export interface PickerOption {
  id: number;
  label: string;
  meta?: string | null;
  code?: string | null;
  /** ป้ายเล็กท้ายชื่อ เช่น สถานะโปรเจกต์ที่ไม่ใช่กำลังดำเนินการ */
  badge?: string | null;
}

/** ต้องพิมพ์อย่างน้อยกี่ตัวอักษรถึงจะเริ่มค้น — ช่องว่างไม่ยิง API */
export const PICKER_MIN_CHARS = 1;
/** หน่วงก่อนยิง API (ms) */
export const PICKER_DEBOUNCE_MS = 300;

/**
 * ค้นหาผ่าน backend `?search=` โดยตรง
 * — ปล่อยให้ HttpParams encode เอง · ไม่ดึงรายการมากรองในเบราว์เซอร์
 */
export function searchViaBackend<T>(
  fetchList: (params: { search: string; limit: number }) => Observable<T[]>,
  toOption: (row: T) => PickerOption,
  query: string,
  limit = 20
): Observable<PickerOption[]> {
  const q = query.trim();
  if (q.length < PICKER_MIN_CHARS) {
    return of([]);
  }
  return fetchList({ search: q, limit }).pipe(
    map((rows) => rows.map(toOption)),
    catchError(() => of([] as PickerOption[]))
  );
}

/** @deprecated ใช้ searchViaBackend — backend ค้นไทยได้แล้ว */
export const searchWithClientFallback = searchViaBackend;

/**
 * ช่องค้นหาแบบเลือกข้อมูล (ลูกค้า / โปรเจกต์ / ผู้ใช้)
 *
 * - พิมพ์ = ค้นผ่าน searchFn หน่วง 300ms · คำขอเก่าถูกยกเลิก (switchMap)
 * - openOnFocus = คลิกช่องแล้วเรียก searchFn('') ให้เห็นรายการแรก (searchFn ต้องจำกัด limit เอง)
 * - เลือกแล้วโชว์ข้อมูลที่เลือกพร้อมปุ่มล้าง · parent ตั้ง selected ทีหลังได้
 */
@Component({
  selector: 'app-entity-picker',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <mat-form-field
      appearance="outline"
      class="picker-field"
      [class]="fieldClass()"
      [subscriptSizing]="fieldClass() ? 'dynamic' : 'fixed'"
    >
      @if (label()) {
        <mat-label>{{ label() }}</mat-label>
      }
      @if (prefixIcon(); as icon) {
        <mat-icon matPrefix>{{ icon }}</mat-icon>
      }
      <input
        matInput
        [formControl]="queryControl"
        [matAutocomplete]="auto"
        [placeholder]="placeholder()"
        [attr.aria-label]="label() || placeholder()"
        autocomplete="off"
        (focus)="onFocus()"
      />
      @if (loading()) {
        <mat-spinner matSuffix diameter="18" />
      } @else if (selected()) {
        <button
          matSuffix
          mat-icon-button
          type="button"
          aria-label="ล้างที่เลือก"
          (click)="clear()"
        >
          <mat-icon>close</mat-icon>
        </button>
      } @else {
        <mat-icon matSuffix>search</mat-icon>
      }
      <mat-autocomplete #auto="matAutocomplete" (optionSelected)="onSelected($event)">
        @for (opt of options(); track opt.id) {
          <mat-option [value]="opt">
            <span class="picker-opt">
              <span class="picker-opt__name">
                {{ opt.label }}
                @if (opt.badge) {
                  <span class="picker-opt__badge">{{ opt.badge }}</span>
                }
              </span>
              @if (opt.meta) {
                <small class="picker-opt__meta">{{ opt.meta }}</small>
              }
            </span>
          </mat-option>
        }
        @if (!loading() && searched() && !options().length) {
          <mat-option disabled class="picker-empty">ไม่พบรายการ</mat-option>
        }
      </mat-autocomplete>
      @if (error(); as e) {
        <mat-error>{{ e }}</mat-error>
      }
    </mat-form-field>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .picker-field {
        width: 100%;
      }
      .picker-opt {
        display: flex;
        flex-direction: column;
        line-height: 1.3;
      }
      .picker-opt__meta {
        color: rgb(0 0 0 / 0.55);
        font-size: 12px;
      }
      .picker-opt__badge {
        display: inline-block;
        margin-left: 0.35rem;
        padding: 0 0.45rem;
        border-radius: 999px;
        background: #f1f5f9;
        color: #475569;
        font-size: 11px;
        line-height: 1.6;
        vertical-align: middle;
      }
    `,
  ],
})
export class EntityPickerComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  /** ป้ายชื่อช่อง เช่น "ลูกค้า" */
  readonly label = input('ค้นหา');
  readonly placeholder = input('พิมพ์เพื่อค้นหา');
  /** ฟังก์ชันค้นหา — คืนรายการตัวเลือก */
  readonly searchFn = input.required<(query: string) => Observable<PickerOption[]>>();
  /** ตัวที่เลือกอยู่ (two-way) */
  readonly selected = model<PickerOption | null>(null);
  readonly disabled = input(false);
  /** คลิกช่องว่างแล้วโหลดรายการแรกทันที (เช่น ?limit=20) */
  readonly openOnFocus = input(false);
  /** class ของ mat-form-field เช่น 'ui-filter ui-filter--icon' สำหรับแถบตัวกรอง */
  readonly fieldClass = input('');
  readonly prefixIcon = input<string | null>(null);
  readonly selectionChange = output<PickerOption | null>();

  readonly queryControl = new FormControl('', { nonNullable: true });
  readonly options = signal<PickerOption[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** ค้นเสร็จอย่างน้อยหนึ่งครั้งกับคำปัจจุบัน — ใช้โชว์「ไม่พบรายการ」 */
  readonly searched = signal(false);

  private readonly opened$ = new Subject<void>();

  constructor() {
    effect(() => {
      const current = this.selected();
      if (current && this.queryControl.value !== current.label) {
        this.queryControl.setValue(current.label, { emitEvent: false });
      }
    });
    effect(() => {
      if (this.disabled()) {
        this.queryControl.disable({ emitEvent: false });
      } else {
        this.queryControl.enable({ emitEvent: false });
      }
    });
  }

  ngOnInit(): void {
    const typed$ = this.queryControl.valueChanges.pipe(
      tap((value) => {
        // พิมพ์แก้ข้อความหลังเลือกแล้ว = ยกเลิกตัวที่เลือก
        const chosen = this.selected();
        if (chosen && value !== chosen.label) {
          this.selected.set(null);
          this.selectionChange.emit(null);
        }
        this.searched.set(false);
      }),
      debounceTime(PICKER_DEBOUNCE_MS),
      map((raw) => (typeof raw === 'string' ? raw : '').trim()),
      distinctUntilChanged()
    );
    // เปิดดรอปดาวน์ตอนเลือกค่าไว้แล้ว = ดูรายการแรก ไม่ใช่ค้นด้วยชื่อที่เลือก
    const browse$ = this.opened$.pipe(
      filter(() => this.openOnFocus() && !this.options().length && !this.loading()),
      map(() => (this.selected() ? '' : this.queryControl.value.trim()))
    );

    merge(typed$, browse$)
      .pipe(
        switchMap((query) => {
          this.error.set(null);
          if (query.length < PICKER_MIN_CHARS && !this.openOnFocus()) {
            this.options.set([]);
            this.loading.set(false);
            return of([] as PickerOption[]);
          }
          this.loading.set(true);
          return this.searchFn()(query).pipe(
            catchError((err: Error) => {
              this.error.set(err.message);
              return of([] as PickerOption[]);
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((list) => {
        this.loading.set(false);
        this.searched.set(true);
        this.options.set(list);
      });
  }

  onFocus(): void {
    this.opened$.next();
  }

  onSelected(event: MatAutocompleteSelectedEvent): void {
    const option = event.option.value as PickerOption;
    this.selected.set(option);
    this.queryControl.setValue(option.label, { emitEvent: false });
    this.options.set([]);
    this.searched.set(false);
    this.selectionChange.emit(option);
  }

  clear(): void {
    this.selected.set(null);
    this.queryControl.setValue('', { emitEvent: false });
    this.options.set([]);
    this.searched.set(false);
    this.selectionChange.emit(null);
  }
}
