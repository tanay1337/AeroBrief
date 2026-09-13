import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import Storage from 'expo-sqlite/kv-store';
import { PreferencesProvider, usePreferences } from '../preferences';

it('preserves both preference patches made before React rerenders and serializes storage writes', async () => {
  const screen = await renderHook(() => usePreferences(), { wrapper: ({ children }: React.PropsWithChildren) => <PreferencesProvider>{children}</PreferencesProvider> });
  await act(async () => {
    await Promise.all([
      screen.result.current.updatePreferences({ mapStartAirport: 'EDAY' }),
      screen.result.current.updatePreferences({ defaultAircraftProfileId: 'aircraft' })
    ]);
  });
  expect(screen.result.current.preferences).toMatchObject({ mapStartAirport: 'EDAY', defaultAircraftProfileId: 'aircraft' });
  const writes = jest.mocked(Storage.setItem).mock.calls;
  expect(JSON.parse(writes.at(-1)![1] as string)).toMatchObject({ mapStartAirport: 'EDAY', defaultAircraftProfileId: 'aircraft' });
  await screen.unmount();
});
