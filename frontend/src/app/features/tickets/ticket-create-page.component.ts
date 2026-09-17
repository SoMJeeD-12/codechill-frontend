import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { QuickActionsService } from '../../core/services/quick-actions.service';

/**
 * /app/tickets/create ต้องมาก่อน tickets/:id
 * ไม่เปิดหน้ารายละเอียดด้วย id="create" (เลยไม่โชว์ "ไม่พบปัญหา")
 */
@Component({
  standalone: true,
  template: '',
})
export class TicketCreatePageComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly quickActions = inject(QuickActionsService);

  ngOnInit(): void {
    void this.router.navigate(['/app/tickets'], { replaceUrl: true });
    if (this.quickActions.canOpenTicket()) {
      this.quickActions.openTicketForm().subscribe();
    }
  }
}
