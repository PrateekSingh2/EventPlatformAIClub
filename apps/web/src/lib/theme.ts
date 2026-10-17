'use client';

import { useState, useEffect, useCallback } from 'react';

export type AppTheme = 'graphite';

export const THEME_STORAGE_KEY = 'contest_sandbox_theme';

export function applyTheme(theme: AppTheme = 'graphite') {
  if (typeof document === 'undefined') return;
  const root = document.getElementById('app-root') || document.documentElement;
  root.setAttribute('data-theme', 'graphite');
  root.classList.remove('light');
  root.classList.add('dark');

  try {
    localStorage.setItem(THEME_STORAGE_KEY, 'graphite');
  } catch {}

  window.dispatchEvent(new CustomEvent('app-theme-changed', { detail: 'graphite' }));
}

export function getCurrentTheme(): AppTheme {
  return 'graphite';
}

export function useTheme() {
  const [theme, setThemeState] = useState<AppTheme>('graphite');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    applyTheme('graphite');
  }, []);

  const setTheme = useCallback((newTheme: AppTheme) => {
    setThemeState('graphite');
    applyTheme('graphite');
  }, []);

  return { theme: 'graphite' as const, setTheme, mounted };
}
