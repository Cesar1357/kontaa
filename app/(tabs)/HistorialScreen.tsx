import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Dimensions, Modal, NativeScrollEvent, NativeSyntheticEvent, Platform, Switch, ToastAndroid, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";
import Animated, { FadeInDown, FadeOutUp, Layout, useSharedValue, withTiming } from "react-native-reanimated";
import { RFValue } from 'react-native-responsive-fontsize';
import { db } from '../../config/firebase';

import { ThemedText } from '@/components/ThemedText';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from "@/hooks/useThemeColor";
import { endOfDay, format, startOfDay } from "date-fns";
import { LinearGradient } from "expo-linear-gradient";
import { collection, deleteDoc, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { LineChart as LineChartKit } from 'react-native-chart-kit';
import { ScrollView } from 'react-native-gesture-handler';
import { BarChart, LineChart, PieChart } from "react-native-gifted-charts";
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { Chip } from 'react-native-paper';

const screenWidth = Dimensions.get('window').width;
const screenHeight = Dimensions.get('window').height;
const chartCardWidth = screenWidth - 24;
const chartCardHeight = Math.max(250, Math.min(420, screenHeight * 0.56));
const chartCardGap = 0;

type HistorialChartKey =
  | 'overview'
  | 'bars'
  | 'weekdayActivity'
  | 'amountRanges'
  | 'pieType'
  | 'pieCategory'
  | 'cumulative'
  | 'trend';

interface HistorialChartConfig {
  key: HistorialChartKey;
  visible: boolean;
}

const HISTORIAL_CHART_CONFIG_DEFAULT: HistorialChartConfig[] = [
  { key: 'overview', visible: true },
  { key: 'bars', visible: true },
  { key: 'weekdayActivity', visible: true },
  { key: 'amountRanges', visible: true },
  { key: 'pieType', visible: true },
  { key: 'pieCategory', visible: true },
  { key: 'cumulative', visible: true },
  { key: 'trend', visible: true },
];

const HISTORIAL_CHART_META: Record<HistorialChartKey, { title: string; subtitle: string }> = {
  overview: { title: 'Vista general', subtitle: 'Tendencia completa de todos los datos' },
  bars: { title: 'Actividad y flujo', subtitle: 'Cantidad de movimientos y flujo mensual' },
  weekdayActivity: { title: 'Patrón semanal', subtitle: 'Qué días concentran más movimientos' },
  amountRanges: { title: 'Rangos de monto', subtitle: 'Distribución por tamaños de transacción' },
  pieType: { title: 'Distribución general', subtitle: 'Relación entre ingresos y egresos' },
  pieCategory: { title: 'Gastos por categoría', subtitle: 'Top categorías del periodo visible' },
  cumulative: { title: 'Saldo acumulado', subtitle: 'Evolución del saldo neto en el periodo' },
  trend: { title: 'Tendencia de movimientos', subtitle: 'Picos positivos y negativos por transacción' },
};

export default function HistorialScreen() {
  const { openCharts, focusChartKey } = useLocalSearchParams<{ openCharts?: string; focusChartKey?: string }>();
  const { user } = useAuth();
  const userId = (user as any)?.uid as string | undefined;
  const [transacciones, setTransacciones] = useState<any[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const backgroundColor = useThemeColor({ light: '', dark: '' }, 'background2');
  const graficaFondoColor = useThemeColor({ light: '', dark: '' }, 'graficaHistorial');
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const progressBg = useThemeColor({ light: '', dark: '' }, 'progressBg');
  const tintColor = useThemeColor({ light: '', dark: '' }, 'tint');
  const iconColor = useThemeColor({ light: '', dark: '' }, 'icon');
  const borderColor = useThemeColor({ light: '', dark: '' }, 'border');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');
  const primaryDarkColor = useThemeColor({ light: '', dark: '' }, 'primaryDark');

  const [filtered, setFiltered] = useState<any[]>([]);
  const [filteredChart, setFilteredChart] = useState<any[]>([]);
  const [chartDataLimit, setChartDataLimit] = useState<number>(30);
  const [activeChartIndex, setActiveChartIndex] = useState(0);

  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [dateStep, setDateStep] = useState<'start' | 'end'>('start');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [range, setRange] = useState<'Total' | '1S' | '1A' | '1M'>('Total');
  const [selectedTipos, setSelectedTipos] = useState<string[]>([]);
  const [selectedCategorias, setSelectedCategorias] = useState<string[]>([]);
  const [selectedPreestablecidos, setSelectedPreestablecidos] = useState<string[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [chartSelectionMode, setChartSelectionMode] = useState<'recent' | 'distributed' | 'balancedWeek' | 'balancedMonth'>('distributed');
  const [showChartControls, setShowChartControls] = useState(false);
  const [subscriptionActive, setSubscriptionActive] = useState<boolean>(false);
  const [showChartOrderModal, setShowChartOrderModal] = useState(false);
  const [chartCardsConfig, setChartCardsConfig] = useState<HistorialChartConfig[]>(HISTORIAL_CHART_CONFIG_DEFAULT);
  const [favoriteCharts, setFavoriteCharts] = useState<Array<{ key: HistorialChartKey; title: string; subtitle: string }>>([]);

  const height = useSharedValue(0);
  const opacity = useSharedValue(0);

  const rangeOptions = [
    { key: 'Total', label: 'Todos' },
    { key: '1S', label: '7 días' },
    { key: '1M', label: '30 días' },
    { key: '1A', label: '12 meses' },
  ];

  const visibleChartCards = useMemo(
    () => chartCardsConfig.filter((item) => item.visible).map((item) => ({ key: item.key, ...HISTORIAL_CHART_META[item.key] })),
    [chartCardsConfig]
  );
    
  const toggleExpanded = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    height.value = withTiming(next ? 415 : 0, { duration: 400 });
    opacity.value = withTiming(next ? 1 : 0, { duration: 300 });
  };

  useEffect(() => {
    if (!userId) return;
    const ref = collection(db, `users/${userId}/transacciones`);
    const q = query(ref, orderBy("fecha", "desc"));

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        date: d.data().fecha?.toDate?.() || null,
      }));
      setTransacciones(data);
    });
    return () => unsub();
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setSubscriptionActive(false);
      return;
    }

    const userRef = doc(db, `users/${userId}`);
    const unsub = onSnapshot(userRef, (snap) => {
      const data = snap.data() || {};
      setSubscriptionActive(Boolean((data as any).supportSubscription?.active));
    });

    return () => unsub();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const loadChartConfig = async () => {
      try {
        const key = `konta.historial.chartCardsConfig.${userId}`;
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return;

        const parsed = JSON.parse(raw) as HistorialChartConfig[];
        const filtered = parsed.filter((item) => HISTORIAL_CHART_CONFIG_DEFAULT.some((base) => base.key === item.key));
        const missing = HISTORIAL_CHART_CONFIG_DEFAULT.filter((base) => !filtered.some((item) => item.key === base.key));
        setChartCardsConfig([...filtered, ...missing]);
      } catch (error) {
        console.log('No se pudo cargar la configuracion de graficas:', error);
      }
    };

    loadChartConfig();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const persistChartConfig = async () => {
      try {
        const key = `konta.historial.chartCardsConfig.${userId}`;
        await AsyncStorage.setItem(key, JSON.stringify(chartCardsConfig));
      } catch (error) {
        console.log('No se pudo guardar la configuracion de graficas:', error);
      }
    };

    persistChartConfig();
  }, [chartCardsConfig, userId]);

  useEffect(() => {
    if (!userId) {
      setFavoriteCharts([]);
      return;
    }

    const loadFavoriteCharts = async () => {
      try {
        const key = `konta.historial.favoriteCharts.${userId}`;
        const raw = await AsyncStorage.getItem(key);
        if (!raw) {
          setFavoriteCharts([]);
          return;
        }
        const parsed = JSON.parse(raw) as Array<{ key: HistorialChartKey; title: string; subtitle: string }>;
        const valid = Array.isArray(parsed)
          ? parsed.filter((item) => HISTORIAL_CHART_CONFIG_DEFAULT.some((base) => base.key === item.key))
          : [];
        setFavoriteCharts(valid);
      } catch (error) {
        console.log('No se pudo cargar graficas favoritas:', error);
      }
    };

    loadFavoriteCharts();
  }, [userId]);

  useEffect(() => {
    if (activeChartIndex <= Math.max(0, visibleChartCards.length - 1)) return;
    setActiveChartIndex(Math.max(0, visibleChartCards.length - 1));
  }, [activeChartIndex, visibleChartCards.length]);

  useEffect(() => {
    if (openCharts !== '1') return;
    setIsExpanded(true);

    if (!focusChartKey) return;
    const idx = visibleChartCards.findIndex((item) => item.key === focusChartKey);
    if (idx >= 0) setActiveChartIndex(idx);
  }, [openCharts, focusChartKey, visibleChartCards]);

  const total = transacciones.reduce(
    (acc, t) => acc + (t.tipo === "ingreso" ? t.monto : -t.monto),
    0
  );

  const ingresos = filtered.reduce(
    (acc, t) => acc + (t.tipo === 'ingreso' ? t.monto : 0),
    0
  );

  const egresos = filtered.reduce(
    (acc, t) => acc + (t.tipo === 'egreso' ? t.monto : 0),
    0
  );

  const neto = ingresos - egresos;

  // Determinar cuántos datos mostrar en la gráfica
  const chartDisplayCount = filteredChart.length < 5 ? filteredChart.length : Math.min(chartDataLimit, filteredChart.length);
  const chartDataToDisplay = useMemo(() => {
    if (chartDisplayCount <= 0) return [];
    if (filteredChart.length <= chartDisplayCount) return filteredChart;

    if (chartSelectionMode === 'recent') {
      return filteredChart.slice(Math.max(0, filteredChart.length - chartDisplayCount), filteredChart.length);
    }

    if (chartSelectionMode === 'balancedWeek' || chartSelectionMode === 'balancedMonth') {
      const buckets = new Map<string, any[]>();

      for (const tx of filteredChart) {
        const d = tx.date || new Date();
        let key = '';

        if (chartSelectionMode === 'balancedWeek') {
          const weekday = d.getDay();
          const mondayOffset = (weekday + 6) % 7;
          const weekStart = new Date(d);
          weekStart.setDate(d.getDate() - mondayOffset);
          key = `${weekStart.getFullYear()}-${weekStart.getMonth() + 1}-${weekStart.getDate()}`;
        } else {
          key = `${d.getFullYear()}-${d.getMonth() + 1}`;
        }

        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)?.push(tx);
      }

      const representatives = Array.from(buckets.values())
        .map((bucket) => {
          if (bucket.length === 1) return bucket[0];

          const signedAvg = bucket.reduce((acc, tx) => {
            const amount = Number(tx.monto || 0);
            return acc + (tx.tipo === 'ingreso' ? amount : -amount);
          }, 0) / bucket.length;

          return bucket.reduce((closest, tx) => {
            const amount = Number(tx.monto || 0);
            const signed = tx.tipo === 'ingreso' ? amount : -amount;
            const closestAmount = Number(closest.monto || 0);
            const closestSigned = closest.tipo === 'ingreso' ? closestAmount : -closestAmount;
            return Math.abs(signed - signedAvg) < Math.abs(closestSigned - signedAvg) ? tx : closest;
          }, bucket[0]);
        })
        .sort((a, b) => {
          const aDate = a.date ? new Date(a.date).getTime() : 0;
          const bDate = b.date ? new Date(b.date).getTime() : 0;
          return aDate - bDate;
        });

      if (representatives.length <= chartDisplayCount) return representatives;

      const sampled: any[] = [];
      const maxIndex = representatives.length - 1;
      const step = maxIndex / Math.max(1, chartDisplayCount - 1);
      for (let i = 0; i < chartDisplayCount; i++) {
        sampled.push(representatives[Math.min(maxIndex, Math.round(i * step))]);
      }
      return sampled;
    }

    // Modo distribuido: toma puntos espaciados a lo largo del rango filtrado.
    const sampled: any[] = [];
    const maxIndex = filteredChart.length - 1;
    const step = maxIndex / Math.max(1, chartDisplayCount - 1);

    for (let i = 0; i < chartDisplayCount; i++) {
      const idx = Math.min(maxIndex, Math.round(i * step));
      sampled.push(filteredChart[idx]);
    }

    return sampled;
  }, [filteredChart, chartDisplayCount, chartSelectionMode]);

  const chartData = chartDataToDisplay.map((t) => ({
    value: t.tipo === "ingreso" ? t.monto : -t.monto,
    label: format(t.date || new Date(), "dd/MM"),
  }));

  const chartSummary = useMemo(() => {
    const dailyMap = new Map<string, { ingresos: number; egresos: number; neto: number; movimientos: number }>();
    const monthlyMap = new Map<string, { ingresos: number; egresos: number; neto: number }>();
    const categories = new Map<string, number>();
    const weekdayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
    const weekdayMovements = [0, 0, 0, 0, 0, 0, 0];
    const amountRangeLabels = ['0-99', '100-499', '500-999', '1000-4999', '5000+'];
    const amountRangeBuckets = [0, 0, 0, 0, 0];
    let selectedIngresos = 0;
    let selectedEgresos = 0;

    for (const tx of chartDataToDisplay) {
      const d = tx.date || new Date();
      const dayKey = format(d, 'dd/MM');
      const monthKey = format(d, 'MM/yy');
      const amount = Number(tx.monto || 0);
      const isIngreso = tx.tipo === 'ingreso';
      const signedAmount = isIngreso ? amount : -amount;

      if (isIngreso) {
        selectedIngresos += amount;
      } else {
        selectedEgresos += amount;
      }

      weekdayMovements[d.getDay()] += 1;

      if (amount < 100) amountRangeBuckets[0] += 1;
      else if (amount < 500) amountRangeBuckets[1] += 1;
      else if (amount < 1000) amountRangeBuckets[2] += 1;
      else if (amount < 5000) amountRangeBuckets[3] += 1;
      else amountRangeBuckets[4] += 1;

      const dayBase = dailyMap.get(dayKey) || { ingresos: 0, egresos: 0, neto: 0, movimientos: 0 };
      dayBase.ingresos += isIngreso ? amount : 0;
      dayBase.egresos += !isIngreso ? amount : 0;
      dayBase.neto += signedAmount;
      dayBase.movimientos += 1;
      dailyMap.set(dayKey, dayBase);

      const monthBase = monthlyMap.get(monthKey) || { ingresos: 0, egresos: 0, neto: 0 };
      monthBase.ingresos += isIngreso ? amount : 0;
      monthBase.egresos += !isIngreso ? amount : 0;
      monthBase.neto += signedAmount;
      monthlyMap.set(monthKey, monthBase);

      if (!isIngreso) {
        const category = tx.presupuestoCategoria || tx.preestablecidoMainNombre || tx.descripcion || 'Otros';
        categories.set(category, (categories.get(category) || 0) + amount);
      }
    }

    let running = 0;
    const cumulativeLineData = chartDataToDisplay.map((tx, index) => {
      const amount = Number(tx.monto || 0);
      running += tx.tipo === 'ingreso' ? amount : -amount;
      return {
        value: Number(running.toFixed(2)),
        label: index % 2 === 0 ? format(tx.date || new Date(), 'dd/MM') : '',
      };
    });

    const trendLineData = chartDataToDisplay.map((tx, index) => ({
      value: Number((tx.tipo === 'ingreso' ? tx.monto : -tx.monto).toFixed(2)),
      label: index % 2 === 0 ? format(tx.date || new Date(), 'dd/MM') : '',
    }));

    const movementBars = Array.from(dailyMap.entries()).slice(-10).map(([label, d]) => ({
      value: d.movimientos,
      label,
      frontColor: tintColor,
    }));

    const monthlyFlowBars = Array.from(monthlyMap.entries()).slice(-6).map(([label, d]) => ({
      value: Number(Math.max(d.ingresos, d.egresos).toFixed(2)),
      label,
      frontColor: d.ingresos >= d.egresos ? primaryColor : '#fb7185',
    }));

    const typePieData = [
      { value: Number(selectedIngresos.toFixed(2)), color: '#34d399', text: 'Ingresos' },
      { value: Number(selectedEgresos.toFixed(2)), color: '#f87171', text: 'Egresos' },
    ].filter((i) => i.value > 0);

    const palette = [tintColor, '#f59e0b', '#a78bfa', primaryColor, '#fb7185', iconColor];
    const categoryPieData = Array.from(categories.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value], index) => ({
        value: Number(value.toFixed(2)),
        color: palette[index % palette.length],
        text: label.length > 12 ? `${label.slice(0, 12)}...` : label,
      }));

    const weekdayActivityBars = weekdayNames.map((label, index) => ({
      label,
      value: weekdayMovements[index],
      frontColor: tintColor,
    }));

    const amountRangeBars = amountRangeLabels.map((label, index) => ({
      label,
      value: amountRangeBuckets[index],
      frontColor: primaryDarkColor,
    }));

    return {
      cumulativeLineData,
      trendLineData,
      movementBars,
      monthlyFlowBars,
      weekdayActivityBars,
      amountRangeBars,
      typePieData,
      categoryPieData,
      selectedNeto: Number((selectedIngresos - selectedEgresos).toFixed(2)),
    };
  }, [chartDataToDisplay, tintColor, primaryColor, primaryDarkColor, iconColor]);

  const tipoOptions = useMemo(() => {
    const found = new Set<string>();
    transacciones.forEach((tx) => {
      if (tx?.tipo) found.add(tx.tipo);
    });
    return Array.from(found);
  }, [transacciones]);

  const categoriaOptions = useMemo(() => {
    const found = new Set<string>();
    transacciones.forEach((tx) => {
      if (tx?.presupuestoCategoria) found.add(tx.presupuestoCategoria);
    });
    return Array.from(found).sort((a, b) => a.localeCompare(b));
  }, [transacciones]);

  const preestablecidoOptions = useMemo(() => {
    const found = new Set<string>();
    transacciones.forEach((tx) => {
      if (tx?.preestablecidoMainNombre) found.add(tx.preestablecidoMainNombre);
    });
    return Array.from(found).sort((a, b) => a.localeCompare(b));
  }, [transacciones]);

  const toggleSelection = (
    option: string,
    selected: string[],
    setSelected: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setSelected((prev) =>
      prev.includes(option) ? prev.filter((item) => item !== option) : [...prev, option]
    );
  };

  const statsSummary = useMemo(() => {
    const signedValues = filtered.map((tx) => (tx.tipo === 'ingreso' ? Number(tx.monto || 0) : -Number(tx.monto || 0)));
    const absValues = filtered.map((tx) => Number(tx.monto || 0));
    const count = signedValues.length;

    if (count === 0) {
      return {
        media: 0,
        mediana: 0,
        modaMonto: null as number | null,
        modaTipo: 'N/A',
        modaCategoria: 'N/A',
      };
    }

    const media = signedValues.reduce((acc, value) => acc + value, 0) / count;
    const sorted = [...signedValues].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const mediana = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];

    const modeMap = new Map<number, number>();
    absValues.forEach((value) => {
      const key = Math.round(value);
      modeMap.set(key, (modeMap.get(key) || 0) + 1);
    });
    let modaMonto: number | null = null;
    let bestCount = 0;
    modeMap.forEach((freq, value) => {
      if (freq > bestCount) {
        modaMonto = value;
        bestCount = freq;
      }
    });

    const tipoMap = new Map<string, number>();
    const categoriaMap = new Map<string, number>();

    filtered.forEach((tx) => {
      const tipo = tx.tipo || 'N/A';
      const categoria = tx.presupuestoCategoria || tx.preestablecidoMainNombre || 'Sin categoría';
      tipoMap.set(tipo, (tipoMap.get(tipo) || 0) + 1);
      categoriaMap.set(categoria, (categoriaMap.get(categoria) || 0) + 1);
    });

    let modaTipo = 'N/A';
    let modaCategoria = 'N/A';

    tipoMap.forEach((freq, value) => {
      if (freq > (tipoMap.get(modaTipo) || 0)) modaTipo = value;
    });
    categoriaMap.forEach((freq, value) => {
      if (freq > (categoriaMap.get(modaCategoria) || 0)) modaCategoria = value;
    });

    return {
      media,
      mediana,
      modaMonto,
      modaTipo,
      modaCategoria,
    };
  }, [filtered]);

  useEffect(() => {
    let filteredData = [...transacciones];
    const now = new Date();

    if (startDate && endDate) {
      filteredData = transacciones.filter(
        (t) => t.date && t.date >= startDate && t.date <= endDate
      );
    } else {
      switch (range) {
        case '1S':
          const weekAgo = new Date(now);
          weekAgo.setDate(now.getDate() - 7);
          filteredData = transacciones.filter((t) => t.date >= weekAgo);
          break;
        case '1M':
          const monthAgo = new Date(now);
          monthAgo.setMonth(now.getMonth() - 1);
          filteredData = transacciones.filter((t) => t.date >= monthAgo);
          break;
        case '1A':
          const yearAgo = new Date(now);
          yearAgo.setFullYear(now.getFullYear() - 1);
          filteredData = transacciones.filter((t) => t.date >= yearAgo);
          break;
        default:
          break;
      }
    }

    if (selectedTipos.length > 0) {
      filteredData = filteredData.filter((t) => selectedTipos.includes(t.tipo));
    }

    if (selectedCategorias.length > 0) {
      filteredData = filteredData.filter((t) => selectedCategorias.includes(t.presupuestoCategoria || ''));
    }

    if (selectedPreestablecidos.length > 0) {
      filteredData = filteredData.filter((t) => selectedPreestablecidos.includes(t.preestablecidoMainNombre || ''));
    }

    filteredData.sort((a, b) => {
      const dateA = a.date || new Date(0);
      const dateB = b.date || new Date(0);
      return dateB.getTime() - dateA.getTime();
    });

    setFiltered(filteredData);
    setFilteredChart([...filteredData].reverse());
  }, [transacciones, range, startDate, endDate, selectedTipos, selectedCategorias, selectedPreestablecidos]);

  const handleChartRailScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (visibleChartCards.length === 0) return;
    const x = event.nativeEvent.contentOffset.x;
    const index = Math.round(x / (chartCardWidth + chartCardGap));
    if (index !== activeChartIndex) {
      setActiveChartIndex(Math.max(0, Math.min(index, visibleChartCards.length - 1)));
    }
  };

  const handleOpenChartOrderCustomization = () => {
    if (subscriptionActive) {
      setShowChartOrderModal(true);
      return;
    }

    Alert.alert(
      'Función Premium',
      'Personalizar el orden de gráficas está disponible con suscripción activa.',
      [
        { text: 'Ahora no', style: 'cancel' },
        {
          text: 'Ver suscripción',
          onPress: () => router.push({ pathname: '/(screens)/Settings', params: { openSubscription: '1' } }),
        },
      ],
    );
  };

  const toggleFavoriteChart = async (chart: { key: HistorialChartKey; title: string; subtitle: string }) => {
    if (!userId) return;

    const exists = favoriteCharts.some((item) => item.key === chart.key);
    if (!exists && !subscriptionActive && favoriteCharts.length >= 1) {
      Alert.alert(
        'Función Premium',
        'Sin suscripción puedes tener 1 gráfica favorita. Activa premium para agregar más.',
        [
          { text: 'Ahora no', style: 'cancel' },
          {
            text: 'Ver suscripción',
            onPress: () => router.push({ pathname: '/(screens)/Settings', params: { openSubscription: '1' } }),
          },
        ],
      );
      return;
    }

    const next = exists
      ? favoriteCharts.filter((item) => item.key !== chart.key)
      : [...favoriteCharts, chart];

    setFavoriteCharts(next);

    try {
      const key = `konta.historial.favoriteCharts.${userId}`;
      await AsyncStorage.setItem(key, JSON.stringify(next));
      if (Platform.OS === 'android') {
        ToastAndroid.show(exists ? 'Gráfica quitada de favoritos' : 'Gráfica agregada a favoritos', ToastAndroid.SHORT);
      }
    } catch (error) {
      console.log('No se pudo guardar favoritas:', error);
    }
  };

  const toggleChartVisibility = (key: HistorialChartKey, value: boolean) => {
    setChartCardsConfig((prev) => prev.map((item) => (item.key === key ? { ...item, visible: value } : item)));
  };

  const moveChartUp = (index: number) => {
    if (index === 0) return;
    setChartCardsConfig((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const moveChartDown = (index: number) => {
    setChartCardsConfig((prev) => {
      if (index === prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  const showPicker = (type: 'start' | 'end') => {
    setDateStep(type);
    setDatePickerVisible(true);
  };

  const handleConfirm = (date: Date) => {
    setDatePickerVisible(false);
    if (dateStep === 'start') {
      setStartDate(startOfDay(date));
      setTimeout(() => showPicker('end'), 400);
    } else {
      setEndDate(endOfDay(date));
    }
  };

  const clearFilters = () => {
    setStartDate(null);
    setEndDate(null);
    setRange('Total');
    setSelectedTipos([]);
    setSelectedCategorias([]);
    setSelectedPreestablecidos([]);
  };

  const customRangeLabel = startDate && endDate
    ? `${format(startDate, 'dd/MM')} - ${format(endDate, 'dd/MM')}`
    : 'Seleccionar rango';

  const rangeLabel = startDate && endDate
    ? `Rango personalizado: ${customRangeLabel}`
    : `Mostrando: ${rangeOptions.find((opt) => opt.key === range)?.label || 'Todos'}`;

  const activeAdvancedFilters = selectedTipos.length + selectedCategorias.length + selectedPreestablecidos.length;

  const chartSelectionModeLabel =
    chartSelectionMode === 'distributed'
      ? 'Distribuidas'
      : chartSelectionMode === 'balancedWeek'
        ? 'Semanal'
        : chartSelectionMode === 'balancedMonth'
          ? 'Mensual'
          : 'Recientes';

  const handleDeleteTransaction = (tx: any) => {
    if (!userId || !tx?.id) return;

    const description = tx.descripcion || 'esta transaccion';
    Alert.alert(
      'Eliminar transaccion',
      `¿Seguro que deseas eliminar ${description}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, `users/${userId}/transacciones`, tx.id));
              if (Platform.OS === 'android') {
                ToastAndroid.show('Transaccion eliminada', ToastAndroid.SHORT);
              }
            } catch (error) {
              console.log('No se pudo eliminar la transaccion:', error);
              if (Platform.OS === 'android') {
                ToastAndroid.show('No se pudo eliminar la transaccion', ToastAndroid.SHORT);
              }
            }
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 16,
          paddingTop: 80,
          paddingBottom: 220,
        }}
      >
      {/* ENCABEZADO */}
      <Animated.View entering={FadeInDown.delay(100)} exiting={FadeOutUp}>
        <LinearGradient
          colors={["#6366f1", "#8b5cf6"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            padding: 20,
            borderRadius: 20,
            marginBottom: 20,
          }}
        >
          <ThemedText style={{ color: "white", fontSize: 18, fontWeight: "600" }}>
            Historial general
          </ThemedText>
          <ThemedText
            style={{
              fontSize: 32,
              fontWeight: "700",
              marginTop: 6,
              padding: 5,
              color: "white"
            }}
          >
            ${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
          </ThemedText>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 }}>
            <View style={{ flex: 1, padding: 14, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 18, marginRight: 8 }}>
              <ThemedText style={{ color: '#d1d5db', fontSize: 12 }}>Ingresos</ThemedText>
              <ThemedText style={{ color: '#a5f3fc', fontSize: 18, fontWeight: '700', marginTop: 8 }}>
                +${ingresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </ThemedText>
            </View>
            <View style={{ flex: 1, padding: 14, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 18, marginRight: 8 }}>
              <ThemedText style={{ color: '#d1d5db', fontSize: 12 }}>Egresos</ThemedText>
              <ThemedText style={{ color: '#fca5a5', fontSize: 18, fontWeight: '700', marginTop: 8 }}>
                -${egresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </ThemedText>
            </View>
            <View style={{ flex: 1, padding: 14, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 18 }}>
              <ThemedText style={{ color: '#d1d5db', fontSize: 12 }}>Saldo</ThemedText>
              <ThemedText style={{ color: neto >= 0 ? '#bbf7d0' : '#fda4af', fontSize: 18, fontWeight: '700', marginTop: 8 }}>
                ${neto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </ThemedText>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* FILTROS */}
      <Animated.View entering={FadeInDown.delay(200)} exiting={FadeOutUp} layout={Layout.springify()}>
        <View style={{ marginBottom: 16 }}>
          <ThemedText style={{ fontSize: 16, marginBottom: 10 }}>Filtrar movimientos</ThemedText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {rangeOptions.map((f) => (
              <TouchableOpacity
                key={f.key}
                onPress={() => {
                    setRange(f.key as 'Total' | '1S' | '1M' | '1A');
                    setStartDate(null);
                    setEndDate(null);
                    }}
                style={{
                  backgroundColor:
                    range === f.key && !startDate ? "#6366f1" : progressBg,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 20,
                  marginRight: 8,
                  marginBottom: 8,
                }}
              >
                <ThemedText style={{ color: range === f.key && !startDate ? '#fff' : '#000000', fontSize: RFValue(12), textTransform: 'capitalize' }}>
                  {f.label}
                </ThemedText>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => showPicker('start')}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 20,
                backgroundColor: 'rgba(120,82,255,0.16)',
                marginRight: 8,
                marginBottom: 8,
              }}
            >
              <ThemedText style={{ fontSize: RFValue(12), color: textColor }}>
                Fecha: {customRangeLabel}
              </ThemedText>
            </TouchableOpacity>
            {(startDate || endDate) && (
              <TouchableOpacity
                onPress={clearFilters}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 20,
                  marginBottom: 8,
                }}
              >
                <ThemedText style={{ color: textColor, fontSize: RFValue(12) }}>
                  Limpiar
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            onPress={() => setShowAdvancedFilters((prev) => !prev)}
            style={{
              marginTop: 8,
              alignSelf: 'flex-start',
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 14,
              backgroundColor: 'rgba(99,102,241,0.2)',
            }}
          >
            <ThemedText style={{ fontSize: 12 }}>
              {showAdvancedFilters ? 'Ocultar filtros avanzados' : 'Mostrar filtros avanzados'}
            </ThemedText>
          </TouchableOpacity>

          {showAdvancedFilters && (
            <>
              <View style={{ marginTop: 6 }}>
                <ThemedText style={{ fontSize: 13, marginBottom: 6, color: '#9ca3af' }}>Tipo</ThemedText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 2 }}>
                  {tipoOptions.map((opcion) => (
                    <Chip
                      key={opcion}
                      selected={selectedTipos.includes(opcion)}
                      compact
                      mode="flat"
                      onPress={() => toggleSelection(opcion, selectedTipos, setSelectedTipos)}
                      textStyle={{ color: selectedTipos.includes(opcion) ? '#ffffff' : '#000000' }}
                      style={{
                        margin: 4,
                        alignSelf: 'flex-start',
                        backgroundColor: selectedTipos.includes(opcion) ? 'rgba(34,197,94,0.3)' : progressBg,
                      }}
                    >
                      {opcion}
                    </Chip>
                  ))}
                </View>
              </View>

              {categoriaOptions.length > 0 && (
                <View style={{ marginTop: 4 }}>
                  <ThemedText style={{ fontSize: 13, marginBottom: 6, color: '#9ca3af' }}>Categoría</ThemedText>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 2 }}>
                    {categoriaOptions.map((opcion) => (
                      <Chip
                        key={opcion}
                        selected={selectedCategorias.includes(opcion)}
                        compact
                        mode="flat"
                        onPress={() => toggleSelection(opcion, selectedCategorias, setSelectedCategorias)}
                        textStyle={{ color: selectedCategorias.includes(opcion) ? '#ffffff' : '#000000' }}
                        style={{
                          margin: 4,
                          alignSelf: 'flex-start',
                          backgroundColor: selectedCategorias.includes(opcion) ? 'rgba(139,92,246,0.35)' : progressBg,
                        }}
                      >
                        {opcion}
                      </Chip>
                    ))}
                  </View>
                </View>
              )}

              {preestablecidoOptions.length > 0 && (
                <View style={{ marginTop: 4 }}>
                  <ThemedText style={{ fontSize: 13, marginBottom: 6, color: '#9ca3af' }}>Preestablecido</ThemedText>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 2 }}>
                    {preestablecidoOptions.map((opcion) => (
                      <Chip
                        key={opcion}
                        selected={selectedPreestablecidos.includes(opcion)}
                        compact
                        mode="flat"
                        onPress={() => toggleSelection(opcion, selectedPreestablecidos, setSelectedPreestablecidos)}
                        textStyle={{ color: selectedPreestablecidos.includes(opcion) ? '#a5f3fc' : '#d1d5db' }}
                        style={{
                          margin: 4,
                          alignSelf: 'flex-start',
                          backgroundColor: selectedPreestablecidos.includes(opcion) ? 'rgba(8,145,178,0.35)' : '#353535',
                        }}
                      >
                        {opcion}
                      </Chip>
                    ))}
                  </View>
                </View>
              )}
            </>
          )}

          <ThemedText style={{ color: '#9ca3af', fontSize: 12, marginTop: 10 }}>{rangeLabel}</ThemedText>
          {activeAdvancedFilters > 0 && (
            <ThemedText style={{ color: '#a5b4fc', fontSize: 12, marginTop: 4 }}>
              Filtros avanzados activos: {activeAdvancedFilters}
            </ThemedText>
          )}
        </View>
      </Animated.View>
      <DateTimePickerModal
              isVisible={isDatePickerVisible}
              mode="date"
              onConfirm={handleConfirm}
              onCancel={() => setDatePickerVisible(false)}
            />

      {/* GRÁFICAS */}
      <Animated.View
        entering={FadeInDown.delay(300)}
        exiting={FadeOutUp}
        layout={Layout.springify()}
        
        style={{
          width: "100%",
          backgroundColor: cardsMain,
          borderRadius: 20,
          padding: 12,
          marginBottom: 10,
          marginTop:10
        }}
      >
        {/* Encabezado */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            alignContent:"center"
          }}
        >
          <ThemedText
            style={{
              fontWeight: "600",
              fontSize: 16,
            }}
          >
            Gráficas
          </ThemedText>
          <TouchableOpacity onPress={toggleExpanded}>
            <Ionicons
              name="open-outline"
              size={RFValue(26)}
              color={textColor}
            />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* LISTA DE TRANSACCIONES */}
      <View style={{ marginBottom: 150 }}>
        <View
          style={{
            backgroundColor: graficaFondoColor,
            borderRadius: 20,
            padding: 16,
            marginBottom: 30,
            marginTop:15
          }}
        >
          <ThemedText
            style={{
              fontWeight: "600",
              marginBottom: 8,
              fontSize: 16,
            }}
          >
            Transacciones
          </ThemedText>

          {filtered.length === 0 ? (
            <ThemedText style={{ color: "#aaa", textAlign: "center", marginTop: 10 }}>
              {transacciones.length === 0 ? "No hay transacciones registradas" : "No hay transacciones en el periodo seleccionado"}
            </ThemedText>
          ) : (
            filtered.map((tx) => (
              <TouchableOpacity
                key={tx.id}
                activeOpacity={0.75}
                onLongPress={() => handleDeleteTransaction(tx)}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{}}>
                    <View style={{flexDirection:"row", flexWrap: 'wrap'}}>
                      <ThemedText allowFontScaling textBreakStrategy="simple" numberOfLines={2} style={{ fontWeight: "500", maxWidth: 185}}>
                        {tx.descripcion || "Sin descripción"} 
                      </ThemedText>
                      {tx.creadoAutomaticamente && (
                        <ThemedText style={{ color: "#888", fontSize: 11, marginLeft: 6 }}>
                          (Automático)
                        </ThemedText>
                      )}
                      {tx.presupuestoCategoria && (
                        <ThemedText style={{ color: "#9ca3af", fontSize: 11, marginLeft: 6 }}>
                          #{tx.presupuestoCategoria}
                        </ThemedText>
                      )}
                      {tx.preestablecidoMainNombre && (
                        <ThemedText style={{ color: "#c4b5fd", fontSize: 11, marginLeft: 6 }}>
                          {tx.preestablecidoMainNombre}
                        </ThemedText>
                      )}
                    </View>
                    <ThemedText style={{ color: "#aaa", fontSize: 12 }}>
                      {format(tx.date || tx.fecha?.toDate?.(), "dd/MM/yyyy")}
                    </ThemedText>
                  </View>
                </View>

                <ThemedText
                  style={{
                    color: tx.tipo === "ingreso" ? "#4ade80" : "#f87171",
                    fontWeight: "600",
                  }}
                >
                  {tx.tipo === "ingreso" ? "+" : "-"}${tx.monto.toFixed(2)}
                </ThemedText>
              </TouchableOpacity>
            ))
          )}
        </View>
      </View>
      </ScrollView>

      <Modal
        animationType="slide"
        transparent={false}
        visible={isExpanded}
        onRequestClose={() => setIsExpanded(false)}
      >
        <View style={{ flex: 1, backgroundColor, paddingTop: 64, paddingHorizontal: 0, paddingBottom: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 12 }}>
            <View>
              <ThemedText style={{ fontSize: 20, fontWeight: '700' }}>Gráficas</ThemedText>
              {filteredChart.length > 0 && (
                <ThemedText style={{ color: '#9ca3af', fontSize: 12, marginTop: 2 }}>
                  {chartSelectionModeLabel} · {chartDataToDisplay.length}/{filteredChart.length}
                </ThemedText>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity
              onPress={handleOpenChartOrderCustomization}
              style={{
                alignSelf: 'flex-end',
                marginTop: 8,
                backgroundColor: subscriptionActive ? `${primaryColor}18` : `${primaryColor}12`,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderWidth: 1,
                borderColor: subscriptionActive ? `${primaryColor}35` : `${primaryColor}25`,
              }}
            >
            <ThemedText style={{ fontSize: 12, fontWeight: '700', opacity: subscriptionActive ? 1 : 0.8 }}>
              {subscriptionActive ? 'Personalizar orden' : 'Personalizar orden • Suscripción'}
            </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsExpanded(false)}>
              <Ionicons name="close-outline" size={RFValue(30)} color={textColor} />
            </TouchableOpacity>
            </View>
          </View>

          {chartDataToDisplay.length > 0 ? (
            <>
              <ScrollView
                horizontal
                snapToInterval={chartCardWidth + chartCardGap}
                snapToAlignment="start"
                decelerationRate="fast"
                onScroll={handleChartRailScroll}
                scrollEventThrottle={16}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: (screenWidth - chartCardWidth) / 2,
                }}
              >
                {visibleChartCards.map((card, index) => (
                  <View
                    key={card.key}
                    style={{
                      width: chartCardWidth,
                      minHeight: chartCardHeight,
                      marginRight: chartCardGap,
                      borderRadius: 16,
                      padding: 12,
                      backgroundColor: cardsMain,
                      borderWidth: index === activeChartIndex ? 1.5 : 1,
                      borderColor: index === activeChartIndex ? tintColor : borderColor,
                      transform: [{ scale: index === activeChartIndex ? 1 : 0.985 }],
                      opacity: index === activeChartIndex ? 1 : 0.9,
                    }}
                  >
                    <ThemedText style={{ fontSize: 14, fontWeight: '700' }}>{card.title}</ThemedText>
                    <ThemedText style={{ marginTop: 2, color: iconColor, fontSize: 11 }}>{card.subtitle}</ThemedText>
                    <TouchableOpacity
                      onPress={() => toggleFavoriteChart(card as { key: HistorialChartKey; title: string; subtitle: string })}
                      style={{ position: 'absolute', top: 10, right: 10, padding: 4 }}
                    >
                      <Ionicons
                        name={favoriteCharts.some((item) => item.key === card.key) ? 'star' : 'star-outline'}
                        size={18}
                        color={favoriteCharts.some((item) => item.key === card.key) ? '#fbbf24' : iconColor}
                      />
                    </TouchableOpacity>

                    {card.key === 'overview' && (
                      <View style={{ marginTop: 8, justifyContent: 'center', alignItems: 'center' }}>
                        {chartDataToDisplay.length > 0 ? (
                          <LineChartKit
                            data={{
                              labels: chartDataToDisplay.map((tx, index) => {
                                const step = Math.max(1, Math.ceil(chartDataToDisplay.length / 6));
                                const showLabel = index % step === 0 || index === chartDataToDisplay.length - 1;
                                return showLabel ? format(tx.date || new Date(), 'dd/MM/yy') : '';
                              }),
                              datasets: [
                                {
                                  data: chartDataToDisplay.map(tx => Number(tx.tipo === 'ingreso' ? tx.monto : -tx.monto)),
                                }
                              ]
                            }}
                            width={chartCardWidth - 20}
                            height={250}
                            chartConfig={{
                              backgroundColor: cardsMain,
                              backgroundGradientFrom: cardsMain,
                              backgroundGradientTo: cardsMain,
                              decimalPlaces: 0,
                              color: () => tintColor,
                              labelColor: () => iconColor,
                              style: { borderRadius: 0 },
                              propsForDots: { r: '2', strokeWidth: '0', stroke: tintColor },
                              propsForBackgroundLines: { strokeWidth: '0' },
                              propsForLabels: { fontSize: 9 },
                            }}
                            bezier
                            withDots
                            withInnerLines={false}
                            withVerticalLabels={true}
                            withHorizontalLabels={false}
                            withOuterLines={false}
                            style={{ borderRadius: 0, paddingRight: 0}} 
                          />
                        ) : (
                          <ThemedText style={{ color: '#aaa', marginTop: 16 }}>Sin datos</ThemedText>
                        )}
                      </View>
                    )}

                    {card.key === 'bars' && (
                        <ScrollView style={{ marginTop: 8 }} showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
                        <ThemedText style={{ color: '#cbd5e1', fontSize: 11, marginBottom: 4 }}>Movimientos diarios</ThemedText>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled={true} scrollEnabled={true}>
                          <BarChart
                            data={chartSummary.movementBars}
                            barWidth={10}
                            spacing={12}
                            roundedTop
                            hideRules
                            noOfSections={3}
                            yAxisThickness={0}
                            xAxisThickness={0}
                            width={Math.max(chartCardWidth - 20, Math.max(chartCardWidth + 80, chartSummary.movementBars.length * 44))}
                          />
                        </ScrollView>
                        <ThemedText style={{ color: '#cbd5e1', fontSize: 11, marginTop: 10, marginBottom: 4 }}>Flujo mensual (mayor entre ingresos/egresos)</ThemedText>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled={true} scrollEnabled={true}>
                          <BarChart
                            data={chartSummary.monthlyFlowBars}
                            barWidth={10}
                            spacing={12}
                            roundedTop
                            hideRules
                            noOfSections={4}
                            yAxisThickness={0}
                            xAxisThickness={0}
                            width={Math.max(chartCardWidth - 20, Math.max(chartCardWidth + 80, chartSummary.monthlyFlowBars.length * 46))}
                          />
                        </ScrollView>
                      </ScrollView>
                    )}

                    {card.key === 'weekdayActivity' && (
                      <View style={{ marginTop: 10 }}>
                        <ThemedText style={{ color: iconColor, fontSize: 11, marginBottom: 6 }}>
                          Movimientos por día de semana
                        </ThemedText>
                        <BarChart
                          data={chartSummary.weekdayActivityBars}
                          barWidth={18}
                          spacing={16}
                          roundedTop
                          hideRules
                          noOfSections={4}
                          yAxisThickness={0}
                          xAxisThickness={0}
                          width={chartCardWidth - 44}
                        />
                      </View>
                    )}

                    {card.key === 'amountRanges' && (
                      <View style={{ marginTop: 10 }}>
                        <ThemedText style={{ color: iconColor, fontSize: 11, marginBottom: 6 }}>
                          Cuántas transacciones caen en cada rango
                        </ThemedText>
                        <BarChart
                          data={chartSummary.amountRangeBars}
                          barWidth={20}
                          spacing={35}
                          roundedTop
                          hideRules
                          noOfSections={4}
                          yAxisThickness={0}
                          xAxisThickness={0}
                          width={chartCardWidth - 35}
                        />
                      </View>
                    )}

                    {card.key === 'pieType' && (
                      <View style={{ marginTop: "35%", alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }}>
                        {chartSummary.typePieData.length > 0 ? (
                          <PieChart
                            data={chartSummary.typePieData}
                            donut
                            radius={100}
                            innerRadius={50}
                            centerLabelComponent={() => (
                              <View style={{ alignItems: 'center' }}>
                                <ThemedText style={{ color: '#9ca3af', fontSize: 11 }}>Balance</ThemedText>
                                <ThemedText style={{ color: '#9ca3af', fontSize: 9 }}>{chartSummary.selectedNeto >= 0 ? 'Positivo' : 'Negativo'}</ThemedText>
                              </View>
                            )}
                          />
                        ) : (
                          <ThemedText style={{ color: '#aaa', marginTop: 16 }}>Sin datos suficientes</ThemedText>
                        )}
                      </View>
                    )}

                    {card.key === 'pieCategory' && (
                      <View style={{ marginTop: "10%", alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }}>
                        {chartSummary.categoryPieData.length > 0 ? (
                          <>
                            <PieChart
                              data={chartSummary.categoryPieData}
                              donut
                              radius={100}
                              innerRadius={50}
                            />
                            <View style={{ width: '100%', marginTop: 8, paddingHorizontal: 6 }}>
                              {chartSummary.categoryPieData.map((item) => (
                                <View key={`${item.text}-${item.color}`} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                  <View style={{ width: 10, height: 10, borderRadius: 6, backgroundColor: item.color, marginRight: 8 }} />
                                  <ThemedText style={{ fontSize: 10, color: '#cbd5e1' }}>{item.text}</ThemedText>
                                </View>
                              ))}
                            </View>
                          </>
                        ) : (
                          <ThemedText style={{ color: '#aaa', marginTop: 16 }}>Sin egresos categorizados</ThemedText>
                        )}
                      </View>
                    )}

                    {card.key === 'cumulative' && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled={true} style={{ marginTop: 8 }}>
                        <LineChart
                          data={chartSummary.cumulativeLineData.length > 0 ? chartSummary.cumulativeLineData : chartData}
                          thickness={2}
                          color="#818cf8"
                          areaChart
                          curved
                          startFillColor="#6366f1"
                          endFillColor="#6366f100"
                          yAxisThickness={0}
                          xAxisColor="transparent"
                          yAxisColor="transparent"
                          noOfSections={4}
                          width={Math.max(chartCardWidth - 30, chartSummary.cumulativeLineData.length * 48)}
                        />
                      </ScrollView>
                    )}

                    {card.key === 'trend' && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled={true} style={{ marginTop: 8 }} scrollEnabled={true}>
                        <LineChart
                          data={chartSummary.trendLineData.length > 0 ? chartSummary.trendLineData : chartData}
                          thickness={2}
                          color="#22d3ee"
                          hideDataPoints={false}
                          dataPointsColor="#67e8f9"
                          curved
                          yAxisThickness={0}
                          xAxisColor="transparent"
                          yAxisColor="transparent"
                          noOfSections={4}
                          width={Math.max(chartCardWidth - 20, Math.max(chartCardWidth + 100, chartSummary.trendLineData.length * 56))}
                        />
                      </ScrollView>
                    )}
                  </View>
                ))}
              </ScrollView>

              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 12 }}>
                {visibleChartCards.map((_, index) => (
                  <View
                    key={`dot-${index}`}
                    style={{
                      width: index === activeChartIndex ? 18 : 8,
                      height: 8,
                      borderRadius: 5,
                      backgroundColor: index === activeChartIndex ? '#818cf8' : 'rgba(148,163,184,0.35)',
                    }}
                  />
                ))}
              </View>

              {visibleChartCards.length === 0 && (
                <ThemedText style={{ color: iconColor, textAlign: 'center', marginTop: 16 }}>
                  No hay gráficas visibles. Personaliza el orden para activar al menos una.
                </ThemedText>
              )}

              <ThemedText style={{ color: '#9ca3af', fontSize: 12, marginTop: 12, textAlign: 'center' }}>
                Mostrando {chartDataToDisplay.length} de {filteredChart.length} transacciones
              </ThemedText>
            </>
          ) : (
            <ThemedText style={{ color: '#aaa', textAlign: 'center', marginTop: 20 }}>
              No hay datos para mostrar
            </ThemedText>
          )}

          {filteredChart.length > 0 && (
            <View style={{ marginTop: 10, paddingHorizontal: 12 }}>
              <View
                style={{
                  backgroundColor: cardsMain,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: borderColor,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                <TouchableOpacity
                  onPress={() => setShowChartControls((prev) => !prev)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <View>
                    <ThemedText style={{ color: textColor, fontSize: 12 }}>
                      Ajustes de visualización
                    </ThemedText>
                    <ThemedText style={{ color: iconColor, fontSize: 11, marginTop: 2 }}>
                      {chartSelectionModeLabel} · {chartDataToDisplay.length}/{filteredChart.length}
                    </ThemedText>
                  </View>
                  <Ionicons
                    name={showChartControls ? 'chevron-up-outline' : 'chevron-down-outline'}
                    size={RFValue(22)}
                    color={iconColor}
                  />
                </TouchableOpacity>

                {showChartControls && (
                  <>
                    <View style={{ marginTop: 10 }}>
                      <ThemedText style={{ color: textColor, fontSize: 12, marginBottom: 6 }}>
                        Modo de selección
                      </ThemedText>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => setChartSelectionMode('distributed')}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 7,
                            borderRadius: 12,
                            backgroundColor: chartSelectionMode === 'distributed' ? tintColor : progressBg,
                            borderWidth: 1,
                            borderColor: chartSelectionMode === 'distributed' ? tintColor : 'transparent',
                          }}
                        >
                          <ThemedText style={{ fontSize: RFValue(10), color: chartSelectionMode === 'distributed' ? '#ffffff' : textColor, fontWeight: '700' }}>
                            Distribuidas
                          </ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setChartSelectionMode('balancedWeek')}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 7,
                            borderRadius: 12,
                            backgroundColor: chartSelectionMode === 'balancedWeek' ? tintColor : progressBg,
                            borderWidth: 1,
                            borderColor: chartSelectionMode === 'balancedWeek' ? tintColor : 'transparent',
                          }}
                        >
                          <ThemedText style={{ fontSize: RFValue(10), color: chartSelectionMode === 'balancedWeek' ? '#ffffff' : textColor, fontWeight: '700' }}>
                            Semanal
                          </ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setChartSelectionMode('balancedMonth')}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 7,
                            borderRadius: 12,
                            backgroundColor: chartSelectionMode === 'balancedMonth' ? tintColor : progressBg,
                            borderWidth: 1,
                            borderColor: chartSelectionMode === 'balancedMonth' ? tintColor : 'transparent',
                          }}
                        >
                          <ThemedText style={{ fontSize: RFValue(10), color: chartSelectionMode === 'balancedMonth' ? '#ffffff' : textColor, fontWeight: '700' }}>
                            Mensual
                          </ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setChartSelectionMode('recent')}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 7,
                            borderRadius: 12,
                            backgroundColor: chartSelectionMode === 'recent' ? tintColor : progressBg,
                            borderWidth: 1,
                            borderColor: chartSelectionMode === 'recent' ? tintColor : 'transparent',
                          }}
                        >
                          <ThemedText style={{ fontSize: RFValue(10), color: chartSelectionMode === 'recent' ? '#ffffff' : textColor, fontWeight: '700' }}>
                            Recientes
                          </ThemedText>
                        </TouchableOpacity>
                      </ScrollView>
                    </View>

                    <ThemedText style={{ color: iconColor, fontSize: 11, marginTop: 8 }}>
                      {chartSelectionMode === 'distributed' && 'Distribuidas: toma puntos repartidos dentro del periodo y filtros activos.'}
                      {chartSelectionMode === 'balancedWeek' && 'Semanal: toma una muestra representativa por semana del periodo y filtros activos.'}
                      {chartSelectionMode === 'balancedMonth' && 'Mensual: toma una muestra representativa por mes del periodo y filtros activos.'}
                      {chartSelectionMode === 'recent' && 'Recientes: toma las transacciones más nuevas dentro del periodo y filtros activos.'}
                    </ThemedText>

                    <View style={{ marginTop: 10 }}>
                      <ThemedText style={{ color: textColor, fontSize: 12, marginBottom: 6 }}>
                        Cantidad de transacciones
                      </ThemedText>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        {[5, 15, 30, 50, filteredChart.length].filter((v, i, arr) => arr.indexOf(v) === i).map((limit) => (
                          <TouchableOpacity
                            key={`fixed-limit-${limit}`}
                            onPress={() => setChartDataLimit(limit)}
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 7,
                              borderRadius: 12,
                              backgroundColor: chartDataLimit === limit ? primaryDarkColor : progressBg,
                              borderWidth: 1,
                              borderColor: chartDataLimit === limit ? primaryDarkColor : 'transparent',
                            }}
                          >
                            <ThemedText
                              style={{
                                fontSize: RFValue(11),
                                color: chartDataLimit === limit ? '#fff' : textColor,
                                fontWeight: chartDataLimit === limit ? '700' : '500',
                              }}
                            >
                              {limit === filteredChart.length ? 'Todos' : limit}
                            </ThemedText>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </>
                )}
              </View>
            </View>
          )}
        </View>
      </Modal>

      <Modal visible={showChartOrderModal && Boolean(subscriptionActive)} transparent animationType="fade" onRequestClose={() => setShowChartOrderModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowChartOrderModal(false)}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }}>
            <TouchableWithoutFeedback>
              <View style={{ width: '88%', borderRadius: 16, padding: 16, backgroundColor: cardsMain }}>
                <ThemedText style={{ fontSize: 18, fontWeight: '700', marginBottom: 4 }}>Personalizar gráficas</ThemedText>
                <ThemedText style={{ fontSize: 12, color: iconColor, marginBottom: 12 }}>
                  Usa flechas para reordenar y el switch para mostrar u ocultar cada gráfica.
                </ThemedText>

                {chartCardsConfig.map((item, index) => (
                  <View
                    key={item.key}
                    style={{
                      backgroundColor: `${primaryColor}14`,
                      borderWidth: 1,
                      borderColor: `${primaryColor}40`,
                      borderRadius: 12,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      marginBottom: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <ThemedText style={{ fontWeight: '700', fontSize: 13, flex: 1 }}>
                      {HISTORIAL_CHART_META[item.key].title}
                    </ThemedText>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Switch
                        value={item.visible}
                        onValueChange={(value) => toggleChartVisibility(item.key, value)}
                        trackColor={{ false: '#6b7280', true: `${primaryColor}88` }}
                        thumbColor={item.visible ? primaryColor : '#f3f4f6'}
                      />
                      <TouchableOpacity
                        onPress={() => moveChartUp(index)}
                        disabled={index === 0}
                        style={{ padding: 4, opacity: index === 0 ? 0.3 : 1 }}
                      >
                        <Ionicons name="arrow-up" size={18} color={textColor} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => moveChartDown(index)}
                        disabled={index === chartCardsConfig.length - 1}
                        style={{ padding: 4, opacity: index === chartCardsConfig.length - 1 ? 0.3 : 1 }}
                      >
                        <Ionicons name="arrow-down" size={18} color={textColor} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                <TouchableOpacity
                  onPress={() => setChartCardsConfig(HISTORIAL_CHART_CONFIG_DEFAULT)}
                  style={{ marginTop: 6, marginBottom: 8, paddingVertical: 10, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: `${primaryColor}50` }}
                >
                  <ThemedText style={{ fontSize: 12, color: primaryColor, textAlign: 'center' }}>Restablecer orden por defecto</ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setShowChartOrderModal(false)}
                  style={{ backgroundColor: primaryColor, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                >
                  <ThemedText style={{ color: '#fff', fontWeight: '700' }}>Listo</ThemedText>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

    </View>
  );
}
