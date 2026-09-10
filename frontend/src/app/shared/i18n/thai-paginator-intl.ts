import { Injectable } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';

@Injectable()
export class ThaiPaginatorIntl extends MatPaginatorIntl {
  override itemsPerPageLabel = 'แสดงต่อหน้า';
  override nextPageLabel = 'หน้าถัดไป';
  override previousPageLabel = 'หน้าก่อนหน้า';
  override firstPageLabel = 'หน้าแรก';
  override lastPageLabel = 'หน้าสุดท้าย';

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) {
      return `0 จาก ${length}`;
    }
    const start = page * pageSize + 1;
    const end = Math.min((page + 1) * pageSize, length);
    return `${start}–${end} จาก ${length}`;
  };
}
