import { getAiracCycleAt } from '@/domain/routePlanning';

export const OPEN_FLIGHT_MAPS_ATTRIBUTION = '© open flightmaps association · © OpenStreetMap contributors · NASA elevation data';
export const SATELLITE_ATTRIBUTION = 'Imagery © Esri and its data providers';
export const SATELLITE_TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export function getOpenFlightMapsTiles(cycle = getAiracCycleAt()): { base: string; aeronautical: string; cycle: string } {
  return {
    cycle,
    base: `https://nwy-tiles-api.prod.newaydata.com/tiles/{z}/{x}/{y}.jpg?path=${cycle}/base/latest`,
    aeronautical: `https://nwy-tiles-api.prod.newaydata.com/tiles/{z}/{x}/{y}.png?path=${cycle}/aero/latest`
  };
}
