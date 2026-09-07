import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MenuCode, PermissionAction } from '../models/permission.model';
import { AuthService } from '../services/auth.service';

export function permissionGuard(
  menuCode: MenuCode,
  action: PermissionAction = 'view'
): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/login']);
    }

    if (auth.hasPermission(menuCode, action)) {
      return true;
    }

    return router.parseUrl(auth.defaultAppPath());
  };
}
