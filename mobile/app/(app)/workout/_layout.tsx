import { Stack } from 'expo-router';

import { SafeFrame } from '@/src/components/SafeFrame';

export default function WorkoutLayout() {
  return <SafeFrame><Stack screenOptions={{ headerShown: false }} /></SafeFrame>;
}
