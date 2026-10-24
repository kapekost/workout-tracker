import { View } from 'react-native';

import { colors, dayColor, icon, tint } from '../theme/tokens';
import IconDayCurl from './IconDayCurl';
import IconDayDeadlift from './IconDayDeadlift';
import IconDayPress from './IconDayPress';
import IconDaySquat from './IconDaySquat';

const BY_DAY = { upper_a: IconDayCurl, upper_b: IconDayPress, lower_a: IconDaySquat, lower_b: IconDayDeadlift };
const BY_KIND = { upper: IconDayCurl, lower: IconDaySquat };

type Props = {
  day: string;
  // The plan's own `icon` for the day, used when the day key is not one of the four seed days.
  kind?: string | null;
  size?: number;
};

// A tint of the day colour would vanish against volt, so Upper A takes the deeper accent.
function secondTone(day: string, color: string) {
  return day === 'upper_a' ? colors.accentDeep : tint(color, 0.6);
}

export default function DayIcon({ day, kind, size = icon.heading }: Props) {
  const Glyph = BY_DAY[day as keyof typeof BY_DAY] ?? BY_KIND[kind as keyof typeof BY_KIND] ?? IconDayCurl;
  const color = dayColor(day);
  return (
    <View style={{ flexShrink: 0 }}>
      <Glyph size={size} color={color} tone2={secondTone(day, color)} />
    </View>
  );
}
