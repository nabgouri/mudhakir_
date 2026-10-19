export const colors = {
  background: '#F7F5EF',
  surface: '#FFFFFF',
  text: '#1C1C1A',
  textSecondary: '#6B6A63',
  border: '#E2DED3',
  primary: '#1F5F4A',
  onPrimary: '#FFFFFF',
  danger: '#B3261E',
  rightSurface: '#E3F1EA',
  wrongSurface: '#F9E3E1',
} as const;

// Noto Naskh Arabic draws diacritics (تشكيل) clearly at reading sizes.
export const fonts = {
  regular: 'NotoNaskhArabic_400Regular',
  bold: 'NotoNaskhArabic_700Bold',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
} as const;
