import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Ionicons } from '@expo/vector-icons';
import { collection, getDocs, query, Timestamp, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

type LeakItem = {
  category: string;
  delta: number;
  growth: number;
};

export default function FugasGastoCard() {
  const { user } = useAuth();
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');

  const [loading, setLoading] = useState(true);
  const [leaks, setLeaks] = useState<LeakItem[]>([]);

  useEffect(() => {
    if (!user?.uid) return;

    const run = async () => {
      try {
        const now = new Date();
        const startCurrent = new Date(now);
        startCurrent.setDate(now.getDate() - 7);
        startCurrent.setHours(0, 0, 0, 0);

        const startPrev = new Date(now);
        startPrev.setDate(now.getDate() - 14);
        startPrev.setHours(0, 0, 0, 0);

        const q = query(
          collection(db, `users/${user.uid}/transacciones`),
          where('fecha', '>=', Timestamp.fromDate(startPrev)),
          where('tipo', '==', 'egreso'),
        );

        const snap = await getDocs(q);
        const currentMap: Record<string, number> = {};
        const prevMap: Record<string, number> = {};

        snap.forEach((d) => {
          const data = d.data() as any;
          const amount = Number(data?.monto || 0);
          if (!amount) return;

          const date = data?.fecha?.toDate ? data.fecha.toDate() : new Date(data?.fecha || 0);
          const key = String(data?.presupuestoCategoria || data?.preestablecidoSubNombre || 'Sin categoria');

          if (date >= startCurrent) {
            currentMap[key] = (currentMap[key] || 0) + amount;
          } else {
            prevMap[key] = (prevMap[key] || 0) + amount;
          }
        });

        const keys = Array.from(new Set([...Object.keys(currentMap), ...Object.keys(prevMap)]));
        const next = keys
          .map((key) => {
            const current = currentMap[key] || 0;
            const previous = prevMap[key] || 0;
            const delta = current - previous;
            const growth = previous > 0 ? (delta / previous) * 100 : current > 0 ? 100 : 0;
            return { category: key, delta, growth };
          })
          .filter((item) => item.delta > 0)
          .sort((a, b) => b.delta - a.delta)
          .slice(0, 3);

        setLeaks(next);
      } catch (error) {
        console.log('No se pudo calcular fugas de gasto:', error);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [user?.uid]);

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
        <Ionicons name="water-outline" size={18} color={primaryColor} />
        <ThemedText style={{ marginLeft: 8, fontSize: 15, fontWeight: '700' }}>Top fugas de gasto</ThemedText>
      </View>

      {loading ? (
        <ActivityIndicator color={primaryColor} />
      ) : leaks.length === 0 ? (
        <ThemedText style={{ fontSize: 12, opacity: 0.82 }}>No se detectaron aumentos de gasto relevantes.</ThemedText>
      ) : (
        leaks.map((item) => (
          <View key={item.category} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <ThemedText style={{ fontSize: 12, opacity: 0.88 }}>{item.category}</ThemedText>
            <ThemedText style={{ fontSize: 12, fontWeight: '700', color: '#ef4444' }}>
              +${item.delta.toFixed(0)} ({item.growth.toFixed(0)}%)
            </ThemedText>
          </View>
        ))
      )}
    </ThemedView>
  );
}
