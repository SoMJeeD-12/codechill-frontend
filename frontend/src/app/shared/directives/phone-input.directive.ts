import { Directive, ElementRef, HostListener, inject } from '@angular/core';
import { NgControl } from '@angular/forms';
import { sanitizePhoneDigits } from '../../core/utils/phone.util';

/** จำกัดให้พิมพ์ได้เฉพาะตัวเลข สูงสุด 10 หลัก */
@Directive({
  selector: 'input[appPhoneInput]',
  standalone: true,
})
export class PhoneInputDirective {
  private readonly el = inject(ElementRef<HTMLInputElement>);
  private readonly ngControl = inject(NgControl, { optional: true, self: true });

  @HostListener('input')
  onInput(): void {
    const input = this.el.nativeElement;
    const next = sanitizePhoneDigits(input.value);
    if (input.value === next) {
      return;
    }
    input.value = next;
    this.ngControl?.control?.setValue(next, { emitEvent: true });
  }
}
