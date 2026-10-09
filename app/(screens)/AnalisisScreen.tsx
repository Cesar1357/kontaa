import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, subDays, subYears } from 'date-fns';
import { router } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, FlatList, Modal, ScrollView, Switch, TouchableOpacity, View } from 'react-native';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';

import { ThemedText } from '@/components/ThemedText';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useTransactions } from '@/hooks/useTransactions';

const screenWidth = Dimensions.get('window').width;
const chartWidth = Math.max(280, screenWidth - 64);

type PeriodKey = '7d' | '30d' | '12m' | 'all' | 'week' | 'month' | 'year';
type AnalysisFavoriteKey = 'analysis-overview' | 'analysis-insights' | 'analysis-activity' | 'analysis-budgets' | 'analysis-trend' | 'analysis-flow' | 'analysis-categories';
type AnalysisSectionKey = 'summary' | 'metrics' | 'insights' | 'activity' | 'budgets' | 'trend' | 'cashflow' | 'categories' | 'weekday' | 'monthlyInsights' | 'largestExpense' | 'savings-evolution';

const ANALYSIS_SECTION_DEFAULTS: Array<{ key: AnalysisSectionKey; visible: boolean; configurable: boolean }> = [
  { key: 'summary', visible: true, configurable: true },
  { key: 'metrics', visible: true, configurable: true },
  { key: 'monthlyInsights', visible: true, configurable: true },
  { key: 'insights', visible: true, configurable: true },
  { key: 'activity', visible: true, configurable: true },
  { key: 'budgets', visible: true, configurable: true },
  { key: 'trend', visible: true, configurable: true },
  { key: 'cashflow', visible: true, configurable: true },
  { key: 'categories', visible: true, configurable: true },
  { key: 'weekday', visible: true, configurable: true },
  { key: 'largestExpense', visible: true, configurable: true },
  { key: 'savings-evolution', visible: true, configurable: true },
];

type Transaction = {
  id: string;
  tipo?: string;
  monto?: number;
  date?: Date | null;
  fecha?: any;
  descripcion?: string;
  presupuestoCategoria?: string | null;
  preestablecidoMainNombre?: string | null;
  origen?: string | null;
  groupItems?: any[];
};

const toDate = (value: any): Date => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value?.toDate) {
    const converted = value.toDate();
    if (converted instanceof Date && !Number.isNaN(converted.getTime())) return converted;
  }
  if (value?.seconds) return new Date(Number(value.seconds) * 1000);
  const converted = value ? new Date(value) : new Date(0);
  return Number.isNaN(converted.getTime()) ? new Date(0) : converted;
};

const amountOf = (value: any) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const currency = (value: number, decimals = 0) =>
  `$${value.toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

const getGroupCategoryTotals = (transaction: Transaction) => {
  if (!Array.isArray(transaction.groupItems) || transaction.groupItems.length === 0) return [];

  const totals = new Map<string, number>();
  transaction.groupItems.forEach((item) => {
    const category = item.presupuestoCategoria || item.categoria || 'Sin categoría';
    const value = amountOf(item.monto) * Math.max(1, amountOf(item.quantity || 1));
    totals.set(category, (totals.get(category) || 0) + value);
  });
  return Array.from(totals.entries());
};

const getExpenseCategoryTotals = (transaction: Transaction): Array<[string, number]> => {
  if (transaction.origen === 'transferencia-ahorro' || transaction.origen === 'retiro-ahorro') {
    return [['Ahorro', amountOf(transaction.monto)]];
  }

  const groupCategories = getGroupCategoryTotals(transaction);
  if (groupCategories.length > 0) return groupCategories;

  return [[transaction.presupuestoCategoria || transaction.descripcion || 'Sin categoría', amountOf(transaction.monto)]];
};

const isSupportSubscriptionActive = (support: any) => {
  if (!support) return false;
  const expiry = support.expiryTime?.toDate?.() || (support.expiryTime ? new Date(support.expiryTime) : null);
  if (expiry instanceof Date && !Number.isNaN(expiry.getTime())) {
    return expiry.getTime() > Date.now()
      && support.state !== 'SUBSCRIPTION_STATE_EXPIRED'
      && support.state !== 'SUBSCRIPTION_STATE_CANCELED';
  }
  return support.active === true;
};

export default function AnalisisScreen() {
  const { user } = useAuth();
  const [subscriptionActive, setSubscriptionActive] = useState<boolean | null>(null);
  const [subscriptionLoaded, setSubscriptionLoaded] = useState<boolean | null>(null);
  
  const transactions = useTransactions((user as any)?.uid) as Transaction[];
  const [period, setPeriod] = useState<PeriodKey>('30d');
  const lastPeriodTapRef = useRef<{ key: PeriodKey; time: number } | null>(null);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [favoriteKeys, setFavoriteKeys] = useState<AnalysisFavoriteKey[]>([]);
  const [largestMovementMode, setLargestMovementMode] = useState<'expense' | 'income'>('expense');
  const [showTopMovements, setShowTopMovements] = useState(false);
  const [analysisSections, setAnalysisSections] = useState(ANALYSIS_SECTION_DEFAULTS);
  const [showSectionOrderModal, setShowSectionOrderModal] = useState(false);
  const [savingsGoals, setSavingsGoals] = useState<any[]>([]);

  const backgroundColor = useThemeColor({ light: '', dark: '' }, 'background2');
  const cardColor = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const mutedColor = useThemeColor({ light: '', dark: '' }, 'icon');
  const borderColor = useThemeColor({ light: '', dark: '' }, 'border');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');
  const progressColor = useThemeColor({ light: '', dark: '' }, 'progressBg');

  useEffect(() => {
    const userId = (user as any)?.uid;
    if (!userId) {
      setFavoriteKeys([]);
      return;
    }

    AsyncStorage.getItem(`konta.historial.favoriteCharts.${userId}`).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Array<{ key?: string }>;
        const valid = parsed
          .map((item) => item.key)
          .filter((key): key is AnalysisFavoriteKey => key?.startsWith('analysis-') === true);
        setFavoriteKeys(valid);
      } catch (error) {
        console.log('No se pudieron cargar favoritas de analisis:', error);
      }
    });
  }, [user]);

  useEffect(() => {
      if (!user?.uid) {
          setSubscriptionLoaded(null);
        return;
      }
  
      const userRef = doc(db, 'users', user.uid);
      const unsub = onSnapshot(userRef, (snap) => {
        const data = snap.data() || {};
        const support = (data as any).supportSubscription;
        const supportActive = isSupportSubscriptionActive(support);
        if (support?.active !== undefined || support?.state || support?.expiryTime) {
          setSubscriptionActive(supportActive);
          setSubscriptionLoaded(true);
        }
      });
  
      return () => unsub();
    }, [user?.uid]);

  useEffect(() => {
    const userId = (user as any)?.uid;
    if (!userId) {
      setAnalysisSections(ANALYSIS_SECTION_DEFAULTS);
      return;
    }

    AsyncStorage.getItem(`konta.analysis.sections.v3.${userId}`).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Array<{ key: AnalysisSectionKey; visible: boolean }>;
        const valid = parsed
          .filter((item) => ANALYSIS_SECTION_DEFAULTS.some((base) => base.key === item.key))
          .map((item) => {
            const base = ANALYSIS_SECTION_DEFAULTS.find((candidate) => candidate.key === item.key)!;
            return { key: item.key, visible: item.visible, configurable: base.configurable };
          });
        const missing = ANALYSIS_SECTION_DEFAULTS.filter((base) => !valid.some((item) => item.key === base.key));
        setAnalysisSections([...valid, ...missing]);
      } catch (error) {
        console.log('No se pudo cargar el orden de analisis:', error);
      }
    });
  }, [user]);

  useEffect(() => {
    const userId = (user as any)?.uid;
    if (!userId) return;
    AsyncStorage.setItem(`konta.analysis.sections.v3.${userId}`, JSON.stringify(analysisSections)).catch(() => undefined);
  }, [analysisSections, user]);

  const toggleAnalysisFavorite = async (key: AnalysisFavoriteKey, title: string, subtitle: string) => {
    const userId = (user as any)?.uid;
    if (!userId) return;

    const nextKeys = favoriteKeys.includes(key)
      ? favoriteKeys.filter((item) => item !== key)
      : [...favoriteKeys, key];
    setFavoriteKeys(nextKeys);

    try {
      const titles: Record<AnalysisFavoriteKey, { title: string; subtitle: string }> = {
        'analysis-overview': { title: 'Resumen financiero', subtitle: 'Balance e indicadores principales' },
        'analysis-insights': { title: 'Lecturas rápidas', subtitle: 'Hábitos y calidad de registro' },
        'analysis-activity': { title: 'Actividad rápida', subtitle: 'Grupos y acciones más usados' },
        'analysis-budgets': { title: 'Presupuestos del mes', subtitle: 'Avance frente al límite' },
        'analysis-trend': { title: 'Balance acumulado', subtitle: 'Evolución del balance' },
        'analysis-flow': { title: 'Flujo diario', subtitle: 'Ingresos y egresos por día' },
        'analysis-categories': { title: 'Categorías de gasto', subtitle: 'Distribución por categoría' },
      };
      const analysisFavorites = nextKeys.map((favoriteKey) => ({
        key: favoriteKey,
        title: titles[favoriteKey]?.title || title,
        subtitle: titles[favoriteKey]?.subtitle || subtitle,
      }));
      await AsyncStorage.setItem(`konta.historial.favoriteCharts.${userId}`, JSON.stringify(analysisFavorites));
    } catch (error) {
      console.log('No se pudo guardar favorita de analisis:', error);
    }
  };

  useEffect(() => {
    const userId = (user as any)?.uid;
    if (!userId) {
      setBudgets([]);
      return;
    }

    const budgetsRef = collection(db, `users/${userId}/presupuestosPersonalizados`);
    const unsubscribe = onSnapshot(budgetsRef, (snapshot) => {
      setBudgets(snapshot.docs.map((budgetDoc) => ({ id: budgetDoc.id, ...budgetDoc.data() })));
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const userId = (user as any)?.uid;
    if (!userId) {
      setSavingsGoals([]);
      return;
    }

    const savingsRef = collection(db, `users/${userId}/ahorros`);
    const unsubscribe = onSnapshot(savingsRef, (snapshot) => {
      setSavingsGoals(snapshot.docs.map((goalDoc) => ({ id: goalDoc.id, ...goalDoc.data() })));
    });
    return () => unsubscribe();
  }, [user]);

  const analysis = useMemo(() => {
    const now = new Date();
    const since = period === '7d'
      ? subDays(now, 7)
      : period === '30d'
        ? subDays(now, 30)
        : period === '12m'
          ? subYears(now, 1)
          : period === 'week'
            ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
            : period === 'month'
              ? new Date(now.getFullYear(), now.getMonth(), 1)
              : period === 'year'
                ? new Date(now.getFullYear(), 0, 1)
          : null;

    const visible = transactions
      .map((transaction) => ({
        ...transaction,
        date: toDate(transaction.date || transaction.fecha),
        monto: amountOf(transaction.monto),
      }))
      .filter((transaction) => !since || transaction.date >= since)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    let ingresos = 0;
    let egresos = 0;
    let movimientos = 0;
    let largestExpense: Transaction | null = null;
    const daily = new Map<string, { date: Date; ingresos: number; egresos: number }>();
    const categories = new Map<string, number>();
    const groups = new Map<string, { count: number; total: number }>();
    const presets = new Map<string, number>();
    const currentMonthCategories = new Map<string, number>();
    const monthly = new Map<string, { date: Date; ingresos: number; egresos: number; categories: Map<string, number> }>();
    const weekdays = [0, 0, 0, 0, 0, 0, 0];
    let unclassifiedExpenses = 0;
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const addExpenseCategories = (transaction: Transaction, target: Map<string, number>) => {
      if (transaction.origen === 'transferencia-ahorro' || transaction.origen === 'retiro-ahorro') {
        target.set('Ahorro', (target.get('Ahorro') || 0) + amountOf(transaction.monto));
        return;
      }

      const groupCategories = getGroupCategoryTotals(transaction);
      if (groupCategories.length > 0) {
        groupCategories.forEach(([category, value]) => target.set(category, (target.get(category) || 0) + value));
        return;
      }

      const category = transaction.presupuestoCategoria || transaction.descripcion || 'Sin categoría';
      target.set(category, (target.get(category) || 0) + amountOf(transaction.monto));
    };

    visible.forEach((transaction) => {
      const amount = amountOf(transaction.monto);
      const isIncome = transaction.tipo === 'ingreso';
      movimientos += 1;
      if (isIncome) ingresos += amount;
      else {
        egresos += amount;
        if (!largestExpense || amount > amountOf(largestExpense.monto)) largestExpense = transaction;
      }

      const dayKey = format(transaction.date, 'yyyy-MM-dd');
      const day = daily.get(dayKey) || { date: transaction.date, ingresos: 0, egresos: 0 };
      if (isIncome) day.ingresos += amount;
      else day.egresos += amount;
      daily.set(dayKey, day);
      if (!isIncome) weekdays[transaction.date.getDay()] += amount;

      const monthKey = format(transaction.date, 'yyyy-MM');
      const month = monthly.get(monthKey) || {
        date: new Date(transaction.date.getFullYear(), transaction.date.getMonth(), 1),
        ingresos: 0,
        egresos: 0,
        categories: new Map<string, number>(),
      };
      if (isIncome) month.ingresos += amount;
      else {
        month.egresos += amount;
        getExpenseCategoryTotals(transaction).forEach(([category, value]) => {
          month.categories.set(category, (month.categories.get(category) || 0) + value);
        });
      }
      monthly.set(monthKey, month);

      if (transaction.groupItems?.length) {
        const groupName = transaction.descripcion || 'Grupo sin nombre';
        const group = groups.get(groupName) || { count: 0, total: 0 };
        group.count += 1;
        group.total += amount;
        groups.set(groupName, group);
      }

      if (transaction.preestablecidoMainNombre) {
        const presetName = transaction.preestablecidoMainNombre;
        presets.set(presetName, (presets.get(presetName) || 0) + 1);
      }

      if (!isIncome) {
        addExpenseCategories(transaction, categories);
        if (!transaction.presupuestoCategoria && !transaction.origen?.includes('ahorro') && getGroupCategoryTotals(transaction).length === 0) unclassifiedExpenses += 1;
      }
    });

    transactions
      .map((transaction) => ({
        ...transaction,
        date: toDate(transaction.date || transaction.fecha),
        monto: amountOf(transaction.monto),
      }))
      .filter((transaction) => transaction.date >= currentMonthStart && transaction.date <= now && transaction.tipo !== 'ingreso')
      .forEach((transaction) => addExpenseCategories(transaction, currentMonthCategories));

    const dailyRows = Array.from(daily.values());
    let running = 0;
    const trend = dailyRows.map((day, index) => {
      running += day.ingresos - day.egresos;
      return {
        value: Number(running.toFixed(2)),
        label: index % Math.max(1, Math.ceil(dailyRows.length / 6)) === 0 ? format(day.date, 'dd/MM') : '',
      };
    });

    const categoryRows = Array.from(categories.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label, value: Number(value.toFixed(2)) }));

    const dayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const weekdayRows = weekdays.map((value, index) => ({ label: dayLabels[index], value: Number(value.toFixed(2)) }));

    const flowRows = dailyRows.slice(-14).map((day) => ({
      label: format(day.date, 'dd/MM'),
      ingresos: Number(day.ingresos.toFixed(2)),
      egresos: Number(day.egresos.toFixed(2)),
    }));

    const groupRows = Array.from(groups.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5)
      .map(([label, value]) => ({ label, count: value.count, total: Number(value.total.toFixed(2)) }));

    const presetRows = Array.from(presets.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count }));

    const topWeekdayIndex = weekdays.reduce((best, value, index) => value > weekdays[best] ? index : best, 0);

    const budgetLimits = new Map<string, number>();
    budgets.forEach((budget) => {
      const limit = amountOf(budget.limite || budget.monto || budget.valor);
      if (budget.categoria && limit > 0) budgetLimits.set(budget.categoria, limit);
    });

    const monthlyRows = Array.from(monthly.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((month) => {
        let exceededCount = 0;
        month.categories.forEach((value, category) => {
          if (budgetLimits.has(category) && value > (budgetLimits.get(category) || 0)) exceededCount += 1;
        });

        return {
          label: format(month.date, 'MMM yy'),
          ingresos: Number(month.ingresos.toFixed(2)),
          egresos: Number(month.egresos.toFixed(2)),
          neto: Number((month.ingresos - month.egresos).toFixed(2)),
          exceededCount,
        };
      });

    const historicalCategories = new Map<string, number>();
    let historicalIngresos = 0;
    let historicalEgresos = 0;
    transactions.forEach((transaction) => {
      const normalized = {
        ...transaction,
        monto: amountOf(transaction.monto),
        date: toDate(transaction.date || transaction.fecha),
      };
      if (normalized.tipo === 'ingreso') historicalIngresos += normalized.monto;
      else {
        historicalEgresos += normalized.monto;
        getExpenseCategoryTotals(normalized).forEach(([category, value]) => historicalCategories.set(category, (historicalCategories.get(category) || 0) + value));
      }
    });

    return {
      visible,
      ingresos,
      egresos,
      neto: ingresos - egresos,
      movimientos,
      average: movimientos > 0 ? (ingresos + egresos) / movimientos : 0,
      largestExpense,
      trend,
      categoryRows,
      categoryTotals: Array.from(categories.entries()).map(([label, value]) => ({ label, value })),
      currentMonthCategoryTotals: Array.from(currentMonthCategories.entries()).map(([label, value]) => ({ label, value })),
      weekdayRows,
      flowRows,
      groupRows,
      presetRows,
      monthlyRows,
      historicalCategories: Array.from(historicalCategories.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value })),
      historicalIngresos,
      historicalEgresos,
      topExpenses: visible.filter((transaction) => transaction.tipo !== 'ingreso').sort((a, b) => b.monto - a.monto).slice(0, 4),
      topIncomes: visible.filter((transaction) => transaction.tipo === 'ingreso').sort((a, b) => b.monto - a.monto).slice(0, 4),
      topWeekday: dayLabels[topWeekdayIndex],
      topWeekdayAmount: Number(weekdays[topWeekdayIndex].toFixed(2)),
      unclassifiedExpenses,
      incomePercent: ingresos + egresos > 0 ? ingresos / (ingresos + egresos) * 100 : 0,
      expensePercent: ingresos + egresos > 0 ? egresos / (ingresos + egresos) * 100 : 0,
    };
  }, [transactions, period, budgets]);

  const budgetRows = useMemo(() => budgets
    .map((budget) => {
      const limit = amountOf(budget.limite || budget.monto || budget.valor);
      const spent = amountOf(analysis.currentMonthCategoryTotals.find((item) => item.label === budget.categoria)?.value);
      return {
        label: budget.categoria || 'Sin categoría',
        limit,
        spent,
        percent: limit > 0 ? (spent / limit) * 100 : 0,
      };
    })
    .filter((budget) => budget.limit > 0)
    .sort((a, b) => b.percent - a.percent), [budgets, analysis.currentMonthCategoryTotals]);

  const savingsInsights = useMemo(() => {
    const goalRows = savingsGoals
      .filter((goal) => amountOf(goal.meta) > 0)
      .map((goal) => ({
        label: goal.nombre || 'Meta',
        current: amountOf(goal.cantidadActual),
        target: amountOf(goal.meta),
        progress: Math.min(100, amountOf(goal.cantidadActual) / Math.max(1, amountOf(goal.meta)) * 100),
      }))
      .sort((a, b) => b.progress - a.progress);
    const contributions = transactions
      .filter((transaction) => transaction.origen === 'transferencia-ahorro')
      .reduce((sum, transaction) => sum + amountOf(transaction.monto), 0);
    const withdrawals = transactions
      .filter((transaction) => transaction.origen === 'retiro-ahorro')
      .reduce((sum, transaction) => sum + amountOf(transaction.monto), 0);

    return {
      goalRows,
      contributions,
      withdrawals,
      net: contributions - withdrawals,
      completed: savingsGoals.filter((goal) => amountOf(goal.meta) > 0 && amountOf(goal.cantidadActual) >= amountOf(goal.meta)).length,
    };
  }, [savingsGoals, transactions]);

  const showLongPeriodInsights = period === '12m' || period === 'all' || period === 'year' || period === 'month';
  const monthsWithBudgetOverruns = analysis.monthlyRows.filter((month) => month.exceededCount > 0).length;
  const highestExpenseMonth = [...analysis.monthlyRows].sort((a, b) => b.egresos - a.egresos)[0] || null;

  const periodOptions: Array<{ key: PeriodKey; label: string }> = [
    { key: '7d', label: '7 días' },
    { key: '30d', label: '30 días' },
    { key: '12m', label: '12 meses' },
    { key: 'all', label: 'Todo' },
  ];

  const handlePeriodPress = (key: PeriodKey) => {
    const now = Date.now();
    const previousTap = lastPeriodTapRef.current;
    const isDoubleTap = previousTap?.key === key && now - previousTap.time < 350;

    if (isDoubleTap) {
      const calendarPeriod = key === '7d' ? 'week' : key === '30d' ? 'month' : key === '12m' ? 'year': null;
      if (calendarPeriod) setPeriod(calendarPeriod);
      lastPeriodTapRef.current = null;
      return;
    }

    setPeriod(key);
    lastPeriodTapRef.current = { key, time: now };
  };

  const isPeriodOptionActive = (key: PeriodKey) => (
    period === key
      || (key === '7d' && period === 'week')
      || (key === '30d' && period === 'month')
      || (key === '12m' && period === 'year')
  );

  const periodOptionLabel = (key: PeriodKey, fallback: string) => {
    if (key === '7d' && period === 'week') return 'Esta semana';
    if (key === '30d' && period === 'month') return 'Este mes';
    if (key === '12m' && period === 'year') return 'Este año';
    return fallback;
  };

  const cardStyle = {
    backgroundColor: cardColor,
    borderColor,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  } as const;
  const categoryColors = ['#22c55e', '#06b6d4', '#f59e0b', '#fb7185', '#a78bfa', '#38bdf8'];
  const largestExpense = analysis.largestExpense as Transaction | null;
  const favoriteButton = (key: AnalysisFavoriteKey, title: string, subtitle: string) => (
    <TouchableOpacity onPress={() => toggleAnalysisFavorite(key, title, subtitle)} style={{ padding: 5 }} accessibilityLabel={favoriteKeys.includes(key) ? 'Quitar de favoritos' : 'Agregar a favoritos'}>
      <Ionicons name={favoriteKeys.includes(key) ? 'star' : 'star-outline'} size={19} color={favoriteKeys.includes(key) ? '#fbbf24' : mutedColor} />
    </TouchableOpacity>
  );

  const sectionLabels: Record<AnalysisSectionKey, string> = {
    summary: 'Resumen financiero',
    metrics: 'Indicadores del periodo',
    insights: 'Lecturas rápidas',
    activity: 'Actividad rápida',
    budgets: 'Presupuestos del mes',
    trend: 'Balance acumulado',
    cashflow: 'Ingresos y egresos',
    categories: 'Categorías de gasto',
    weekday: 'Actividad por día',
    monthlyInsights: 'Lo que revela tu año',
    largestExpense: 'Mayor gasto/ingreso',
    'savings-evolution': 'Evolución del ahorro',
  };

  const isSectionVisible = (key: AnalysisSectionKey) => analysisSections.find((section) => section.key === key)?.visible !== false;
  const isReorderableSection = (_key: AnalysisSectionKey) => true;

  const renderAdditionalSection = (key: AnalysisSectionKey) => {
    if (key === 'savings-evolution') {
      return (
        <View style={cardStyle}>
          <ThemedText style={{ color: textColor, fontSize: 16, fontWeight: '800' }}>Evolución del ahorro</ThemedText>
          <ThemedText style={{ color: mutedColor, fontSize: 12, marginTop: 3 }}>Lo que has enviado, retirado y construido en tus metas.</ThemedText>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <View style={{ flex: 1, backgroundColor: `${primaryColor}12`, borderRadius: 12, padding: 10 }}><ThemedText style={{ color: mutedColor, fontSize: 10 }}>Aportado</ThemedText><ThemedText style={{ color: '#34d399', fontSize: 18, fontWeight: '800', marginTop: 4 }}>{currency(savingsInsights.contributions)}</ThemedText></View>
            <View style={{ flex: 1, backgroundColor: `${primaryColor}12`, borderRadius: 12, padding: 10 }}><ThemedText style={{ color: mutedColor, fontSize: 10 }}>Metas completas</ThemedText><ThemedText style={{ color: textColor, fontSize: 18, fontWeight: '800', marginTop: 4 }}>{savingsInsights.completed}</ThemedText></View>
          </View>
          {savingsInsights.goalRows.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}><BarChart data={savingsInsights.goalRows.slice(0, 6).map((goal) => ({ label: goal.label.length > 8 ? `${goal.label.slice(0, 8)}…` : goal.label, value: Number(goal.progress.toFixed(1)), frontColor: primaryColor }))} width={Math.max(chartWidth, savingsInsights.goalRows.length * 62)} barWidth={24} spacing={24} roundedTop hideRules yAxisThickness={0} xAxisThickness={0} maxValue={100} xAxisLabelTextStyle={{ color: mutedColor, fontSize: 9 }} yAxisTextStyle={{ color: mutedColor, fontSize: 9 }} /></ScrollView>}
        </View>
      );
    }

    return null;
  };


  const handleOpenOrderCustomization = () => {
      if (subscriptionActive) {
        setShowSectionOrderModal(true);
        return;
      }
  
      Alert.alert(
        'Función Premium',
        'Personalizar el orden de Análisis está disponible con suscripción activa.',
        [
          { text: 'Ahora no', style: 'cancel' },
          {
            text: 'Ver suscripción',
            onPress: () => router.push({ pathname: '/(screens)/Settings', params: { openSubscription: '1' } }),
          },
        ],
      );
    };
    
  const toggleAnalysisSection = (key: AnalysisSectionKey) => {
    setAnalysisSections((current) => current.map((section) => section.key === key && section.configurable ? { ...section, visible: !section.visible } : section));
  };

  const moveAnalysisSection = (index: number, direction: -1 | 1) => {
    setAnalysisSections((current) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.length || !isReorderableSection(current[index].key) || !isReorderableSection(current[targetIndex].key)) return current;
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <View>
            <ThemedText style={{ fontSize: 26, fontWeight: '800' }}>Análisis</ThemedText>
            <ThemedText style={{ color: mutedColor, fontSize: 12, marginTop: 3 }}>Tus decisiones financieras, más claras.</ThemedText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity onPress={handleOpenOrderCustomization} style={{ padding: 8 }} accessibilityLabel="Personalizar secciones de análisis">
              <Ionicons name="options-outline" size={24} color={textColor} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }} accessibilityLabel="Cerrar análisis">
              <Ionicons name="close-outline" size={28} color={textColor} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
          {periodOptions.map((option) => (
            <TouchableOpacity
              key={option.key}
              onPress={() => handlePeriodPress(option.key)}
              style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 12, backgroundColor: isPeriodOptionActive(option.key) ? primaryColor : progressColor, borderWidth: 1, borderColor: isPeriodOptionActive(option.key) ? primaryColor : borderColor }}
            >
              <ThemedText style={{ color: isPeriodOptionActive(option.key) ? '#fff' : textColor, fontSize: 12, fontWeight: '700' }}>{periodOptionLabel(option.key, option.label)}</ThemedText>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {isSectionVisible('summary') && <View style={{ ...cardStyle, backgroundColor: primaryColor }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <ThemedText style={{ color: '#dcfce7', fontSize: 12, fontWeight: '700' }}>Balance del periodo</ThemedText>
            {favoriteButton('analysis-overview', 'Resumen financiero', 'Balance e indicadores principales')}
          </View>
          <ThemedText style={{ color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 5 }}>{currency(analysis.neto, 2)}</ThemedText>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 12, padding: 10 }}>
              <ThemedText style={{ color: '#bbf7d0', fontSize: 11 }}>Ingresos</ThemedText>
              <ThemedText style={{ color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 4 }}>{currency(analysis.ingresos)}</ThemedText>
            </View>
            <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 12, padding: 10 }}>
              <ThemedText style={{ color: '#fecaca', fontSize: 11 }}>Egresos</ThemedText>
              <ThemedText style={{ color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 4 }}>{currency(analysis.egresos)}</ThemedText>
            </View>
          </View>
        </View>}

        {isSectionVisible('metrics') && <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ ...cardStyle, flex: 1 }}>
            <ThemedText style={{ color: mutedColor, fontSize: 11 }}>Movimientos</ThemedText>
            <ThemedText style={{ color: textColor, fontSize: 21, fontWeight: '800', marginTop: 5 }}>{analysis.movimientos}</ThemedText>
          </View>
          <View style={{ ...cardStyle, flex: 1 }}>
            <ThemedText style={{ color: mutedColor, fontSize: 11 }}>Promedio</ThemedText>
            <ThemedText style={{ color: textColor, fontSize: 21, fontWeight: '800', marginTop: 5 }}>{currency(analysis.average)}</ThemedText>
          </View>
        </View>}

        {isSectionVisible('monthlyInsights') && showLongPeriodInsights && analysis.monthlyRows.length > 0 && (
          <View style={cardStyle}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <ThemedText style={{ color: textColor, fontSize: 16, fontWeight: '800' }}>Lo que revela tu año</ThemedText>
              {favoriteButton('analysis-overview', 'Resumen financiero', 'Patrones de todo el periodo')}
            </View>
            <ThemedText style={{ color: mutedColor, fontSize: 12, marginTop: 3 }}>Patrones que aparecen cuando miras más allá de un solo mes.</ThemedText>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <View style={{ flex: 1, backgroundColor: `${primaryColor}12`, borderRadius: 12, padding: 10 }}>
                <ThemedText style={{ color: mutedColor, fontSize: 10 }}>Meses sobre presupuesto</ThemedText>
                <ThemedText style={{ color: monthsWithBudgetOverruns > 0 ? '#fb7185' : '#34d399', fontSize: 21, fontWeight: '800', marginTop: 4 }}>{monthsWithBudgetOverruns}</ThemedText>
              </View>
              <View style={{ flex: 1, backgroundColor: `${primaryColor}12`, borderRadius: 12, padding: 10 }}>
                <ThemedText style={{ color: mutedColor, fontSize: 10 }}>Mes con más gasto</ThemedText>
                <ThemedText style={{ color: textColor, fontSize: 17, fontWeight: '800', marginTop: 5 }}>{highestExpenseMonth?.label || '—'}</ThemedText>
                <ThemedText style={{ color: mutedColor, fontSize: 10, marginTop: 2 }}>{highestExpenseMonth ? currency(highestExpenseMonth.egresos) : 'Sin datos'}</ThemedText>
              </View>
            </View>
            <View style={{ marginTop: 14 }}>
              {analysis.monthlyRows.slice(-12).map((month) => {
                const maxFlow = Math.max(month.ingresos, month.egresos, 1);
                return (
                  <View key={month.label} style={{ marginBottom: 11 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <ThemedText style={{ color: textColor, fontSize: 11, fontWeight: '700' }}>{month.label}</ThemedText>
                      <ThemedText style={{ color: month.neto >= 0 ? '#34d399' : '#fb7185', fontSize: 11, fontWeight: '700' }}>
                        {month.neto >= 0 ? '+' : ''}{currency(month.neto)}{month.exceededCount > 0 ? ` · ${month.exceededCount} excedido${month.exceededCount > 1 ? 's' : ''}` : ''}
                      </ThemedText>
                    </View>
                    <View style={{ height: 7, borderRadius: 8, backgroundColor: progressColor, overflow: 'hidden' }}>
                      <View style={{ height: 7, width: `${Math.max(2, (month.egresos / maxFlow) * 100)}%`, backgroundColor: month.exceededCount > 0 ? '#fb7185' : '#f59e0b', borderRadius: 8 }} />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {isSectionVisible('insights') && <View style={cardStyle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <ThemedText style={{ color: textColor, fontSize: 16, fontWeight: '800' }}>Lecturas rápidas</ThemedText>
            {favoriteButton('analysis-insights', 'Lecturas rápidas', 'Hábitos y calidad de registro')}
          </View>
          <ThemedText style={{ color: mutedColor, fontSize: 12, marginTop: 3 }}>Señales útiles a partir de tus movimientos.</ThemedText>
          <View style={{ marginTop: 14, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="calendar-outline" size={20} color={primaryColor} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <ThemedText style={{ color: textColor, fontSize: 12, fontWeight: '700' }}>Día con más gasto</ThemedText>
                <ThemedText style={{ color: mutedColor, fontSize: 12, marginTop: 2 }}>{analysis.movimientos > 0 ? `${analysis.topWeekday} · ${currency(analysis.topWeekdayAmount, 2)}` : 'Sin movimientos todavía'}</ThemedText>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="pricetag-outline" size={20} color="#f59e0b" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <ThemedText style={{ color: textColor, fontSize: 12, fontWeight: '700' }}>Categoría principal</ThemedText>
                <ThemedText style={{ color: mutedColor, fontSize: 12, marginTop: 2 }}>{analysis.categoryRows[0] ? `${analysis.categoryRows[0].label} · ${currency(analysis.categoryRows[0].value, 2)}` : 'Sin egresos categorizados'}</ThemedText>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="alert-circle-outline" size={20} color={analysis.unclassifiedExpenses > 0 ? '#fb7185' : '#34d399'} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <ThemedText style={{ color: textColor, fontSize: 12, fontWeight: '700' }}>Calidad de registro</ThemedText>
                <ThemedText style={{ color: mutedColor, fontSize: 12, marginTop: 2 }}>{analysis.unclassifiedExpenses > 0 ? `${analysis.unclassifiedExpenses} egresos sin presupuesto` : 'Tus egresos están categorizados'}</ThemedText>
              </View>
            </View>
          </View>
        </View>}

        {isSectionVisible('activity') && (analysis.groupRows.length > 0 || analysis.presetRows.length > 0) && (
          <View style={cardStyle}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <ThemedText style={{ color: textColor, fontSize: 16, fontWeight: '800' }}>Actividad rápida</ThemedText>
              {favoriteButton('analysis-activity', 'Actividad rápida', 'Grupos y acciones más usados')}
            </View>
            <ThemedText style={{ color: mutedColor, fontSize: 12, marginTop: 3 }}>Qué grupos y acciones usaste más.</ThemedText>
            {analysis.groupRows.length > 0 && (
              <View style={{ marginTop: 14 }}>
                <ThemedText style={{ color: primaryColor, fontSize: 11, fontWeight: '800', marginBottom: 8 }}>Grupos</ThemedText>
                {analysis.groupRows.map((item) => (
                  <View key={item.label} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <ThemedText style={{ color: textColor, fontSize: 12, flex: 1 }} numberOfLines={1}>{item.label}</ThemedText>
                    <ThemedText style={{ color: mutedColor, fontSize: 12 }}>{item.count} usos · {currency(item.total)}</ThemedText>
                  </View>
                ))}
              </View>
            )}
            {analysis.presetRows.length > 0 && (
              <View style={{ marginTop: 6 }}>
                <ThemedText style={{ color: '#06b6d4', fontSize: 11, fontWeight: '800', marginBottom: 8 }}>Acciones de grupo</ThemedText>
                {analysis.presetRows.map((item) => (
                  <View key={item.label} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <ThemedText style={{ color: textColor, fontSize: 12, flex: 1 }} numberOfLines={1}>{item.label}</ThemedText>
                    <ThemedText style={{ color: mutedColor, fontSize: 12 }}>{item.count} usos</ThemedText>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {isSectionVisible('budgets') && budgetRows.length > 0 && (
          <View style={cardStyle}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <ThemedText style={{ color: textColor, fontSize: 16, fontWeight: '800' }}>Presupuestos del mes actual</ThemedText>
              {favoriteButton('analysis-budgets', 'Presupuestos del mes', 'Avance frente al límite')}
            </View>
            <ThemedText style={{ color: mutedColor, fontSize: 12, marginTop: 3 }}>Desde el primer día del mes hasta hoy.</ThemedText>
            {budgetRows.slice(0, 5).map((budget) => {
              const progress = Math.min(budget.percent, 100);
              const color = budget.percent >= 100 ? '#fb7185' : budget.percent >= 80 ? '#f59e0b' : '#34d399';
              return (
                <View key={budget.label} style={{ marginTop: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                    <ThemedText style={{ color: textColor, fontSize: 12, flex: 1 }} numberOfLines={1}>{budget.label}</ThemedText>
                    <ThemedText style={{ color, fontSize: 12, fontWeight: '700' }}>{budget.percent.toFixed(0)}% · {currency(budget.spent)} / {currency(budget.limit)}</ThemedText>
                  </View>
                  <View style={{ height: 8, borderRadius: 8, backgroundColor: progressColor, overflow: 'hidden' }}>
                    <View style={{ height: 8, width: `${Math.max(progress, budget.spent > 0 ? 2 : 0)}%`, borderRadius: 8, backgroundColor: color }} />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {isSectionVisible('trend') && <View style={cardStyle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <ThemedText style={{ color: textColor, fontSize: 16, fontWeight: '800' }}>Balance acumulado</ThemedText>
            {favoriteButton('analysis-trend', 'Balance acumulado', 'Evolución del balance')}
          </View>
          <ThemedText style={{ color: mutedColor, fontSize: 12, marginTop: 3 }}>Cómo evolucionó tu saldo durante el periodo.</ThemedText>
          {analysis.trend.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
              <LineChart data={analysis.trend} width={Math.max(chartWidth, analysis.trend.length * 42)} height={210} color={primaryColor} thickness={2} areaChart curved startFillColor={primaryColor} endFillColor={`${primaryColor}00`} yAxisThickness={0} xAxisColor={borderColor} yAxisColor={borderColor} xAxisLabelTextStyle={{ color: mutedColor, fontSize: 10 }} yAxisTextStyle={{ color: mutedColor, fontSize: 10 }} noOfSections={4} />
            </ScrollView>
          ) : (
            <ThemedText style={{ color: mutedColor, marginTop: 18 }}>Se necesitan al menos dos días con movimientos.</ThemedText>
          )}
        </View>}

        {isSectionVisible('cashflow') && <View style={cardStyle}>
          <ThemedText style={{ color: textColor, fontSize: 16, fontWeight: '800' }}>Ingresos y egresos</ThemedText>
          <ThemedText style={{ color: mutedColor, fontSize: 12, marginTop: 3 }}>Proporción del flujo total.</ThemedText>
          {analysis.ingresos + analysis.egresos > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
              <PieChart data={[{ value: analysis.ingresos, color: '#34d399' }, { value: analysis.egresos, color: '#fb7185' }]} donut radius={76} innerRadius={45} centerLabelComponent={() => <ThemedText style={{ color: textColor, fontSize: 13, fontWeight: '800' }}>{currency(analysis.ingresos + analysis.egresos)}</ThemedText>} />
              <View style={{ flex: 1, marginLeft: 18, gap: 12 }}>
                <View><ThemedText style={{ color: '#34d399', fontWeight: '800' }}>Ingresos {analysis.incomePercent.toFixed(0)}%</ThemedText><ThemedText style={{ color: mutedColor, fontSize: 12, marginTop: 2 }}>{currency(analysis.ingresos, 2)}</ThemedText></View>
                <View><ThemedText style={{ color: '#fb7185', fontWeight: '800' }}>Egresos {analysis.expensePercent.toFixed(0)}%</ThemedText><ThemedText style={{ color: mutedColor, fontSize: 12, marginTop: 2 }}>{currency(analysis.egresos, 2)}</ThemedText></View>
              </View>
            </View>
          ) : <ThemedText style={{ color: mutedColor, marginTop: 18 }}>No hay flujo para este periodo.</ThemedText>}
        </View>}

        {isSectionVisible('categories') && <View style={cardStyle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <ThemedText style={{ color: textColor, fontSize: 16, fontWeight: '800' }}>Dónde se va tu dinero</ThemedText>
            {favoriteButton('analysis-categories', 'Categorías de gasto', 'Distribución por categoría')}
          </View>
          <ThemedText style={{ color: mutedColor, fontSize: 12, marginTop: 3 }}>Categorías ordenadas por gasto.</ThemedText>
          {analysis.categoryRows.length > 0 ? analysis.categoryRows.map((item, index) => {
            const share = analysis.egresos > 0 ? item.value / analysis.egresos : 0;
            return (
              <View key={item.label} style={{ marginTop: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                  <ThemedText style={{ color: textColor, fontSize: 12, flex: 1 }} numberOfLines={1}>{item.label}</ThemedText>
                  <ThemedText style={{ color: mutedColor, fontSize: 12 }}>{(share * 100).toFixed(0)}% · {currency(item.value, 2)}</ThemedText>
                </View>
                <View style={{ height: 8, borderRadius: 8, backgroundColor: progressColor, overflow: 'hidden' }}><View style={{ height: 8, width: `${Math.max(share * 100, 2)}%`, backgroundColor: categoryColors[index], borderRadius: 8 }} /></View>
              </View>
            );
          }) : <ThemedText style={{ color: mutedColor, marginTop: 18 }}>No hay categorías de gasto en este periodo.</ThemedText>}
        </View>}

        {isSectionVisible('categories') && <View style={{ ...cardStyle, alignItems: 'center' }}>
          <View style={{ width: '100%' }}>
            <ThemedText style={{ color: textColor, fontSize: 16, fontWeight: '800' }}>Distribución de categorías</ThemedText>
            <ThemedText style={{ color: mutedColor, fontSize: 12, marginTop: 3 }}>La misma distribución, vista como proporciones.</ThemedText>
          </View>
          {analysis.categoryRows.length > 0 ? (
            <PieChart
              data={analysis.categoryRows.map((item, index) => ({
                value: item.value,
                color: categoryColors[index],
                text: item.label.length > 10 ? `${item.label.slice(0, 10)}…` : item.label,
                textColor,
                textSize: 10,
              }))}
              radius={102}
              showText
              textBackgroundColor="transparent"
              focusOnPress
            />
          ) : (
            <ThemedText style={{ color: mutedColor, marginTop: 18 }}>No hay categorías de gasto para mostrar.</ThemedText>
          )}
        </View>}

        {isSectionVisible('weekday') && <View style={cardStyle}>
          <ThemedText style={{ color: textColor, fontSize: 16, fontWeight: '800' }}>Actividad por día</ThemedText>
          <ThemedText style={{ color: mutedColor, fontSize: 12, marginTop: 3 }}>Qué días concentran más gasto.</ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
            <BarChart data={analysis.weekdayRows} width={Math.max(chartWidth, 7 * 48)} barWidth={22} spacing={22} roundedTop hideRules yAxisThickness={0} xAxisThickness={0} xAxisLabelTextStyle={{ color: mutedColor, fontSize: 10 }} yAxisTextStyle={{ color: mutedColor, fontSize: 9 }} frontColor={primaryColor} />
          </ScrollView>
        </View>}

        {isSectionVisible('cashflow') && <View style={cardStyle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <ThemedText style={{ color: textColor, fontSize: 16, fontWeight: '800' }}>Flujo diario</ThemedText>
            {favoriteButton('analysis-flow', 'Flujo diario', 'Ingresos y egresos por día')}
          </View>
          <ThemedText style={{ color: mutedColor, fontSize: 12, marginTop: 3 }}>Comparación de ingresos y egresos recientes.</ThemedText>
          {analysis.flowRows.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
              <View style={{ width: Math.max(chartWidth, analysis.flowRows.length * 48) }}>
                <ThemedText style={{ color: '#34d399', fontSize: 11, fontWeight: '700', marginBottom: 2 }}>Ingresos</ThemedText>
                <BarChart data={analysis.flowRows.map((item) => ({ label: item.label, value: item.ingresos, frontColor: '#34d399' }))} width={Math.max(chartWidth, analysis.flowRows.length * 48)} barWidth={14} spacing={18} roundedTop hideRules yAxisThickness={0} xAxisThickness={0} xAxisLabelTextStyle={{ color: mutedColor, fontSize: 9 }} yAxisTextStyle={{ color: mutedColor, fontSize: 9 }} />
                <ThemedText style={{ color: '#fb7185', fontSize: 11, fontWeight: '700', marginTop: 12, marginBottom: 2 }}>Egresos</ThemedText>
                <BarChart data={analysis.flowRows.map((item) => ({ label: item.label, value: item.egresos, frontColor: '#fb7185' }))} width={Math.max(chartWidth, analysis.flowRows.length * 48)} barWidth={14} spacing={18} roundedTop hideRules yAxisThickness={0} xAxisThickness={0} xAxisLabelTextStyle={{ color: mutedColor, fontSize: 9 }} yAxisTextStyle={{ color: mutedColor, fontSize: 9 }} />
              </View>
            </ScrollView>
          ) : <ThemedText style={{ color: mutedColor, marginTop: 18 }}>No hay movimientos diarios para este periodo.</ThemedText>}
        </View>}

        {isSectionVisible('largestExpense') && (largestExpense || analysis.topIncomes.length > 0) && (
          <View style={{ ...cardStyle, borderColor: largestMovementMode === 'expense' ? '#fb7185' : '#34d399' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <ThemedText style={{ color: largestMovementMode === 'expense' ? '#fb7185' : '#34d399', fontSize: 12, fontWeight: '800' }}>
                Mayor {largestMovementMode === 'expense' ? 'egreso' : 'ingreso'}
              </ThemedText>
              <View style={{ flexDirection: 'row', backgroundColor: progressColor, borderRadius: 999, padding: 3 }}>
                <TouchableOpacity onPress={() => { setLargestMovementMode('expense'); setShowTopMovements(false); }} style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: largestMovementMode === 'expense' ? '#fb7185' : 'transparent' }}>
                  <ThemedText style={{ color: largestMovementMode === 'expense' ? '#fff' : textColor, fontSize: 10, fontWeight: '800' }}>Gastos</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setLargestMovementMode('income'); setShowTopMovements(false); }} style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: largestMovementMode === 'income' ? '#34d399' : 'transparent' }}>
                  <ThemedText style={{ color: largestMovementMode === 'income' ? '#0f172a' : textColor, fontSize: 10, fontWeight: '800' }}>Ingresos</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
            {(() => {
              const topRows = largestMovementMode === 'expense' ? analysis.topExpenses : analysis.topIncomes;
              return topRows.slice(0, showTopMovements ? 4 : 1).map((movement, index) => (
                <View key={movement.id || `${movement.descripcion}-${index}`} style={{ marginTop: index === 0 ? 12 : 9, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <ThemedText style={{ color: textColor, fontSize: index === 0 ? 18 : 12, fontWeight: index === 0 ? '800' : '700' }} numberOfLines={1}>{movement.descripcion || 'Movimiento'}</ThemedText>
                    <ThemedText style={{ color: mutedColor, fontSize: 10, marginTop: 2 }}>{format(toDate(movement.date), 'dd/MM/yyyy')}</ThemedText>
                  </View>
                  <ThemedText style={{ color: largestMovementMode === 'expense' ? '#fb7185' : '#34d399', fontSize: index === 0 ? 16 : 12, fontWeight: '800' }}>{largestMovementMode === 'expense' ? '-' : '+'}{currency(amountOf(movement.monto), 2)}</ThemedText>
                </View>
              ));
            })()}
            {((largestMovementMode === 'expense' ? analysis.topExpenses : analysis.topIncomes).length > 1) && (
              <TouchableOpacity onPress={() => setShowTopMovements((previous) => !previous)} style={{ alignSelf: 'flex-start', marginTop: 12 }}>
                <ThemedText style={{ color: primaryColor, fontSize: 11, fontWeight: '800' }}>{showTopMovements ? 'Ver menos' : 'Ver top 4'}</ThemedText>
              </TouchableOpacity>
            )}
          </View>
        )}

        {analysisSections.filter((section) => section.visible && section.key === 'savings-evolution').map((section) => (
          <View key={section.key}>{renderAdditionalSection(section.key)}</View>
        ))}
      </ScrollView>

      <Modal visible={showSectionOrderModal} transparent animationType="fade" onRequestClose={() => setShowSectionOrderModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxHeight: '80%', backgroundColor: cardColor, borderRadius: 18, padding: 16, borderWidth: 1, borderColor }}>
            <ThemedText style={{ color: textColor, fontSize: 19, fontWeight: '800' }}>Personalizar análisis</ThemedText>
            <ThemedText style={{ color: mutedColor, fontSize: 12, marginTop: 4, marginBottom: 12 }}>Elige qué secciones ver y cambia su orden.</ThemedText>
            <FlatList
              data={analysisSections}
              keyExtractor={(item) => item.key}
              renderItem={({ item, index }) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: `${borderColor}66` }}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ color: textColor, fontSize: 13, fontWeight: '700' }}>{sectionLabels[item.key]}</ThemedText>
                  </View>
                  <Switch value={item.visible} disabled={!item.configurable} onValueChange={() => toggleAnalysisSection(item.key)} trackColor={{ false: '#94a3b8', true: `${primaryColor}88` }} thumbColor={item.visible ? primaryColor : '#f8fafc'} />
                  <TouchableOpacity onPress={() => moveAnalysisSection(index, -1)} disabled={!isReorderableSection(item.key) || index === 0 || !isReorderableSection(analysisSections[index - 1]?.key)} style={{ padding: 6, opacity: !isReorderableSection(item.key) || index === 0 || !isReorderableSection(analysisSections[index - 1]?.key) ? 0.3 : 1 }}><Ionicons name="arrow-up" size={18} color={textColor} /></TouchableOpacity>
                  <TouchableOpacity onPress={() => moveAnalysisSection(index, 1)} disabled={!isReorderableSection(item.key) || index === analysisSections.length - 1 || !isReorderableSection(analysisSections[index + 1]?.key)} style={{ padding: 6, opacity: !isReorderableSection(item.key) || index === analysisSections.length - 1 || !isReorderableSection(analysisSections[index + 1]?.key) ? 0.3 : 1 }}><Ionicons name="arrow-down" size={18} color={textColor} /></TouchableOpacity>
                </View>
              )}
            />
            <TouchableOpacity onPress={() => setShowSectionOrderModal(false)} style={{ backgroundColor: primaryColor, borderRadius: 10, alignItems: 'center', paddingVertical: 11, marginTop: 14 }}><ThemedText style={{ color: '#fff', fontWeight: '800' }}>Listo</ThemedText></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
