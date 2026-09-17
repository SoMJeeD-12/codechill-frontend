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
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/profile-page.component').then((m) => m.ProfilePageComponent),
      },
      {
        path: 'home',
        canActivate: [permissionGuard('dashboard')],
        loadComponent: () =>
          import('./features/home/home-page.component').then((m) => m.HomePageComponent),
      },
      // ลิงก์เดิม
      { path: 'dashboard', redirectTo: 'home', pathMatch: 'full' },
      { path: 'my-work', redirectTo: 'tasks/me', pathMatch: 'full' },
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
        path: 'customer-360',
        canActivate: [permissionGuard('customer-360')],
        loadComponent: () =>
          import('./features/customers/customers-page.component').then((m) => m.CustomersPageComponent),
        data: { mode: '360' },
      },
      {
        path: 'customer-360/:id',
        canActivate: [permissionGuard('customer-360')],
        loadComponent: () =>
          import('./features/customers/customer-detail-page.component').then(
            (m) => m.CustomerDetailPageComponent
          ),
        data: { mode: '360' },
      },
      {
        path: 'projects',
        canActivate: [permissionGuard('projects')],
        loadComponent: () =>
          import('./features/projects/projects-page.component').then((m) => m.ProjectsPageComponent),
      },
      {
        path: 'tasks',
        canActivate: [permissionGuard('tasks')],
        loadComponent: () =>
          import('./features/tasks/tasks-page.component').then((m) => m.TasksPageComponent),
        data: { taskMode: 'all' },
      },
      {
        path: 'tasks/me',
        canActivate: [permissionGuard('tasks-me')],
        loadComponent: () =>
          import('./features/tasks/tasks-page.component').then((m) => m.TasksPageComponent),
        data: { taskMode: 'me' },
      },
      {
        path: 'tasks/unassigned',
        canActivate: [permissionGuard('tasks-me')],
        loadComponent: () =>
          import('./features/tasks/tasks-page.component').then((m) => m.TasksPageComponent),
        data: { taskMode: 'me', myView: 'todo' },
      },
      {
        path: 'tasks/doing',
        canActivate: [permissionGuard('tasks-me')],
        loadComponent: () =>
          import('./features/tasks/tasks-page.component').then((m) => m.TasksPageComponent),
        data: { taskMode: 'me', myView: 'doing' },
      },
      {
        path: 'tasks/review',
        canActivate: [permissionGuard('tasks-review')],
        loadComponent: () =>
          import('./features/tasks/tasks-page.component').then((m) => m.TasksPageComponent),
        data: { taskMode: 'review' },
      },
      {
        path: 'tasks/overdue',
        canActivate: [permissionGuard('tasks-me')],
        loadComponent: () =>
          import('./features/tasks/tasks-page.component').then((m) => m.TasksPageComponent),
        data: { taskMode: 'me', myView: 'overdue' },
      },
      {
        path: 'tasks/board',
        canActivate: [permissionGuard('tasks')],
        loadComponent: () =>
          import('./features/tasks/tasks-page.component').then((m) => m.TasksPageComponent),
        data: { taskMode: 'board' },
      },
      // ลิงก์เก่าจากหน้าภาพรวมงาน
      {
        path: 'tasks/overview',
        redirectTo: 'tasks',
        pathMatch: 'full',
      },
      {
        path: 'projects/board',
        redirectTo: '/app/tasks/board',
        pathMatch: 'full',
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
        path: 'tickets/create',
        canActivate: [permissionGuard('tickets')],
        loadComponent: () =>
          import('./features/tickets/ticket-create-page.component').then(
            (m) => m.TicketCreatePageComponent
          ),
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
        path: 'ma/plans',
        canActivate: [permissionGuard('ma-plans')],
        loadComponent: () =>
          import('./features/ma/ma-plans-page.component').then((m) => m.MaPlansPageComponent),
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
          import('./features/follow-ups/follow-ups-page.component').then(
            (m) => m.FollowUpsPageComponent
          ),
      },
      {
        path: 'surveys',
        canActivate: [permissionGuard('surveys')],
        loadComponent: () =>
          import('./features/surveys/surveys-page.component').then((m) => m.SurveysPageComponent),
      },
      {
        path: 'surveys/:id',
        canActivate: [permissionGuard('surveys')],
        loadComponent: () =>
          import('./features/surveys/survey-detail-page.component').then(
            (m) => m.SurveyDetailPageComponent
          ),
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
          import('./features/reports/reports-page.component').then((m) => m.ReportsPageComponent),
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
          import('./features/audit/audit-logs-page.component').then(
            (m) => m.AuditLogsPageComponent
          ),
      },
    ],
  },
  { path: '**', redirectTo: 'app' },
];
