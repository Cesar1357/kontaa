import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDoc, getDocs, query, Timestamp, where } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

export default function RiesgoPresupuestoCard() {
  const { user } = useAuth();
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');

  const [loading, setLoading] = useState(true);
  const [monthlyBudget, setMonthlyBudget] = useState(0);
  const [monthlySpent, setMonthlySpent] = useState(0);

  useEffect(() => {
    if (!user?.uid) return;

    const run = async () => {
      try {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const presupuestoMes = Number((userDoc.data() as any)?.presupuestos?.mes || 0);

        const q = query(
          collection(db, `users/${user.uid}/transacciones`),
          where('fecha', '>=', Timestamp.fromDate(start)),
          where('tipo', '==', 'egreso'),
        );

        const snap = await getDocs(q);
        const spent = snap.docs.reduce((acc, d) => acc + Number((d.data() as any)?.monto || 0), 0);

        setMonthlyBudget(presupuestoMes);
        setMonthlySpent(spent);
      } catch (error) {
        console.log('No se pudo calcular riesgo de presupuesto:', error);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [user?.uid]);

  const projection = useMemo(() => {
    const now = new Date();
    const daysPassed = Math.max(1, now.getDate());
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const projected = (monthlySpent / daysPassed) * daysInMonth;

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

    return { projected, status, color };
  }, [monthlyBudget, monthlySpent]);

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
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Ionicons name="alert-circle-outline" size={18} color={projection.color} />
        <ThemedText style={{ marginLeft: 8, fontSize: 15, fontWeight: '700' }}>Riesgo de presupuesto</ThemedText>
      </View>

      {loading ? (
        <ActivityIndicator color={primaryColor} />
      ) : (
        <>
          <ThemedText style={{ fontSize: 12, opacity: 0.82, marginBottom: 8 }}>
            Proyección al cierre del mes: ${projection.projected.toFixed(0)} / ${monthlyBudget.toFixed(0)}
          </ThemedText>
          <ThemedText style={{ fontSize: 12, fontWeight: '700', color: projection.color }}>{projection.status}</ThemedText>
        </>
      )}
    </ThemedView>
  );
}
