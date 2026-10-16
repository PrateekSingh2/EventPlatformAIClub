'use client';

import { useState, useEffect, useCallback } from 'react';

export type AppTheme = 'graphite' | 'light';

export const THEME_STORAGE_KEY = 'contest_sandbox_theme';

export function applyTheme(theme: AppTheme) {
  if (typeof document === 'undefined') return;
  const root = document.getElementById('app-root') || document.documentElement;
  root.setAttribute('data-theme', theme);

  if (theme === 'light') {
    root.classList.remove('dark');
    root.classList.add('light');
  } else {
    root.classList.remove('light');
    root.classList.add('dark');
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}

  // Broadcast event for multi-component awareness
  window.dispatchEvent(new CustomEvent('app-theme-changed', { detail: theme }));
}

export function getCurrentTheme(): AppTheme {
  if (typeof window === 'undefined') return 'graphite';
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as string | null;
    if (saved === 'light') {
      return 'light';
    }
  } catch {}
  return 'graphite';
}

export function useTheme() {
  const [theme, setThemeState] = useState<AppTheme>('graphite');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const initial = getCurrentTheme();
    setThemeState(initial);
    applyTheme(initial);

    const handleThemeEvent = (e: Event) => {
      const customEvent = e as CustomEvent<AppTheme>;
      if (customEvent.detail) {
        setThemeState(customEvent.detail);
      }
    };

    window.addEventListener('app-theme-changed', handleThemeEvent);
    return () => window.removeEventListener('app-theme-changed', handleThemeEvent);
  }, []);

  const setTheme = useCallback((newTheme: AppTheme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
  }, []);

  return { theme, setTheme, mounted };
}
