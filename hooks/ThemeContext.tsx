import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

export type ThemeMode = 'system' | 'light' | 'dark' | 'grey';
export type AppTheme = 'light' | 'dark' | 'grey';

interface ThemeContextValue {
  themeMode: ThemeMode;
  resolvedTheme: AppTheme;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const THEME_STORAGE_KEY = 'themeMode';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemTheme = useSystemColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');
  const [resolvedTheme, setResolvedTheme] = useState<AppTheme>('light');

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const storedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'grey' || storedTheme === 'system') {
          setThemeModeState(storedTheme);
        }
      } catch (error) {
        console.warn('No se pudo cargar el tema guardado:', error);
      }
    };

    loadTheme();
  }, []);

  useEffect(() => {
    const nextTheme = themeMode === 'system'
      ? systemTheme === 'dark'
        ? 'dark'
        : 'light'
      : themeMode === 'grey'
        ? 'grey'
        : themeMode === 'dark'
          ? 'dark'
          : 'light';

    setResolvedTheme(nextTheme);
  }, [systemTheme, themeMode]);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
  }, []);

  const value = useMemo(
    () => ({
      themeMode,
      resolvedTheme,
      setThemeMode,
      isDark: resolvedTheme === 'dark',
    }),
    [resolvedTheme, setThemeMode, themeMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useAppTheme must be used inside ThemeProvider');
  }

  return context;
}

export function useColorScheme() {
  return useAppTheme().resolvedTheme;
}
