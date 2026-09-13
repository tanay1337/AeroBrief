import * as Linking from 'expo-linking';
import { Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

export const DFS_BRIEFING_URL = 'https://ais.dfs.de/pilotservice/user/login/login_edit.jsp?lang=en';

export function openInAppBrowser(url: string, title: string): void {
  if (!/^https?:\/\//i.test(url)) return;
  void title;
  const request = /^https:\/\/ais\.dfs\.de\//i.test(url) ? Linking.openURL(url) : WebBrowser.openBrowserAsync(url, {
    toolbarColor: '#07161C',
    controlsColor: '#55CBD4',
    showTitle: true,
    enableBarCollapsing: true
  });
  void request.catch(() => Alert.alert('Could not open browser', 'Please try again with a browser installed.'));
}
