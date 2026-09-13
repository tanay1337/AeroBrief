import { reorderWaypoints } from '../reorderWaypoints';
it('moves a waypoint across multiple positions without dropping intermediate points', () => {
  const points = ['EDAY', 'WP1', 'WP2', 'EDCE'];
  expect(reorderWaypoints(points, 1, 3)).toEqual(['EDAY', 'WP2', 'EDCE', 'WP1']);
  expect(reorderWaypoints(points, 3, 1)).toEqual(['EDAY', 'EDCE', 'WP1', 'WP2']);
  expect(points).toEqual(['EDAY', 'WP1', 'WP2', 'EDCE']);
});
it('leaves the route intact when a drag does not change position or goes beyond its ends', () => {
  const points = ['A', 'B'];
  expect(reorderWaypoints(points, 0, 0)).toBe(points);
  expect(reorderWaypoints(points, 0, 2)).toBe(points);
});
