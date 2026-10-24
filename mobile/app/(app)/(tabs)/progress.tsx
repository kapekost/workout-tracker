import { ScrollView } from 'react-native';

import { EmptyState } from '@/src/components/EmptyState';
import { ThemedText } from '@/src/components/ThemedText';
import { space } from '@/src/theme/tokens';

export default function ProgressScreen() {
  return (
    <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl }}>
      <ThemedText size="title" weight="bold">
        Progress
      </ThemedText>
      <EmptyState title="Progress is not in the app yet" subtitle="Use the website for now." />
    </ScrollView>
  );
}
