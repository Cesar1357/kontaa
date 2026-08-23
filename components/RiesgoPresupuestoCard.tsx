import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDocs, onSnapshot, query, Timestamp, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

export default function RiesgoPresupuestoCard() {
  const { user } = useAuth();
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');

  const [loading, setLoading] = useState(true);
  const [monthlyBudget, setMonthlyBudget] = useState(0);
  const [monthlySpent, setMonthlySpent] = useState(0);
  const [monthlyRecurringActualSpent, setMonthlyRecurringActualSpent] = useState(0);
  const [monthlyRecurringPendingSpent, setMonthlyRecurringPendingSpent] = useState(0);

  const toMonthlyAmount = (item: any) => {
    const amount = Number(item?.monto || 0);
    const frecuencia = String(item?.frecuencia || 'mensual').toLowerCase();

    if (frecuencia.includes('dia')) return amount * 30;
    if (frecuencia.includes('sem')) return amount * 4.33;
    if (frecuencia.includes('quin')) return amount * 2;
    if (frecuencia.includes('an')) return amount / 12;
    return amount;
  };

  useEffect(() => {
    const userId = (user as any)?.uid;
    if (!userId) {
      setMonthlyBudget(0);
      setMonthlySpent(0);
      setMonthlyRecurringActualSpent(0);
      setMonthlyRecurringPendingSpent(0);
      setLoading(false);
      return;
    }

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

    const userUnsub = onSnapshot(doc(db, 'users', userId), (userDoc) => {
      const data = userDoc.data() as any;
      const presupuestoMes = Number(data?.presupuestos?.mes ?? data?.presupuestos?.mensual ?? 0);
      setMonthlyBudget(presupuestoMes);
    });

    const q = query(
      collection(db, `users/${userId}/transacciones`),
      where('fecha', '>=', Timestamp.fromDate(start)),
      where('tipo', '==', 'egreso'),
    );

    const transactionsUnsub = onSnapshot(
      q,
      async (snap) => {
        try {
          const currentMonthTransactions = snap.docs.map((d) => d.data() as any);
          const normalSpent = currentMonthTransactions
            .filter((item) => !item?.recurrenteId)
            .reduce((acc, item) => acc + Number(item?.monto || 0), 0);

          const recurringActualSpent = currentMonthTransactions
            .filter((item) => item?.recurrenteId)
            .reduce((acc, item) => acc + Number(item?.monto || 0), 0);

          const recurrentesSnap = await getDocs(collection(db, `users/${userId}/gastosRecurrentes`));
          const recurrentesPendientes = recurrentesSnap.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) }))
            .filter((item) => item?.activo !== false && !currentMonthTransactions.some((tx) => tx?.recurrenteId === item?.id))
            .reduce((acc, item) => acc + toMonthlyAmount(item), 0);

          setMonthlySpent(normalSpent);
          setMonthlyRecurringActualSpent(recurringActualSpent);
          setMonthlyRecurringPendingSpent(recurrentesPendientes);
          setLoading(false);
        } catch (error) {
          console.log('No se pudo calcular riesgo de presupuesto:', error);
          setLoading(false);
        }
      },
      () => {
        setLoading(false);
      },
    );

    return () => {
      userUnsub();
      transactionsUnsub();
    };
  }, [user]);

  const projection = useMemo(() => {
    const now = new Date();
    const daysPassed = Math.max(1, now.getDate());
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const projectedByTransactions = (monthlySpent / daysPassed) * daysInMonth;
    const projected = projectedByTransactions + monthlyRecurringActualSpent + monthlyRecurringPendingSpent;

    let status = 'Sin presupuesto mensual';
    let color = '#94a3b8';

    if (monthlyBudget > 0) {
      const usage = (projected / monthlyBudget) * 100;
      if (usage <= 85) {
        status = 'Riesgo bajo';
        color = '#22c55e';
      } else if (usage <= 100) {
        status = 'Riesgo medio';
        color = '#f59e0b';
      } else {
        status = 'Riesgo alto';
        color = '#ef4444';
      }
    }

    return { projected, projectedByTransactions, status, color };
  }, [monthlyBudget, monthlySpent, monthlyRecurringActualSpent, monthlyRecurringPendingSpent]);

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
          <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: `${projection.color}18`, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="alert-circle-outline" size={18} color={projection.color} />
          </View>
          <ThemedText style={{ marginLeft: 8, fontSize: 15 }}>Riesgo de presupuesto</ThemedText>
        </View>
        <ThemedText style={{ fontSize: 11, color: projection.color, fontWeight: '700' }}>{projection.status}</ThemedText>
      </View>

      {loading ? (
        <ActivityIndicator color={primaryColor} />
      ) : (
        <>
          <View style={{ backgroundColor: `${projection.color}12`, borderRadius: 12, borderWidth: 1, borderColor: `${projection.color}20`, padding: 10, marginBottom: 8 }}>
            <ThemedText style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>Proyección al cierre</ThemedText>
            <ThemedText style={{ fontSize: 18, fontWeight: '800' }}>
              ${projection.projected.toFixed(0)} / ${monthlyBudget.toFixed(0)}
            </ThemedText>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontSize: 10, opacity: 0.7 }}>Transacc.</ThemedText>
              <ThemedText style={{ fontSize: 12, fontWeight: '700' }}>${projection.projectedByTransactions.toFixed(0)}</ThemedText>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <ThemedText style={{ fontSize: 10, opacity: 0.7 }}>Recurrentes</ThemedText>
              <ThemedText style={{ fontSize: 12, fontWeight: '700' }}>${monthlyRecurringActualSpent.toFixed(0)}</ThemedText>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <ThemedText style={{ fontSize: 10, opacity: 0.7 }}>Pendientes</ThemedText>
              <ThemedText style={{ fontSize: 12, fontWeight: '700' }}>${monthlyRecurringPendingSpent.toFixed(0)}</ThemedText>
            </View>
          </View>

          <ThemedText style={{ fontSize: 11, opacity: 0.72 }}>
            Incluye transacciones normales, recurrentes ya cobrados y los pendientes del calendario del mes.
          </ThemedText>
        </>
      )}
    </ThemedView>
  );
}
