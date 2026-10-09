import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, TouchableOpacity, View } from 'react-native';

type SavingGoal = {
  id: string;
  nombre: string;
  meta: number;
  cantidadActual: number;
  plazo?: 'corto' | 'mediano' | 'largo' | null;
  fechaLimite?: any;
  creado?: any;
};

type GoalVelocity = {
  monthly: number;
  recentCount: number;
};

const DAY_MS = 1000 * 60 * 60 * 24;

const toDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const getDaysUntil = (targetDate: Date, now: Date) => {
  const diff = targetDate.getTime() - now.getTime();
  return Math.max(1, Math.ceil(diff / DAY_MS));
};

const formatEstimatedDuration = (days: number) => {
  const totalDays = Math.max(1, Math.round(days));
  const years = Math.floor(totalDays / 365);
  const remainingAfterYears = totalDays - (years * 365);
  const months = Math.floor(remainingAfterYears / 30);
  const remainingDays = remainingAfterYears - (months * 30);

  if (years > 0) {
    const yearLabel = years === 1 ? 'año' : 'años';
    const monthLabel = months === 1 ? 'mes' : 'meses';
    const dayLabel = remainingDays === 1 ? 'día' : 'días';

    if (months > 0 && remainingDays > 0) {
      return `${years} ${yearLabel}, ${months} ${monthLabel} y ${remainingDays} ${dayLabel}`;
    }

    if (months > 0) {
      return `${years} ${yearLabel} y ${months} ${monthLabel}`;
    }

    if (remainingDays > 0) {
      return `${years} ${yearLabel} y ${remainingDays} ${dayLabel}`;
    }

    return `${years} ${yearLabel}`;
  }

  if (months > 0 && remainingDays > 0) {
    return `${months} meses y ${remainingDays} días`;
  }

  if (months > 0) {
    return `${months} meses`;
  }

  if (totalDays === 1) {
    return '1 día';
  }

  return `${totalDays} días`;
};

const getMonthlyNetForDate = (
  transactions: any[],
  recurrentExpenses: any[],
  recurrentIncome: any[],
  referenceDate: Date = new Date(),
) => {
  const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const monthEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 23, 59, 59, 999);

  const monthIncome = transactions
    .filter((item) => item?.tipo === 'ingreso')
    .filter((item) => {
      const date = toDate(item?.fecha);
      return date && date >= monthStart && date <= monthEnd;
    })
    .reduce((sum, item) => sum + Number(item?.monto || 0), 0);

  const monthExpense = transactions
    .filter((item) => item?.tipo === 'egreso')
    .filter((item) => {
      const date = toDate(item?.fecha);
      return date && date >= monthStart && date <= monthEnd;
    })
    .reduce((sum, item) => sum + Number(item?.monto || 0), 0);

  const recurringIncome = recurrentIncome.reduce((sum, item) => sum + Number(item?.monto || 0), 0);
  const recurringExpense = recurrentExpenses.reduce((sum, item) => sum + Number(item?.monto || 0), 0);

  return monthIncome - monthExpense + recurringIncome - recurringExpense;
};

const getSustainableMonthlyNet = (
  transactions: any[],
  recurrentExpenses: any[],
  recurrentIncome: any[],
) => {
  const now = new Date();
  const monthlyValues = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return getMonthlyNetForDate(transactions, recurrentExpenses, recurrentIncome, date);
  });

  const validValues = monthlyValues.filter((value) => Number.isFinite(value));
  if (validValues.length === 0) return 0;

  const currentNet = validValues[validValues.length - 1] || 0;
  const avgNet = validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
  const sorted = [...validValues].sort((a, b) => a - b);
  const medianNet = sorted[Math.floor(sorted.length / 2)] || 0;

  return Math.min(currentNet, avgNet, medianNet);
};

export default function MetaMensualCard() {
  const { user } = useAuth();
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');

  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<SavingGoal[]>([]);
  const [goalIndex, setGoalIndex] = useState(0);
  const [monthlyNetIncome, setMonthlyNetIncome] = useState(0);
  const [velocityByGoal, setVelocityByGoal] = useState<Record<string, GoalVelocity>>({});
  const [projectionMode, setProjectionMode] = useState<'real' | 'conservative'>('conservative');
  const [isExpanded, setIsExpanded] = useState(true);

  const activeGoal = goals[goalIndex] || null;

  useEffect(() => {
    if (!user?.uid) return;

    const key = `konta.metaCard.expanded.${user.uid}`;
    AsyncStorage.getItem(key)
      .then((value) => {
        if (value === 'collapsed') setIsExpanded(false);
      })
      .catch(() => undefined);
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    const key = `konta.metaCard.expanded.${user.uid}`;
    AsyncStorage.setItem(key, isExpanded ? 'expanded' : 'collapsed').catch(() => undefined);
  }, [isExpanded, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    const key = `konta.metaCard.projectionMode.${user.uid}`;
    AsyncStorage.getItem(key)
      .then((value) => {
        if (value === 'real' || value === 'conservative') setProjectionMode(value);
      })
      .catch(() => undefined);
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    const key = `konta.metaCard.projectionMode.${user.uid}`;
    AsyncStorage.setItem(key, projectionMode).catch(() => undefined);
  }, [projectionMode, user?.uid]);

  useEffect(() => {
    const userId = (user as any)?.uid;
    if (!userId) {
      setGoals([]);
      setGoalIndex(0);
      setLoading(false);
      return;
    }

    const run = async () => {
      try {
        const [goalsSnap, transactionsSnap, expenseSnap, incomeSnap] = await Promise.all([
          getDocs(collection(db, `users/${userId}/ahorros`)),
          getDocs(collection(db, `users/${userId}/transacciones`)),
          getDocs(collection(db, `users/${userId}/gastosRecurrentes`)),
          getDocs(collection(db, `users/${userId}/ingresosRecurrentes`)),
        ]);

        const goalList = goalsSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((item) => Number(item.meta || 0) > 0)
          .map((item) => ({
            id: item.id,
            nombre: String(item.nombre || 'Meta'),
            meta: Number(item.meta || 0),
            cantidadActual: Number(item.cantidadActual || 0),
            plazo: item.plazo || null,
            fechaLimite: item.fechaLimite || null,
            creado: item.creado || null,
          }))
          .filter((item) => item.cantidadActual < item.meta)
          .sort((a, b) => (b.cantidadActual / b.meta) - (a.cantidadActual / a.meta));

        const velocityMap: Record<string, GoalVelocity> = {};

        for (const goal of goalList) {
          const movementSnap = await getDocs(collection(db, `users/${userId}/ahorros/${goal.id}/movimientos`));
          const movements = movementSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
          const recent = movements.filter((item) => {
            const date = toDate(item.creado);
            if (!date) return false;
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 90);
            return date >= cutoff;
          });

          const depositTotal = recent
            .filter((item) => item.tipo === 'deposito' || item.tipo === 'transferencia')
            .reduce((sum, item) => sum + Number(item.monto || 0), 0);

          velocityMap[goal.id] = {
            monthly: depositTotal / 3,
            recentCount: recent.length,
          };
        }

        setGoals(goalList);
        setGoalIndex(0);
        setVelocityByGoal(velocityMap);
        const transactions = transactionsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        const expenses = expenseSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        const income = incomeSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

        setMonthlyNetIncome(getSustainableMonthlyNet(transactions, expenses, income));
      } catch (error) {
        console.log('No se pudo cargar meta mensual:', error);
        setGoals([]);
        setVelocityByGoal({});
        setMonthlyNetIncome(0);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [user]);

  const values = useMemo(() => {
    if (!activeGoal) return null;

    const restante = Math.max(0, activeGoal.meta - activeGoal.cantidadActual);
    const progress = activeGoal.meta > 0 ? Math.min(100, (activeGoal.cantidadActual / activeGoal.meta) * 100) : 0;
    const now = new Date();
    const fechaLimite = toDate(activeGoal.fechaLimite);
    let targetDate = fechaLimite;

    if (!targetDate && activeGoal.plazo) {
      const creado = toDate(activeGoal.creado) || now;
      const daysByPlazo = activeGoal.plazo === 'corto' ? 30 : activeGoal.plazo === 'mediano' ? 365 : 730;
      targetDate = new Date(creado.getTime() + daysByPlazo * DAY_MS);
    }

    if (!targetDate) {
      targetDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    const activeGoals = goals.filter((item) => item.cantidadActual < item.meta && item.meta > 0);
    const totalNeeded = activeGoals.reduce((sum, item) => {
      const remaining = Math.max(0, item.meta - item.cantidadActual);
      const target = toDate(item.fechaLimite) || (toDate(item.creado) ? new Date(toDate(item.creado)!.getTime() + ((item.plazo === 'corto' ? 30 : item.plazo === 'mediano' ? 365 : 730) * DAY_MS)) : new Date(now.getFullYear(), now.getMonth() + 1, 0));
      const daysLeft = getDaysUntil(target, now);
      return sum + (remaining / Math.max(1, daysLeft / 30));
    }, 0);

    const monthlyShare = activeGoals.length > 0 ? Math.max(0, monthlyNetIncome / activeGoals.length) : 0;
    const observedMonthly = velocityByGoal[activeGoal.id]?.monthly || 0;
    const pace = observedMonthly > 0 ? Math.max(monthlyShare, Math.min(observedMonthly * 1.2, monthlyShare > 0 ? monthlyShare * 1.4 : observedMonthly)) : monthlyShare;
    const safePace = Math.max(0, monthlyNetIncome > 0 ? monthlyNetIncome : observedMonthly);
    const projectionPace = projectionMode === 'real'
      ? Math.max(0, Math.max(pace, safePace * 0.7))
      : Math.max(0, Math.min(safePace, Math.max(0, monthlyNetIncome * 0.9)));
    const dailyTarget = Math.max(0, restante / Math.max(1, getDaysUntil(targetDate, now)));
    const forecastDays = projectionPace > 0 ? (restante / (projectionPace / 30)) : null;
    const targetDays = getDaysUntil(targetDate, now);
    const onTrack = forecastDays !== null && Number.isFinite(forecastDays) ? forecastDays <= targetDays : false;
    const statusColor = onTrack ? '#22c55e' : (forecastDays !== null && Number.isFinite(forecastDays) ? '#ef4444' : '#f59e0b');
    const statusLabel = onTrack ? 'En camino' : (forecastDays !== null && Number.isFinite(forecastDays) ? 'Fuera de tiempo' : 'Sin estimación');

    let estimateText = 'Tu flujo actual no alcanza para esta meta.';
    if (forecastDays !== null && Number.isFinite(forecastDays)) {
      const display = formatEstimatedDuration(forecastDays);
      estimateText = `A tu ritmo ${projectionMode === 'conservative' ? 'conservador' : 'actual'}, te tomaría ${display} .`;
    }

    const distributionText = activeGoals.length > 1
      ? `Hay ${activeGoals.length} metas activas y el ingreso neto mensual se reparte entre ellas.`
      : 'Se calcula con el ingreso neto mensual disponible para esta meta.';

    const requiredMonthly = totalNeeded > 0 ? restante / Math.max(1, getDaysUntil(targetDate, now) / 30) : 0;
    const comparisonText = requiredMonthly > 0 && monthlyNetIncome > 0
      ? `Necesitas alrededor de $${requiredMonthly.toFixed(0)}/mes; se toma tu ingreso neto mensual de $${monthlyNetIncome.toFixed(0)}/mes.`
      : 'Se toma el ingreso neto mensual real del mes, menos egresos y recurrentes, para estimar la meta.';

    return {
      restante,
      progress,
      dailyTarget,
      targetLabel: targetDate.toLocaleDateString('es-MX'),
      estimateText,
      distributionText,
      comparisonText,
      onTrack,
      statusColor,
      statusLabel,
      forecastDays,
      targetDays,
      projectionPace,
    };
  }, [activeGoal, goals, monthlyNetIncome, projectionMode, velocityByGoal]);

  const canCycleGoals = goals.length > 1;
  const goalSummary = activeGoal && values ? (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <ThemedText style={{ fontSize: 13, fontWeight: '700', flexShrink: 1 }}>{activeGoal.nombre}</ThemedText>
        <View style={{ backgroundColor: `${values.statusColor}1A`, borderRadius: 999, borderWidth: 1, borderColor: `${values.statusColor}55`, paddingHorizontal: 8, paddingVertical: 4 }}>
          <ThemedText style={{ fontSize: 10, color: values.statusColor }}>{values.statusLabel}</ThemedText>
        </View>
      </View>
      <View style={{ height: 8, borderRadius: 999, backgroundColor: `${primaryColor}18`, overflow: 'hidden', marginBottom: 8 }}>
        <View style={{ width: `${Math.min(100, values.progress)}%`, height: '100%', borderRadius: 999, backgroundColor: values.onTrack ? '#22c55e' : '#f59e0b' }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
        <ThemedText style={{ fontSize: 12, opacity: 0.82 }}>${activeGoal.cantidadActual.toFixed(0)} / ${activeGoal.meta.toFixed(0)}</ThemedText>
        <ThemedText style={{ fontSize: 12, fontWeight: '700' }}>{values.progress.toFixed(0)}%</ThemedText>
      </View>
    </>
  ) : null;

  return (
    <ThemedView
      style={{
        width: '95%',
        borderRadius: 16,
        padding: 14,
        marginTop: 12,
        marginBottom: 8,
        backgroundColor: cardsMain,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowOffset: { width: 0, height: 12 },
        shadowRadius: 22,
        elevation: 5,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              backgroundColor: `${primaryColor}18`,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: `${primaryColor}33`,
            }}
          >
            <Ionicons name="flag-outline" size={18} color={primaryColor} />
          </View>
          <ThemedText style={{ marginLeft: 8, fontSize: 15, fontWeight: '700' }}>Meta de ahorro</ThemedText>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => setIsExpanded((prev) => !prev)}
            style={{
              marginRight: 6,
              paddingHorizontal: 8,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: `${primaryColor}12`,
              borderWidth: 1,
              borderColor: `${primaryColor}22`,
            }}
          >
            <ThemedText style={{ fontSize: 10, fontWeight: '700' }}>{isExpanded ? 'Compacto' : 'Detalle'}</ThemedText>
          </TouchableOpacity>

          {canCycleGoals && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: `${primaryColor}12`, borderRadius: 999, padding: 4 }}>
              <TouchableOpacity
                onPress={() => setGoalIndex((prev) => (prev === 0 ? goals.length - 1 : prev - 1))}
                style={{ paddingHorizontal: 6, paddingVertical: 4 }}
              >
                <Ionicons name="chevron-back" size={18} color={primaryColor} />
              </TouchableOpacity>
              <ThemedText style={{ fontSize: 11, opacity: 0.7, marginHorizontal: 4 }}>
                {goalIndex + 1}/{goals.length}
              </ThemedText>
              <TouchableOpacity
                onPress={() => setGoalIndex((prev) => (prev + 1) % goals.length)}
                style={{ paddingHorizontal: 6, paddingVertical: 4 }}
              >
                <Ionicons name="chevron-forward" size={18} color={primaryColor} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={primaryColor} />
      ) : !activeGoal || !values ? (
        <ThemedText style={{ fontSize: 12, opacity: 0.82 }}>No tienes metas activas con objetivo definido.</ThemedText>
      ) : !isExpanded ? (
        <>
          {goalSummary}

          <ThemedText style={{ fontSize: 12, opacity: 0.9, color: values.statusColor }}>{values.estimateText}</ThemedText>
          <ThemedText style={{ fontSize: 12, opacity: 0.78, marginBottom: 8 }}>
            Objetivo calculado al {values.targetLabel}.
          </ThemedText>
        </>
      ) : (
        <>
          {goalSummary}

          <View
            style={{
              flexDirection: 'row',
              backgroundColor: `${primaryColor}10`,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: `${primaryColor}20`,
              padding: 8,
              marginBottom: 8,
            }}
          >
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontSize: 10, opacity: 0.7 }}>Faltan</ThemedText>
              <ThemedText style={{ fontSize: 12, fontWeight: '700' }}>${values.restante.toFixed(0)}</ThemedText>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <ThemedText style={{ fontSize: 10, opacity: 0.7 }}>Ritmo</ThemedText>
              <ThemedText style={{ fontSize: 12, fontWeight: '700' }}>${values.dailyTarget.toFixed(0)}/día</ThemedText>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <ThemedText style={{ fontSize: 12, marginRight: 8, opacity: 0.96 }}>{values.estimateText}</ThemedText>
          </View>

          <View
            style={{
              flexDirection: 'row',
              backgroundColor: `${values.statusColor}0D`,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: `${values.statusColor}26`,
              padding: 8,
              marginBottom: 8,
            }}
          >
            <ThemedText style={{ fontSize: 11, color: values.statusColor}}>
              {values.statusLabel} · {values.forecastDays !== null && Number.isFinite(values.forecastDays) ? formatEstimatedDuration(values.forecastDays) : 'Sin estimación'}
            </ThemedText>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Pressable
              onPress={() => setProjectionMode('conservative')}
              style={{
                flex: 1,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: projectionMode === 'conservative' ? primaryColor : cardsMain,
                borderWidth: 1,
                borderColor: projectionMode === 'conservative' ? primaryColor : `${primaryColor}55`,
                marginRight: 6,
                alignItems: 'center',
              }}
            >
              <ThemedText style={{ fontSize: 11, fontWeight: '700', color: projectionMode === 'conservative' ? '#fff' : '#ddd' }}>Conservador</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setProjectionMode('real')}
              style={{
                flex: 1,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: projectionMode === 'real' ? primaryColor : cardsMain,
                borderWidth: 1,
                borderColor: projectionMode === 'real' ? primaryColor : `${primaryColor}55`,
                marginLeft: 6,
                alignItems: 'center',
              }}
            >
              <ThemedText style={{ fontSize: 11, fontWeight: '700', color: projectionMode === 'real' ? '#fff' : '#ddd' }}>Ritmo real</ThemedText>
            </Pressable>
          </View>

          <ThemedText style={{ fontSize: 11, opacity: 0.74, marginBottom: 6 }}>
            {values.distributionText}
          </ThemedText>
          <ThemedText style={{ fontSize: 11, opacity: 0.72, marginBottom: 8 }}>
            {values.comparisonText}
          </ThemedText>
          <ThemedText style={{ fontSize: 12, opacity: 0.78, marginBottom: 8 }}>
            Objetivo calculado al {values.targetLabel}.
          </ThemedText>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/AhorrosScreen')}
            style={{
              alignSelf: 'flex-start',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: `${primaryColor}55`,
              backgroundColor: `${primaryColor}14`,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <ThemedText style={{ fontSize: 12, fontWeight: '700' }}>Ver metas</ThemedText>
          </TouchableOpacity>
        </>
      )}
    </ThemedView>
  );
}
