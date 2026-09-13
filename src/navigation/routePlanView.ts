export const routePlanViewQueryKey = (id?: string, flightId?: string) =>
  ['route-plan-view', id ?? null, flightId ?? null] as const;
