import { Ionicons } from '@expo/vector-icons';
import { BottomSheetFlatList, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    BackHandler,
    FlatList,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from '@/hooks/useThemeColor';
import { db } from '../../config/firebase';

type ToolType = 'calendar' | 'months' | 'goal' | 'fifty' | 'emergency' | 'debt' | 'leaks';

interface ToolCard {
  id: ToolType;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface ToolCardConfig {
  key: ToolType;
  visible: boolean;
}

const TOOL_CARDS: ToolCard[] = [
    {
    id: 'calendar',
    title: 'Calendario de pagos',
    subtitle: 'Proximos cargos e ingresos de 30 dias',
    icon: 'calendar-outline',
  },
  {
    id: 'months',
    title: 'Compras a meses',
    subtitle: 'Pago mensual, intereses y total final',
    icon: 'card-outline',
  },
  {
    id: 'goal',
    title: 'Meta de compra',
    subtitle: 'Cuanto ahorrar por mes para llegar a tu meta',
    icon: 'flag-outline',
  },
  {
    id: 'fifty',
    title: 'Regla 50/30/20',
    subtitle: 'Distribución recomendada de tu ingreso',
    icon: 'pie-chart-outline',
  },
  {
    id: 'emergency',
    title: 'Fondo de emergencia',
    subtitle: 'Meta de 3 a 6 meses de gastos y avance actual',
    icon: 'shield-checkmark-outline',
  },
  {
    id: 'debt',
    title: 'Simulador de deudas',
    subtitle: 'Compara bola de nieve vs avalancha',
    icon: 'trending-down-outline',
  },
  {
    id: 'leaks',
    title: 'Gastos hormiga',
    subtitle: 'Detecta gastos pequenos y frecuentes',
    icon: 'water-outline',
  },
];

const TOOL_CARDS_CONFIG_DEFAULT: ToolCardConfig[] = TOOL_CARDS.map((card) => ({
  key: card.id,
  visible: true,
}));

function parseNumber(value: string): number {
  if (!value) return 0;
  const normalized = value.replace(/,/g, '.').replace(/[^0-9.\-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return value.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  });
}

function calculateMonthsPlan(totalPrice: number, downPayment: number, annualRate: number, months: number, paidInstallments: number) {
  const principal = Math.max(totalPrice - downPayment, 0);
  const m = Math.max(Math.floor(months), 1);
  const paid = Math.max(Math.floor(paidInstallments), 0);
  const monthlyRate = Math.max(annualRate, 0) / 100 / 12;

  let monthlyPayment = 0;
  if (principal > 0) {
    if (monthlyRate === 0) {
      monthlyPayment = principal / m;
    } else {
      const factor = Math.pow(1 + monthlyRate, m);
      monthlyPayment = principal * ((monthlyRate * factor) / (factor - 1));
    }
  }

  const totalPaid = monthlyPayment * m;
  const totalInterest = Math.max(totalPaid - principal, 0);

  const safePaid = Math.min(paid, m);
  const paidAmount = monthlyPayment * safePaid;
  const remainingInstallments = Math.max(m - safePaid, 0);

  let remainingBalance = 0;
  if (principal > 0) {
    if (monthlyRate === 0) {
      remainingBalance = Math.max(principal - paidAmount, 0);
    } else {
      const factor = Math.pow(1 + monthlyRate, m);
      const factorPaid = Math.pow(1 + monthlyRate, safePaid);
      remainingBalance = principal * ((factor - factorPaid) / (factor - 1));
    }
  }

  return {
    principal,
    monthlyPayment,
    totalPaid,
    totalInterest,
    paidAmount,
    remainingBalance: Math.max(remainingBalance, 0),
    remainingInstallments,
  };
}

function getDateInMonthByDay(year: number, month: number, day: number) {
  const safeDay = Math.max(Math.floor(day), 1);
  const lastDayInMonth = new Date(year, month + 1, 0).getDate();
  const clampedDay = Math.min(safeDay, lastDayInMonth);
  return new Date(year, month, clampedDay, 12, 0, 0, 0);
}

type InstallmentPurchase = {
  id: string;
  nombre: string;
  totalPrice: number;
  downPayment: number;
  annualRate: number;
  months: number;
  paidInstallments: number;
  periodicBillingEnabled?: boolean;
  billingDay?: number;
  recurrenteGastoId?: string | null;
  createdAt?: any;
  updatedAt?: any;
};

type RecurringRecord = {
  id: string;
  nombre?: string;
  monto?: number;
  diaPago?: number;
  categoria?: string;
  activo?: boolean;
};

type CalendarItem = {
  id: string;
  title: string;
  type: 'egreso' | 'ingreso';
  amount: number;
  date: Date;
  category: string;
  source: 'gasto_recurrente' | 'ingreso_recurrente';
};

type LeakTransaction = {
  id: string;
  monto: number;
  tipo: string;
  date: Date | null;
  categoria?: string;
  descripcion?: string;
  preestablecidoMainNombre?: string;
};

type DebtItem = {
  id: string;
  name: string;
  balance: number;
  annualRate: number;
  minPayment: number;
};

type DebtPlanResult = {
  months: number;
  totalInterest: number;
  totalPaid: number;
  estimatedPayoffDate: Date | null;
  unresolved: boolean;
};

function simulateDebtPlan(inputDebts: DebtItem[], strategy: 'snowball' | 'avalanche', extraPayment: number): DebtPlanResult {
  const debts = inputDebts
    .filter((item) => Number(item.balance) > 0)
    .map((item) => ({
      ...item,
      balance: Number(item.balance),
      annualRate: Math.max(Number(item.annualRate), 0),
      minPayment: Math.max(Number(item.minPayment), 0),
    }));

  if (debts.length === 0) {
    return {
      months: 0,
      totalInterest: 0,
      totalPaid: 0,
      estimatedPayoffDate: null,
      unresolved: false,
    };
  }

  const monthlyExtra = Math.max(extraPayment, 0);
  let totalInterest = 0;
  let totalPaid = 0;
  let months = 0;
  const maxMonths = 600;

  while (months < maxMonths && debts.some((item) => item.balance > 0.01)) {
    months += 1;

    for (const debt of debts) {
      if (debt.balance <= 0) continue;
      const monthlyRate = debt.annualRate / 100 / 12;
      const interest = debt.balance * monthlyRate;
      debt.balance += interest;
      totalInterest += interest;
    }

    let available = debts.reduce((sum, debt) => sum + Math.min(debt.minPayment, debt.balance), 0) + monthlyExtra;

    for (const debt of debts) {
      if (debt.balance <= 0 || available <= 0) continue;
      const payment = Math.min(debt.minPayment, debt.balance, available);
      debt.balance -= payment;
      totalPaid += payment;
      available -= payment;
    }

    while (available > 0.01) {
      const activeDebts = debts.filter((item) => item.balance > 0.01);
      if (activeDebts.length === 0) break;

      activeDebts.sort((a, b) => {
        if (strategy === 'avalanche') {
          if (b.annualRate === a.annualRate) return a.balance - b.balance;
          return b.annualRate - a.annualRate;
        }
        if (a.balance === b.balance) return b.annualRate - a.annualRate;
        return a.balance - b.balance;
      });

      const target = activeDebts[0];
      const payment = Math.min(target.balance, available);
      if (payment <= 0) break;

      target.balance -= payment;
      totalPaid += payment;
      available -= payment;
    }
  }

  const unresolved = debts.some((item) => item.balance > 0.01);
  const now = new Date();
  const estimatedPayoffDate = unresolved ? null : new Date(now.getFullYear(), now.getMonth() + months, 1);

  return {
    months,
    totalInterest,
    totalPaid,
    estimatedPayoffDate,
    unresolved,
  };
}

export default function AppsScreen() {
  const { uid } = useAuth();
  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const backgroundColor = useThemeColor({ light: '', dark: '' }, 'background');
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const borderColor = useThemeColor({ light: '', dark: '' }, 'border');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');

  const modalRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['100%', '100%'], []);
  const [activeTool, setActiveTool] = useState<ToolType>('months');
  const [isToolModalOpen, setIsToolModalOpen] = useState(false);

  const [price, setPrice] = useState('12000');
  const [downPayment, setDownPayment] = useState('1500');
  const [annualRate, setAnnualRate] = useState('42');
  const [months, setMonths] = useState('12');
  const [paidInstallments, setPaidInstallments] = useState('0');
  const [purchaseName, setPurchaseName] = useState('Macbook Air');
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [periodicBillingEnabled, setPeriodicBillingEnabled] = useState(false);
  const [billingDay, setBillingDay] = useState('5');
  const [purchaseFilter, setPurchaseFilter] = useState<'all' | 'pending' | 'done'>('all');
  const [purchases, setPurchases] = useState<InstallmentPurchase[]>([]);

  const [goalAmount, setGoalAmount] = useState('35000');
  const [goalMonths, setGoalMonths] = useState('10');
  const [savedAmount, setSavedAmount] = useState('4000');

  const [monthlyIncome, setMonthlyIncome] = useState('18000');
  const [emergencyMonthlyExpense, setEmergencyMonthlyExpense] = useState('15000');
  const [emergencyTargetMonths, setEmergencyTargetMonths] = useState('6');
  const [emergencyCurrentSaved, setEmergencyCurrentSaved] = useState('0');
  const [emergencyPlanMonths, setEmergencyPlanMonths] = useState('12');
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringRecord[]>([]);
  const [recurringIncomes, setRecurringIncomes] = useState<RecurringRecord[]>([]);
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [showToolOrderModal, setShowToolOrderModal] = useState(false);
  const [toolCardsConfig, setToolCardsConfig] = useState<ToolCardConfig[]>(TOOL_CARDS_CONFIG_DEFAULT);
  const [debts, setDebts] = useState<DebtItem[]>([]);
  const [debtName, setDebtName] = useState('');
  const [debtBalance, setDebtBalance] = useState('');
  const [debtAnnualRate, setDebtAnnualRate] = useState('');
  const [debtMinPayment, setDebtMinPayment] = useState('');
  const [debtExtraPayment, setDebtExtraPayment] = useState('0');
  const [leakTransactions, setLeakTransactions] = useState<LeakTransaction[]>([]);
  const [leakMaxAmount, setLeakMaxAmount] = useState('200');
  const [leakMinOccurrences, setLeakMinOccurrences] = useState('4');
  const [leakWindowDays, setLeakWindowDays] = useState('30');

  useEffect(() => {
    if (!uid) {
      setPurchases([]);
      return;
    }

    const ref = collection(db, `users/${uid}/comprasMeses`);
    const unsub = onSnapshot(ref, (snap) => {
      const rows = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<InstallmentPurchase, 'id'>),
      }));

      rows.sort((a, b) => {
        const aTime = Number(a?.updatedAt?.seconds || a?.createdAt?.seconds || 0);
        const bTime = Number(b?.updatedAt?.seconds || b?.createdAt?.seconds || 0);
        return bTime - aTime;
      });

      setPurchases(rows);
    });

    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setLeakTransactions([]);
      return;
    }

    const ref = collection(db, `users/${uid}/transacciones`);
    const unsub = onSnapshot(ref, (snap) => {
      const rows = snap.docs.map((d) => {
        const data = d.data() as any;
        const parsedDate = data?.fecha?.toDate?.() || (data?.fecha ? new Date(data.fecha) : null);
        return {
          id: d.id,
          monto: Math.max(Number(data?.monto || 0), 0),
          tipo: String(data?.tipo || ''),
          date: parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
          categoria: data?.presupuestoCategoria || undefined,
          descripcion: data?.descripcion || undefined,
          preestablecidoMainNombre: data?.preestablecidoMainNombre || undefined,
        };
      });

      setLeakTransactions(rows);
    });

    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const leakRef = doc(db, `users/${uid}/apps`, 'gastosHormiga');
    const unsub = onSnapshot(leakRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() || {};

      setLeakMaxAmount(String(data.maxAmount ?? '200'));
      setLeakMinOccurrences(String(data.minOccurrences ?? '4'));
      setLeakWindowDays(String(data.windowDays ?? '30'));
    });

    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setDebts([]);
      return;
    }

    const debtRef = doc(db, `users/${uid}/apps`, 'simuladorDeudas');
    const unsub = onSnapshot(debtRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() || {};
      const parsedDebts = Array.isArray(data.debts)
        ? data.debts
            .map((item: any, index: number) => ({
              id: String(item?.id || `debt-${index}`),
              name: String(item?.name || 'Deuda'),
              balance: Math.max(Number(item?.balance || 0), 0),
              annualRate: Math.max(Number(item?.annualRate || 0), 0),
              minPayment: Math.max(Number(item?.minPayment || 0), 0),
            }))
            .filter((item: DebtItem) => item.balance > 0)
        : [];

      setDebts(parsedDebts);
      setDebtExtraPayment(String(data.extraPayment ?? '0'));
    });

    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setSubscriptionActive(false);
      return;
    }

    const userRef = doc(db, `users/${uid}`);
    const unsub = onSnapshot(userRef, (snap) => {
      const data = snap.data() || {};
      setSubscriptionActive(Boolean((data as any).supportSubscription?.active));
    });

    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const loadToolCardsConfig = async () => {
      try {
        const key = `konta.apps.toolCardsConfig.${uid}`;
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return;

        const parsed = JSON.parse(raw) as ToolCardConfig[];
        const filtered = parsed.filter((item) => TOOL_CARDS_CONFIG_DEFAULT.some((base) => base.key === item.key));
        const missing = TOOL_CARDS_CONFIG_DEFAULT.filter((base) => !filtered.some((item) => item.key === base.key));
        setToolCardsConfig([...filtered, ...missing]);
      } catch (error) {
        console.log('No se pudo cargar la configuracion de apps:', error);
      }
    };

    loadToolCardsConfig();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const persistToolCardsConfig = async () => {
      try {
        const key = `konta.apps.toolCardsConfig.${uid}`;
        await AsyncStorage.setItem(key, JSON.stringify(toolCardsConfig));
      } catch (error) {
        console.log('No se pudo guardar la configuracion de apps:', error);
      }
    };

    persistToolCardsConfig();
  }, [toolCardsConfig, uid]);

  useEffect(() => {
    if (!uid) {
      setRecurringExpenses([]);
      setRecurringIncomes([]);
      return;
    }

    const expensesRef = query(
      collection(db, `users/${uid}/gastosRecurrentes`),
      where('activo', '==', true)
    );
    const incomesRef = query(
      collection(db, `users/${uid}/ingresosRecurrentes`),
      where('activo', '==', true)
    );

    const unsubExpenses = onSnapshot(expensesRef, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RecurringRecord, 'id'>) }));
      setRecurringExpenses(rows);
    });

    const unsubIncomes = onSnapshot(incomesRef, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RecurringRecord, 'id'>) }));
      setRecurringIncomes(rows);
    });

    return () => {
      unsubExpenses();
      unsubIncomes();
    };
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const emergencyRef = doc(db, `users/${uid}/apps`, 'fondoEmergencia');
    const unsub = onSnapshot(emergencyRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() || {};

      setEmergencyMonthlyExpense(String(data.monthlyExpense ?? ''));
      setEmergencyTargetMonths(String(data.targetMonths ?? ''));
      setEmergencyCurrentSaved(String(data.currentSaved ?? ''));
      setEmergencyPlanMonths(String(data.planMonths ?? ''));
    });

    return () => unsub();
  }, [uid]);

  const monthsCalc = useMemo(() => {
    return calculateMonthsPlan(
      parseNumber(price),
      parseNumber(downPayment),
      parseNumber(annualRate),
      parseNumber(months),
      parseNumber(paidInstallments)
    );
  }, [annualRate, downPayment, months, paidInstallments, price]);

  const goalCalc = useMemo(() => {
    const target = Math.max(parseNumber(goalAmount), 0);
    const monthsTarget = Math.max(Math.floor(parseNumber(goalMonths)), 1);
    const currentSaved = Math.max(parseNumber(savedAmount), 0);
    const remaining = Math.max(target - currentSaved, 0);
    const monthlyNeeded = remaining / monthsTarget;

    return {
      target,
      monthsTarget,
      currentSaved,
      remaining,
      monthlyNeeded,
    };
  }, [goalAmount, goalMonths, savedAmount]);

  const fiftyCalc = useMemo(() => {
    const income = Math.max(parseNumber(monthlyIncome), 0);
    return {
      income,
      needs: income * 0.5,
      wants: income * 0.3,
      savings: income * 0.2,
    };
  }, [monthlyIncome]);

  const emergencyCalc = useMemo(() => {
    const monthlyExpense = Math.max(parseNumber(emergencyMonthlyExpense), 0);
    const targetMonths = Math.max(Math.floor(parseNumber(emergencyTargetMonths)), 1);
    const currentSaved = Math.max(parseNumber(emergencyCurrentSaved), 0);
    const planMonths = Math.max(Math.floor(parseNumber(emergencyPlanMonths)), 1);

    const targetAmount = monthlyExpense * targetMonths;
    const remaining = Math.max(targetAmount - currentSaved, 0);
    const monthlySuggested = remaining / planMonths;
    const progressPct = targetAmount > 0
      ? Math.min(Math.max((currentSaved / targetAmount) * 100, 0), 100)
      : 0;

    return {
      monthlyExpense,
      targetMonths,
      currentSaved,
      planMonths,
      targetAmount,
      remaining,
      monthlySuggested,
      progressPct,
    };
  }, [emergencyCurrentSaved, emergencyMonthlyExpense, emergencyPlanMonths, emergencyTargetMonths]);

  const selectedCalendarDate = useMemo(() => {
    const base = new Date();
    return new Date(base.getFullYear(), base.getMonth() + calendarMonthOffset, 1, 12, 0, 0, 0);
  }, [calendarMonthOffset]);

  const calendarItems = useMemo(() => {
    const year = selectedCalendarDate.getFullYear();
    const month = selectedCalendarDate.getMonth();

    const items: CalendarItem[] = [];

    for (const expense of recurringExpenses) {
      const day = Number(expense.diaPago || 0);
      if (day <= 0) continue;
      const date = getDateInMonthByDay(year, month, day);

      items.push({
        id: `egreso-${expense.id}`,
        title: expense.nombre || 'Gasto recurrente',
        type: 'egreso',
        amount: Math.max(Number(expense.monto || 0), 0),
        date,
        category: expense.categoria || 'General',
        source: 'gasto_recurrente',
      });
    }

    for (const income of recurringIncomes) {
      const day = Number(income.diaPago || 0);
      if (day <= 0) continue;
      const date = getDateInMonthByDay(year, month, day);

      items.push({
        id: `ingreso-${income.id}`,
        title: income.nombre || 'Ingreso recurrente',
        type: 'ingreso',
        amount: Math.max(Number(income.monto || 0), 0),
        date,
        category: income.categoria || 'Ingreso',
        source: 'ingreso_recurrente',
      });
    }

    items.sort((a, b) => a.date.getTime() - b.date.getTime());
    return items;
  }, [recurringExpenses, recurringIncomes, selectedCalendarDate]);

  const calendarSummary = useMemo(() => {
    let ingresos = 0;
    let egresos = 0;

    for (const item of calendarItems) {
      if (item.type === 'ingreso') ingresos += item.amount;
      else egresos += item.amount;
    }

    return {
      ingresos,
      egresos,
      balance: ingresos - egresos,
    };
  }, [calendarItems]);

  const calendarMonthModel = useMemo(() => {
    const year = selectedCalendarDate.getFullYear();
    const month = selectedCalendarDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekDay = (new Date(year, month, 1).getDay() + 6) % 7;

    const marksByDay = new Map();
    for (const item of calendarItems) {
      if (item.date.getFullYear() !== year || item.date.getMonth() !== month) continue;

      const day = item.date.getDate();
      const current = marksByDay.get(day) || { hasIncome: false, hasExpense: false, count: 0 };
      marksByDay.set(day, {
        hasIncome: current.hasIncome || item.type === 'ingreso',
        hasExpense: current.hasExpense || item.type === 'egreso',
        count: current.count + 1,
      });
    }

    const cells = [];
    for (let i = 0; i < firstWeekDay; i += 1) {
      cells.push({ key: `empty-${i}`, day: null, mark: null });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({
        key: `day-${day}`,
        day,
        mark: marksByDay.get(day) || null,
      });
    }

    return {
      label: selectedCalendarDate.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }),
      weekDays: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
      cells,
    };
  }, [calendarItems, selectedCalendarDate]);

  const debtResults = useMemo(() => {
    const extra = parseNumber(debtExtraPayment);
    const snowball = simulateDebtPlan(debts, 'snowball', extra);
    const avalanche = simulateDebtPlan(debts, 'avalanche', extra);

    const recommended = avalanche.unresolved && !snowball.unresolved
      ? 'snowball'
      : snowball.unresolved && !avalanche.unresolved
        ? 'avalanche'
        : avalanche.totalInterest <= snowball.totalInterest
          ? 'avalanche'
          : 'snowball';

    return {
      snowball,
      avalanche,
      recommended,
    };
  }, [debtExtraPayment, debts]);

  const leakInsights = useMemo(() => {
    const maxAmount = Math.max(parseNumber(leakMaxAmount), 1);
    const minOccurrences = Math.max(Math.floor(parseNumber(leakMinOccurrences)), 1);
    const windowDays = Math.max(Math.floor(parseNumber(leakWindowDays)), 1);

    const since = new Date();
    since.setDate(since.getDate() - windowDays);

    const grouped = new Map<string, { label: string; count: number; total: number }>();

    for (const tx of leakTransactions) {
      if (tx.tipo !== 'egreso') continue;
      if (!tx.date || tx.date < since) continue;
      if (tx.monto <= 0 || tx.monto > maxAmount) continue;

      const label = (tx.categoria || tx.preestablecidoMainNombre || tx.descripcion || 'Otros').trim() || 'Otros';
      const key = label.toLowerCase();
      const current = grouped.get(key) || { label, count: 0, total: 0 };

      grouped.set(key, {
        label: current.label,
        count: current.count + 1,
        total: current.total + tx.monto,
      });
    }

    const candidates = Array.from(grouped.values())
      .filter((item) => item.count >= minOccurrences)
      .map((item) => {
        const avg = item.total / item.count;
        const estimatedMonthly = item.total * (30 / windowDays);
        return {
          ...item,
          avg,
          estimatedMonthly,
        };
      })
      .sort((a, b) => b.estimatedMonthly - a.estimatedMonthly);

    const monthlyTotal = candidates.reduce((sum, item) => sum + item.estimatedMonthly, 0);
    return {
      maxAmount,
      minOccurrences,
      windowDays,
      candidates,
      monthlyTotal,
      potentialSavings50: monthlyTotal * 0.5,
    };
  }, [leakMaxAmount, leakMinOccurrences, leakTransactions, leakWindowDays]);

  const visibleToolCards = useMemo(() => {
    return toolCardsConfig
      .filter((item) => item.visible)
      .map((item) => TOOL_CARDS.find((card) => card.id === item.key))
      .filter((card): card is ToolCard => Boolean(card));
  }, [toolCardsConfig]);

  const openTool = (tool: ToolType) => {
    setActiveTool(tool);
    if (tool !== 'months') {
      setShowPurchaseForm(false);
      setEditingPurchaseId(null);
    }
    modalRef.current?.present();
    setIsToolModalOpen(true);
  };

  const toggleToolVisibility = (key: ToolType, value: boolean) => {
    setToolCardsConfig((prev) => prev.map((item) => (item.key === key ? { ...item, visible: value } : item)));
  };

  const moveToolUp = (index: number) => {
    if (index === 0) return;
    setToolCardsConfig((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const moveToolDown = (index: number) => {
    setToolCardsConfig((prev) => {
      if (index === prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  const handleOpenToolCustomization = () => {
    if (subscriptionActive) {
      setShowToolOrderModal(true);
      return;
    }

    Alert.alert(
      'Funcion Premium',
      'Personalizar el orden de apps esta disponible con suscripcion activa.',
      [
        { text: 'Ahora no', style: 'cancel' },
        {
          text: 'Ver suscripcion',
          onPress: () => router.push({ pathname: '/(screens)/Settings', params: { openSubscription: '1' } }),
        },
      ],
    );
  };

  const addDebt = () => {
    const name = debtName.trim();
    const balance = Math.max(parseNumber(debtBalance), 0);
    const annualRateValue = Math.max(parseNumber(debtAnnualRate), 0);
    const minPayment = Math.max(parseNumber(debtMinPayment), 0);

    if (!name) {
      Alert.alert('Dato faltante', 'Agrega un nombre para la deuda.');
      return;
    }

    if (balance <= 0) {
      Alert.alert('Dato invalido', 'Ingresa un saldo pendiente mayor a 0.');
      return;
    }

    if (minPayment <= 0) {
      Alert.alert('Dato invalido', 'Ingresa un pago minimo mensual mayor a 0.');
      return;
    }

    const newDebt: DebtItem = {
      id: `debt-${Date.now()}`,
      name,
      balance,
      annualRate: annualRateValue,
      minPayment,
    };

    setDebts((prev) => [newDebt, ...prev]);
    setDebtName('');
    setDebtBalance('');
    setDebtAnnualRate('');
    setDebtMinPayment('');
  };

  const persistDebtSimulator = async (nextDebts: DebtItem[]) => {
    if (!uid) {
      Alert.alert('Sesion requerida', 'Inicia sesion para guardar tus deudas.');
      return;
    }

    try {
      await setDoc(
        doc(db, `users/${uid}/apps`, 'simuladorDeudas'),
        {
          debts: nextDebts,
          extraPayment: Math.max(parseNumber(debtExtraPayment), 0),
          updatedAt: new Date(),
        },
        { merge: true }
      );
      return true;
    } catch (error) {
      console.error('Error guardando simulador de deudas:', error);
      Alert.alert('Error', 'No se pudo guardar tu simulador de deudas.');
      return false;
    }
  };

  const removeDebt = async (id: string) => {
    const nextDebts = debts.filter((item) => item.id !== id);
    setDebts(nextDebts);
    await persistDebtSimulator(nextDebts);
  };

  const saveDebtSimulator = async () => {
    const saved = await persistDebtSimulator(debts);
    if (saved) {
      Alert.alert('Guardado', 'Tu simulador de deudas fue actualizado.');
    }
  };

  const saveLeakSettings = async () => {
    if (!uid) {
      Alert.alert('Sesion requerida', 'Inicia sesion para guardar la configuracion de gastos hormiga.');
      return;
    }

    try {
      await setDoc(
        doc(db, `users/${uid}/apps`, 'gastosHormiga'),
        {
          maxAmount: leakInsights.maxAmount,
          minOccurrences: leakInsights.minOccurrences,
          windowDays: leakInsights.windowDays,
          updatedAt: new Date(),
        },
        { merge: true }
      );
      Alert.alert('Guardado', 'Configuracion de gastos hormiga actualizada.');
    } catch (error) {
      console.error('Error guardando gastos hormiga:', error);
      Alert.alert('Error', 'No se pudo guardar la configuracion.');
    }
  };

  useFocusEffect(
    useCallback(
      () => {
        const onBackPress = () => {
          if (!isToolModalOpen) {
            return false;
          }

          if (showPurchaseForm) {
            setShowPurchaseForm(false);
            resetPurchaseForm();
            return true;
          }

          modalRef.current?.dismiss();
          setIsToolModalOpen(false);
          return true;
        };

        const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => subscription.remove();
      },
      [isToolModalOpen, showPurchaseForm]
    )
  );

  const resetPurchaseForm = () => {
    setPurchaseName('');
    setPrice('');
    setDownPayment('');
    setAnnualRate('0');
    setMonths('12');
    setPaidInstallments('0');
    setPeriodicBillingEnabled(false);
    setBillingDay('5');
    setEditingPurchaseId(null);
  };

  const openCreatePurchaseForm = () => {
    resetPurchaseForm();
    setShowPurchaseForm(true);
  };

  const openEditPurchaseForm = (purchase: InstallmentPurchase) => {
    setEditingPurchaseId(purchase.id);
    setPurchaseName(purchase.nombre || '');
    setPrice(String(purchase.totalPrice || 0));
    setDownPayment(String(purchase.downPayment || 0));
    setAnnualRate(String(purchase.annualRate || 0));
    setMonths(String(purchase.months || 1));
    setPaidInstallments(String(purchase.paidInstallments || 0));
    setPeriodicBillingEnabled(Boolean(purchase.periodicBillingEnabled));
    setBillingDay(String(purchase.billingDay || 5));
    setShowPurchaseForm(true);
  };

  const upsertRecurringForPurchase = async ({
    userId,
    purchaseId,
    recurrenteGastoId,
    nombre,
    monthlyPayment,
    day,
    enabled,
  }: {
    userId: string;
    purchaseId: string;
    recurrenteGastoId?: string | null;
    nombre: string;
    monthlyPayment: number;
    day: number;
    enabled: boolean;
  }) => {
    if (!enabled) {
      if (recurrenteGastoId) {
        await updateDoc(doc(db, `users/${userId}/gastosRecurrentes`, recurrenteGastoId), {
          activo: false,
          updatedAt: new Date(),
        });
      }
      return recurrenteGastoId || null;
    }

    const recurringPayload = {
      nombre: `Pago a meses ${nombre}`,
      categoria: 'Compras a meses',
      monto: Number(monthlyPayment.toFixed(2)),
      frecuencia: 'Mensual',
      diaPago: day,
      activo: true,
      lastUpdate: new Date(),
      updatedAt: new Date(),
      source: 'compras_meses',
      compraMesId: purchaseId,
    };

    if (recurrenteGastoId) {
      await updateDoc(doc(db, `users/${userId}/gastosRecurrentes`, recurrenteGastoId), recurringPayload);
      return recurrenteGastoId;
    }

    const recurringRef = doc(collection(db, `users/${userId}/gastosRecurrentes`));
    await setDoc(recurringRef, {
      ...recurringPayload,
      createdAt: new Date(),
      creado: new Date(),
    });
    return recurringRef.id;
  };

  const savePurchase = async () => {
    if (!uid) {
      Alert.alert('Sesion requerida', 'Inicia sesion para guardar tus compras a meses.');
      return;
    }

    const nombre = purchaseName.trim();
    const totalPrice = parseNumber(price);
    const down = parseNumber(downPayment);
    const rate = Math.max(parseNumber(annualRate), 0);
    const totalMonths = Math.max(Math.floor(parseNumber(months)), 1);
    const paid = Math.max(Math.floor(parseNumber(paidInstallments)), 0);
    const day = Math.max(Math.min(Math.floor(parseNumber(billingDay)), 28), 1);

    if (!nombre) {
      Alert.alert('Dato faltante', 'Agrega un nombre para identificar la compra.');
      return;
    }

    if (totalPrice <= 0) {
      Alert.alert('Monto invalido', 'Ingresa un precio total valido.');
      return;
    }

    if (down < 0 || down > totalPrice) {
      Alert.alert('Enganche invalido', 'El enganche debe estar entre 0 y el precio total.');
      return;
    }

    if (paid > totalMonths) {
      Alert.alert('Pagos invalidos', 'Los pagos realizados no pueden ser mayores al total de meses.');
      return;
    }

    if (periodicBillingEnabled && (day < 1 || day > 28)) {
      Alert.alert('Dia invalido', 'El dia de cobro debe estar entre 1 y 28.');
      return;
    }

    const calc = calculateMonthsPlan(totalPrice, down, rate, totalMonths, paid);
    if (periodicBillingEnabled && calc.monthlyPayment <= 0) {
      Alert.alert('Pago mensual invalido', 'No se pudo calcular un pago mensual valido para la facturacion periodica.');
      return;
    }

    const editingPurchase = editingPurchaseId
      ? purchases.find((item) => item.id === editingPurchaseId) || null
      : null;
    const existingRecurringId = editingPurchase?.recurrenteGastoId || null;

    const purchaseId = editingPurchaseId || doc(collection(db, `users/${uid}/comprasMeses`)).id;

    const payload = {
      nombre,
      totalPrice,
      downPayment: down,
      annualRate: rate,
      months: totalMonths,
      paidInstallments: paid,
      periodicBillingEnabled,
      billingDay: day,
      updatedAt: new Date(),
    };

    try {
      const recurringId = await upsertRecurringForPurchase({
        userId: uid,
        purchaseId,
        recurrenteGastoId: existingRecurringId,
        nombre,
        monthlyPayment: calc.monthlyPayment,
        day,
        enabled: periodicBillingEnabled,
      });

      if (editingPurchaseId) {
        await updateDoc(doc(db, `users/${uid}/comprasMeses`, purchaseId), {
          ...payload,
          recurrenteGastoId: recurringId,
        });
      } else {
        await setDoc(doc(db, `users/${uid}/comprasMeses`, purchaseId), {
          ...payload,
          recurrenteGastoId: recurringId,
          createdAt: new Date(),
        });
      }

      setShowPurchaseForm(false);
      resetPurchaseForm();
    } catch (error) {
      console.error('Error guardando compra a meses:', error);
      Alert.alert('Error', 'No se pudo guardar la compra. Intentalo de nuevo.');
    }
  };

  const filteredPurchases = useMemo(() => {
    if (purchaseFilter === 'all') return purchases;
    if (purchaseFilter === 'pending') {
      return purchases.filter((p) => Number(p.paidInstallments || 0) < Number(p.months || 0));
    }
    return purchases.filter((p) => Number(p.paidInstallments || 0) >= Number(p.months || 0));
  }, [purchaseFilter, purchases]);

  const incrementPaidInstallment = async (purchase: InstallmentPurchase) => {
    if (!uid) return;
    const currentPaid = Number(purchase.paidInstallments || 0);
    const totalMonths = Number(purchase.months || 0);

    if (currentPaid >= totalMonths) {
      Alert.alert('Compra liquidada', 'Esta compra ya no tiene pagos pendientes.');
      return;
    }

    const next = Math.min(currentPaid + 1, totalMonths);
    const calc = calculateMonthsPlan(
      Number(purchase.totalPrice || 0),
      Number(purchase.downPayment || 0),
      Number(purchase.annualRate || 0),
      totalMonths,
      currentPaid
    );
    const montoPago = Number(calc.monthlyPayment.toFixed(2));

    try {
      await setDoc(doc(collection(db, `users/${uid}/transacciones`)), {
        descripcion: `Pago a meses ${purchase.nombre}`,
        monto: montoPago,
        tipo: 'egreso',
        fecha: new Date(),
        presupuestoCategoria: 'Compras a meses',
        recurrenteId: purchase.recurrenteGastoId || null,
        compraMesId: purchase.id,
        creadoAutomaticamente: false,
        source: 'apps_compras_meses',
      });

      await updateDoc(doc(db, `users/${uid}/comprasMeses`, purchase.id), {
        paidInstallments: next,
        updatedAt: new Date(),
      });

      // Si ya se liquido y tenia recurrente asociado, lo desactivamos para evitar cargos extra.
      if (next >= totalMonths && purchase.recurrenteGastoId) {
        await updateDoc(doc(db, `users/${uid}/gastosRecurrentes`, purchase.recurrenteGastoId), {
          activo: false,
          updatedAt: new Date(),
        });
      }
    } catch (error) {
      console.error('Error actualizando pagos realizados:', error);
      Alert.alert('Error', 'No se pudo actualizar los pagos realizados.');
    }
  };

  const deletePurchase = async (purchase: InstallmentPurchase) => {
    if (!uid) return;
    Alert.alert('Eliminar compra', `Se eliminara "${purchase.nombre}". Esta accion no se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            if (purchase.recurrenteGastoId) {
              await updateDoc(doc(db, `users/${uid}/gastosRecurrentes`, purchase.recurrenteGastoId), {
                activo: false,
                updatedAt: new Date(),
              });
            }
            await deleteDoc(doc(db, `users/${uid}/comprasMeses`, purchase.id));
          } catch (error) {
            console.error('Error eliminando compra:', error);
            Alert.alert('Error', 'No se pudo eliminar la compra.');
          }
        },
      },
    ]);
  };

  const saveEmergencyFund = async () => {
    if (!uid) {
      Alert.alert('Sesion requerida', 'Inicia sesion para guardar tu fondo de emergencia.');
      return;
    }

    if (emergencyCalc.monthlyExpense <= 0) {
      Alert.alert('Dato invalido', 'Ingresa un gasto mensual base mayor a 0.');
      return;
    }

    if (emergencyCalc.targetMonths < 1) {
      Alert.alert('Dato invalido', 'Los meses objetivo deben ser al menos 1.');
      return;
    }

    if (emergencyCalc.planMonths < 1) {
      Alert.alert('Dato invalido', 'El plazo de ahorro debe ser al menos 1 mes.');
      return;
    }

    try {
      await setDoc(
        doc(db, `users/${uid}/apps`, 'fondoEmergencia'),
        {
          monthlyExpense: emergencyCalc.monthlyExpense,
          targetMonths: emergencyCalc.targetMonths,
          currentSaved: emergencyCalc.currentSaved,
          planMonths: emergencyCalc.planMonths,
          targetAmount: emergencyCalc.targetAmount,
          remaining: emergencyCalc.remaining,
          monthlySuggested: emergencyCalc.monthlySuggested,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      Alert.alert('Guardado', 'Tu fondo de emergencia fue actualizado.');
    } catch (error) {
      console.error('Error guardando fondo de emergencia:', error);
      Alert.alert('Error', 'No se pudo guardar tu fondo de emergencia.');
    }
  };

  const renderResultRow = (label: string, value: string, positive = false) => (
    <View style={[styles.resultRow, { borderBottomColor: `${textColor}18` }]}>
      <Text style={[styles.resultLabel, { color: `${textColor}B8` }]}>{label}</Text>
      <Text style={[styles.resultValue, { color: positive ? primaryColor : textColor }]}>{value}</Text>
    </View>
  );

  const renderMonthsTool = () => {
    const listHeader = (
      <>
        <ThemedText style={[styles.sheetTitle, { color: textColor }]}>Compras a meses</ThemedText>
        <ThemedText style={[styles.sheetSubtitle, { color: `${textColor}A3` }]}>Guarda tus compras, actualiza pagos y revisa intereses y saldo real.</ThemedText>

        <Pressable
          onPress={openCreatePurchaseForm}
          style={[styles.primaryAction, { backgroundColor: primaryColor }]}
        >
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={styles.primaryActionText}>Agregar compra a meses</Text>
        </Pressable>

        {showPurchaseForm && (
          <View style={[styles.formCard, { backgroundColor: cardsMain, borderColor }]}> 
            <Text style={[styles.formTitle, { color: textColor }]}> 
              {editingPurchaseId ? 'Editar compra' : 'Nueva compra'}
            </Text>

            <View style={styles.inputGrid}>
              <View style={[styles.inputBlock, { width: '100%' }]}> 
                <Text style={[styles.inputLabel, { color: `${textColor}9A` }]}>Nombre</Text>
                <TextInput
                  value={purchaseName}
                  onChangeText={setPurchaseName}
                  placeholder="Ej. Laptop trabajo"
                  placeholderTextColor={`${textColor}60`}
                  style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
                />
              </View>

              <View style={styles.inputBlock}>
                <Text style={[styles.inputLabel, { color: `${textColor}9A` }]}>Precio total</Text>
                <TextInput
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={`${textColor}60`}
                  style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
                />
              </View>

              <View style={styles.inputBlock}>
                <Text style={[styles.inputLabel, { color: `${textColor}9A` }]}>Enganche</Text>
                <TextInput
                  value={downPayment}
                  onChangeText={setDownPayment}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={`${textColor}60`}
                  style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
                />
              </View>

              <View style={styles.inputBlock}>
                <Text style={[styles.inputLabel, { color: `${textColor}9A` }]}>Tasa anual (%)</Text>
                <TextInput
                  value={annualRate}
                  onChangeText={setAnnualRate}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={`${textColor}60`}
                  style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
                />
              </View>

              <View style={styles.inputBlock}>
                <Text style={[styles.inputLabel, { color: `${textColor}9A` }]}>Meses</Text>
                <TextInput
                  value={months}
                  onChangeText={setMonths}
                  keyboardType="numeric"
                  placeholder="1"
                  placeholderTextColor={`${textColor}60`}
                  style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
                />
              </View>

              <View style={[styles.inputBlock, { width: '100%' }]}> 
                <Text style={[styles.inputLabel, { color: `${textColor}9A` }]}>Pagos realizados</Text>
                <TextInput
                  value={paidInstallments}
                  onChangeText={setPaidInstallments}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={`${textColor}60`}
                  style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
                />
              </View>

              <View style={[styles.inputBlock, { width: '100%' }]}> 
                <View style={styles.toggleRow}>
                  <Text style={[styles.inputLabel, { color: `${textColor}9A`, marginBottom: 0 }]}>Activar facturacion periodica</Text>
                  <Switch
                    value={periodicBillingEnabled}
                    onValueChange={setPeriodicBillingEnabled}
                    thumbColor={periodicBillingEnabled ? primaryColor : '#9ca3af'}
                    trackColor={{ false: `${textColor}33`, true: `${primaryColor}55` }}
                  />
                </View>
                {periodicBillingEnabled && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={[styles.inputLabel, { color: `${textColor}9A` }]}>Dia de cobro (1-28)</Text>
                    <TextInput
                      value={billingDay}
                      onChangeText={setBillingDay}
                      keyboardType="numeric"
                      placeholder="5"
                      placeholderTextColor={`${textColor}60`}
                      style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
                    />
                  </View>
                )}
              </View>
            </View>

            <View style={styles.formActionsRow}>
              <Pressable onPress={savePurchase} style={[styles.secondaryAction, { borderColor: `${primaryColor}55` }]}>
                <Text style={[styles.secondaryActionText, { color: primaryColor }]}> 
                  {editingPurchaseId ? 'Guardar cambios' : 'Guardar compra'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setShowPurchaseForm(false);
                  resetPurchaseForm();
                }}
                style={[styles.secondaryAction, { borderColor }]}
              >
                <Text style={[styles.secondaryActionText, { color: textColor }]}>Cancelar</Text>
              </Pressable>
            </View>

            <View style={[styles.resultCard, { backgroundColor: cardsMain, borderColor }]}> 
              {renderResultRow('Monto financiado', formatCurrency(monthsCalc.principal))}
              {renderResultRow('Pago mensual', formatCurrency(monthsCalc.monthlyPayment), true)}
              {renderResultRow('Intereses totales', formatCurrency(monthsCalc.totalInterest))}
              {renderResultRow('Total al final', formatCurrency(monthsCalc.totalPaid))}
              {renderResultRow('Pagos restantes', `${monthsCalc.remainingInstallments} meses`)}
            </View>
          </View>
        )}

        <ThemedText style={[styles.sectionTitle, { color: textColor }]}>Mis compras guardadas</ThemedText>

        <View style={styles.filterRow}>
          {[
            { key: 'all', label: 'Todas' },
            { key: 'pending', label: 'Pendientes' },
            { key: 'done', label: 'Liquidadas' },
          ].map((item) => {
            const selected = purchaseFilter === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setPurchaseFilter(item.key as 'all' | 'pending' | 'done')}
                style={[
                  styles.filterChip,
                  {
                    borderColor: selected ? `${primaryColor}66` : borderColor,
                    backgroundColor: selected ? `${primaryColor}1A` : cardsMain,
                  },
                ]}
              >
                <Text style={{ color: selected ? primaryColor : textColor, fontWeight: selected ? '800' : '600', fontSize: 12 }}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </>
    );

    return (
      <BottomSheetFlatList
        data={filteredPurchases}
        keyExtractor={(item) => item.id}
        style={styles.savedPurchasesList}
        contentContainerStyle={styles.savedPurchasesScrollContent}
        ListHeaderComponent={listHeader}
        nestedScrollEnabled
        ListEmptyComponent={
          <View style={[styles.emptyCard, { backgroundColor: cardsMain, borderColor }]}> 
            <Text style={[styles.emptyCardTitle, { color: textColor }]}>Aun no tienes compras a meses.</Text>
            <Text style={[styles.emptyCardSubtitle, { color: `${textColor}98` }]}>Toca "Agregar compra a meses" para guardar tu primera compra y llevar el avance.</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        renderItem={({ item: purchase }) => {
          const calc = calculateMonthsPlan(
            Number(purchase.totalPrice || 0),
            Number(purchase.downPayment || 0),
            Number(purchase.annualRate || 0),
            Number(purchase.months || 0),
            Number(purchase.paidInstallments || 0)
          );

          const progress = purchase.months > 0
            ? Math.min(Math.max((purchase.paidInstallments / purchase.months) * 100, 0), 100)
            : 0;

          return (
            <View
              style={[
                styles.purchaseCard,
                {
                  backgroundColor: cardsMain,
                  borderColor,
                },
              ]}
            >
              <View style={styles.purchaseHeader}>
                <Text style={[styles.purchaseName, { color: textColor }]}>{purchase.nombre}</Text>
                <Text style={[styles.purchaseChip, { color: primaryColor }]}>{Math.round(progress)}%</Text>
              </View>

              <View style={styles.purchaseActionsRow}>
                <Pressable onPress={() => openEditPurchaseForm(purchase)} style={[styles.smallAction, { borderColor: `${primaryColor}55` }]}>
                  <Text style={[styles.smallActionText, { color: primaryColor }]}>Editar</Text>
                </Pressable>
                <Pressable
                  onPress={() => incrementPaidInstallment(purchase)}
                  style={[styles.smallAction, { borderColor: `${primaryColor}55` }]}
                >
                  <Text style={[styles.smallActionText, { color: primaryColor }]}>+1 pago</Text>
                </Pressable>
                <Pressable onPress={() => deletePurchase(purchase)} style={[styles.smallAction, { borderColor: '#ef444499' }]}>
                  <Text style={[styles.smallActionText, { color: '#ef4444' }]}>Eliminar</Text>
                </Pressable>
              </View>

              <View style={[styles.progressTrack, { backgroundColor: `${textColor}1A` }]}>
                <View style={[styles.progressFill, { backgroundColor: primaryColor, width: `${progress}%` }]} />
              </View>

              {renderResultRow('Pago mensual', formatCurrency(calc.monthlyPayment), true)}
              {renderResultRow('Intereses totales', formatCurrency(calc.totalInterest))}
              {renderResultRow('Total al final', formatCurrency(calc.totalPaid))}
              {renderResultRow('Pagos pagados', `${purchase.paidInstallments} / ${purchase.months}`)}
              {renderResultRow('Pagos restantes', `${calc.remainingInstallments} meses`)}
              {renderResultRow('Saldo pendiente', formatCurrency(calc.remainingBalance))}
            </View>
          );
          }}
      />
    );
  };

  const renderGoalTool = () => (
    <>
      <ThemedText style={[styles.sheetTitle, { color: textColor }]}>Meta de compra</ThemedText>
      <ThemedText style={[styles.sheetSubtitle, { color: `${textColor}A3` }]}>Define un objetivo y te dice cuanto debes guardar al mes.</ThemedText>

      <View style={styles.inputGrid}>
        <View style={[styles.inputBlock, { width: '100%' }]}>
          <Text style={[styles.inputLabel, { color: `${textColor}9A` }]}>Costo objetivo</Text>
          <TextInput
            value={goalAmount}
            onChangeText={setGoalAmount}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={`${textColor}60`}
            style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
          />
        </View>

        <View style={styles.inputBlock}>
          <Text style={[styles.inputLabel, { color: `${textColor}9A` }]}>Plazo (meses)</Text>
          <TextInput
            value={goalMonths}
            onChangeText={setGoalMonths}
            keyboardType="numeric"
            placeholder="1"
            placeholderTextColor={`${textColor}60`}
            style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
          />
        </View>

        <View style={styles.inputBlock}>
          <Text style={[styles.inputLabel, { color: `${textColor}9A` }]}>Ahorrado actual</Text>
          <TextInput
            value={savedAmount}
            onChangeText={setSavedAmount}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={`${textColor}60`}
            style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
          />
        </View>
      </View>

      <View style={[styles.resultCard, { backgroundColor: cardsMain, borderColor }]}> 
        {renderResultRow('Objetivo total', formatCurrency(goalCalc.target))}
        {renderResultRow('Ahorrado', formatCurrency(goalCalc.currentSaved))}
        {renderResultRow('Faltante', formatCurrency(goalCalc.remaining))}
        {renderResultRow('Meses', `${goalCalc.monthsTarget}`)}
        {renderResultRow('Ahorro mensual requerido', formatCurrency(goalCalc.monthlyNeeded), true)}
      </View>
    </>
  );

  const renderFiftyTool = () => (
    <>
      <ThemedText style={[styles.sheetTitle, { color: textColor }]}>Regla 50/30/20</ThemedText>
      <ThemedText style={[styles.sheetSubtitle, { color: `${textColor}A3` }]}>Reparte tu ingreso en necesidades, estilo de vida y ahorro.</ThemedText>

      <View style={styles.inputGrid}>
        <View style={[styles.inputBlock, { width: '100%' }]}>
          <Text style={[styles.inputLabel, { color: `${textColor}9A` }]}>Ingreso mensual</Text>
          <TextInput
            value={monthlyIncome}
            onChangeText={setMonthlyIncome}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={`${textColor}60`}
            style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
          />
        </View>
      </View>

      <View style={[styles.resultCard, { backgroundColor: cardsMain, borderColor }]}> 
        {renderResultRow('Necesidades (50%)', formatCurrency(fiftyCalc.needs))}
        {renderResultRow('Deseos (30%)', formatCurrency(fiftyCalc.wants))}
        {renderResultRow('Ahorro/Deuda (20%)', formatCurrency(fiftyCalc.savings), true)}
      </View>
    </>
  );

  const renderEmergencyTool = () => (
    <>
      <ThemedText style={[styles.sheetTitle, { color: textColor }]}>Fondo de emergencia</ThemedText>
      <ThemedText style={[styles.sheetSubtitle, { color: `${textColor}A3` }]}>Define tu meta en meses de gasto y calcula tu avance real.</ThemedText>

      <View style={styles.inputGrid}>
        <View style={[styles.inputBlock, { width: '100%' }]}>
          <Text style={[styles.inputLabel, { color: `${textColor}9A` }]}>Gasto mensual base</Text>
          <TextInput
            value={emergencyMonthlyExpense}
            onChangeText={setEmergencyMonthlyExpense}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={`${textColor}60`}
            style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
          />
        </View>

        <View style={styles.inputBlock}>
          <Text style={[styles.inputLabel, { color: `${textColor}9A` }]}>Meses objetivo</Text>
          <TextInput
            value={emergencyTargetMonths}
            onChangeText={setEmergencyTargetMonths}
            keyboardType="numeric"
            placeholder="6"
            placeholderTextColor={`${textColor}60`}
            style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
          />
        </View>

        <View style={styles.inputBlock}>
          <Text style={[styles.inputLabel, { color: `${textColor}9A` }]}>Ahorrado actual</Text>
          <TextInput
            value={emergencyCurrentSaved}
            onChangeText={setEmergencyCurrentSaved}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={`${textColor}60`}
            style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
          />
        </View>

        <View style={[styles.inputBlock, { width: '100%' }]}>
          <Text style={[styles.inputLabel, { color: `${textColor}9A` }]}>Plazo para completarlo (meses)</Text>
          <TextInput
            value={emergencyPlanMonths}
            onChangeText={setEmergencyPlanMonths}
            keyboardType="numeric"
            placeholder="12"
            placeholderTextColor={`${textColor}60`}
            style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
          />
        </View>
      </View>

      <Pressable onPress={saveEmergencyFund} style={[styles.primaryAction, { backgroundColor: primaryColor }]}>
        <Ionicons name="save-outline" size={18} color="#fff" />
        <Text style={styles.primaryActionText}>Guardar fondo de emergencia</Text>
      </Pressable>

      <View style={[styles.resultCard, { backgroundColor: cardsMain, borderColor }]}> 
        {renderResultRow('Meta total', formatCurrency(emergencyCalc.targetAmount), true)}
        {renderResultRow('Ahorrado actual', formatCurrency(emergencyCalc.currentSaved))}
        {renderResultRow('Faltante', formatCurrency(emergencyCalc.remaining))}
        {renderResultRow('Avance', `${Math.round(emergencyCalc.progressPct)}%`)}
        {renderResultRow('Aporte mensual sugerido', formatCurrency(emergencyCalc.monthlySuggested), true)}
      </View>
    </>
  );

  const renderCalendarTool = () => (
    <>
      <ThemedText style={[styles.sheetTitle, { color: textColor }]}>Calendario de pagos</ThemedText>
      <ThemedText style={[styles.sheetSubtitle, { color: `${textColor}A3` }]}>Proximos 30 dias de ingresos y cargos programados.</ThemedText>

      <View style={[styles.resultCard, { backgroundColor: cardsMain, borderColor }]}> 
        {renderResultRow('Ingresos programados', formatCurrency(calendarSummary.ingresos), true)}
        {renderResultRow('Cargos programados', formatCurrency(calendarSummary.egresos))}
        {renderResultRow('Balance neto', formatCurrency(calendarSummary.balance), calendarSummary.balance >= 0)}
      </View>

      <View style={[styles.calendarMonthCard, { backgroundColor: cardsMain, borderColor }]}>
        <View style={styles.calendarMonthNavRow}>
          <Pressable
            onPress={() => setCalendarMonthOffset((prev) => prev - 1)}
            style={[styles.calendarNavButton, { borderColor }]}
          >
            <Ionicons name="chevron-back" size={18} color={textColor} />
          </Pressable>

          <Text style={[styles.calendarMonthTitle, { color: textColor }]}>{calendarMonthModel.label}</Text>

          <Pressable
            onPress={() => setCalendarMonthOffset((prev) => prev + 1)}
            style={[styles.calendarNavButton, { borderColor }]}
          >
            <Ionicons name="chevron-forward" size={18} color={textColor} />
          </Pressable>
        </View>

        <View style={styles.calendarWeekHeader}>
          {calendarMonthModel.weekDays.map((weekday) => (
            <Text key={weekday} style={[styles.calendarWeekday, { color: `${textColor}A0` }]}>{weekday}</Text>
          ))}
        </View>

        <View style={styles.calendarGrid}>
          {calendarMonthModel.cells.map((cell) => {
            if (!cell.day) {
              return <View key={cell.key} style={styles.calendarDayCell} />;
            }

            const today = new Date();
            const isToday =
              cell.day === today.getDate() &&
              selectedCalendarDate.getMonth() === today.getMonth() &&
              selectedCalendarDate.getFullYear() === today.getFullYear();

            return (
              <View
                key={cell.key}
                style={[
                  styles.calendarDayCell,
                  isToday ? [styles.calendarDayCellToday, { borderColor: `${primaryColor}66`, backgroundColor: `${primaryColor}1A` }] : null,
                ]}
              >
                <Text
                  style={[
                    styles.calendarDayNumber,
                    { color: isToday ? primaryColor : textColor },
                    isToday ? styles.calendarDayNumberToday : null,
                  ]}
                >
                  {cell.day}
                </Text>
                {cell.mark ? (
                  <View style={styles.calendarMarkersRow}>
                    {cell.mark.hasExpense ? <View style={[styles.calendarMarkerDot, { backgroundColor: '#f59e0b' }]} /> : null}
                    {cell.mark.hasIncome ? <View style={[styles.calendarMarkerDot, { backgroundColor: '#10b981' }]} /> : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={styles.calendarLegendRow}>
          <View style={styles.calendarLegendItem}>
            <View style={[styles.calendarMarkerDot, { backgroundColor: '#f59e0b' }]} />
            <Text style={[styles.calendarLegendText, { color: `${textColor}A0` }]}>Cargo</Text>
          </View>
          <View style={styles.calendarLegendItem}>
            <View style={[styles.calendarMarkerDot, { backgroundColor: '#10b981' }]} />
            <Text style={[styles.calendarLegendText, { color: `${textColor}A0` }]}>Ingreso</Text>
          </View>
        </View>
      </View>

      <ThemedText style={[styles.sectionTitle, { color: textColor }]}>Agenda</ThemedText>

      {calendarItems.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: cardsMain, borderColor }]}> 
          <Text style={[styles.emptyCardTitle, { color: textColor }]}>No hay movimientos en los proximos 30 dias.</Text>
          <Text style={[styles.emptyCardSubtitle, { color: `${textColor}98` }]}>Activa ingresos o gastos recurrentes para verlos aqui.</Text>
        </View>
      ) : (
        <View style={styles.calendarListWrap}>
          {calendarItems.map((item) => {
            const isIncome = item.type === 'ingreso';
            const badgeColor = isIncome ? '#10b981' : '#f59e0b';
            const dateLabel = item.date.toLocaleDateString('es-MX', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            });

            return (
              <View key={item.id} style={[styles.calendarCard, { backgroundColor: cardsMain, borderColor }]}>
                <View style={styles.calendarRowTop}>
                  <Text style={[styles.calendarTitle, { color: textColor }]}>{item.title}</Text>
                  <Text style={[styles.calendarBadge, { color: badgeColor }]}>{isIncome ? 'Ingreso' : 'Cargo'}</Text>
                </View>

                <View style={styles.calendarRowBottom}>
                  <Text style={[styles.calendarMeta, { color: `${textColor}A0` }]}>{dateLabel} · {item.category}</Text>
                  <Text style={[styles.calendarAmount, { color: isIncome ? '#10b981' : textColor }]}>{formatCurrency(item.amount)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </>
  );

  const renderDebtTool = () => (
    <>
      <ThemedText style={[styles.sheetTitle, { color: textColor }]}>Simulador de deudas</ThemedText>
      <ThemedText style={[styles.sheetSubtitle, { color: `${textColor}A3` }]}>Compara bola de nieve y avalancha para liquidar deudas mas rapido.</ThemedText>

      <View style={[styles.formCard, { backgroundColor: cardsMain, borderColor }]}> 
        <Text style={[styles.formTitle, { color: textColor }]}>Nueva deuda</Text>
        <View style={styles.inputGrid}>
          <View style={[styles.inputBlock, { width: '100%' }]}>
            <Text style={[styles.inputLabel, { color: `${textColor}9A` }]}>Nombre</Text>
            <TextInput
              value={debtName}
              onChangeText={setDebtName}
              placeholder="Ej. Tarjeta banco"
              placeholderTextColor={`${textColor}60`}
              style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
            />
          </View>

          <View style={styles.inputBlock}>
            <Text style={[styles.inputLabel, { color: `${textColor}9A` }]}>Saldo pendiente</Text>
            <TextInput
              value={debtBalance}
              onChangeText={setDebtBalance}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={`${textColor}60`}
              style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
            />
          </View>

          <View style={styles.inputBlock}>
            <Text style={[styles.inputLabel, { color: `${textColor}9A` }]}>Tasa anual (%)</Text>
            <TextInput
              value={debtAnnualRate}
              onChangeText={setDebtAnnualRate}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={`${textColor}60`}
              style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
            />
          </View>

          <View style={[styles.inputBlock, { width: '100%' }]}>
            <Text style={[styles.inputLabel, { color: `${textColor}9A` }]}>Pago minimo mensual</Text>
            <TextInput
              value={debtMinPayment}
              onChangeText={setDebtMinPayment}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={`${textColor}60`}
              style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
            />
          </View>
        </View>

        <Pressable onPress={addDebt} style={[styles.primaryAction, { backgroundColor: primaryColor }]}>
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={styles.primaryActionText}>Agregar deuda</Text>
        </Pressable>
      </View>

      <View style={[styles.formCard, { backgroundColor: cardsMain, borderColor }]}> 
        <Text style={[styles.formTitle, { color: textColor }]}>Pago extra mensual</Text>
        <TextInput
          value={debtExtraPayment}
          onChangeText={setDebtExtraPayment}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={`${textColor}60`}
          style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
        />
      </View>

      {debts.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: cardsMain, borderColor }]}> 
          <Text style={[styles.emptyCardTitle, { color: textColor }]}>Aun no agregas deudas.</Text>
          <Text style={[styles.emptyCardSubtitle, { color: `${textColor}98` }]}>Agrega al menos una deuda para comparar estrategias.</Text>
        </View>
      ) : (
        <>
          <ThemedText style={[styles.sectionTitle, { color: textColor }]}>Tus deudas</ThemedText>
          {debts.map((debt) => (
            <View key={debt.id} style={[styles.purchaseCard, { backgroundColor: cardsMain, borderColor }]}>
              <View style={styles.purchaseHeader}>
                <Text style={[styles.purchaseName, { color: textColor }]}>{debt.name}</Text>
                <Pressable onPress={() => removeDebt(debt.id)} style={[styles.smallAction, { borderColor: '#ef444499', maxWidth: 90 }]}>
                  <Text style={[styles.smallActionText, { color: '#ef4444' }]}>Eliminar</Text>
                </Pressable>
              </View>
              {renderResultRow('Saldo', formatCurrency(debt.balance))}
              {renderResultRow('Tasa anual', `${debt.annualRate.toFixed(2)}%`)}
              {renderResultRow('Pago minimo', formatCurrency(debt.minPayment), true)}
            </View>
          ))}

          <View style={[styles.resultCard, { backgroundColor: cardsMain, borderColor }]}> 
            <Text style={[styles.formTitle, { color: textColor, marginBottom: 4 }]}>Avalancha</Text>
            {renderResultRow('Meses estimados', debtResults.avalanche.unresolved ? 'No converge' : `${debtResults.avalanche.months}`)}
            {renderResultRow('Intereses totales', formatCurrency(debtResults.avalanche.totalInterest))}
            {renderResultRow('Total pagado', formatCurrency(debtResults.avalanche.totalPaid))}
          </View>

          <View style={[styles.resultCard, { backgroundColor: cardsMain, borderColor, marginTop: 10 }]}> 
            <Text style={[styles.formTitle, { color: textColor, marginBottom: 4 }]}>Bola de nieve</Text>
            {renderResultRow('Meses estimados', debtResults.snowball.unresolved ? 'No converge' : `${debtResults.snowball.months}`)}
            {renderResultRow('Intereses totales', formatCurrency(debtResults.snowball.totalInterest))}
            {renderResultRow('Total pagado', formatCurrency(debtResults.snowball.totalPaid))}
          </View>

          <View style={[styles.emptyCard, { backgroundColor: cardsMain, borderColor, marginTop: 10 }]}> 
            <Text style={[styles.emptyCardTitle, { color: textColor }]}>Recomendacion</Text>
            <Text style={[styles.emptyCardSubtitle, { color: `${textColor}98` }]}>
              {debtResults.recommended === 'avalanche'
                ? 'Avalancha reduce mas intereses en este escenario.'
                : 'Bola de nieve puede darte avance mas motivador en este escenario.'}
            </Text>
          </View>

          <Pressable onPress={saveDebtSimulator} style={[styles.primaryAction, { backgroundColor: primaryColor, marginTop: 10 }]}>
            <Ionicons name="save-outline" size={18} color="#fff" />
            <Text style={styles.primaryActionText}>Guardar simulador</Text>
          </Pressable>
        </>
      )}
    </>
  );

  const renderLeaksTool = () => (
    <>
      <ThemedText style={[styles.sheetTitle, { color: textColor }]}>Gastos hormiga</ThemedText>
      <ThemedText style={[styles.sheetSubtitle, { color: `${textColor}A3` }]}>Detecta gastos pequenos que se repiten y pueden drenar tu presupuesto.</ThemedText>

      <View style={[styles.formCard, { backgroundColor: cardsMain, borderColor }]}> 
        <Text style={[styles.formTitle, { color: textColor }]}>Sensibilidad del analisis</Text>
        <View style={styles.inputGrid}>
          <View style={styles.inputBlock}>
            <Text style={[styles.inputLabel, { color: `${textColor}9A` }]}>Monto maximo por gasto</Text>
            <TextInput
              value={leakMaxAmount}
              onChangeText={setLeakMaxAmount}
              keyboardType="numeric"
              placeholder="200"
              placeholderTextColor={`${textColor}60`}
              style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
            />
          </View>

          <View style={styles.inputBlock}>
            <Text style={[styles.inputLabel, { color: `${textColor}9A` }]}>Repeticiones minimas</Text>
            <TextInput
              value={leakMinOccurrences}
              onChangeText={setLeakMinOccurrences}
              keyboardType="numeric"
              placeholder="4"
              placeholderTextColor={`${textColor}60`}
              style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
            />
          </View>

          <View style={[styles.inputBlock, { width: '100%' }]}>
            <Text style={[styles.inputLabel, { color: `${textColor}9A` }]}>Ventana de dias</Text>
            <TextInput
              value={leakWindowDays}
              onChangeText={setLeakWindowDays}
              keyboardType="numeric"
              placeholder="30"
              placeholderTextColor={`${textColor}60`}
              style={[styles.input, { borderColor, color: textColor, backgroundColor: cardsMain }]}
            />
          </View>
        </View>

        <Pressable onPress={saveLeakSettings} style={[styles.primaryAction, { backgroundColor: primaryColor }]}>
          <Ionicons name="save-outline" size={18} color="#fff" />
          <Text style={styles.primaryActionText}>Guardar configuracion</Text>
        </Pressable>
      </View>

      <View style={[styles.resultCard, { backgroundColor: cardsMain, borderColor }]}> 
        {renderResultRow('Gasto hormiga estimado / mes', formatCurrency(leakInsights.monthlyTotal), true)}
        {renderResultRow('Ahorro potencial (50%)', formatCurrency(leakInsights.potentialSavings50))}
        {renderResultRow('Categorias detectadas', `${leakInsights.candidates.length}`)}
      </View>

      <ThemedText style={[styles.sectionTitle, { color: textColor }]}>Categorias detectadas</ThemedText>

      {leakInsights.candidates.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: cardsMain, borderColor }]}> 
          <Text style={[styles.emptyCardTitle, { color: textColor }]}>Sin patrones claros por ahora.</Text>
          <Text style={[styles.emptyCardSubtitle, { color: `${textColor}98` }]}>Amplia la ventana de dias o sube el monto maximo para detectar mas gastos hormiga.</Text>
        </View>
      ) : (
        leakInsights.candidates.map((item) => (
          <View key={item.label} style={[styles.purchaseCard, { backgroundColor: cardsMain, borderColor }]}> 
            <View style={styles.purchaseHeader}>
              <Text style={[styles.purchaseName, { color: textColor }]}>{item.label}</Text>
              <Text style={[styles.purchaseChip, { color: primaryColor }]}>{item.count} mov.</Text>
            </View>
            {renderResultRow('Total en periodo', formatCurrency(item.total))}
            {renderResultRow('Promedio por movimiento', formatCurrency(item.avg))}
            {renderResultRow('Estimado mensual', formatCurrency(item.estimatedMonthly), true)}
          </View>
        ))
      )}
    </>
  );


  return (
    <View style={[styles.container, { backgroundColor }]}> 
      <ScrollView contentContainerStyle={styles.content} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        <View style={{ marginTop: 30 }}>
            <ThemedText style={[styles.title, { color: textColor }]}>Aplicaciones</ThemedText>
            <ThemedText style={[styles.subtitle, { color: `${textColor}A3` }]}>Mini herramientas para decisiones financieras rapidas.</ThemedText>
            <Pressable
              onPress={handleOpenToolCustomization}
              style={{
                alignSelf: 'flex-start',
                marginBottom: 10,
                backgroundColor: subscriptionActive ? `${primaryColor}18` : `${primaryColor}10`,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderWidth: 1,
                borderColor: subscriptionActive ? `${primaryColor}40` : `${primaryColor}25`,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: primaryColor, opacity: subscriptionActive ? 1 : 0.8 }}>
                Personalizar orden de apps
              </Text>
            </Pressable>
        </View>
        <View style={styles.gridWrap}>
          {visibleToolCards.map((card) => (
            <Pressable
              key={card.id}
              onPress={() => openTool(card.id)}
              style={({ pressed }) => [
                styles.toolCard,
                {
                  backgroundColor: cardsMain,
                  borderColor,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
            >
              <View style={[styles.iconWrap, { backgroundColor: `${primaryColor}18` }]}>
                <Ionicons name={card.icon} size={22} color={primaryColor} />
              </View>
              <Text style={[styles.toolTitle, { color: textColor }]}>{card.title}</Text>
              <Text style={[styles.toolSubtitle, { color: `${textColor}9E` }]}>{card.subtitle}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Modal visible={showToolOrderModal && Boolean(subscriptionActive)} transparent animationType="fade" onRequestClose={() => setShowToolOrderModal(false)}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Pressable
            onPress={() => setShowToolOrderModal(false)}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.45)' }}
          />

          <View style={{ width: '88%', maxHeight: '80%', borderRadius: 16, padding: 16, backgroundColor: cardsMain, zIndex: 2, elevation: 6 }}>
            <ThemedText style={{ fontSize: 18, fontWeight: '700', marginBottom: 4 }}>Personalizar apps</ThemedText>
            <ThemedText style={{ fontSize: 12, opacity: 0.8, marginBottom: 12 }}>
              Usa flechas para reordenar y el switch para mostrar u ocultar cada app.
            </ThemedText>

            <FlatList
              data={toolCardsConfig}
              keyExtractor={(item) => item.key}
              nestedScrollEnabled
              style={{ flexGrow: 0, maxHeight: 420, marginBottom: 12 }}
              contentContainerStyle={{ paddingBottom: 4 }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item, index }) => {
                const card = TOOL_CARDS.find((entry) => entry.id === item.key);
                if (!card) return null;

                return (
                  <View
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
                      {card.title}
                    </ThemedText>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Switch
                        value={item.visible}
                        onValueChange={(value) => toggleToolVisibility(item.key, value)}
                        trackColor={{ false: '#6b7280', true: `${primaryColor}88` }}
                        thumbColor={item.visible ? primaryColor : '#f3f4f6'}
                      />
                      <Pressable
                        onPress={() => moveToolUp(index)}
                        disabled={index === 0}
                        style={{ padding: 4, opacity: index === 0 ? 0.3 : 1 }}
                      >
                        <Ionicons name="arrow-up" size={18} color={textColor} />
                      </Pressable>
                      <Pressable
                        onPress={() => moveToolDown(index)}
                        disabled={index === toolCardsConfig.length - 1}
                        style={{ padding: 4, opacity: index === toolCardsConfig.length - 1 ? 0.3 : 1 }}
                      >
                        <Ionicons name="arrow-down" size={18} color={textColor} />
                      </Pressable>
                    </View>
                  </View>
                );
              }}
            />

            <Pressable
              onPress={() => setToolCardsConfig(TOOL_CARDS_CONFIG_DEFAULT)}
              style={{ marginTop: 6, marginBottom: 8, paddingVertical: 10, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: `${primaryColor}50` }}
            >
              <ThemedText style={{ fontSize: 12, color: primaryColor, textAlign: 'center' }}>Restablecer orden por defecto</ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setShowToolOrderModal(false)}
              style={{ backgroundColor: primaryColor, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
            >
              <ThemedText style={{ color: '#fff', fontWeight: '700' }}>Listo</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>

      <BottomSheetModal
        ref={modalRef}
        snapPoints={snapPoints}
        index={0}
        enablePanDownToClose
        enableDynamicSizing={false}
        onDismiss={() => {
          setIsToolModalOpen(false);
          setShowPurchaseForm(false);
          setEditingPurchaseId(null);
        }}
        handleIndicatorStyle={{ backgroundColor: primaryColor }}
        backgroundStyle={{ backgroundColor: backgroundColor }}
      >
        <BottomSheetScrollView style={styles.sheetContainer}>
              {activeTool === 'months' && renderMonthsTool()}
              {activeTool === 'goal' && renderGoalTool()}
              {activeTool === 'fifty' && renderFiftyTool()}
              {activeTool === 'emergency' && renderEmergencyTool()}
              {activeTool === 'calendar' && renderCalendarTool()}
              {activeTool === 'debt' && renderDebtTool()}
              {activeTool === 'leaks' && renderLeaksTool()}
        </BottomSheetScrollView>
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 26,
    paddingBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    height: 30,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 18,
    fontSize: 14,
    lineHeight: 20,
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  toolCard: {
    width: '48.5%',
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginBottom: 12,
    minHeight: 150,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  toolTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  toolSubtitle: {
    fontSize: 12,
    lineHeight: 17,
  },
  sheetContainer: {
    flex: 1,
    paddingHorizontal: 10,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  sheetTitle: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 20,
  },
  sheetSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 14,
  },
  inputGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  inputBlock: {
    width: '48.7%',
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 12,
    marginBottom: 5,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 46,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '600',
  },
  resultCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  resultRow: {
    minHeight: 38,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  resultLabel: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
    paddingRight: 10,
  },
  resultValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  primaryAction: {
    minHeight: 46,
    borderRadius: 12,
    marginBottom: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryActionText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  sectionTitle: {
    marginTop: 12,
    marginBottom: 8,
    fontSize: 18,
    fontWeight: '800',
  },
  formCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
  },
  formActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  savedPurchasesList: {
    flex: 1,
  },
  savedPurchasesScrollContent: {
    paddingHorizontal: 0,
    paddingBottom: 8,
  },
  secondaryAction: {
    flex: 1,
    borderWidth: 1,
    minHeight: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  emptyCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyCardSubtitle: {
    fontSize: 12,
    lineHeight: 18,
  },
  purchaseCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  purchaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  purchaseName: {
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
    paddingRight: 10,
  },
  purchaseChip: {
    fontSize: 12,
    fontWeight: '900',
  },
  purchaseActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 6,
  },
  smallAction: {
    flex: 1,
    borderWidth: 1,
    minHeight: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  smallActionText: {
    fontSize: 11,
    fontWeight: '800',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  calendarListWrap: {
    marginTop: 4,
    paddingBottom: 18,
  },
  calendarCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  calendarRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  calendarRowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  calendarTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  calendarBadge: {
    fontSize: 12,
    fontWeight: '800',
  },
  calendarMeta: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  calendarAmount: {
    fontSize: 13,
    fontWeight: '800',
  },
  calendarMonthCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginTop: 10,
  },
  calendarMonthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 10,
  },
  calendarNavButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonthTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    textTransform: 'capitalize',
    textAlign: 'center',
  },
  calendarWeekHeader: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  calendarWeekday: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDayCell: {
    width: `${100 / 7}%`,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 4,
  },
  calendarDayCellToday: {
    borderWidth: 1,
  },
  calendarDayNumber: {
    fontSize: 12,
    fontWeight: '700',
  },
  calendarDayNumberToday: {
    fontWeight: '900',
  },
  calendarMarkersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 3,
  },
  calendarMarkerDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  calendarLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 8,
  },
  calendarLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calendarLegendText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
