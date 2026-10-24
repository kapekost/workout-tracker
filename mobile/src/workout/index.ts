import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useStore } from 'zustand';

import { api } from '../api';
import { authStore } from '../auth';
import { createWorkoutStore, keepAwakeChange, type WorkoutState } from './session';

const KEEP_AWAKE_TAG = 'workout';

// Not every device has a haptic engine (simulators, web); a missing one is not an error.
const buzz = () => {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
};

export const workoutStore = createWorkoutStore(api, Date.now, buzz);

// The screen stays on for exactly as long as a workout is open, wherever the user navigates.
workoutStore.subscribe((state, prev) => {
  const change = keepAwakeChange(prev.active, state.active);
  if (change === 'on') activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
  if (change === 'off') deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
});

// An open workout belongs to whoever was logged in; it must not outlive them on a shared device.
authStore.subscribe((state) => {
  if (state.status !== 'signedIn') workoutStore.getState().reset();
});

export const useWorkout = <T>(selector: (state: WorkoutState) => T) => useStore(workoutStore, selector);
