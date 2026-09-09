import { Directive, ElementRef, HostListener, Input, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { formatMoneyDisplay, parseMoneyValue, sanitizeMoneyTyping } from '../../core/utils/money.util';

/**
 * ช่องกรอกเงินที่มีคอมม่าคั่นหลักพันขณะพิมพ์
 * ค่าใน FormControl เป็น number | null
 *
 * ใช้: <input matInput appMoneyInput formControlName="amount" />
 */
@Directive({
  selector: 'input[appMoneyInput]',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MoneyInputDirective),
      multi: true,
    },
  ],
})
export class MoneyInputDirective implements ControlValueAccessor {
  private readonly el = inject(ElementRef<HTMLInputElement>);

  /** อนุญาตทศนิยมสูงสุด 2 ตำแหน่ง (ค่าเริ่มต้น true) */
  @Input() moneyAllowDecimal = true;

  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private disabled = false;

  writeValue(value: number | string | null | undefined): void {
    this.el.nativeElement.value = formatMoneyDisplay(value);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.el.nativeElement.disabled = isDisabled;
  }

  @HostListener('input')
  onInput(): void {
    if (this.disabled) {
      return;
    }
    const input = this.el.nativeElement;
    const prev = input.value;
    const caret = input.selectionStart ?? prev.length;
    const digitsBeforeCaret = prev.slice(0, caret).replace(/[^\d.]/g, '').length;

    const next = sanitizeMoneyTyping(prev, this.moneyAllowDecimal);
    input.value = next;

    // คืนตำแหน่งเคอร์เซอร์ให้ใกล้เคียงเดิมหลังใส่คอมม่า
    let pos = 0;
    let seen = 0;
    while (pos < next.length && seen < digitsBeforeCaret) {
      if (/[\d.]/.test(next[pos])) {
        seen++;
      }
      pos++;
    }
    input.setSelectionRange(pos, pos);

    this.onChange(parseMoneyValue(next));
  }

  @HostListener('blur')
  onBlur(): void {
    const input = this.el.nativeElement;
    const parsed = parseMoneyValue(input.value);
    input.value = formatMoneyDisplay(parsed);
    this.onChange(parsed);
    this.onTouched();
  }
}
