import { ViewStyle } from 'react-native';
import { AppColors } from './colors';

export const Shadows: Record<string, ViewStyle> = {
  soft: {
    shadowColor: AppColors.shadow.default,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  card: {
    shadowColor: AppColors.shadow.default,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  elevated: {
    shadowColor: AppColors.shadow.default,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  glow: (color: string): ViewStyle => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  }),
} as any;
