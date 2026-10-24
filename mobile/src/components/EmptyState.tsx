import { space } from '../theme/tokens';
import { Card } from './Card';
import { ThemedText } from './ThemedText';

// The shared "nothing here yet" card.
export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Card style={{ padding: space.xxxl, alignItems: 'center' }}>
      <ThemedText color="muted2" style={{ textAlign: 'center' }}>
        {title}
      </ThemedText>
      {subtitle ? (
        <ThemedText color="muted" size="md" style={{ textAlign: 'center', marginTop: space.xs }}>
          {subtitle}
        </ThemedText>
      ) : null}
    </Card>
  );
}
