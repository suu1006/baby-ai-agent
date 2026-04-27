export const Colors = {
  primary: '#FF6B6B',
  primaryLight: '#FFE5E5',
  secondary: '#4ECDC4',
  secondaryLight: '#E0F7F6',
  accent: '#FFD93D',
  background: '#FFF5F0',
  surface: '#FFFFFF',
  text: '#2D3436',
  textSecondary: '#636E72',
  textLight: '#B2BEC3',
  border: '#F0E0DB',
  success: '#00B894',
  warning: '#FDCB6E',
  error: '#E17055',
  white: '#FFFFFF',
  black: '#000000',
};

export const Fonts = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
};

export const MoodConfig = {
  great: { emoji: '😄', label: '최고예요', color: '#00B894' },
  good: { emoji: '😊', label: '좋아요', color: '#4ECDC4' },
  neutral: { emoji: '😐', label: '보통이에요', color: '#FDCB6E' },
  bad: { emoji: '😔', label: '힘들어요', color: '#E17055' },
  sick: { emoji: '🤒', label: '아파요', color: '#FF6B6B' },
} as const;
