import {
  Component,
  DestroyRef,
  OnInit,
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
import { Observable, of } from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
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
 * ช่องค้นหาแบบเลือกข้อมูล (ลูกค้า / โปรเจค / ผู้ใช้)
 *
 * กติกาตามที่ตกลงไว้:
 * - ยังไม่พิมพ์ = ไม่แสดงรายการอะไรเลย (ไม่ preload ทั้งตาราง)
 * - เริ่มค้นเมื่อพิมพ์อย่างน้อย 1 ตัวอักษร · หน่วง 300ms
 * - เลือกแล้วโชว์ข้อมูลที่เลือกให้เห็นชัด ๆ พร้อมปุ่มล้าง
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
    <mat-form-field appearance="outline" class="picker-field">
      <mat-label>{{ label() }}</mat-label>
      <input
        matInput
        [formControl]="queryControl"
        [matAutocomplete]="auto"
        [placeholder]="placeholder()"
        [attr.aria-label]="label()"
        autocomplete="off"
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
              <span class="picker-opt__name">{{ opt.label }}</span>
              @if (opt.meta) {
                <small class="picker-opt__meta">{{ opt.meta }}</small>
              }
            </span>
          </mat-option>
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
  readonly selectionChange = output<PickerOption | null>();

  readonly queryControl = new FormControl('', { nonNullable: true });
  readonly options = signal<PickerOption[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const current = this.selected();
    if (current) {
      this.queryControl.setValue(current.label, { emitEvent: false });
    }
    if (this.disabled()) {
      this.queryControl.disable({ emitEvent: false });
    }

    this.queryControl.valueChanges
      .pipe(
        tap((value) => {
          // พิมพ์แก้ข้อความหลังเลือกแล้ว = ยกเลิกตัวที่เลือก
          const chosen = this.selected();
          if (chosen && value !== chosen.label) {
            this.selected.set(null);
            this.selectionChange.emit(null);
          }
        }),
        debounceTime(PICKER_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((raw) => {
          const query = (typeof raw === 'string' ? raw : '').trim();
          this.error.set(null);

          if (query.length < PICKER_MIN_CHARS) {
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
        this.options.set(list);
      });
  }

  onSelected(event: MatAutocompleteSelectedEvent): void {
    const option = event.option.value as PickerOption;
    this.selected.set(option);
    this.queryControl.setValue(option.label, { emitEvent: false });
    this.options.set([]);
    this.selectionChange.emit(option);
  }

  clear(): void {
    this.selected.set(null);
    this.queryControl.setValue('', { emitEvent: false });
    this.options.set([]);
    this.selectionChange.emit(null);
  }
}
