import { View } from 'react-native';

import { ThemedText } from '@/src/components/ThemedText';

export default function TabOneScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ThemedText size="title">Gym Tracker</ThemedText>
      <ThemedText color="muted">Mobile app</ThemedText>
    </View>
  );
}
