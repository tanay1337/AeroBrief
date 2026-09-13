import type { TafPeriod } from './models';

export type TafWeatherIconName = 'help-outline' | 'thunderstorm-outline' | 'snow-outline' | 'rainy-outline' | 'reorder-two-outline' | 'ice-cream-outline' | 'cloud-outline' | 'partly-sunny-outline' | 'cloudy-night-outline' | 'sunny-outline' | 'moon-outline';

export function tafWeatherIcon(period: TafPeriod | null, isNight = false): { name: TafWeatherIconName; tone: 'primary' | 'warning' | 'muted' } {
  if (!period) return { name: 'help-outline', tone: 'muted' };
  const codes = period.weather.map((code) => code.replace(/^[-+]/, ''));
  if (codes.some((code) => code.includes('TS'))) return { name: 'thunderstorm-outline', tone: 'warning' };
  if (codes.some((code) => code.includes('FZRA') || code.includes('FZDZ'))) return { name: 'snow-outline', tone: 'warning' };
  if (codes.some((code) => code.includes('SN') || code.includes('SG') || code.includes('PL'))) return { name: 'snow-outline', tone: 'primary' };
  if (codes.some((code) => code.includes('RA') || code.includes('DZ') || code.includes('SH'))) return { name: 'rainy-outline', tone: 'primary' };
  if (codes.some((code) => code.includes('FG') || code.includes('BR') || code.includes('HZ') || code.includes('FU'))) return { name: 'reorder-two-outline', tone: 'muted' };
  if (codes.some((code) => code.includes('GR') || code.includes('GS'))) return { name: 'ice-cream-outline', tone: 'warning' };

  const covers = period.clouds.map((cloud) => cloud.cover);
  if (covers.some((cover) => cover === 'OVC' || cover === 'VV')) return { name: 'cloud-outline', tone: 'muted' };
  if (covers.some((cover) => cover === 'BKN' || cover === 'SCT' || cover === 'FEW')) {
    return { name: isNight ? 'cloudy-night-outline' : 'partly-sunny-outline', tone: 'primary' };
  }
  return { name: isNight ? 'moon-outline' : 'sunny-outline', tone: isNight ? 'primary' : 'warning' };
}
