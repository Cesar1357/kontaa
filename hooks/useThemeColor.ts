/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/Colors';
import type { AppTheme } from '@/hooks/ThemeContext';
import { useColorScheme } from '@/hooks/useColorScheme';

export function useThemeColor(
  props: Partial<Record<AppTheme, string>>,
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  const theme = useColorScheme() ?? 'light';
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme][colorName];
  }
}
