import { Injectable, computed, signal } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import { MOCK_ROLES } from '../mock/mock-data';
import { Permission, Role } from '../models/permission.model';

const STORAGE_KEY = 'cpams_mock_roles';

@Injectable({ providedIn: 'root' })
export class RoleService {
  private readonly rolesSignal = signal<Role[]>(this.load());
  private nextId = this.calcNextId(this.rolesSignal());

  readonly roles = this.rolesSignal.asReadonly();
  readonly roleCount = computed(() => this.rolesSignal().length);

  list(): Observable<Role[]> {
    return of(structuredClone(this.rolesSignal())).pipe(delay(250));
  }

  getById(id: number): Role | undefined {
    return this.rolesSignal().find((r) => r.id === id);
  }

  create(input: { name: string; description: string; permissions: Permission[] }): Observable<Role> {
    const name = input.name.trim();
    if (!name) {
      return throwError(() => new Error('กรุณาระบุชื่อบทบาท'));
    }
    if (this.rolesSignal().some((r) => r.name === name)) {
      return throwError(() => new Error('มีชื่อบทบาทนี้แล้ว'));
    }

    const role: Role = {
      id: this.nextId++,
      name,
      description: input.description.trim(),
      permissions: structuredClone(input.permissions),
    };
    this.rolesSignal.update((list) => {
      const next = [...list, role];
      this.save(next);
      return next;
    });
    return of(structuredClone(role)).pipe(delay(300));
  }

  update(
    id: number,
    input: { name: string; description: string; permissions: Permission[] }
  ): Observable<Role> {
    const current = this.getById(id);
    if (!current) {
      return throwError(() => new Error('ไม่พบบทบาท'));
    }
    const name = input.name.trim();
    if (this.rolesSignal().some((r) => r.name === name && r.id !== id)) {
      return throwError(() => new Error('มีชื่อบทบาทนี้แล้ว'));
    }

    const updated: Role = {
      ...current,
      name,
      description: input.description.trim(),
      permissions: structuredClone(input.permissions),
    };
    this.rolesSignal.update((list) => {
      const next = list.map((r) => (r.id === id ? updated : r));
      this.save(next);
      return next;
    });
    return of(structuredClone(updated)).pipe(delay(300));
  }

  remove(id: number): Observable<void> {
    if (!this.getById(id)) {
      return throwError(() => new Error('ไม่พบบทบาท'));
    }
    this.rolesSignal.update((list) => {
      const next = list.filter((r) => r.id !== id);
      this.save(next);
      return next;
    });
    return of(void 0).pipe(delay(250));
  }

  private load(): Role[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw) as Role[];
      }
    } catch {
      /* ignore */
    }
    const seed = structuredClone(MOCK_ROLES);
    this.save(seed);
    return seed;
  }

  private save(roles: Role[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(roles));
  }

  private calcNextId(roles: Role[]): number {
    return roles.reduce((max, r) => Math.max(max, r.id), 0) + 1;
  }
}
