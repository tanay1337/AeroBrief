import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { openInAppBrowser } from '@/navigation/inAppBrowser';

jest.mock('expo-linking', () => ({ openURL: jest.fn().mockResolvedValue(true) }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn().mockResolvedValue({ type: 'cancel' }) }));

describe('in-app browser', () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens web sources in a Custom Tab', () => {
    openInAppBrowser('https://aip.dfs.de/BasicVFR', 'Official AIP');
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      'https://aip.dfs.de/BasicVFR',
      expect.objectContaining({ showTitle: true, enableBarCollapsing: true })
    );
  });

  it('opens DFS in the full browser for popup and PDF download support', () => {
    openInAppBrowser('https://ais.dfs.de/pilotservice/user/login/login_edit.jsp', 'DFS');
    expect(Linking.openURL).toHaveBeenCalledWith('https://ais.dfs.de/pilotservice/user/login/login_edit.jsp');
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it('rejects non-web URLs', () => {
    openInAppBrowser('file:///private/document.pdf', 'Document');
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
});
