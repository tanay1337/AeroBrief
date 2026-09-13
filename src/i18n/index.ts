import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

const i18n = createInstance();
void i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  resources: {
    en: {
      translation: {
        appName: 'AeroBrief',
        favorites: 'Favorites',
        search: 'Search airports',
        settings: 'Settings',
        overview: 'Overview',
        metar: 'METAR',
        taf: 'TAF',
        airport: 'Airport',
        noFavorites: 'No favorite airports yet',
        noFavoritesBody: 'Search for an airport and tap the star to keep its weather close.',
        informationalOnly: 'Informational use only',
        safetyBody: 'AeroBrief may contain delayed, incomplete, or inaccurate data. Do not use it as a substitute for an authorized preflight briefing or official weather source.',
        acknowledge: 'I understand',
        tryAgain: 'Try again',
        noReport: 'No current report is available for this airport.'
      }
    }
  }
});

export default i18n;
