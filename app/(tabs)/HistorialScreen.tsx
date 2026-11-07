import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Dimensions, KeyboardAvoidingView, Platform, StyleSheet, TextInput, ToastAndroid, TouchableOpacity, View } from "react-native";
import Animated, { FadeInDown, FadeOutUp, Layout } from "react-native-reanimated";
import { RFValue } from 'react-native-responsive-fontsize';
import { db } from '../../config/firebase';
  
import { ThemedText } from '@/components/ThemedText';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from "@/hooks/useThemeColor";
import { useTransactions } from '@/hooks/useTransactions';
import { useAccounts } from '@/hooks/useAccounts';
import { endOfDay, format, startOfDay } from "date-fns";
import { LinearGradient } from "expo-linear-gradient";
import { collection, deleteDoc, doc, onSnapshot } from "firebase/firestore";
import { ScrollView } from 'react-native-gesture-handler';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { Chip } from 'react-native-paper';

const toSafeDate = (value: any): Date => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value?.toDate) return value.toDate();
  const converted = value ? new Date(value) : new Date(0);
  return Number.isNaN(converted.getTime()) ? new Date(0) : converted;
};

const HISTORY_TOUR_STEPS = [
  {
    target: 'summary',
    icon: 'wallet-outline' as const,
    title: 'Resumen financiero',
    description: 'Consulta tus ingresos, egresos y saldo neto del periodo seleccionado.',
  },
  {
    target: 'filters',
    icon: 'options-outline' as const,
    title: 'Filtros de movimientos',
    description: 'Filtra por periodo, cuenta, categoría, tipo de movimiento y monto.',
  },
  {
    target: 'analysis',
    icon: 'pie-chart-outline' as const,
    title: 'Análisis',
    description: 'Abre el análisis financiero para consultar gráficas y tendencias.',
  },
  {
    target: 'transactions',
    icon: 'list-outline' as const,
    title: 'Tus movimientos',
    description: 'Revisa cada transacción, su categoría, cuenta y fecha.',
  },
];

export default function HistorialScreen() {
  const { accountId: routeAccountId } = useLocalSearchParams<{ accountId?: string }>();
  const { user } = useAuth();
  const userId = (user as any)?.uid as string | undefined;
  const transaccionesBase = useTransactions(userId);
  const accounts = useAccounts(userId);
  const [transacciones, setTransacciones] = useState<any[]>([]);
  const [accionesCatalogo, setAccionesCatalogo] = useState<Record<string, any>>({});
  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const backgroundColor = useThemeColor({ light: '', dark: '' }, 'background2');
  const graficaFondoColor = useThemeColor({ light: '', dark: '' }, 'graficaHistorial');
  const progressBg = useThemeColor({ light: '', dark: '' }, 'progressBg');
  const iconColor = useThemeColor({ light: '', dark: '' }, 'icon');
  const borderColor = useThemeColor({ light: '', dark: '' }, 'border');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');
  const headerColors: [string, string] = [primaryColor, primaryColor];

  const [filtered, setFiltered] = useState<any[]>([]);
  const [transactionSearchOpen, setTransactionSearchOpen] = useState(false);
  const [transactionSearch, setTransactionSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [dateStep, setDateStep] = useState<'start' | 'end' | 'month'>('start');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [range, setRange] = useState<'Total' | '1S' | '1A' | '1M'>('Total');
  const [selectedTipos, setSelectedTipos] = useState<string[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedCategorias, setSelectedCategorias] = useState<string[]>([]);
  const [selectedSubcategorias, setSelectedSubcategorias] = useState<string[]>([]);
  const [selectedPreestablecidos, setSelectedPreestablecidos] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<Date | null>(null);
  const [amountFilter, setAmountFilter] = useState<'all' | '0-99' | '100-499' | '500-999' | '1000-4999' | '5000+' >('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showHistoryTour, setShowHistoryTour] = useState(false);
  const [historyTourStep, setHistoryTourStep] = useState(0);
  const [historyTourTarget, setHistoryTourTarget] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const historyTourRefs = {
    summary: React.useRef<View>(null),
    filters: React.useRef<View>(null),
    analysis: React.useRef<View>(null),
    transactions: React.useRef<View>(null),
  };
  const historyScrollRef = React.useRef<any>(null);
  const historyTourStorageKey = userId ? `konta.history-tour.v1.${userId}` : null;
  const analysisLayoutY = React.useRef(0);
  const transactionsLayoutY = React.useRef(0);

  useEffect(() => {
    if (!historyTourStorageKey) return;
    AsyncStorage.getItem(historyTourStorageKey).then((seen) => {
      setShowHistoryTour(seen !== 'true');
    }).catch((error) => console.error('No se pudo cargar el recorrido de Historial:', error));
  }, [historyTourStorageKey]);

  const finishHistoryTour = async () => {
    if (historyTourStorageKey) {
      await AsyncStorage.setItem(historyTourStorageKey, 'true');
    }
    setShowHistoryTour(false);
    setHistoryTourStep(0);
  };

  const measureHistoryTourTarget = () => {
    const target = HISTORY_TOUR_STEPS[historyTourStep]?.target as keyof typeof historyTourRefs | undefined;
    const node = target ? historyTourRefs[target].current : null;
    if (!node) {
      setHistoryTourTarget(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) setHistoryTourTarget({ x, y, width, height });
    });
  };

  useEffect(() => {
    if (!showHistoryTour) return;
    const target = HISTORY_TOUR_STEPS[historyTourStep]?.target;
    const layoutY = target === 'analysis'
      ? analysisLayoutY.current
      : target === 'transactions'
        ? transactionsLayoutY.current
        : null;
    if (layoutY !== null && layoutY > 0) {
      historyScrollRef.current?.scrollTo?.({ y: Math.max(0, layoutY - 140), animated: true });
    }
    const firstTimer = setTimeout(measureHistoryTourTarget, target === 'summary' || target === 'filters' ? 180 : 650);
    const secondTimer = setTimeout(measureHistoryTourTarget, target === 'summary' || target === 'filters' ? 350 : 1100);
    return () => {
      clearTimeout(firstTimer);
      clearTimeout(secondTimer);
    };
  }, [historyTourStep, showHistoryTour, filtered.length, showAdvancedFilters]);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const filtersStorageKey = userId ? `@kontaa:historial-filtros:${userId}` : null;

  const rangeOptions = [
    { key: 'Total', label: 'Todos' },
    { key: '1S', label: '7 días' },
    { key: '1M', label: '30 días' },
    { key: '1A', label: '12 meses' },
  ];

  const amountRangeOptions = [
    { key: 'all', label: 'Todas' },
    { key: '0-99', label: '0-99' },
    { key: '100-499', label: '100-499' },
    { key: '500-999', label: '500-999' },
    { key: '1000-4999', label: '1000-4999' },
    { key: '5000+', label: '5000+' },
  ] as const;

  const getTransactionCategory = (transaction: any) => (
    transaction?.origen === 'transferencia-ahorro' || transaction?.origen === 'retiro-ahorro'
      ? 'Ahorro'
      : transaction?.presupuestoCategoria || transaction?.categoria || transaction?.categoriaNombre || ''
  );

  useEffect(() => {
    if (!filtersStorageKey) return;
    AsyncStorage.getItem(filtersStorageKey)
      .then((stored) => {
        if (!stored) return;
        const saved = JSON.parse(stored);
        if (Array.isArray(saved.selectedTipos)) setSelectedTipos(saved.selectedTipos);
        if (typeof saved.selectedAccountId === 'string') setSelectedAccountId(saved.selectedAccountId);
        if (typeof saved.amountFilter === 'string') setAmountFilter(saved.amountFilter);
        if (saved.range === 'Total' || saved.range === '1S' || saved.range === '1M' || saved.range === '1A') setRange(saved.range);
      })
      .catch((error) => console.error('Error al cargar filtros guardados:', error))
      .finally(() => setFiltersLoaded(true));
  }, [filtersStorageKey]);

  useEffect(() => {
    if (!filtersLoaded || typeof routeAccountId !== 'string' || !routeAccountId) return;
    setSelectedAccountId(routeAccountId);
  }, [filtersLoaded, routeAccountId]);

  useEffect(() => {
    if (!filtersStorageKey || !filtersLoaded) return;
    AsyncStorage.setItem(filtersStorageKey, JSON.stringify({
      selectedTipos,
      selectedAccountId,
      amountFilter,
      range,
    })).catch((error) => console.error('Error al guardar filtros:', error));
  }, [amountFilter, filtersLoaded, filtersStorageKey, range, selectedAccountId, selectedTipos]);

  useEffect(() => {
    if (!userId) {
      setAccionesCatalogo({});
      return;
    }

    const actionsRef = collection(db, `users/${userId}/preestablecidosSubs`);
    const unsubscribe = onSnapshot(actionsRef, (snapshot) => {
      const catalog = Object.fromEntries(snapshot.docs.map((actionDoc) => [actionDoc.id, { id: actionDoc.id, ...actionDoc.data() }]));
      setAccionesCatalogo(catalog);
    });

    return () => unsubscribe();
  }, [userId]);
    
  useEffect(() => {
    if (!userId) return;
    const cryptoMovements = new Map<string, any[]>();
    const movementUnsubscribers: Record<string, () => void> = {};

    const updateTransactions = () => {
      const crypto = Array.from(cryptoMovements.values()).flat();
      const merged = [
        ...transaccionesBase,
        ...crypto.filter((movement) => movement.ledger !== 'local' && !movement.originTransactionId),
      ].sort((a, b) => (b.date?.getTime?.() || 0) - (a.date?.getTime?.() || 0));
      setTransacciones(merged);
    };

    const cryptosRef = collection(db, `users/${userId}/criptos`);
    const unsubCryptos = onSnapshot(cryptosRef, (snap) => {
      const currentIds = new Set(snap.docs.map((d) => d.id));

      Object.keys(movementUnsubscribers).forEach((cryptoId) => {
        if (!currentIds.has(cryptoId)) {
          movementUnsubscribers[cryptoId]?.();
          delete movementUnsubscribers[cryptoId];
          cryptoMovements.delete(cryptoId);
        }
      });

      snap.docs.forEach((cryptoDoc) => {
        if (movementUnsubscribers[cryptoDoc.id]) return;

        const cryptoData = cryptoDoc.data() as any;
        const movementsRef = collection(db, `users/${userId}/criptos/${cryptoDoc.id}/movimientos`);
        movementUnsubscribers[cryptoDoc.id] = onSnapshot(movementsRef, (movementSnap) => {
          cryptoMovements.set(cryptoDoc.id, movementSnap.docs.map((movementDoc) => {
            const movement = movementDoc.data() as any;
            const date = movement.fecha?.toDate?.() || (movement.fecha ? new Date(movement.fecha) : new Date());
            const isSale = movement.tipo === 'venta';

            return {
              id: `crypto-${cryptoDoc.id}-${movementDoc.id}`,
              tipo: isSale ? 'ingreso' : 'egreso',
              monto: Number(movement.monto || (Number(movement.cantidad || 0) * Number(movement.precio || 0))),
              descripcion: movement.descripcion || movement.tipo || 'Movimiento cripto',
              fecha: movement.fecha,
              date,
              crypto: {
                symbol: cryptoData.symbol || cryptoDoc.id,
                name: cryptoData.name || cryptoData.symbol || cryptoDoc.id,
                quantity: Number(movement.cantidad || 0),
                price: Number(movement.precio || 0),
              },
              originTransactionId: movement.originTransactionId || null,
              ledger: movement.ledger || null,
              origen: 'movimiento-cripto',
            };
          }));
          updateTransactions();
        });
      });
    });

    return () => {
      unsubCryptos();
      Object.values(movementUnsubscribers).forEach((unsubscribe) => unsubscribe());
    };
  }, [userId, transaccionesBase]);

  useEffect(() => {
    if (!userId) {
      setSubscriptionActive(false);
      return;
    }

    const userRef = doc(db, `users/${userId}`);
    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      setSubscriptionActive(Boolean((snapshot.data() as any)?.supportSubscription?.active));
    });

    return () => unsubscribe();
  }, [userId]);

  const total = transacciones.reduce(
    (acc, t) => acc + (t.tipo === "ingreso" ? t.monto : t.tipo === "transferencia" ? 0 : -t.monto),
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
      if (tx?.origen === 'transferencia-ahorro' || tx?.origen === 'retiro-ahorro') found.add('Ahorro');
      tx?.groupItems?.forEach((item: any) => {
        const category = item.presupuestoCategoria || item.categoria;
        if (category) found.add(category);
      });
    });
    return Array.from(found).sort((a, b) => a.localeCompare(b));
  }, [transacciones]);

  const preestablecidoOptions = useMemo(() => {
    const found = new Set<string>();
    transacciones.forEach((tx) => {
      if (tx?.preestablecidoMainNombre) found.add(tx.preestablecidoMainNombre);
      if (tx?.grupoNombre) found.add(tx.grupoNombre);
      tx?.groupItems?.forEach((item: any) => {
        const preset = item.preestablecidoMainNombre || item.mainNombre;
        if (preset) found.add(preset);
      });
    });
    return Array.from(found).sort((a, b) => a.localeCompare(b));
  }, [transacciones]);

  const subcategoriaOptions = useMemo(() => {
    if (selectedCategorias.length === 0) return [];

    const found = new Set<string>();
    transacciones.forEach((tx) => {
      const category = tx?.presupuestoCategoria || tx?.categoria || tx?.categoriaNombre;
      const subcategoria = tx?.subcategoria || tx?.subCategoria || tx?.subcategory || tx?.subcategoriaNombre;
      if (selectedCategorias.includes(category || '') && subcategoria && String(subcategoria).trim()) {
        found.add(String(subcategoria));
      }

      tx?.groupItems?.forEach((item: any) => {
        const itemCategory = item.presupuestoCategoria || item.categoria;
        const itemSubcategory = item.subcategoria || item.subCategoria || item.subcategory || item.subcategoriaNombre;
        if (selectedCategorias.includes(itemCategory || '') && itemSubcategory && String(itemSubcategory).trim()) {
          found.add(String(itemSubcategory));
        }
      });
    });

    return Array.from(found).sort((a, b) => a.localeCompare(b));
  }, [selectedCategorias, transacciones]);

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
    const signedValues = filtered.map((tx) => (
      tx.tipo === 'ingreso'
        ? Number(tx.monto || 0)
        : tx.tipo === 'transferencia'
          ? 0
          : -Number(tx.monto || 0)
    ));
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
      const categoria = getTransactionCategory(tx) || tx.preestablecidoMainNombre || 'Sin categoría';
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
        case '1S': {
          const weekAgo = new Date(now);
          weekAgo.setDate(now.getDate() - 7);
          filteredData = transacciones.filter((t) => t.date >= weekAgo);
          break;
        }
        case '1M': {
          const monthAgo = new Date(now);
          monthAgo.setMonth(now.getMonth() - 1);
          filteredData = transacciones.filter((t) => t.date >= monthAgo);
          break;
        }
        case '1A': {
          const yearAgo = new Date(now);
          yearAgo.setFullYear(now.getFullYear() - 1);
          filteredData = transacciones.filter((t) => t.date >= yearAgo);
          break;
        }
        default:
          break;
      }
    }

    if (selectedMonth) {
      const monthStart = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
      const monthEnd = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0, 23, 59, 59, 999);
      filteredData = filteredData.filter((t) => t.date >= monthStart && t.date <= monthEnd);
      setRange('Total');
    }

    if (selectedTipos.length > 0) {
      filteredData = filteredData.filter((t) => matchesTransactionOrGroup(t, (item) => selectedTipos.includes(item.tipo)));
    }

    if (selectedAccountId) {
      filteredData = filteredData.filter((transaction) =>
        transaction.cuentaId === selectedAccountId
        || transaction.cuentaOrigenId === selectedAccountId
        || transaction.cuentaDestinoId === selectedAccountId
      );
    }

    if (selectedCategorias.length > 0) {
      filteredData = filteredData.filter((t) => matchesTransactionOrGroup(t, (item) => selectedCategorias.includes(getTransactionCategory(item))));
    }

    if (selectedSubcategorias.length > 0) {
      filteredData = filteredData.filter((t) => matchesTransactionOrGroup(t, (item) => {
        const subcategoria = item.subcategoria || item.subCategoria || item.subcategory || item.subcategoriaNombre;
        return subcategoria && selectedSubcategorias.includes(String(subcategoria));
      }));
    }

    if (selectedPreestablecidos.length > 0) {
      filteredData = filteredData.filter((t) => matchesTransactionOrGroup(t, (item) => selectedPreestablecidos.includes(item.preestablecidoMainNombre || item.mainNombre || '')));
    }

    if (amountFilter !== 'all') {
      const amountRange = amountFilter.split('-').length > 1 ? amountFilter : null;
      filteredData = filteredData.filter((t) => matchesTransactionOrGroup(t, (item) => {
        const amount = Number(item.monto || 0) * Number(item.quantity || 1);
        if (amountFilter === '5000+') return amount >= 5000;
        if (!amountRange) return true;
        const [minRaw, maxRaw] = amountRange.split('-');
        const min = Number(minRaw);
        const max = Number(maxRaw);
        return amount >= min && amount <= max;
      }));
    }

    const searchTerm = transactionSearch.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (searchTerm) {
      filteredData = filteredData.filter((transaction) => {
        const groupItemsText = Array.isArray(transaction.groupItems)
          ? transaction.groupItems.map((item: any) => `${item.nombre || ''} ${item.categoria || ''}`).join(' ')
          : '';
        const searchableText = `${transaction.descripcion || ''} ${getTransactionCategory(transaction)} ${transaction.preestablecidoMainNombre || ''} ${transaction.grupoNombre || ''} ${groupItemsText}`
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        return searchableText.includes(searchTerm);
      });
    }

    filteredData = filteredData
      .map(filterGroupItems)
      .filter((transaction): transaction is any => Boolean(transaction));

    filteredData.sort((a, b) => {
      const dateA = a.date || new Date(0);
      const dateB = b.date || new Date(0);
      return dateB.getTime() - dateA.getTime();
    });

    setFiltered(filteredData);
  }, [transacciones, range, startDate, endDate, selectedTipos, selectedAccountId, selectedCategorias, selectedSubcategorias, selectedPreestablecidos, selectedMonth, amountFilter, transactionSearch]);

  const handleToggleAdvancedFilters = () => {
    if (!subscriptionActive) {
      Alert.alert(
        'Función Premium',
        'Los filtros avanzados están disponibles con suscripción activa.',
        [
          { text: 'Ahora no', style: 'cancel' },
          {
            text: 'Obtener suscripción',
            onPress: () => router.push({ pathname: '/(screens)/Settings', params: { openSubscription: '1' } }),
          },
        ],
      );
      return;
    }

    setShowAdvancedFilters((prev) => !prev);
  };

  const showPicker = (type: 'start' | 'end' | 'month') => {
    setDateStep(type);
    setDatePickerVisible(true);
  };

  const handleConfirm = (date: Date) => {
    setDatePickerVisible(false);

    if (dateStep === 'month') {
      setSelectedMonth(new Date(date.getFullYear(), date.getMonth(), 1));
      setStartDate(null);
      setEndDate(null);
      setRange('Total');
      return;
    }

    if (dateStep === 'start') {
      setSelectedMonth(null);
      setStartDate(startOfDay(date));
      setTimeout(() => showPicker('end'), 400);
      return;
    }

    setEndDate(endOfDay(date));
  };

  const clearFilters = () => {
    setStartDate(null);
    setEndDate(null);
    setSelectedMonth(null);
    setRange('Total');
    setSelectedTipos([]);
    setSelectedAccountId(null);
    setSelectedCategorias([]);
    setSelectedSubcategorias([]);
    setSelectedPreestablecidos([]);
    setAmountFilter('all');
  };

  const customRangeLabel = startDate && endDate
    ? `${format(startDate, 'dd/MM')} - ${format(endDate, 'dd/MM')}`
    : selectedMonth
      ? format(selectedMonth, 'MMM yyyy')
      : 'Seleccionar rango';

  const rangeLabel = selectedMonth
    ? `Mes seleccionado: ${format(selectedMonth, 'MMMM yyyy')}`
    : startDate && endDate
      ? `Rango personalizado: ${customRangeLabel}`
      : `Mostrando: ${rangeOptions.find((opt) => opt.key === range)?.label || 'Todos'}`;

  const activeAdvancedFilters = selectedTipos.length + (selectedAccountId ? 1 : 0) + selectedCategorias.length + selectedSubcategorias.length + selectedPreestablecidos.length + (amountFilter !== 'all' ? 1 : 0) + (selectedMonth ? 1 : 0);
  const historyTourWindowHeight = Dimensions.get('window').height;
  const historyTourCardTop = historyTourTarget
    ? historyTourTarget.y > historyTourWindowHeight * 0.48
      ? 24
      : Math.min(historyTourTarget.y + historyTourTarget.height + 16, historyTourWindowHeight - 360)
    : 180;

  const matchesTransactionOrGroup = (transaction: any, predicate: (item: any) => boolean) => {
    if (predicate(transaction)) return true;
    return Array.isArray(transaction.groupItems) && transaction.groupItems.some((item: any) => predicate(item));
  };

  const filterGroupItems = (transaction: any) => {
    if (!Array.isArray(transaction.groupItems) || transaction.groupItems.length === 0) return transaction;

    const groupMatchesPreset = selectedPreestablecidos.length > 0 && selectedPreestablecidos.includes(
      transaction.preestablecidoMainNombre || transaction.grupoNombre || ''
    );
    const hasOtherItemFilters = selectedTipos.length > 0
      || selectedCategorias.length > 0
      || selectedSubcategorias.length > 0
      || amountFilter !== 'all';
    if (groupMatchesPreset && !hasOtherItemFilters) return transaction;

    const hasItemFilters = selectedTipos.length > 0
      || selectedCategorias.length > 0
      || selectedSubcategorias.length > 0
      || selectedPreestablecidos.length > 0
      || amountFilter !== 'all';
    if (!hasItemFilters) return transaction;

    const items = transaction.groupItems.filter((item: any) => {
      if (selectedTipos.length > 0 && !selectedTipos.includes(item.tipo)) return false;

      const category = item.presupuestoCategoria || item.categoria || '';
      if (selectedCategorias.length > 0 && !selectedCategorias.includes(category)) return false;

      const subcategoria = item.subcategoria || item.subCategoria || item.subcategory || item.subcategoriaNombre;
      if (selectedSubcategorias.length > 0 && !selectedSubcategorias.includes(String(subcategoria || ''))) return false;

      const preset = item.preestablecidoMainNombre || item.mainNombre || '';
      if (selectedPreestablecidos.length > 0 && !selectedPreestablecidos.includes(preset)) return false;

      if (amountFilter !== 'all') {
        const amount = Number(item.monto || 0) * Number(item.quantity || 1);
        if (amountFilter === '5000+' && amount < 5000) return false;
        if (amountFilter !== '5000+') {
          const [minRaw, maxRaw] = amountFilter.split('-');
          if (amount < Number(minRaw) || amount > Number(maxRaw)) return false;
        }
      }

      return true;
    });

    if (items.length === 0) return null;

    return {
      ...transaction,
      groupItems: items,
      monto: items.reduce((sum: number, item: any) => sum + Number(item.monto || 0) * Number(item.quantity || 1), 0),
    };
  };

  const handleDeleteTransaction = (tx: any) => {
    if (!userId || !tx?.id) return;

    if (tx.origen === 'transferencia-ahorro' || tx.origen === 'retiro-ahorro') {
      Alert.alert(
        'Transferencia de ahorro',
        'Esta transferencia se administra desde el ahorro relacionado. Abre esa meta para eliminarla.',
        [{ text: 'Entendido' }],
      );
      return;
    }

    if (tx.origen === 'movimiento-cripto' || tx.cryptoLedger === 'global' || tx.crypto?.symbol) {
      Alert.alert(
        'Movimiento de cripto',
        'Este movimiento se administra desde la pantalla de Cripto. Abre el historial del activo para eliminarlo.',
        [{ text: 'Entendido' }],
      );
      return;
    }

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
    <View style={{ flex: 1, backgroundColor:backgroundColor }}>
      {showHistoryTour && (
        <View
          style={{
            ...StyleSheet.absoluteFill,
            zIndex: 50,
            backgroundColor: 'transparent',
          }}
        >
          {historyTourTarget ? (
            <>
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: Math.max(0, historyTourTarget.y - 8), backgroundColor: 'rgba(6, 8, 20, 0.72)' }} />
              <View pointerEvents="none" style={{ position: 'absolute', top: historyTourTarget.y - 8, left: 0, width: Math.max(0, historyTourTarget.x - 8), height: historyTourTarget.height + 16, backgroundColor: 'rgba(6, 8, 20, 0.72)' }} />
              <View pointerEvents="none" style={{ position: 'absolute', top: historyTourTarget.y - 8, right: 0, width: Math.max(0, Dimensions.get('window').width - historyTourTarget.x - historyTourTarget.width - 8), height: historyTourTarget.height + 16, backgroundColor: 'rgba(6, 8, 20, 0.72)' }} />
              <View pointerEvents="none" style={{ position: 'absolute', top: historyTourTarget.y + historyTourTarget.height + 8, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6, 8, 20, 0.72)' }} />
              <View pointerEvents="none" style={{ position: 'absolute', top: historyTourTarget.y - 8, left: historyTourTarget.x - 8, width: historyTourTarget.width + 16, height: historyTourTarget.height + 16, borderRadius: 16, borderWidth: 2, borderColor: primaryColor, shadowColor: primaryColor, shadowOpacity: 0.9, shadowRadius: 12, elevation: 12 }} />
            </>
          ) : (
            <View pointerEvents="none" style={{ ...StyleSheet.absoluteFill, backgroundColor: 'rgba(6, 8, 20, 0.72)' }} />
          )}
          <View pointerEvents="box-none" style={{ position: 'absolute', top: historyTourCardTop, left: 16, right: 16 }}>
            <View style={{ backgroundColor: backgroundColor, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: `${primaryColor}35`, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <ThemedText style={{ fontSize: 12, opacity: 0.8 }}>Recorrido de Historial</ThemedText>
                <TouchableOpacity onPress={finishHistoryTour} style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
                  <ThemedText style={{ fontSize: 12, fontWeight: '700', color: '#94a3b8' }}>Omitir</ThemedText>
                </TouchableOpacity>
              </View>
              <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginTop: 10, marginBottom: 10, backgroundColor: `${primaryColor}20`, borderWidth: 1, borderColor: `${primaryColor}55` }}>
                <Ionicons name={HISTORY_TOUR_STEPS[historyTourStep].icon} size={28} color={primaryColor} />
              </View>
              <ThemedText style={{ fontSize: 20, fontWeight: '800', marginBottom: 8 }}>{HISTORY_TOUR_STEPS[historyTourStep].title}</ThemedText>
              <ThemedText style={{ fontSize: 13, opacity: 0.86, lineHeight: 20 }}>{HISTORY_TOUR_STEPS[historyTourStep].description}</ThemedText>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 14 }}>
                {HISTORY_TOUR_STEPS.map((_, index) => <View key={`history-dot-${index}`} style={{ width: historyTourStep === index ? 20 : 8, height: 8, borderRadius: 99, marginRight: 6, backgroundColor: historyTourStep === index ? primaryColor : `${primaryColor}35` }} />)}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <TouchableOpacity disabled={historyTourStep === 0} onPress={() => setHistoryTourStep((step) => Math.max(0, step - 1))} style={{ borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: `${primaryColor}45`, opacity: historyTourStep === 0 ? 0.4 : 1 }}>
                  <ThemedText style={{ fontWeight: '700', fontSize: 12 }}>Atrás</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    if (historyTourStep >= HISTORY_TOUR_STEPS.length - 1) {
                      finishHistoryTour();
                      setHistoryTourStep(0);
                    } else {
                      setHistoryTourStep((step) => step + 1);
                    }
                  }}
                  style={{ borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: primaryColor }}
                >
                  <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{historyTourStep >= HISTORY_TOUR_STEPS.length - 1 ? 'Listo' : 'Siguiente'}</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}
      <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}>
      <ScrollView
        ref={historyScrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 16,
          paddingTop: 80,
          paddingBottom: 220,
        }}
      >
      {/* ENCABEZADO */}
      <Animated.View ref={historyTourRefs.summary} entering={FadeInDown.delay(100)} exiting={FadeOutUp}>
        <LinearGradient
          colors={headerColors}
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
      <Animated.View ref={historyTourRefs.filters} entering={FadeInDown.delay(200)} exiting={FadeOutUp} layout={Layout.springify()}>
        <View style={{ marginBottom: 16 }}>
          <ThemedText style={{ fontSize: 16, marginBottom: 10 }}>Filtrar movimientos</ThemedText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {rangeOptions.map((f) => (
              <TouchableOpacity
                key={f.key}
                onPress={() => {
                    setSelectedMonth(null);
                    setRange(f.key as 'Total' | '1S' | '1M' | '1A');
                    setStartDate(null);
                    setEndDate(null);
                    }}
                style={{
                  backgroundColor:
                    range === f.key && !startDate && !selectedMonth ? "#6366f1" : progressBg,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 20,
                  marginRight: 8,
                  marginBottom: 8,
                }}
              >
                <ThemedText style={{ color: range === f.key && !startDate && !selectedMonth ? '#fff' : '#9ca3af', fontSize: RFValue(12), textTransform: 'capitalize' }}>
                  {f.label}
                </ThemedText>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => showPicker('month')}
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
                Mes: {selectedMonth ? format(selectedMonth, 'MMM yyyy') : 'Seleccionar'}
              </ThemedText>
            </TouchableOpacity>
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
            {(startDate || endDate || selectedMonth || selectedTipos.length > 0 || selectedAccountId || selectedCategorias.length > 0 || selectedPreestablecidos.length > 0 || amountFilter !== 'all' || activeAdvancedFilters > 0) && (
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
                  Quitar filtros
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            onPress={handleToggleAdvancedFilters}
            style={{
              marginTop: 8,
              alignSelf: 'flex-start',
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 14,
              backgroundColor: subscriptionActive ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.12)',
              borderWidth: 1,
              borderColor: subscriptionActive ? 'rgba(99,102,241,0.35)' : 'rgba(99,102,241,0.18)',
            }}
          >
            <ThemedText style={{ fontSize: 12, opacity: subscriptionActive ? 1 : 0.8 }}>
              {showAdvancedFilters ? 'Ocultar filtros avanzados' : subscriptionActive ? 'Mostrar filtros avanzados' : 'Filtros avanzados • Premium'}
            </ThemedText>
          </TouchableOpacity>

          {showAdvancedFilters && (
            <>
              <View style={{ marginTop: 6 }}>
                <ThemedText style={{ fontSize: 13, marginBottom: 6, color: '#9ca3af' }}>Cuenta</ThemedText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 2 }}>
                  <Chip
                    selected={!selectedAccountId}
                    compact
                    mode="flat"
                    onPress={() => setSelectedAccountId(null)}
                    textStyle={{ color: !selectedAccountId ? '#ffffff' : '#9ca3af' }}
                    style={{ margin: 4, backgroundColor: !selectedAccountId ? 'rgba(34,197,94,0.3)' : progressBg }}
                  >
                    Todas
                  </Chip>
                  {accounts.filter((account) => account.activo !== false).map((account) => (
                    <Chip
                      key={account.id}
                      selected={selectedAccountId === account.id}
                      compact
                      mode="flat"
                      onPress={() => setSelectedAccountId(selectedAccountId === account.id ? null : account.id)}
                      textStyle={{ color: selectedAccountId === account.id ? '#ffffff' : '#9ca3af' }}
                      style={{ margin: 4, backgroundColor: selectedAccountId === account.id ? 'rgba(34,197,94,0.3)' : progressBg }}
                    >
                      {account.nombre}
                    </Chip>
                  ))}
                </View>
              </View>

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
                      textStyle={{ color: selectedTipos.includes(opcion) ? '#ffffff' : '#9ca3af' }}
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

              <View style={{ marginTop: 6 }}>
                <ThemedText style={{ fontSize: 13, marginBottom: 6, color: '#9ca3af' }}>Cantidad</ThemedText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 2 }}>
                  {amountRangeOptions.map((opcion) => (
                    <Chip
                      key={opcion.key}
                      selected={amountFilter === opcion.key}
                      compact
                      mode="flat"
                      onPress={() => setAmountFilter(opcion.key)}
                      textStyle={{ color: amountFilter === opcion.key ? '#ffffff' : '#9ca3af' }}
                      style={{
                        margin: 4,
                        alignSelf: 'flex-start',
                        backgroundColor: amountFilter === opcion.key ? 'rgba(251,191,36,0.3)' : progressBg,
                      }}
                    >
                      {opcion.label}
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
                        onPress={() => {
                          const next = selectedCategorias.includes(opcion)
                            ? selectedCategorias.filter((item) => item !== opcion)
                            : [...selectedCategorias, opcion];
                          setSelectedCategorias(next);
                          if (!selectedCategorias.includes(opcion)) {
                            setSelectedSubcategorias([]);
                          }
                        }}
                        textStyle={{ color: selectedCategorias.includes(opcion) ? '#ffffff' : '#9ca3af' }}
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

              {selectedCategorias.length > 0 && subcategoriaOptions.length > 0 && (
                <View style={{ marginTop: 4 }}>
                  <ThemedText style={{ fontSize: 13, marginBottom: 6, color: '#9ca3af' }}>Subcategoría</ThemedText>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 2 }}>
                    {subcategoriaOptions.map((opcion) => (
                      <Chip
                        key={opcion}
                        selected={selectedSubcategorias.includes(opcion)}
                        compact
                        mode="flat"
                        onPress={() => toggleSelection(opcion, selectedSubcategorias, setSelectedSubcategorias)}
                        textStyle={{ color: selectedSubcategorias.includes(opcion) ? '#ffffff' : '#9ca3af' }}
                        style={{
                          margin: 4,
                          alignSelf: 'flex-start',
                          backgroundColor: selectedSubcategorias.includes(opcion) ? 'rgba(14,165,233,0.35)' : progressBg,
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
                  <ThemedText style={{ fontSize: 13, marginBottom: 6, color: '#9ca3af' }}>Grupo</ThemedText>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 2 }}>
                    {preestablecidoOptions.map((opcion) => (
                      <Chip
                        key={opcion}
                        selected={selectedPreestablecidos.includes(opcion)}
                        compact
                        mode="flat"
                        onPress={() => toggleSelection(opcion, selectedPreestablecidos, setSelectedPreestablecidos)}
                        textStyle={{ color: selectedPreestablecidos.includes(opcion) ? '#ffffff' : '#9ca3af' }}
                        style={{
                          margin: 4,
                          alignSelf: 'flex-start',
                          backgroundColor: selectedPreestablecidos.includes(opcion) ? 'rgba(8,145,178,0.35)' : progressBg,
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
      <View
        ref={historyTourRefs.analysis}
        collapsable={false}
        onLayout={(event) => {
          analysisLayoutY.current = event.nativeEvent.layout.y;
        }}
        style={{
          width: "100%",
          marginBottom: 10,
          marginTop: 10,
        }}
      >
        <Animated.View
          entering={FadeInDown.delay(300)}
          exiting={FadeOutUp}
          layout={Layout.springify()}
          style={{
            width: "100%",
            backgroundColor: graficaFondoColor,
            borderRadius: 20,
            padding: 12,
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
              Análisis
            </ThemedText>
            <TouchableOpacity onPress={() => router.push('/(screens)/AnalisisScreen')} accessibilityLabel="Abrir análisis financiero">
              <Ionicons
                name="arrow-forward-circle-outline"
                size={RFValue(26)}
                color={textColor}
              />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>

      {/* LISTA DE TRANSACCIONES */}
      
      <View
        ref={historyTourRefs.transactions}
        collapsable={false}
        onLayout={(event) => {
          transactionsLayoutY.current = event.nativeEvent.layout.y;
        }}
        style={{ marginBottom: 150 }}
      >
        <View
          style={{
            backgroundColor: graficaFondoColor,
            borderRadius: 20,
            padding: 16,
            marginBottom: 30,
            marginTop:15
          }}
        >
          
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: transactionSearchOpen ? 8 : 4 }}>
            {transactionSearchOpen ? (
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: `${borderColor}22`, borderRadius: 10, paddingHorizontal: 8, marginRight: 8 }}>
                <Ionicons name="search-outline" size={18} color={iconColor} />
                <TextInput
                  autoFocus
                  value={transactionSearch}
                  onChangeText={setTransactionSearch}
                  placeholder="Buscar transacciones"
                  placeholderTextColor={iconColor}
                  style={{ flex: 1, color: textColor, paddingVertical: 8, paddingHorizontal: 7, fontSize: 13 }}
                />
                {transactionSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setTransactionSearch('')} style={{ padding: 3 }}>
                    <Ionicons name="close-circle" size={17} color={iconColor} />
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <ThemedText style={{ fontWeight: '600', fontSize: 16 }}>Transacciones</ThemedText>
            )}
            <TouchableOpacity
              onPress={() => {
                setTransactionSearchOpen((previous) => !previous);
                if (transactionSearchOpen) setTransactionSearch('');
              }}
              accessibilityLabel={transactionSearchOpen ? 'Cerrar búsqueda de transacciones' : 'Buscar transacciones'}
              style={{ padding: 5 }}
            >
              <Ionicons name={transactionSearchOpen ? 'close-outline' : 'search-outline'} size={22} color={textColor} />
            </TouchableOpacity>
          </View>

          {filtered.length === 0 ? (
            <ThemedText style={{ color: "#aaa", textAlign: "center", marginTop: 10 }}>
              {transacciones.length === 0 ? "No hay transacciones registradas" : "No hay transacciones en el periodo seleccionado"}
            </ThemedText>
          ) : (
            filtered.map((tx) => (
              <TouchableOpacity
                key={tx.id}
                activeOpacity={0.75}
                onPress={() => tx.groupItems?.length && setExpandedGroups((prev) => ({ ...prev, [tx.id]: !prev[tx.id] }))}
                onLongPress={() => handleDeleteTransaction(tx)}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  width: '100%',
                  justifyContent: 'space-between',
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", maxWidth: 250, flex: 1 }}>
                  {tx.groupItems?.length ? (
                    <ThemedText style={{ fontSize: 20, marginRight: 8 }}>{tx.grupoIcono || '📦'}</ThemedText>
                  ) : null}
                  <View style={{}}>
                    <View style={{flexDirection:"row", flexWrap: 'wrap', alignItems: 'center'}}>
                      <ThemedText allowFontScaling textBreakStrategy="simple" numberOfLines={2} style={{ fontWeight: "500", maxWidth: 185}}>
                        {tx.descripcion || "Sin descripción"} 
                      </ThemedText>
                      {tx.creadoAutomaticamente && (
                        <ThemedText style={{ color: "#888", fontSize: 11, marginLeft: 6 }}>
                          (Automático)
                        </ThemedText>
                      )}
                      {(tx.presupuestoCategoria || tx.origen === 'transferencia-ahorro' || tx.origen === 'retiro-ahorro') && (
                        <ThemedText style={{ color: "#9ca3af", fontSize: 11, marginLeft: 6 }}>
                          #{getTransactionCategory(tx)}
                        </ThemedText>
                      )}
                      {tx.preestablecidoMainNombre && (
                        <ThemedText style={{ color: "#c4b5fd", fontSize: 11, marginLeft: 6 }}>
                          {tx.preestablecidoMainNombre}
                        </ThemedText>
                      )}
                    </View>
                    <ThemedText style={{ color: "#aaa", fontSize: 12 }}>
                      {format(toSafeDate(tx.date || tx.fecha), "dd/MM/yyyy")}
                    </ThemedText>
                    {tx.groupItems?.length ? (
                      <ThemedText style={{ color: iconColor, fontSize: 11, marginTop: 3 }}>
                        {expandedGroups[tx.id] ? 'Ocultar productos' : `${tx.groupItems.length} productos · Ver detalle`}
                      </ThemedText>
                    ) : null}
                    {tx.groupItems?.length && expandedGroups[tx.id] ? (
                      <View style={{ marginTop: 8, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: `${primaryColor}66` }}>
                        {tx.groupItems.map((item: any, index: number) => (
                          <View key={`${tx.id}-group-item-${item.actionId || index}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 12 }}>
                            {(() => {
                              const catalogAction = accionesCatalogo[item.actionId] || {};
                              const actionName = item.nombre || item.name || item.actionName || catalogAction.nombre || 'Producto';
                              const actionIcon = item.icono || item.icon || item.actionIcon || catalogAction.icono || '•';
                              const actionCategory = item.categoria || item.presupuestoCategoria || catalogAction.presupuestoCategoria;
                              return (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6}}>
                                  <ThemedText style={{ flex: 1, fontSize: 11 }} numberOfLines={1}>
                                    {actionIcon} {actionName} x{item.quantity || 1}
                                  </ThemedText>
                                  <ThemedText style={{ fontSize: 11, color: iconColor }}>
                                    ${(Number(item.monto || 0) * Number(item.quantity || 1)).toFixed(2)}
                                  </ThemedText>
                                  <ThemedText style={{ fontSize: 10, color: actionCategory ? primaryColor : iconColor }}>
                                    {actionCategory || 'Sin presupuesto'}
                                  </ThemedText>
                                </View>
                              );
                            })()}
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>

                <ThemedText
                  style={{
                    textAlign: "right",
                    color: tx.tipo === "transferencia" ? "#c084fc" : tx.tipo === "ingreso" ? "#4ade80" : "#f87171",
                    fontWeight: "600",
                  }}
                >
                  {tx.tipo === "transferencia" ? "↔ " : tx.tipo === "ingreso" ? "+" : "-"}${tx.monto.toFixed(2)}
                </ThemedText>
              </TouchableOpacity>
            ))
          )}
        </View>
      </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
