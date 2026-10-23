import { useStore } from 'zustand';

import { api } from '../api';
import { authStore } from '../auth';
import { createWorkoutStore, type WorkoutState } from './session';

export const workoutStore = createWorkoutStore(api);

// An open workout belongs to whoever was logged in; it must not outlive them on a shared device.
authStore.subscribe((state) => {
  if (state.status !== 'signedIn') workoutStore.getState().reset();
});

export const useWorkout = <T>(selector: (state: WorkoutState) => T) => useStore(workoutStore, selector);
