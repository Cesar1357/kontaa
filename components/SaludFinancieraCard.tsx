import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, query, Timestamp, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

export default function SaludFinancieraCard() {
  const { user } = useAuth();
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');

  const daysWindow = 7;
  const [loading, setLoading] = useState(true);
  const [ingresos, setIngresos] = useState(0);
  const [egresos, setEgresos] = useState(0);
  const [movimientos, setMovimientos] = useState(0);

  useEffect(() => {
    if (!user?.uid) return;

    const start = new Date();
    start.setDate(start.getDate() - daysWindow);
    start.setHours(0, 0, 0, 0);

    const ref = collection(db, `users/${user.uid}/transacciones`);
    const q = query(ref, where('fecha', '>=', Timestamp.fromDate(start)));

    const unsub = onSnapshot(
      q,
      (snap) => {
        let nextIngresos = 0;
        let nextEgresos = 0;
        let nextMovimientos = 0;

        snap.forEach((d) => {
          const data = d.data() as any;
          const amount = Number(data?.monto || 0);
          if (!amount) return;
          nextMovimientos += 1;
          if (data?.tipo === 'ingreso') nextIngresos += amount;
          if (data?.tipo === 'egreso') nextEgresos += amount;
        });

        setIngresos(nextIngresos);
        setEgresos(nextEgresos);
        setMovimientos(nextMovimientos);
        setLoading(false);
      },
      () => setLoading(false),
    );

    return () => unsub();
  }, [user?.uid]);

  const stats = useMemo(() => {
    const neto = ingresos - egresos;
    const tasa = ingresos > 0 ? (neto / ingresos) * 100 : egresos > 0 ? -100 : 0;
    const promedioIngresos = ingresos / daysWindow;
    const promedioEgresos = egresos / daysWindow;
    const promedioNeto = neto / daysWindow;

    if (neto >= 0 && tasa >= 20) {
      return { color: '#22c55e', icon: 'pulse', estado: 'Excelente salud semanal' };
    }
    if (neto >= 0) {
      return { color: '#f59e0b', icon: 'analytics', estado: 'Salud estable, ojo con gastos' };
    }
    return { color: '#ef4444', icon: 'warning', estado: 'Balance negativo esta semana' };
  }, [ingresos, egresos]);

  const neto = ingresos - egresos;
  const tasaAhorro = ingresos > 0 ? (neto / ingresos) * 100 : egresos > 0 ? -100 : 0;
  const promedioIngresos = ingresos / daysWindow;
  const promedioEgresos = egresos / daysWindow;
  const promedioNeto = neto / daysWindow;

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
          <ThemedText style={{ fontSize: 12, opacity: 0.82, marginBottom: 4 }}>{stats.estado}</ThemedText>
          <ThemedText style={{ fontSize: 11, opacity: 0.62, marginBottom: 10 }}>Últimos {daysWindow} días · {movimientos} movimientos</ThemedText>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontSize: 11, opacity: 0.68 }}>Ingresos</ThemedText>
              <ThemedText style={{ fontSize: 14, color: '#22c55e', fontWeight: '700' }}>${ingresos.toFixed(0)}</ThemedText>
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontSize: 11, opacity: 0.68 }}>Gastos</ThemedText>
              <ThemedText style={{ fontSize: 14, color: '#ef4444', fontWeight: '700' }}>${egresos.toFixed(0)}</ThemedText>
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontSize: 11, opacity: 0.68 }}>Neto</ThemedText>
              <ThemedText style={{ fontSize: 14, color: textColor, fontWeight: '700' }}>${neto.toFixed(0)}</ThemedText>
            </View>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontSize: 11, opacity: 0.68 }}>Prom. diario ingresos</ThemedText>
              <ThemedText style={{ fontSize: 13, color: textColor, fontWeight: '600' }}>${promedioIngresos.toFixed(0)}</ThemedText>
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontSize: 11, opacity: 0.68 }}>Prom. diario gastos</ThemedText>
              <ThemedText style={{ fontSize: 13, color: textColor, fontWeight: '600' }}>${promedioEgresos.toFixed(0)}</ThemedText>
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontSize: 11, opacity: 0.68 }}>Tasa de ahorro</ThemedText>
              <ThemedText style={{ fontSize: 13, color: stats.color, fontWeight: '600' }}>{tasaAhorro.toFixed(0)}%</ThemedText>
            </View>
          </View>
        </>
      )}
    </ThemedView>
  );
}
