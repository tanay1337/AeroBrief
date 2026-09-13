import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PreferencesProvider } from '@/state/preferences';
import { AppThemeProvider } from '@/theme/theme';
import { PlannedAerodromeBriefing } from '../PlannedAerodromeBriefing';
import { createPdfViewer } from '@/data/pdfViewer';

const mockFiles = [
  { id: 'approach', name: 'EDAY · Approach plate.pdf', mimeType: 'application/pdf', uri: 'file:///approach.pdf', createdAt: Date.UTC(2026, 8, 13), category: 'APPROACH_PLATE', airportIdent: 'EDAY' },
  { id: 'layout', name: 'EDAY · Aerodrome layout.pdf', mimeType: 'application/pdf', uri: 'file:///layout.pdf', createdAt: Date.UTC(2026, 8, 13), category: 'AERODROME_LAYOUT', airportIdent: 'EDAY' }
];
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Text' }));
jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => ({}) }));
jest.mock('@/data/plannedFlightAttachments', () => ({ getPlannedFlightAttachments: jest.fn().mockImplementation(async () => mockFiles) }));
jest.mock('@/data/pdfViewer', () => ({ createPdfViewer: jest.fn().mockResolvedValue({ viewerUri: 'file:///viewer.html', directory: null }), deletePdfViewer: jest.fn() }));
jest.mock('@/components/DocumentViewerModal', () => ({ DocumentViewerModal: () => null }));

it('opens both saved charts directly without expanding aerodrome or category rows', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpen = jest.fn();
  const screen = await render(<PreferencesProvider><AppThemeProvider><QueryClientProvider client={client}><PlannedAerodromeBriefing flightId="flight" ident="EDAY" label="Departure aerodrome" onOpen={onOpen} /></QueryClientProvider></AppThemeProvider></PreferencesProvider>);
  await waitFor(() => expect(screen.getByLabelText('Open EDAY · Approach plate.pdf')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Open EDAY · Approach plate.pdf'));
  expect(createPdfViewer).toHaveBeenCalledWith('file:///approach.pdf');
  await fireEvent.press(screen.getByLabelText('Open EDAY · Aerodrome layout.pdf'));
  expect(createPdfViewer).toHaveBeenCalledWith('file:///layout.pdf');
  expect(onOpen).not.toHaveBeenCalled();
  expect(screen.queryByText('1 attached')).toBeNull();
  expect(screen.queryByText('Approach plates')).toBeNull();
  expect(screen.queryByText('Aerodrome layouts')).toBeNull();
  await screen.unmount(); client.clear();
});
