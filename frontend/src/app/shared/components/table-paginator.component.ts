import { Component, input, output } from '@angular/core';
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
        (page)="page.emit($event)"
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
}
