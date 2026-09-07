import { Routes } from '@angular/router';
import { authGuard, defaultAppRedirectGuard, guestGuard } from './core/guards/auth.guard';
import { permissionGuard } from './core/guards/permission.guard';
import { MainLayoutComponent } from './core/layout/main-layout.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'app',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        canActivate: [defaultAppRedirectGuard],
        children: [],
      },
      {
        path: 'no-access',
        loadComponent: () =>
          import('./features/auth/no-access/no-access-page.component').then(
            (m) => m.NoAccessPageComponent
          ),
      },
      {
        path: 'dashboard',
        canActivate: [permissionGuard('dashboard')],
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'customers',
        canActivate: [permissionGuard('customers')],
        loadComponent: () =>
          import('./features/customers/customers-page.component').then((m) => m.CustomersPageComponent),
      },
      {
        path: 'customers/:id',
        canActivate: [permissionGuard('customers')],
        loadComponent: () =>
          import('./features/customers/customer-detail-page.component').then(
            (m) => m.CustomerDetailPageComponent
          ),
      },
      {
        path: 'projects',
        canActivate: [permissionGuard('projects')],
        loadComponent: () =>
          import('./features/projects/projects-page.component').then((m) => m.ProjectsPageComponent),
      },
      {
        path: 'projects/:id',
        canActivate: [permissionGuard('projects')],
        loadComponent: () =>
          import('./features/projects/project-detail-page.component').then(
            (m) => m.ProjectDetailPageComponent
          ),
      },
      {
        path: 'tickets',
        canActivate: [permissionGuard('tickets')],
        loadComponent: () =>
          import('./features/tickets/tickets-page.component').then((m) => m.TicketsPageComponent),
      },
      {
        path: 'tickets/:id',
        canActivate: [permissionGuard('tickets')],
        loadComponent: () =>
          import('./features/tickets/ticket-detail-page.component').then(
            (m) => m.TicketDetailPageComponent
          ),
      },
      {
        path: 'warranties',
        canActivate: [permissionGuard('warranties')],
        loadComponent: () =>
          import('./features/warranties/warranties-page.component').then(
            (m) => m.WarrantiesPageComponent
          ),
      },
      {
        path: 'ma',
        canActivate: [permissionGuard('ma')],
        loadComponent: () =>
          import('./features/ma/ma-page.component').then((m) => m.MaPageComponent),
      },
      {
        path: 'ma/:id',
        canActivate: [permissionGuard('ma')],
        loadComponent: () =>
          import('./features/ma/ma-detail-page.component').then((m) => m.MaDetailPageComponent),
      },
      {
        path: 'follow-ups',
        canActivate: [permissionGuard('follow-ups')],
        loadComponent: () =>
          import('./shared/components/placeholder-page.component').then((m) => m.PlaceholderPageComponent),
        data: {
          title: 'ติดตามลูกค้า',
          description: 'แผนติดตามและลูกค้าที่เลยกำหนด',
          icon: 'event_available',
        },
      },
      {
        path: 'surveys',
        canActivate: [permissionGuard('surveys')],
        loadComponent: () =>
          import('./shared/components/placeholder-page.component').then((m) => m.PlaceholderPageComponent),
        data: {
          title: 'แบบประเมิน',
          description: 'สร้างแบบประเมินและสรุปความพึงพอใจ',
          icon: 'rate_review',
        },
      },
      {
        path: 'documents',
        canActivate: [permissionGuard('documents')],
        loadComponent: () =>
          import('./features/documents/documents-page.component').then(
            (m) => m.DocumentsPageComponent
          ),
      },
      {
        path: 'reports',
        canActivate: [permissionGuard('reports')],
        loadComponent: () =>
          import('./shared/components/placeholder-page.component').then((m) => m.PlaceholderPageComponent),
        data: {
          title: 'รายงาน',
          description: 'รายได้ ต้นทุน และแดชบอร์ดผู้บริหาร',
          icon: 'analytics',
        },
      },
      {
        path: 'notifications',
        canActivate: [permissionGuard('notifications')],
        loadComponent: () =>
          import('./shared/components/placeholder-page.component').then((m) => m.PlaceholderPageComponent),
        data: {
          title: 'การแจ้งเตือน',
          description: 'กติกาแจ้งเตือนและรายการแจ้งเตือนในระบบ',
          icon: 'notifications',
        },
      },
      {
        path: 'users',
        canActivate: [permissionGuard('users')],
        loadComponent: () =>
          import('./features/users/users-page.component').then((m) => m.UsersPageComponent),
      },
      {
        path: 'roles',
        canActivate: [permissionGuard('roles')],
        loadComponent: () =>
          import('./features/roles/roles-page.component').then((m) => m.RolesPageComponent),
      },
      {
        path: 'audit-logs',
        canActivate: [permissionGuard('audit-logs')],
        loadComponent: () =>
          import('./shared/components/placeholder-page.component').then((m) => m.PlaceholderPageComponent),
        data: {
          title: 'บันทึกการใช้งาน',
          description: 'ตรวจสอบว่าใครเพิ่ม แก้ไข หรือลบข้อมูลใดเมื่อใด',
          icon: 'history',
        },
      },
    ],
  },
  { path: '**', redirectTo: 'app' },
];
