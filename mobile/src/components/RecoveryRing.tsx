import Svg, { Circle } from 'react-native-svg';

import { colors } from '../theme/tokens';

// Freshness is a MAGNITUDE, so the ring is a sequential encoding: one hue, dark to light. It is
// deliberately not red/amber/green: "Recently trained" is a fact, not a warning. Both ends sit in
// the same hue family; the vivid end is the app accent. Same endpoints as the PWA's ring.
const RING_LOW = [45, 95, 80]; // dark lime, recedes against the surface
const RING_HIGH = [212, 255, 63]; // colors.accent (#d4ff3f)

// "Never trained" must not look like "just trained". An unknown ring is drawn empty anyway.
const RING_UNKNOWN = colors.border;

export function ringColor(freshness: number | null | undefined): string {
  if (freshness === null || freshness === undefined) return RING_UNKNOWN;
  const t = Math.max(0, Math.min(1, freshness));
  const [r, g, b] = [0, 1, 2].map((i) => Math.round(RING_LOW[i] + (RING_HIGH[i] - RING_LOW[i]) * t));
  return `rgb(${r}, ${g}, ${b})`;
}

type Props = { freshness: number | null; size?: number };

// The unfilled track is the accent wash, so the ring reads as one object. Not animated: the PWA's
// transition is decorative and reduce-motion is not this screen's question. The text next to it is
// always a band label, never a number.
export function RecoveryRing({ freshness, size = 44 }: Props) {
  const stroke = 4;
  const r = (size - stroke - 2) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = freshness === null ? 0 : Math.max(0, Math.min(1, freshness));
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }} aria-hidden>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.accentWash} strokeWidth={stroke} />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={ringColor(freshness)}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - filled)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}
