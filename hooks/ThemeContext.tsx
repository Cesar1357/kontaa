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
export type CryptoListViewMode = 'normal' | 'compact';
export type CryptoChangeWindow = '24h' | '7d' | '30d' | '1y';

interface ThemeContextValue {
  themeMode: ThemeMode;
  resolvedTheme: AppTheme;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  isDark: boolean;
  savingsViewMode: 'ahorros' | 'cripto';
  setSavingsViewMode: (mode: 'ahorros' | 'cripto') => Promise<void>;
  cryptoListViewMode: CryptoListViewMode;
  setCryptoListViewMode: (mode: CryptoListViewMode) => Promise<void>;
  cryptoHomeExpanded: boolean;
  setCryptoHomeExpanded: (expanded: boolean) => Promise<void>;
  cryptoChangeWindow: CryptoChangeWindow;
  setCryptoChangeWindow: (w: CryptoChangeWindow) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const THEME_STORAGE_KEY = 'themeMode';
const SAVINGS_VIEW_MODE_STORAGE_KEY = '@kontaa:savings-view-mode';
const CRYPTO_LIST_VIEW_MODE_STORAGE_KEY = '@kontaa:crypto-list-view-mode';
const CRYPTO_HOME_EXPANDED_STORAGE_KEY = '@kontaa:crypto-home-expanded';
const CRYPTO_CHANGE_WINDOW_STORAGE_KEY = '@kontaa:crypto-change-window';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemTheme = useSystemColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');
  const [resolvedTheme, setResolvedTheme] = useState<AppTheme>('light');
  const [savingsViewMode, setSavingsViewModeState] = useState<'ahorros' | 'cripto'>('ahorros');
  const [cryptoListViewMode, setCryptoListViewModeState] = useState<CryptoListViewMode>('normal');
  const [cryptoHomeExpanded, setCryptoHomeExpandedState] = useState(true);
  const [cryptoChangeWindow, setCryptoChangeWindowState] = useState<CryptoChangeWindow>('24h');

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

      try {
        const storedSavingsViewMode = await AsyncStorage.getItem(SAVINGS_VIEW_MODE_STORAGE_KEY);
        if (storedSavingsViewMode === 'ahorros' || storedSavingsViewMode === 'cripto') {
          setSavingsViewModeState(storedSavingsViewMode);
        }
      } catch (error) {
        console.warn('No se pudo cargar el modo de ahorro guardado:', error);
      }

      try {
        const storedCryptoListViewMode = await AsyncStorage.getItem(CRYPTO_LIST_VIEW_MODE_STORAGE_KEY);
        if (storedCryptoListViewMode === 'normal' || storedCryptoListViewMode === 'compact') {
          setCryptoListViewModeState(storedCryptoListViewMode);
        }
      } catch (error) {
        console.warn('No se pudo cargar el modo de listado cripto guardado:', error);
      }

      try {
        const storedCryptoHomeExpanded = await AsyncStorage.getItem(CRYPTO_HOME_EXPANDED_STORAGE_KEY);
        if (storedCryptoHomeExpanded === 'true' || storedCryptoHomeExpanded === 'false') {
          setCryptoHomeExpandedState(storedCryptoHomeExpanded === 'true');
        }
      } catch (error) {
        console.warn('No se pudo cargar la expansión del portafolio cripto guardada:', error);
      }

      try {
        const storedCryptoChangeWindow = await AsyncStorage.getItem(CRYPTO_CHANGE_WINDOW_STORAGE_KEY);
        if (storedCryptoChangeWindow === '24h' || storedCryptoChangeWindow === '7d' || storedCryptoChangeWindow === '30d' || storedCryptoChangeWindow === '1y') {
          setCryptoChangeWindowState(storedCryptoChangeWindow);
        }
      } catch (error) {
        console.warn('No se pudo cargar la ventana de cambio cripto guardada:', error);
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

  const setSavingsViewMode = useCallback(async (mode: 'ahorros' | 'cripto') => {
    setSavingsViewModeState(mode);
    await AsyncStorage.setItem(SAVINGS_VIEW_MODE_STORAGE_KEY, mode);
  }, []);

  const setCryptoListViewMode = useCallback(async (mode: CryptoListViewMode) => {
    setCryptoListViewModeState(mode);
    await AsyncStorage.setItem(CRYPTO_LIST_VIEW_MODE_STORAGE_KEY, mode);
  }, []);

  const setCryptoHomeExpanded = useCallback(async (expanded: boolean) => {
    setCryptoHomeExpandedState(expanded);
    await AsyncStorage.setItem(CRYPTO_HOME_EXPANDED_STORAGE_KEY, String(expanded));
  }, []);

  const setCryptoChangeWindow = useCallback(async (w: CryptoChangeWindow) => {
    setCryptoChangeWindowState(w);
    await AsyncStorage.setItem(CRYPTO_CHANGE_WINDOW_STORAGE_KEY, w);
  }, []);

  const value = useMemo(
    () => ({
      themeMode,
      resolvedTheme,
      setThemeMode,
      isDark: resolvedTheme === 'dark',
      savingsViewMode,
      setSavingsViewMode,
      cryptoListViewMode,
      setCryptoListViewMode,
      cryptoHomeExpanded,
      setCryptoHomeExpanded,
      cryptoChangeWindow,
      setCryptoChangeWindow,
    }),
    [cryptoHomeExpanded, cryptoListViewMode, cryptoChangeWindow, resolvedTheme, setCryptoHomeExpanded, setCryptoListViewMode, setCryptoChangeWindow, setThemeMode, savingsViewMode, setSavingsViewMode, themeMode]
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
