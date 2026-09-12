import { Injectable, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, from, of } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { PickerOption } from '../../shared/components/entity-picker.component';
import { FORM_DIALOG } from '../../shared/utils/form-dialog';
import { AuthService } from './auth.service';

/**
 * ปุ่มลัดที่เปิดได้จากทุกหน้า — "ทำงานครั้งเดียวจบ"
 * โหลด dialog แบบ dynamic import เพื่อไม่ให้ layout ดึง feature bundle มาทั้งก้อน
 */
@Injectable({ providedIn: 'root' })
export class QuickActionsService {
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);

  /**
   * นับจำนวนครั้งที่มีการเปิดใบแจ้งปัญหาสำเร็จ
   * หน้าไหนที่แสดงรายการใบแจ้งปัญหาให้ effect() ตามค่านี้เพื่อโหลดใหม่
   * (ปุ่มลัดอยู่บนแถบบน กดได้จากทุกหน้า — รายการที่เปิดค้างอยู่ต้องอัปเดตตาม)
   */
  private readonly ticketCreatedCount = signal(0);
  readonly ticketCreated = this.ticketCreatedCount.asReadonly();

  canOpenTicket(): boolean {
    return this.auth.hasPermissionCode('ticket.create');
  }

  canLogCommunication(): boolean {
    return (
      this.auth.hasPermissionCode('communication_log.create') ||
      this.auth.hasPermissionCode('customer.update')
    );
  }

  /** + เปิดใบแจ้งปัญหา — คืน true เมื่อบันทึกสำเร็จ */
  openTicketForm(preset?: {
    customer?: PickerOption | null;
    project?: PickerOption | null;
  }): Observable<boolean> {
    return from(
      import('../../features/tickets/ticket-form-dialog.component')
    ).pipe(
      switchMap((m) =>
        this.dialog
          .open(m.TicketFormDialogComponent, {
            ...FORM_DIALOG,
            autoFocus: 'first-tabbable',
            data: { customer: preset?.customer ?? null, project: preset?.project ?? null },
          })
          .afterClosed()
      ),
      switchMap((saved) => of(!!saved)),
      tap((saved) => {
        if (saved) {
          this.ticketCreatedCount.update((n) => n + 1);
        }
      })
    );
  }

  /** + บันทึกการติดต่อ — คืน true เมื่อบันทึกสำเร็จ */
  openCommunicationLog(preset?: { customer?: PickerOption | null }): Observable<boolean> {
    return from(
      import('../../features/customers/quick-log-dialog.component')
    ).pipe(
      switchMap((m) =>
        this.dialog
          .open(m.QuickLogDialogComponent, {
            ...FORM_DIALOG,
            autoFocus: 'first-tabbable',
            data: { customer: preset?.customer ?? null },
          })
          .afterClosed()
      ),
      switchMap((saved) => of(!!saved))
    );
  }
}
