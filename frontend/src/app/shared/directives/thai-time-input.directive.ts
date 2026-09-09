import { Directive, ElementRef, HostListener, inject, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { parseTimeParts } from '../../core/utils/date.util';

/**
 * ช่องเวลาแบบไทย 24 ชม. — แสดง/เก็บเป็น 15.30
 * ใช้แทน input type="time" ที่เบราว์เซอร์บังคับ AM/PM
 */
@Directive({
  selector: 'input[appThaiTimeInput]',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ThaiTimeInputDirective),
      multi: true,
    },
  ],
  host: {
    inputmode: 'numeric',
    maxlength: '5',
    placeholder: '15.30',
    autocomplete: 'off',
  },
})
export class ThaiTimeInputDirective implements ControlValueAccessor {
  private readonly el = inject(ElementRef<HTMLInputElement>);
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  @HostListener('input')
  onInput(): void {
    const input = this.el.nativeElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 4);
    let next = digits;
    if (digits.length > 2) {
      next = `${digits.slice(0, 2)}.${digits.slice(2)}`;
    }
    input.value = next;
    this.onChange(next);
  }

  @HostListener('blur')
  onBlur(): void {
    const input = this.el.nativeElement;
    const { hours, minutes } = parseTimeParts(input.value || '0.0');
    const normalized = `${String(hours).padStart(2, '0')}.${String(minutes).padStart(2, '0')}`;
    input.value = normalized;
    this.onChange(normalized);
    this.onTouched();
  }

  writeValue(value: string | null): void {
    const input = this.el.nativeElement;
    if (!value) {
      input.value = '';
      return;
    }
    const { hours, minutes } = parseTimeParts(value);
    input.value = `${String(hours).padStart(2, '0')}.${String(minutes).padStart(2, '0')}`;
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.el.nativeElement.disabled = isDisabled;
  }
}
