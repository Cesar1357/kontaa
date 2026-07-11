import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';

type SavingGoal = {
  id: string;
  nombre: string;
  meta: number;
  cantidadActual: number;
};

export default function MetaMensualCard() {
  const { user } = useAuth();
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');

  const [loading, setLoading] = useState(true);
  const [goal, setGoal] = useState<SavingGoal | null>(null);

  useEffect(() => {
    if (!user?.uid) return;

    const run = async () => {
      try {
        const ref = collection(db, `users/${user.uid}/ahorros`);
        const snap = await getDocs(ref);
        const goals = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((item) => Number(item.meta || 0) > 0)
          .map((item) => ({
            id: item.id,
            nombre: String(item.nombre || 'Meta'),
            meta: Number(item.meta || 0),
            cantidadActual: Number(item.cantidadActual || 0),
          }))
          .filter((item) => item.cantidadActual < item.meta)
          .sort((a, b) => (b.cantidadActual / b.meta) - (a.cantidadActual / a.meta));

        setGoal(goals[0] || null);
      } catch (error) {
        console.log('No se pudo cargar meta mensual:', error);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [user?.uid]);

  const values = useMemo(() => {
    if (!goal) return null;

    const restante = Math.max(0, goal.meta - goal.cantidadActual);
    const progress = goal.meta > 0 ? Math.min(100, (goal.cantidadActual / goal.meta) * 100) : 0;
    const now = new Date();
    const daysLeft = Math.max(1, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate());
    const dailyTarget = restante / daysLeft;

    return { restante, progress, dailyTarget };
  }, [goal]);

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
        <Ionicons name="flag-outline" size={18} color={primaryColor} />
        <ThemedText style={{ marginLeft: 8, fontSize: 15, fontWeight: '700' }}>Meta del mes</ThemedText>
      </View>

      {loading ? (
        <ActivityIndicator color={primaryColor} />
      ) : !goal || !values ? (
        <ThemedText style={{ fontSize: 12, opacity: 0.82 }}>No tienes metas activas con objetivo definido.</ThemedText>
      ) : (
        <>
          <ThemedText style={{ fontSize: 13, fontWeight: '700', marginBottom: 4 }}>{goal.nombre}</ThemedText>
          <ThemedText style={{ fontSize: 12, opacity: 0.82, marginBottom: 8 }}>
            ${goal.cantidadActual.toFixed(0)} / ${goal.meta.toFixed(0)} ({values.progress.toFixed(0)}%)
          </ThemedText>
          <ThemedText style={{ fontSize: 12, marginBottom: 8 }}>
            Te faltan ${values.restante.toFixed(0)}. Ritmo recomendado: ${values.dailyTarget.toFixed(0)} por dia.
          </ThemedText>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/AhorrosScreen')}
            style={{
              alignSelf: 'flex-start',
              borderRadius: 8,
              borderWidth: 1,
              borderColor: `${primaryColor}55`,
              paddingHorizontal: 10,
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
