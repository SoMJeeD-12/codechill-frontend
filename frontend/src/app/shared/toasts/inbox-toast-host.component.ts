import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ThaiDatePipe } from '../pipes/thai-date.pipe';
import { InboxToastService } from './inbox-toast.service';

@Component({
  selector: 'app-inbox-toast-host',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, ThaiDatePipe],
  templateUrl: './inbox-toast-host.component.html',
  styleUrl: './inbox-toast-host.component.scss',
})
export class InboxToastHostComponent {
  readonly toasts = inject(InboxToastService);

  messageText(message: string | null | undefined): string {
    return message?.trim() ?? '';
  }

  whenAt(sentAt: string | null | undefined, createdAt: string): string {
    return sentAt || createdAt;
  }
}
