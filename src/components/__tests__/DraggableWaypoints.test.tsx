import { act, render } from '@testing-library/react-native';
import React from 'react';
import { PanResponder } from 'react-native';
import { PreferencesProvider } from '@/state/preferences';
import { AppThemeProvider } from '@/theme/theme';
import type { RouteWaypoint } from '@/domain/routePlanning';
import { DraggableWaypoints } from '../DraggableWaypoints';

// Icon fonts are unrelated to the gesture lifecycle under test.
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Text' }));

const points: RouteWaypoint[] = ['EDAY', 'WP1', 'EDCE'].map((ident, index) => ({ id: ident, ident, name: ident, source: 'MAP', latitude: 52 + index / 100, longitude: 13 }));
afterEach(() => jest.restoreAllMocks());
it('installs drag handlers, moves multiple positions, and releases the parent scroll lock', async () => {
  const spy = jest.spyOn(PanResponder, 'create');
  const onChange = jest.fn();
  const onDragging = jest.fn();
  await render(<PreferencesProvider><AppThemeProvider><DraggableWaypoints waypoints={points} onChange={onChange} onDragging={onDragging} /></AppThemeProvider></PreferencesProvider>);
  const handlers = spy.mock.calls[0]![0];
  await act(() => handlers.onPanResponderGrant?.({} as never, {} as never));
  expect(onDragging).toHaveBeenLastCalledWith(true);
  await act(() => handlers.onPanResponderRelease?.({} as never, { dy: 168 } as never));
  expect(onChange.mock.calls[0]![0].map((point: RouteWaypoint) => point.ident)).toEqual(['WP1', 'EDCE', 'EDAY']);
  expect(onDragging).toHaveBeenLastCalledWith(false);
});
it('cancels an interrupted drag without changing the route', async () => {
  const spy = jest.spyOn(PanResponder, 'create');
  const onChange = jest.fn();
  const onDragging = jest.fn();
  await render(<PreferencesProvider><AppThemeProvider><DraggableWaypoints waypoints={points} onChange={onChange} onDragging={onDragging} /></AppThemeProvider></PreferencesProvider>);
  const handlers = spy.mock.calls[0]![0];
  await act(() => handlers.onPanResponderGrant?.({} as never, {} as never));
  await act(() => handlers.onPanResponderMove?.({} as never, { dy: 100 } as never));
  await act(() => handlers.onPanResponderTerminate?.({} as never, {} as never));
  expect(onChange).not.toHaveBeenCalled();
  expect(onDragging).toHaveBeenLastCalledWith(false);
});
