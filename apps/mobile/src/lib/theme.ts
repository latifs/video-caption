import { vars } from 'nativewind';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = '@theme_preference';

export async function loadThemePreference() {
  try {
    const saved = await AsyncStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') {
      Appearance.setColorScheme(saved);
    }
  } catch {
    // ignore
  }
}

export async function setThemePreference(scheme: 'light' | 'dark') {
  Appearance.setColorScheme(scheme);
  try {
    await AsyncStorage.setItem(THEME_KEY, scheme);
  } catch {
    // ignore
  }
}

export const lightThemeVars = vars({
  '--color-background': '#F2F5F2',
  '--color-foreground': '#0A1F17',
  '--color-primary': '#2E5D4E',
  '--color-primary-foreground': '#F8FBF9',
  '--color-primary-muted': 'rgba(46,93,78,0.1)',
  '--color-secondary': 'rgba(0,0,0,0.05)',
  '--color-secondary-foreground': '#0A1F17',
  '--color-muted': '#E3EAE6',
  '--color-muted-foreground': '#5A6B65',
  '--color-accent': '#2E5D4E',
  '--color-accent-foreground': '#F8FBF9',
  '--color-card': '#FFFFFF',
  '--color-card-foreground': '#0A1F17',
  '--color-border': 'rgba(0,0,0,0.09)',
  '--color-input': 'rgba(0,0,0,0.07)',
  '--color-destructive': '#DC2626',
  '--color-success': '#15803d',
  '--color-overlay': 'rgba(0,0,0,0.5)',
});

export const darkThemeVars = vars({
  '--color-background': '#0C1A14',
  '--color-foreground': '#E8F0EC',
  '--color-primary': '#D5ECE5',
  '--color-primary-foreground': '#0C1A14',
  '--color-primary-muted': 'rgba(213,236,229,0.15)',
  '--color-secondary': 'rgba(255,255,255,0.08)',
  '--color-secondary-foreground': '#E8F0EC',
  '--color-muted': '#182A20',
  '--color-muted-foreground': 'rgba(232,240,236,0.5)',
  '--color-accent': '#D5ECE5',
  '--color-accent-foreground': '#0C1A14',
  '--color-card': '#182A20',
  '--color-card-foreground': '#E8F0EC',
  '--color-border': 'rgba(255,255,255,0.08)',
  '--color-input': 'rgba(255,255,255,0.08)',
  '--color-destructive': '#EF4444',
  '--color-success': '#4ade80',
  '--color-overlay': 'rgba(0,0,0,0.5)',
});

export const THEME_COLORS = {
  light: {
    background: '#F2F5F2',
    primary: '#2E5D4E',
  },
  dark: {
    background: '#0C1A14',
    primary: '#D5ECE5',
  },
} as const;
