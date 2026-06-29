export const CYCLE = ['upper_a', 'lower_a', 'upper_b', 'lower_b']

export const PLAN = {
  upper_a: {
    id: 'upper_a', name: 'Upper A', emoji: '💪',
    tag: 'Chest · Back Horizontal · Arms',
    exercises: [
      {
        id: 'bench_press', name: 'Bench Press', alt: 'or Dumbbell Press',
        sets: 3, repsLow: 6, repsHigh: 10,
        muscles: ['Chest', 'Front Delt', 'Triceps'],
        ytUrl: 'https://www.youtube.com/results?search_query=bench+press+proper+form+jeff+nippard',
        cues: [
          'Retract & depress shoulder blades into bench',
          'Slight arch — feet flat for a stable base',
          'Elbows ~70° from torso (not fully flared)',
          'Bar traces slight diagonal to lower chest',
          '2 sec controlled descent, full ROM'
        ]
      },
      {
        id: 'bent_row', name: 'Bent-over Row', alt: 'or Chest-supported Row',
        sets: 3, repsLow: 8, repsHigh: 12,
        muscles: ['Lats', 'Rhomboids', 'Rear Delt', 'Biceps'],
        ytUrl: 'https://www.youtube.com/results?search_query=barbell+bent+over+row+form+tutorial',
        cues: [
          'Hinge to ~45°, neutral spine throughout',
          'Drive elbows back — not flared wide',
          'Squeeze shoulder blades together at top',
          'Bar stays close to body on the way up',
          'Control the descent, no jerking'
        ]
      },
      {
        id: 'ohp', name: 'Overhead Press', alt: 'Barbell or Dumbbell',
        sets: 3, repsLow: 8, repsHigh: 12,
        muscles: ['Front Delt', 'Side Delt', 'Triceps'],
        ytUrl: 'https://www.youtube.com/results?search_query=overhead+press+form+tutorial+barbell',
        cues: [
          'Grip just outside shoulders, full grip',
          'Bar starts at upper chest / clavicle',
          'Head moves back slightly as bar passes face',
          'Full lockout at top, squeeze glutes throughout',
          'Core braced — no excessive lower back arch'
        ]
      },
      {
        id: 'lat_pulldown', name: 'Lat Pulldown', alt: 'or Pull-up',
        sets: 3, repsLow: 8, repsHigh: 12,
        muscles: ['Lats', 'Biceps', 'Rear Delt'],
        ytUrl: 'https://www.youtube.com/results?search_query=lat+pulldown+proper+form+tutorial',
        cues: [
          'Depress shoulder blades before pulling',
          'Pull elbows down and in to pockets',
          'Slight layback (~10-15°) is fine',
          'Full stretch at top — don\'t rush it',
          'Bar to upper chest, brief squeeze'
        ]
      },
      {
        id: 'tricep_pushdown', name: 'Tricep Pushdown', alt: 'Cable rope or bar',
        sets: 2, repsLow: 10, repsHigh: 15,
        muscles: ['Triceps'],
        ytUrl: 'https://www.youtube.com/results?search_query=cable+tricep+pushdown+form+rope',
        cues: [
          'Elbows pinned tight to sides',
          'Slight forward hinge at hips',
          'Full extension at bottom, squeeze',
          '2 sec slow return — feel the stretch',
          'Don\'t let elbows flare or drift forward'
        ]
      },
      {
        id: 'db_curl', name: 'Dumbbell Curl', alt: 'Supinating grip',
        sets: 2, repsLow: 10, repsHigh: 15,
        muscles: ['Biceps', 'Brachialis'],
        ytUrl: 'https://www.youtube.com/results?search_query=dumbbell+bicep+curl+form+tutorial',
        cues: [
          'Start neutral (thumbs up), supinate at top',
          'Elbows stay at sides — no swinging',
          'Full extension at bottom every rep',
          'Squeeze bicep hard at the peak',
          'Slow on the way down — 2-3 sec'
        ]
      }
    ]
  },

  lower_a: {
    id: 'lower_a', name: 'Lower A', emoji: '🦵',
    tag: 'Quad · Hamstring · Calves',
    exercises: [
      {
        id: 'back_squat', name: 'Back Squat', alt: 'High or Low Bar',
        sets: 3, repsLow: 6, repsHigh: 10,
        muscles: ['Quads', 'Glutes', 'Hamstrings'],
        ytUrl: 'https://www.youtube.com/results?search_query=back+squat+form+tutorial+jeff+nippard',
        cues: [
          'Feet shoulder-width, toes out ~30°',
          'Knees track over toes — no caving in',
          'Chest up, elbows down (high bar) or back (low bar)',
          'Depth: hip crease below top of knee minimum',
          'Drive through mid-foot, not heels or toes'
        ]
      },
      {
        id: 'rdl', name: 'Romanian Deadlift', alt: 'Barbell or Dumbbell',
        sets: 3, repsLow: 8, repsHigh: 12,
        muscles: ['Hamstrings', 'Glutes', 'Lower Back'],
        ytUrl: 'https://www.youtube.com/results?search_query=romanian+deadlift+rdl+proper+form',
        cues: [
          'Hip hinge — push hips BACK, not down',
          'Soft bend in knees, maintained throughout',
          'Bar drags close down the shins and thighs',
          'Feel deep hamstring stretch at the bottom',
          'Drive hips forward to stand, squeeze glutes'
        ]
      },
      {
        id: 'leg_press', name: 'Leg Press', alt: 'Machine',
        sets: 3, repsLow: 10, repsHigh: 15,
        muscles: ['Quads', 'Glutes'],
        ytUrl: 'https://www.youtube.com/results?search_query=leg+press+proper+form+foot+placement',
        cues: [
          'Feet shoulder-width, mid to upper platform',
          'Full ROM: knees deep to chest at bottom',
          'Don\'t lock out knees completely at top',
          'Lower back stays pressed to pad',
          'Controlled descent — don\'t drop the weight'
        ]
      },
      {
        id: 'leg_curl', name: 'Leg Curl', alt: 'Lying or Seated',
        sets: 3, repsLow: 10, repsHigh: 15,
        muscles: ['Hamstrings'],
        ytUrl: 'https://www.youtube.com/results?search_query=lying+leg+curl+machine+form+tutorial',
        cues: [
          'Hips stay flat on pad throughout',
          'Curl through full range of motion',
          'Squeeze at peak contraction, brief hold',
          '2-3 sec controlled return',
          'No momentum or swinging the hips'
        ]
      },
      {
        id: 'standing_calf', name: 'Standing Calf Raise', alt: 'Machine or Smith Bar',
        sets: 3, repsLow: 12, repsHigh: 20,
        muscles: ['Gastrocnemius', 'Soleus'],
        ytUrl: 'https://www.youtube.com/results?search_query=standing+calf+raise+form+tutorial',
        cues: [
          'Full stretch at bottom — heels below platform edge',
          'Rise onto ball of foot, not the toes',
          '1-2 sec hold at the top',
          'Slow controlled descent — calves grow under stretch',
          'Knees soft, not locked'
        ]
      }
    ]
  },

  upper_b: {
    id: 'upper_b', name: 'Upper B', emoji: '🏋️',
    tag: 'Upper Chest · Vertical Pull · Shoulders',
    exercises: [
      {
        id: 'incline_press', name: 'Incline DB Press', alt: '30-45° bench',
        sets: 3, repsLow: 8, repsHigh: 12,
        muscles: ['Upper Chest', 'Front Delt', 'Triceps'],
        ytUrl: 'https://www.youtube.com/results?search_query=incline+dumbbell+press+form+tutorial',
        cues: [
          '30° bench hits more chest than 45°',
          'DB at chest height, neutral or angled grip',
          'Press slightly inward at top for chest squeeze',
          'Full stretch at bottom — feel it in upper chest',
          '2-3 sec descent, controlled'
        ]
      },
      {
        id: 'pullup', name: 'Pull-up', alt: 'Use assisted machine if needed',
        sets: 3, repsLow: 6, repsHigh: 12,
        muscles: ['Lats', 'Biceps', 'Rear Delt'],
        ytUrl: 'https://www.youtube.com/results?search_query=how+to+pull+ups+proper+form+tutorial',
        cues: [
          'Dead hang at bottom — full shoulder elevation',
          'Initiate: depress shoulder blades first',
          'Pull elbows down to hips, not behind',
          'Chin clears bar — chest moves toward bar',
          'Lower fully — no half reps'
        ]
      },
      {
        id: 'cable_row', name: 'Seated Cable Row', alt: 'Close or wide grip',
        sets: 3, repsLow: 10, repsHigh: 12,
        muscles: ['Mid Back', 'Rhomboids', 'Lats', 'Biceps'],
        ytUrl: 'https://www.youtube.com/results?search_query=seated+cable+row+form+tutorial',
        cues: [
          'Sit tall, slight natural lumbar arch',
          'Drive elbows back — squeeze mid-back at end',
          'Hold the peak contraction briefly',
          'Don\'t lean back excessively with the torso',
          'Full arm extension on the return'
        ]
      },
      {
        id: 'lateral_raise', name: 'Lateral Raise', alt: 'Dumbbell or cable',
        sets: 3, repsLow: 12, repsHigh: 15,
        muscles: ['Side Delt'],
        ytUrl: 'https://www.youtube.com/results?search_query=lateral+raise+proper+form+side+delt+tutorial',
        cues: [
          'Slight forward lean, slight elbow bend',
          'Raise to shoulder height — no higher needed',
          'Lead with elbows, pinky slightly higher than thumb',
          'No momentum — strict and slow',
          'Feel the side delt, not traps'
        ]
      },
      {
        id: 'hammer_curl', name: 'Hammer Curl', alt: 'Neutral grip DB',
        sets: 2, repsLow: 10, repsHigh: 15,
        muscles: ['Brachialis', 'Biceps', 'Forearms'],
        ytUrl: 'https://www.youtube.com/results?search_query=hammer+curl+form+tutorial+brachialis',
        cues: [
          'Neutral grip (thumbs up) throughout the entire rep',
          'Elbows stay pinned to sides',
          'Full ROM — full extension at bottom',
          'Squeeze at peak, no swinging',
          'Alternating or simultaneous — both effective'
        ]
      },
      {
        id: 'skull_crusher', name: 'Skull Crusher', alt: 'EZ bar or dumbbells',
        sets: 2, repsLow: 10, repsHigh: 15,
        muscles: ['Triceps (Long Head)'],
        ytUrl: 'https://www.youtube.com/results?search_query=skull+crusher+ez+bar+form+triceps',
        cues: [
          'Upper arms vertical, elbows pointed at ceiling',
          'Lower toward forehead or just behind the head',
          'Elbows stay stationary — only forearms move',
          'Full lockout at top, squeeze triceps',
          'Slow controlled descent'
        ]
      }
    ]
  },

  lower_b: {
    id: 'lower_b', name: 'Lower B', emoji: '🔥',
    tag: 'Posterior Chain · Glutes · Power',
    exercises: [
      {
        id: 'deadlift', name: 'Deadlift', alt: 'Conventional or Trap Bar',
        sets: 3, repsLow: 4, repsHigh: 8,
        muscles: ['Hamstrings', 'Glutes', 'Spinal Erectors', 'Traps'],
        ytUrl: 'https://www.youtube.com/results?search_query=alan+thrall+how+to+deadlift+tutorial',
        cues: [
          'Bar over mid-foot, hip-width stance',
          'Grab bar, push shins to bar — don\'t reach down',
          '"Protect your armpits" — engage lats hard',
          'Hips and shoulders rise at the same rate',
          'Squeeze glutes at lockout, hinge back down'
        ]
      },
      {
        id: 'bss', name: 'Bulgarian Split Squat', alt: 'Dumbbells or Barbell',
        sets: 3, repsLow: 8, repsHigh: 12,
        muscles: ['Quads', 'Glutes', 'Hip Flexors'],
        ytUrl: 'https://www.youtube.com/results?search_query=bulgarian+split+squat+form+tutorial',
        cues: [
          'Front foot far enough forward — don\'t tip',
          'Rear foot on bench, top of foot down',
          'Slight forward torso lean — engages more glute',
          'Front knee tracks over toes — no caving',
          '2 sec descent, explosive drive up'
        ]
      },
      {
        id: 'hip_thrust', name: 'Hip Thrust', alt: 'Barbell or machine',
        sets: 3, repsLow: 10, repsHigh: 12,
        muscles: ['Glutes', 'Hamstrings'],
        ytUrl: 'https://www.youtube.com/results?search_query=barbell+hip+thrust+form+tutorial+glutes',
        cues: [
          'Shoulders on bench, bar over hip crease (use a pad)',
          'Feet flat, shins vertical at the top position',
          'Drive through heels, squeeze glutes hard at top',
          'Hips level — no rotation left or right',
          'Don\'t hyperextend lower back at top'
        ]
      },
      {
        id: 'leg_ext', name: 'Leg Extension', alt: 'Machine',
        sets: 3, repsLow: 12, repsHigh: 15,
        muscles: ['Quads'],
        ytUrl: 'https://www.youtube.com/results?search_query=leg+extension+machine+form+tutorial',
        cues: [
          'Adjust seat so knee joint aligns with pivot',
          'Full extension at top — squeeze quads hard',
          '1-2 sec hold at peak contraction',
          'Controlled slow descent',
          'Toes slightly out targets outer quad'
        ]
      },
      {
        id: 'seated_calf', name: 'Seated Calf Raise', alt: 'Machine or DB on knees',
        sets: 3, repsLow: 12, repsHigh: 20,
        muscles: ['Soleus', 'Gastrocnemius'],
        ytUrl: 'https://www.youtube.com/results?search_query=seated+calf+raise+form+soleus+tutorial',
        cues: [
          'Knees at 90°, pad on lower thighs',
          'Full stretch — heels as low as possible',
          'Rise onto ball of foot, hold 1-2 sec',
          'Slow controlled descent',
          'Seated = more soleus activation than standing'
        ]
      }
    ]
  }
}

export const getNextWorkoutId = (sessions) => {
  if (!sessions?.length) return 'upper_a'
  const last = sessions[0]?.workout_day
  const idx = CYCLE.indexOf(last)
  if (idx === -1) return 'upper_a'
  return CYCLE[(idx + 1) % CYCLE.length]
}

export const DAY_COLORS = {
  upper_a: '#6ee7b7',
  lower_a: '#60a5fa',
  upper_b: '#f472b6',
  lower_b: '#fb923c'
}
