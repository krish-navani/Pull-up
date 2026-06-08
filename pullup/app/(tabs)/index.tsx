import { Redirect } from 'expo-router';

/**
 * Tabs index - redirects to home tab
 * This file exists because expo-router requires an index.tsx in tab groups,
 * but the actual home screen is at home.tsx
 */
export default function TabsIndex() {
  return <Redirect href="/(tabs)/home" />;
}
