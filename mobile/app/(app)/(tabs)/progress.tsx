import { ScrollView } from 'react-native';

import { EmptyState } from '@/src/components/EmptyState';
import { space } from '@/src/theme/tokens';

export default function ProgressScreen() {
  return (
    <ScrollView contentContainerStyle={{ padding: space.xl }}>
      <EmptyState title="Progress is coming to the app" subtitle="It is on the website for now." />
    </ScrollView>
  );
}
