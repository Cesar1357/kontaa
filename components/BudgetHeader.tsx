import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  TouchableOpacity,
  View,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { RFValue } from 'react-native-responsive-fontsize';

const screenWidth = Dimensions.get('window').width;

export default function PresupuestoHeader() {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [presupuestos, setPresupuestos] = useState<any>({});
  const [range, setRange] = useState<'D' | 'S' | 'M'>('D');
  const [gastoTotal, setGastoTotal] = useState(0);
  const [chartData, setChartData] = useState<number[]>([]);
  const [porcentaje, setPorcentaje] = useState(0);
  const [restante, setRestante] = useState(0);

  const height = useSharedValue(0);
  const opacity = useSharedValue(0);

  const cardsColor = useThemeColor({light:'',dark:''},'cardsMain');
  const textColor = useThemeColor({light:'',dark:''},'text');
    
  const [actualizar, setActualizar] = useState([]);

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    height.value = withTiming(next ? 215 : 0, { duration: 400 });
    opacity.value = withTiming(next ? 1 : 0, { duration: 300 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
    overflow: 'hidden',
  }));

  // 🔹 Escucha en tiempo real los presupuestos del usuario
  useEffect(() => {
  if (!user?.uid) return;

  try {
    const ref = collection(db, `users/${user.uid}/transacciones`);
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActualizar(data.length);
    });

    return () => unsubscribe();
  } catch (e) {
    console.error("Error en useEffect de presupuestos:", e);
  }
}, [user]);

  useEffect(() => {
    try{
      if (!user?.uid) return;

      const ref = doc(db, `users/${user.uid}`);
      const unsubscribe = onSnapshot(ref, (snap) => {
        const data = snap.data();
        if (data?.presupuestos) {
          setPresupuestos(data.presupuestos);
        }
      });

      return () => unsubscribe();
    } catch(e){
      console.error("Error en useEffect de presupuestos:", e);
    }
  }, [user, actualizar]);

  // 🔹 Escucha en tiempo real las transacciones dentro del rango actual
  useEffect(() => {
    try{
      if (!user?.uid) return;

      setLoading(true);
      const now = new Date();
      let start = new Date();

      if (range === 'D') {
        start.setHours(0, 0, 0, 0);
      } else if (range === 'S') {
        const day = now.getDay() === 0 ? 6 : now.getDay() - 1; // lunes como inicio
        start.setDate(now.getDate() - day);
        start.setHours(0, 0, 0, 0);
      } else if (range === 'M') {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      const ref = collection(db, `users/${user.uid}/transacciones`);
      const q = query(
        ref,
        where('fecha', '>=', Timestamp.fromDate(start)),
        where('fecha', '<=', Timestamp.fromDate(now)),
        orderBy('fecha', 'asc')
      );

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const txs = snapshot.docs.map((d) => ({
            ...d.data(),
            date: d.data().fecha?.toDate(),
          }));

          // Calcular gasto total (solo egresos)
          const total = txs
            .filter((t) => t.tipo === 'egreso')
            .reduce((acc, t) => acc + t.monto, 0);

          // Agrupar para la gráfica
          const grouped: Record<string, number> = {};
          txs.forEach((t) => {
            const key =
              range === 'D'
                ? t.date.getHours().toString()
                : range === 'S'
                ? t.date.toISOString().slice(0, 10)
                : `${t.date.getFullYear()}-${t.date.getMonth()}-${t.date.getDate()}`;
            grouped[key] = (grouped[key] || 0) + t.monto;
          });

          const data = Object.values(grouped);
          const presupuestoActual =
            range === 'D'
              ? presupuestos?.dia || 0
              : range === 'S'
              ? presupuestos?.semana || 0
              : presupuestos?.mes || 0;

          const porc =
            presupuestoActual > 0
              ? (total / presupuestoActual) * 100
              : 0;

          setGastoTotal(total);
          setRestante(presupuestoActual - total);
          setPorcentaje(porc);
          setChartData(data);
          setLoading(false);
        },
        (error) => {
          console.error('Error al escuchar transacciones:', error);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    }catch(e){
      console.error("Error en useEffect de transacciones:", e);
    }
  }, [user, range, presupuestos, actualizar]);

  const chartConfig = {
    backgroundGradientFrom: cardsColor,
    backgroundGradientTo: cardsColor,
    color: (opacity = 1) => `rgba(255, 189, 68, ${opacity})`,
    strokeWidth: 2,
    propsForDots: { r: '0' },
    propsForBackgroundLines: { stroke: 'rgba(255,255,255,0.05)' },
  };

  return (
    <ThemedView
      style={{
        backgroundColor: cardsColor,
        borderRadius: 14,
        paddingVertical: RFValue(20),
        paddingHorizontal: RFValue(16),
        marginVertical: RFValue(10),
        alignItems: 'center',
        width: '95%',
        alignSelf: 'center',
      }}
    >
      {/* --- Fila superior --- */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
        <View style={{maxWidth: '80%'}}>
          <ThemedText style={{ fontSize: RFValue(13), color: '#aaa', marginBottom: 4 }}>
            Presupuesto ({range === 'D' ? 'Diario' : range === 'S' ? 'Semanal' : 'Mensual'})
          </ThemedText>
          {loading ? (
            <ActivityIndicator color={textColor} />
          ) : (
            <ThemedText
              style={{
                fontSize: RFValue(28),
                fontWeight: '700',
                color: restante < 0 ? '#ff4d4d' : textColor,
                padding:5
              }}
            >
              ${restante.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN restantes
            </ThemedText>
          )}
        </View>
        <TouchableOpacity onPress={toggleExpanded}>
          <Ionicons
            name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
            size={RFValue(26)}
            color={textColor}
          />
        </TouchableOpacity>
      </View>

      {/* --- Subinfo --- */}
      {!loading && (
        <ThemedText
          style={{
            color: porcentaje > 100 ? '#ff4d4d' : '#ffbd44',
            marginTop: 4,
            fontSize: RFValue(14),
          }}
        >
          {porcentaje.toFixed(1)}% del presupuesto usado | Gasto: $
          {gastoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
        </ThemedText>
      )}

      {/* --- Contenedor animado --- */}
      <Animated.View style={[{ width: '100%', marginTop: RFValue(10) }, animatedStyle]}>
        {!loading && chartData.length > 0 && (
          <LineChart
            data={{
              labels: chartData.map(() => ''),
              datasets: [{ data: chartData }],
            }}
            width={screenWidth * 0.85}
            height={RFValue(150)}
            chartConfig={chartConfig}
            bezier
            withDots={false}
            withInnerLines={false}
            style={{ borderRadius: 10 }}
          />
        )}

        {/* Botones de rango */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            marginTop: RFValue(5),
          }}
        >
          {['D', 'S', 'M'].map((r) => (
            <TouchableOpacity
              key={r}
              onPress={() => setRange(r as 'D' | 'S' | 'M')}
              style={{
                paddingVertical: 4,
                paddingHorizontal: 10,
                borderRadius: 6,
                backgroundColor:
                  range === r ? 'rgba(255,189,68,0.2)' : 'transparent',
                marginHorizontal: 3,
              }}
            >
              <ThemedText style={{ fontSize: RFValue(11) }}>
                {r === 'D' ? 'Día' : r === 'S' ? 'Semana' : 'Mes'}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    </ThemedView>
  );
}
