import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

type RecurrentItem = {
  id: string;
  nombre: string;
  monto: number;
  diaPago: number;
  tipo: 'ingreso' | 'egreso';
  nextDate: Date;
  daysLeft: number;
};

const nextPaymentDate = (day: number) => {
  const now = new Date();
  const safeDay = Math.max(1, Math.min(28, Number(day || 1)));
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), safeDay, 0, 0, 0, 0);
  if (thisMonth >= now) return thisMonth;
  return new Date(now.getFullYear(), now.getMonth() + 1, safeDay, 0, 0, 0, 0);
};

export default function ProximosRecurrentesCard() {
  const { user } = useAuth();
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<RecurrentItem[]>([]);

  useEffect(() => {
    if (!user?.uid) return;

    const gastosRef = collection(db, `users/${user.uid}/gastosRecurrentes`);
    const ingresosRef = collection(db, `users/${user.uid}/ingresosRecurrentes`);

    let gastos: any[] = [];
    let ingresos: any[] = [];

    const flush = () => {
      const now = new Date();
      const next = [
        ...gastos.map((item) => ({ ...item, tipo: 'egreso' as const })),
        ...ingresos.map((item) => ({ ...item, tipo: 'ingreso' as const })),
      ]
        .filter((item) => item.activo !== false)
        .map((item) => {
          const nextDate = nextPaymentDate(Number(item.diaPago || 1));
          const daysLeft = Math.max(0, Math.ceil((nextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
          return {
            id: item.id,
            nombre: item.nombre || 'Recurrente',
            monto: Number(item.monto || 0),
            diaPago: Number(item.diaPago || 1),
            tipo: item.tipo,
            nextDate,
            daysLeft,
          };
        })
        .sort((a, b) => a.daysLeft - b.daysLeft)
        .slice(0, 3);

      setItems(next);
      setLoading(false);
    };

    const unsubGastos = onSnapshot(gastosRef, (snap) => {
      gastos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      flush();
    });

    const unsubIngresos = onSnapshot(ingresosRef, (snap) => {
      ingresos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      flush();
    });

    return () => {
      unsubGastos();
      unsubIngresos();
    };
  }, [user?.uid]);

  const subtitle = useMemo(() => {
    if (items.length === 0) return 'Aún no tienes recurrentes activos.';
    return 'Tus proximos movimientos programados';
  }, [items.length]);

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
        <Ionicons name="calendar-outline" size={18} color={primaryColor} />
        <ThemedText style={{ marginLeft: 8, fontSize: 15, fontWeight: '700' }}>Próximos recurrentes</ThemedText>
      </View>
      <ThemedText style={{ fontSize: 12, opacity: 0.82, marginBottom: 10 }}>{subtitle}</ThemedText>

      {loading ? (
        <ActivityIndicator color={primaryColor} />
      ) : (
        items.map((item) => (
          <View key={item.id} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <ThemedText style={{ fontSize: 12, opacity: 0.88 }}>
              {item.tipo === 'egreso' ? 'Gasto' : 'Ingreso'} • {item.nombre}
            </ThemedText>
            <ThemedText style={{ fontSize: 12, fontWeight: '700' }}>
              ${item.monto.toFixed(0)} · {item.daysLeft}d
            </ThemedText>
          </View>
        ))
      )}
    </ThemedView>
  );
}
