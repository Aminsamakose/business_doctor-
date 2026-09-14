'use client';

import translations from '@/data/translations.json';

type Language = keyof typeof translations;

export const storeI18n = {
  getLanguage: (): Language => {
    if (typeof window === 'undefined') return 'en';
    return (localStorage.getItem('app_lang') as Language) || 'en';
  },
  setLanguage: (lang: Language) => {
    localStorage.setItem('app_lang', lang);
    window.location.reload(); // Reload to apply changes globally
  },
  t: (path: string) => {
    const lang = storeI18n.getLanguage();
    const keys = path.split('.');
    let result: any = translations[lang];

    for (const key of keys) {
      if (result && result[key]) {
        result = result[key];
      } else {
        return path; // Fallback to the key itself
      }
    }
    return result;
  }
};
