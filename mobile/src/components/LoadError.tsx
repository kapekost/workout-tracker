import { View } from 'react-native';

import { colors, fontSize, radius, space } from '../theme/tokens';
import { Button } from './Button';
import { Eyebrow } from './Eyebrow';
import { ThemedText } from './ThemedText';

// A failed read replaces the content instead of rendering as an empty state, which would read as
// fact ("No sessions logged yet"). "Nothing was lost" answers the question behind it.
export function LoadError({ what = 'your data', onRetry }: { what?: string; onRetry?: () => void }) {
  return (
    <View
      accessibilityRole="alert"
      style={{
        marginTop: space.xs,
        padding: space.md,
        paddingVertical: 10,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.danger,
        borderLeftWidth: 3,
        backgroundColor: colors.dangerBg,
      }}>
      <ThemedText size="lg" weight="semibold">
        We couldn&apos;t load {what}.
      </ThemedText>
      <ThemedText size="lg" style={{ marginTop: space.xs }}>
        Nothing was lost.
      </ThemedText>
      {onRetry ? (
        <View style={{ marginTop: space.md, alignSelf: 'flex-start' }}>
          <Button variant="secondary" label="Try again" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

// The eyebrow and heading a full-page error shares across screens.
export function LoadErrorHeading({ children }: { children: string }) {
  return (
    <View>
      <Eyebrow color="danger" size="base" style={{ marginBottom: space.xs }}>
        Couldn&apos;t load
      </Eyebrow>
      <ThemedText
        size="title"
        weight="bold"
        style={{ lineHeight: fontSize.title * 1.1, letterSpacing: -fontSize.title * 0.01 }}>
        {children}
      </ThemedText>
    </View>
  );
}
