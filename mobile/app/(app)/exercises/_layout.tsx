import { Stack } from 'expo-router';

import { SafeFrame } from '@/src/components/SafeFrame';

export default function ExercisesLayout() {
  return <SafeFrame><Stack screenOptions={{ headerShown: false }} /></SafeFrame>;
}
