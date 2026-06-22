export const colors = {
  background: '#FAFAF8',
  surface: '#FFFFFF',
  white: '#FFFFFF',
  text: '#1A1A1A',
  textMuted: '#6B6B6B',
  primary: '#2F6F4F',
  primaryDark: '#234F38',
  border: '#E2E0DC',
  danger: '#B3261E',
  warning: '#B8860B',
  success: '#2F6F4F',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radii = {
  sm: 6,
  md: 12,
  lg: 20,
  full: 999,
};

export const typography = {
  title: { fontSize: 28, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 20, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 16, fontWeight: '400' as const, color: colors.text },
  caption: { fontSize: 13, fontWeight: '400' as const, color: colors.textMuted },
  button: { fontSize: 16, fontWeight: '600' as const },
};
