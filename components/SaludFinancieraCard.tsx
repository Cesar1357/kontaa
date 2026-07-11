import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, query, Timestamp, where } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

export default function SaludFinancieraCard() {
  const { user } = useAuth();
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');

  const [loading, setLoading] = useState(true);
  const [ingresos, setIngresos] = useState(0);
  const [egresos, setEgresos] = useState(0);

  useEffect(() => {
    if (!user?.uid) return;

    const start = new Date();
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);

    const ref = collection(db, `users/${user.uid}/transacciones`);
    const q = query(ref, where('fecha', '>=', Timestamp.fromDate(start)));

    const unsub = onSnapshot(
      q,
      (snap) => {
        let nextIngresos = 0;
        let nextEgresos = 0;

        snap.forEach((d) => {
          const data = d.data() as any;
          const amount = Number(data?.monto || 0);
          if (!amount) return;
          if (data?.tipo === 'ingreso') nextIngresos += amount;
          if (data?.tipo === 'egreso') nextEgresos += amount;
        });

        setIngresos(nextIngresos);
        setEgresos(nextEgresos);
        setLoading(false);
      },
      () => setLoading(false),
    );

    return () => unsub();
  }, [user?.uid]);

  const stats = useMemo(() => {
    const neto = ingresos - egresos;
    const tasa = ingresos > 0 ? (neto / ingresos) * 100 : egresos > 0 ? -100 : 0;

    if (neto >= 0 && tasa >= 20) {
      return { color: '#22c55e', icon: 'pulse', estado: 'Excelente salud semanal' };
    }
    if (neto >= 0) {
      return { color: '#f59e0b', icon: 'analytics', estado: 'Salud estable, ojo con gastos' };
    }
    return { color: '#ef4444', icon: 'warning', estado: 'Balance negativo esta semana' };
  }, [ingresos, egresos]);

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
        <Ionicons name={stats.icon as any} size={18} color={stats.color} />
        <ThemedText style={{ marginLeft: 8, fontSize: 15, fontWeight: '700' }}>Salud financiera semanal</ThemedText>
      </View>

      {loading ? (
        <ActivityIndicator color={primaryColor} />
      ) : (
        <>
          <ThemedText style={{ fontSize: 12, opacity: 0.82, marginBottom: 10 }}>{stats.estado}</ThemedText>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <ThemedText style={{ fontSize: 12, color: '#22c55e' }}>Ingresos: ${ingresos.toFixed(0)}</ThemedText>
            <ThemedText style={{ fontSize: 12, color: '#ef4444' }}>Gastos: ${egresos.toFixed(0)}</ThemedText>
            <ThemedText style={{ fontSize: 12, color: textColor }}>Neto: ${(ingresos - egresos).toFixed(0)}</ThemedText>
          </View>
        </>
      )}
    </ThemedView>
  );
}
