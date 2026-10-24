import { ScrollView } from 'react-native';

import { EmptyState } from '@/src/components/EmptyState';
import { ThemedText } from '@/src/components/ThemedText';
import { space } from '@/src/theme/tokens';

export default function HistoryScreen() {
  return (
    <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl }}>
      <ThemedText size="title" weight="bold">
        History
      </ThemedText>
      <EmptyState title="History is not in the app yet" subtitle="Use the website for now." />
    </ScrollView>
  );
}
