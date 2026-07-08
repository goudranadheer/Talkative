// Futuristic neon-on-deep-space theme, shared by all screens.

export const colors = {
  bg: '#04060F',          // near-black deep space
  bgElevated: '#0A0E20',  // headers, input bars
  surface: '#10142B',     // cards, inputs
  surfaceHi: '#171C3A',   // active/selected surfaces
  border: '#232A4D',
  borderGlow: 'rgba(0, 229, 255, 0.35)',
  primary: '#00E5FF',     // electric cyan
  primaryDim: 'rgba(0, 229, 255, 0.14)',
  accent: '#7C4DFF',      // violet
  accentDim: 'rgba(124, 77, 255, 0.16)',
  text: '#EAF4FF',
  textDim: '#8B94B8',
  textFaint: '#4C5578',
  danger: '#FF5C7A',
  success: '#3DFFB4',
};

export const gradients = {
  primary: ['#00E5FF', '#7C4DFF'] as const,
  card: ['rgba(0,229,255,0.10)', 'rgba(124,77,255,0.10)'] as const,
  disabled: ['#1C2140', '#1C2140'] as const,
};

// Neon glow for buttons / active elements (iOS shadow + Android elevation).
export const glow = {
  shadowColor: '#00E5FF',
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.45,
  shadowRadius: 12,
  elevation: 8,
};

export const radii = { sm: 10, md: 14, lg: 20, pill: 999 };

// Wide-tracked uppercase labels give the sci-fi HUD feel.
export const hudLabel = {
  fontSize: 11,
  fontWeight: '700' as const,
  letterSpacing: 2,
  textTransform: 'uppercase' as const,
  color: colors.textDim,
};
