import { ActivityIndicator, View } from 'react-native';

import { colors, space } from '../theme/tokens';
import { LoadError } from './LoadError';

type Props = {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  what?: string;
  children: React.ReactNode;
};

// The loading and error states every data screen shares.
export function Screen({ loading, error, onRetry, what, children }: Props) {
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} accessibilityLabel="Loading" />
      </View>
    );
  }
  if (error) {
    return (
      <View style={{ flex: 1, padding: space.xl }}>
        <LoadError what={what} onRetry={onRetry} />
      </View>
    );
  }
  return <>{children}</>;
}
