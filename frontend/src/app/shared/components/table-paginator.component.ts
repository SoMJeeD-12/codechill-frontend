import { Component, ElementRef, inject, input, output } from '@angular/core';
import { MatPaginatorModule, MatPaginatorIntl, PageEvent } from '@angular/material/paginator';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '../utils/client-pager';
import { ThaiPaginatorIntl } from '../i18n/thai-paginator-intl';

@Component({
  selector: 'app-table-paginator',
  standalone: true,
  imports: [MatPaginatorModule],
  providers: [{ provide: MatPaginatorIntl, useClass: ThaiPaginatorIntl }],
  template: `
    @if (length() > 0) {
      <mat-paginator
        class="table-paginator"
        [length]="length()"
        [pageIndex]="pageIndex()"
        [pageSize]="pageSize()"
        [pageSizeOptions]="pageSizeOptions()"
        [showFirstLastButtons]="true"
        [disabled]="disabled()"
        (page)="onPage($event)"
      />
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .table-paginator {
        background: transparent;
      }
    `,
  ],
})
export class TablePaginatorComponent {
  readonly length = input.required<number>();
  readonly pageIndex = input(0);
  readonly pageSize = input(10);
  readonly pageSizeOptions = input<number[]>([...DEFAULT_PAGE_SIZE_OPTIONS]);
  readonly disabled = input(false);
  readonly page = output<PageEvent>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  onPage(event: PageEvent): void {
    this.page.emit(event);
    requestAnimationFrame(() => this.scrollListToTop());
  }

  private scrollListToTop(): void {
    const el = this.host.nativeElement;
    const dialogContent = el.closest<HTMLElement>('.mat-mdc-dialog-content');
    if (dialogContent) {
      dialogContent.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const target = el.closest<HTMLElement>('.app-panel') ?? el.parentElement;
    if (!target) {
      return;
    }
    // หัวแอป (topbar) ติดด้านบน — เลื่อนเฉพาะเมื่อหัวตารางถูกบังหรือเลื่อนพ้นจอไปแล้ว
    const topbarOffset = 72;
    if (target.getBoundingClientRect().top < topbarOffset) {
      target.style.scrollMarginTop = `${topbarOffset}px`;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}
