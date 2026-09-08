import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

/** ล้างข้อมูลจำลองเก่าที่เคยเก็บในเบราว์เซอร์ */
function clearLegacyMockStorage(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('cpams_mock_')) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    localStorage.removeItem(key);
  }
}

clearLegacyMockStorage();

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
