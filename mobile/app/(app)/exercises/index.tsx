import { Link, useRouter } from 'expo-router';
import { Pressable, SectionList, View } from 'react-native';

import { Button } from '@/src/components/Button';
import { Screen } from '@/src/components/Screen';
import { ThemedText } from '@/src/components/ThemedText';
import { planDays, repRange } from '@/src/plan/plan';
import { usePlan } from '@/src/plan';
import { colors, radius, space } from '@/src/theme/tokens';

export default function ExerciseListScreen() {
  const router = useRouter();
  const { data, isPending, isError, refetch } = usePlan();
  const sections = data ? planDays(data).map((day) => ({ title: day.name, tag: day.tag, data: day.exercises })) : [];

  return (
    <View style={{ flex: 1 }}>
      <Screen loading={isPending} error={isError} onRetry={refetch}>
        <SectionList
          sections={sections}
          keyExtractor={(ex) => ex.id}
          contentContainerStyle={{ padding: space.xl, paddingBottom: space.xxxl }}
          renderSectionHeader={({ section }) => (
            <View style={{ paddingTop: space.xxl, paddingBottom: space.md, backgroundColor: colors.bg }}>
              <ThemedText size="strong">{section.title}</ThemedText>
              {section.tag ? (
                <ThemedText size="sm" color="muted">
                  {section.tag}
                </ThemedText>
              ) : null}
            </View>
          )}
          renderItem={({ item }) => (
            <Link href={{ pathname: '/exercises/[id]', params: { id: item.id } }} asChild>
              <Pressable
                accessibilityRole="button"
                style={{
                  minHeight: 56,
                  justifyContent: 'center',
                  marginBottom: space.sm,
                  paddingHorizontal: space.xl,
                  borderRadius: radius.md,
                  backgroundColor: colors.card,
                }}>
                <ThemedText>{item.name}</ThemedText>
                <ThemedText size="sm" color="muted">
                  {item.sets} × {repRange(item)}
                  {item.bodyweight ? ' · bodyweight' : ''}
                </ThemedText>
              </Pressable>
            </Link>
          )}
        />
      </Screen>
      <View style={{ padding: space.xl }}>
        <Button label="Back" onPress={() => router.back()} />
      </View>
    </View>
  );
}
