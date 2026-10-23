import { ActivityIndicator, View } from 'react-native';

import { colors, space } from '../theme/tokens';
import { Button } from './Button';
import { ThemedText } from './ThemedText';

type Props = {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  children: React.ReactNode;
};

// The loading and error states every data screen shares.
export function Screen({ loading, error, onRetry, children }: Props) {
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} accessibilityLabel="Loading" />
      </View>
    );
  }
  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: space.xxxl, gap: space.xl }}>
        <ThemedText color="danger" accessibilityRole="alert">
          Could not load this. Check your connection and try again.
        </ThemedText>
        <Button label="Try again" onPress={onRetry} />
      </View>
    );
  }
  return <>{children}</>;
}
