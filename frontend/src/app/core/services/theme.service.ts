import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

/** ต้องตรงกับสคริปต์ใน index.html (ใส่ class ก่อน Angular โหลด กันจอขาวแวบ) */
const STORAGE_KEY = 'cpams.theme';
const DARK_CLASS = 'theme-dark';

/**
 * โหมดสว่าง / มืด — เก็บในเครื่องผู้ใช้ (localStorage)
 * ยังไม่เคยเลือก = ตามการตั้งค่าของระบบปฏิบัติการ และเปลี่ยนตามเมื่อระบบเปลี่ยน
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  private readonly media = this.doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)') ?? null;
  private readonly chosen = signal<ThemeMode | null>(this.readStored());
  private readonly systemDark = signal(!!this.media?.matches);

  readonly mode = computed<ThemeMode>(() => this.chosen() ?? (this.systemDark() ? 'dark' : 'light'));
  readonly isDark = computed(() => this.mode() === 'dark');

  constructor() {
    this.media?.addEventListener?.('change', (e) => this.systemDark.set(e.matches));
    effect(() => this.apply(this.mode()));
  }

  toggle(): void {
    this.set(this.isDark() ? 'light' : 'dark');
  }

  set(mode: ThemeMode): void {
    this.chosen.set(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // storage ถูกปิด — ใช้ค่าในหน่วยความจำต่อ
    }
  }

  private apply(mode: ThemeMode): void {
    const root = this.doc.documentElement;
    root.classList.toggle(DARK_CLASS, mode === 'dark');
    root.style.colorScheme = mode;
  }

  private readStored(): ThemeMode | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw === 'light' || raw === 'dark' ? raw : null;
    } catch {
      return null;
    }
  }
}
