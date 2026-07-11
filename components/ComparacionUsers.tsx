import { useThemeColor } from "@/hooks/useThemeColor";
import { Ionicons } from "@expo/vector-icons";
import {
  collection,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { RFValue } from "react-native-responsive-fontsize";
import { db } from "../config/firebase";
import { useAuth } from "../hooks/useAuth";

export default function CardComparativaTransacciones() {
  const { uid } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sampleSize, setSampleSize] = useState(0);
  const [insights, setInsights] = useState<Array<{ label: string; value: number; delta: number; positiveIsGood?: boolean }>>([]);
  const cardsColor = useThemeColor({light:'',dark:''},'cardsMain');
  const textColor = useThemeColor({light:'',dark:''},'text');

  const styles = StyleSheet.create({
  simpleCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: cardsColor,
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 10,
    marginVertical: RFValue(10),
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 22,
    elevation: 5,
  },
  simpleCardTitle: {
    color: "#aaa",
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  simpleCardText: {
    flex: 1,
    color: textColor,
    fontSize: 12,
    lineHeight: 20,
  },
});

  const getMedian = (values: number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
    return sorted[mid];
  };

  useEffect(() => {
    const cargarComparativa = async () => {
      if (!uid) return;

      try {
        const ahora = new Date();
        const hace7dias = new Date();
        hace7dias.setDate(ahora.getDate() - 7);

        const usersSnap = await getDocs(query(collection(db, "users"), limit(25)));

        const allUsersData: Array<{ uid: string; ingresos: number; egresos: number; neto: number }> = [];
        let me = { ingresos: 0, egresos: 0, neto: 0 };

        for (const u of usersSnap.docs) {
          const transSnap = await getDocs(
            query(
              collection(db, `users/${u.id}/transacciones`),
              where("fecha", ">=", hace7dias)
            )
          );

          let ingresos = 0;
          let egresos = 0;

          transSnap.forEach((doc) => {
            const data = doc.data();
            if (typeof data.monto === "number" && typeof data.tipo === "string") {
              if (data.tipo === "ingreso") ingresos += data.monto;
              else if (data.tipo === "egreso") egresos += data.monto;
            }
          });

          const hasActivity = ingresos > 0 || egresos > 0;
          if (!hasActivity) continue;

          const neto = ingresos - egresos;
          allUsersData.push({ uid: u.id, ingresos, egresos, neto });

          if (u.id === uid) {
            me = { ingresos, egresos, neto };
          }
        }

        const peers = allUsersData.filter((item) => item.uid !== uid);
        setSampleSize(peers.length);

        if (peers.length === 0) {
          setInsights([]);
          return;
        }

        const medianIngresos = getMedian(peers.map((item) => item.ingresos));
        const medianEgresos = getMedian(peers.map((item) => item.egresos));
        const medianNeto = getMedian(peers.map((item) => item.neto));

        const deltaIngresos = medianIngresos > 0 ? ((me.ingresos - medianIngresos) / medianIngresos) * 100 : 0;
        const deltaEgresos = medianEgresos > 0 ? ((me.egresos - medianEgresos) / medianEgresos) * 100 : 0;
        const deltaNeto = Math.abs(medianNeto) > 0 ? ((me.neto - medianNeto) / Math.abs(medianNeto)) * 100 : 0;

        setInsights([
          { label: 'Ingresos', value: me.ingresos, delta: deltaIngresos, positiveIsGood: true },
          { label: 'Gastos', value: me.egresos, delta: deltaEgresos, positiveIsGood: false },
          { label: 'Balance neto', value: me.neto, delta: deltaNeto, positiveIsGood: true },
        ]);
      } catch (e) {
        console.error("Error en comparativa de transacciones:", e);
        setInsights([]);
      } finally {
        setLoading(false);
      }
    };

    cargarComparativa();
  }, [uid]);

  if (loading) {
    return (
      <View style={styles.simpleCard}>
        <ActivityIndicator size="small" color="#5c6bf2" style={{ marginRight: 8 }} />
        <Text style={styles.simpleCardText}>Analizando tus transacciones...</Text>
      </View>
    );
  }

  if (insights.length === 0) {
    return (
      <View style={styles.simpleCard}>
        <Ionicons name="bar-chart-outline" size={22} color="#5c6bf2" style={{ marginRight: 10 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.simpleCardTitle}>Comparativa semanal</Text>
          <Text style={styles.simpleCardText}>Sin datos suficientes aún para comparar.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.simpleCard}>
      <Ionicons name="stats-chart" size={22} color="#5c6bf2" style={{ marginRight: 10 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.simpleCardTitle}>Comparativa semanal</Text>
        <Text style={[styles.simpleCardText, { marginBottom: 8 }]}>Comparado con {sampleSize} usuarios.</Text>

        {insights.map((item) => {
          const rawDelta = Number.isFinite(item.delta) ? item.delta : 0;
          const isBetter = item.positiveIsGood ? rawDelta >= 0 : rawDelta <= 0;
          const icon = rawDelta === 0 ? 'remove' : rawDelta > 0 ? 'arrow-up' : 'arrow-down';
          const color = rawDelta === 0 ? '#94a3b8' : isBetter ? '#22c55e' : '#ef4444';

          return (
            <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ color: textColor, fontSize: 12 }}>{item.label}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name={icon as any} size={12} color={color} style={{ marginRight: 4 }} />
                <Text style={{ color, fontSize: 12, fontWeight: '700' }}>
                  {Math.abs(rawDelta).toFixed(1)}%
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
  
}


