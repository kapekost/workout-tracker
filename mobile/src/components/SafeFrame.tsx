import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../theme/tokens';

// For stacks that render without the TopBar and TabBar, which otherwise own the safe areas.
export function SafeFrame({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {children}
    </SafeAreaView>
  );
}
