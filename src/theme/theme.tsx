import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { usePreferences } from '@/state/preferences';
import type { FlightCategory } from '@/domain/models';

export interface AppColors {
  background: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  textMuted: string;
  primary: string;
  primarySoft: string;
  border: string;
  danger: string;
  warning: string;
  success: string;
  shadow: string;
}

const light: AppColors = {
  background: '#F3F6F8',
  surface: '#FFFFFF',
  surfaceRaised: '#EAF0F3',
  text: '#14242B',
  textMuted: '#5C7079',
  primary: '#087F8C',
  primarySoft: '#D8F2F3',
  border: '#D7E0E4',
  danger: '#B42318',
  warning: '#B54708',
  success: '#18794E',
  shadow: '#102A36'
};

const dark: AppColors = {
  background: '#0D171B',
  surface: '#152329',
  surfaceRaised: '#20343C',
  text: '#F4F8F9',
  textMuted: '#A9BDC5',
  primary: '#57CED4',
  primarySoft: '#153D42',
  border: '#2C4149',
  danger: '#FF8A80',
  warning: '#FFB86B',
  success: '#67D6A0',
  shadow: '#000000'
};

const ThemeContext = createContext({ colors: light, dark: false });

export function AppThemeProvider({ children }: React.PropsWithChildren): React.JSX.Element {
  const system = useColorScheme();
  const { preferences } = usePreferences();
  const isDark = preferences.theme === 'dark'
    || (preferences.theme === 'system' && system === 'dark');
  const value = useMemo(() => ({ colors: isDark ? dark : light, dark: isDark }), [isDark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useAppTheme = () => useContext(ThemeContext);

export const categoryColors: Record<FlightCategory, { background: string; foreground: string }> = {
  VFR: { background: '#D8F3E5', foreground: '#08633B' },
  MVFR: { background: '#DCEBFF', foreground: '#1556A8' },
  IFR: { background: '#FFE3DC', foreground: '#A92D20' },
  LIFR: { background: '#EEE0FF', foreground: '#7135A4' },
  UNKNOWN: { background: '#E6ECEF', foreground: '#4C626C' }
};
