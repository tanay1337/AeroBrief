import { routePlanViewQueryKey } from '@/navigation/routePlanView';

describe('route plan viewer cache isolation', () => {
  it('does not collide with the FlightRouteSnapshot cached by the logbook screen', () => {
    expect(routePlanViewQueryKey(undefined, 'flight-1')).toEqual(['route-plan-view', null, 'flight-1']);
    expect(routePlanViewQueryKey(undefined, 'flight-1')).not.toEqual(['flight-route', 'flight-1']);
  });
});
