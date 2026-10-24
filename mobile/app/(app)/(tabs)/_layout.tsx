import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/src/components/TabBar';
import { TopBar } from '@/src/components/TopBar';

// Order is the PWA's: Home, Progress, History.
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ header: () => <TopBar /> }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="progress" />
      <Tabs.Screen name="history" />
    </Tabs>
  );
}
