import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuditActivityFeedComponent } from './audit-activity-feed.component';

@Component({
  selector: 'app-audit-logs-page',
  standalone: true,
  imports: [AuditActivityFeedComponent],
  templateUrl: './audit-logs-page.component.html',
  styleUrl: './audit-logs-page.component.scss',
})
export class AuditLogsPageComponent {
  private readonly route = inject(ActivatedRoute);

  /** ?userId= — เปิดจากหน้าผู้ใช้「ดูกิจกรรม」 */
  readonly initialUserId = (() => {
    const id = Number(this.route.snapshot.queryParamMap.get('userId'));
    return Number.isInteger(id) && id > 0 ? id : null;
  })();
}
