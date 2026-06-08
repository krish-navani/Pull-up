import { Platform } from 'react-native';
import { DefaultTheme } from '@react-navigation/native';

export const WARM_CORE = {
  background: '#FFF8F0',    // Cream (main background)
  card: '#F4E9D9',          // Sand (surfaces, input fills)
  accent: '#FF7A33',        // Light Orange (highlights, status badges)
  primary: '#D4500A',       // Burnt Orange (primary CTAs, buttons, logo)
  deepAccent: '#A33A08',    // Terracotta (pressed states, headers, highlights)
  
  // Custom theme typography colors for contrast
  text: '#1E120D',          // Dark brown for highly visible body text
  textSecondary: '#6E5650',  // Medium warm brown for labels and secondary text
  border: '#E8DCCB',        // Sand-Cream border
  white: '#FFFFFF',
  
  // States
  error: '#EF4444',
  success: '#10B981',
} as const;

// Custom React Navigation theme configuration mapping to WARM CORE
export const WarmNavigationTheme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: WARM_CORE.primary,
    background: WARM_CORE.background,
    card: WARM_CORE.card,
    text: WARM_CORE.text,
    border: WARM_CORE.border,
    notification: WARM_CORE.accent,
  },
};

// Legacy fallback config to prevent imports breakage if any
export const Colors = {
  light: {
    text: WARM_CORE.text,
    background: WARM_CORE.background,
    tint: WARM_CORE.primary,
    icon: WARM_CORE.textSecondary,
    tabIconDefault: WARM_CORE.textSecondary,
    tabIconSelected: WARM_CORE.primary,
  },
  dark: {
    text: WARM_CORE.text,
    background: WARM_CORE.background,
    tint: WARM_CORE.primary,
    icon: WARM_CORE.textSecondary,
    tabIconDefault: WARM_CORE.textSecondary,
    tabIconSelected: WARM_CORE.primary,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
