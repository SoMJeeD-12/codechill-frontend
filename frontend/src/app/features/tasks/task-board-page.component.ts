import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/services/auth.service';
import { TaskKanbanBoardComponent } from '../projects/task-kanban-board.component';

/** กระดานงานของหัวหน้า — งานทั้งบริษัท ซ่อนงานที่เสร็จแล้วเป็นค่าเริ่มต้น */
@Component({
  selector: 'app-task-board-page',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule, TaskKanbanBoardComponent],
  template: `
    <section class="app-page">
      <header class="app-page-header">
        <div>
          <h1 class="app-page-title">กระดานงาน</h1>
          <p class="app-subtitle">
            งานที่ยังไม่เสร็จของทีม · ลากการ์ดเพื่อเปลี่ยนสถานะ (ส่งตรวจ/ตรวจผ่านต้องกดปุ่มบนการ์ด)
          </p>
        </div>
        <div class="app-header-actions">
          @if (canReview) {
            <a mat-stroked-button routerLink="/app/tasks/review">
              <mat-icon>rate_review</mat-icon>
              งานตรวจ
            </a>
          }
        </div>
      </header>
      <app-task-kanban-board [showProjectFilter]="true" [initialProjectId]="projectId" />
    </section>
  `,
})
export class TaskBoardPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  readonly canReview = this.auth.canAccessTaskReviewQueue();
  readonly projectId = this.parseProjectId();

  private parseProjectId(): number | null {
    const id = Number(this.route.snapshot.queryParamMap.get('projectId'));
    return Number.isFinite(id) && id > 0 ? id : null;
  }
}
