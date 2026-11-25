import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { zh } from './zh';

const stored = typeof window !== 'undefined' ? window.localStorage.getItem('courseatlas.language') : null;
const initialLanguage = stored === 'zh' ? 'zh' : 'en';

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: initialLanguage,
  fallbackLng: 'en',
  supportedLngs: ['en', 'zh'],
  interpolation: { escapeValue: false },
  returnNull: false,
});

if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLanguage === 'zh' ? 'zh-CN' : 'en';
}

export default i18n;
