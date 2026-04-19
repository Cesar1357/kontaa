import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, TouchableOpacity, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { RFValue } from 'react-native-responsive-fontsize';

const screenWidth = Dimensions.get('window').width;

export default function BalanceHeader() {
  const { user } = useAuth();
  const cardsColor = useThemeColor({light:'',dark:''},'cardsMain');
  const textColor = useThemeColor({light:'',dark:''},'text');

  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [cambio, setCambio] = useState(0);
  const [diferencia, setDiferencia] = useState(0);
  const [chartData, setChartData] = useState<number[]>([]);
  const [chartLabels, setChartLabels] = useState<string[]>([]);
  const [colorSaldo, setColorSaldo] = useState<'black' |'white' | '#ff4d4d'>('white');

  const [range, setRange] = useState('1S');
  const [allData, setAllData] = useState<any[]>([]);

  const height = useSharedValue(0);
  const opacity = useSharedValue(0);

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


  useEffect(() => {
    setColorSaldo(textColor);
  }, [textColor]);

  // 🔹 Cargar todas las transacciones una sola vez
  useEffect(() => {
    try{
      if (!user?.uid) return;

      const q = query(
        collection(db, "users", user.uid, "transacciones"),
        orderBy("fecha", "desc")
      );

      // 🔥 Escucha en tiempo real
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const data = snapshot.docs.map((d) => ({
            ...d.data(),
            date: d.data().fecha?.toDate?.() || null,
            id: d.id,
          }));
          console.log("Datos actualizados:", data);
          setAllData(data);
          setLoading(false);
        },
        (error) => {
          console.error("Error al escuchar transacciones:", error);
          setLoading(false);
        }
      );

      // 🔚 Limpia el listener cuando se desmonta el componente o cambia el usuario
      return () => unsubscribe();
    }catch(e){
      console.error("Error en useEffect de transacciones:", e);
    }
  }, [user]);

  
  useEffect(() => {
    try{
      if (!allData.length) return;

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let startDate: Date;
      let labels: string[] = [];

      const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      const weekdayInitial = (date: Date) => {
          // Domingo=0 ... Sábado=6 -> queremos Domingo='D', Lunes='L', Martes='M', Mié='X', Jue='J', Vie='V', Sáb='S'
          const map = ['D','L','M','X','J','V','S'];
          return map[date.getDay()];
      };

      switch (range) {
          case '1S':
          startDate = new Date(startOfToday);
          startDate.setDate(startOfToday.getDate() - 6); // últimos 7 días
          // labels desde startDate hasta now
          for (let d = new Date(startDate); d <= startOfToday; d.setDate(d.getDate() + 1)) {
              labels.push(weekdayInitial(new Date(d)));
          }
          break;

          case '1M':
          startDate = new Date(startOfToday);
          startDate.setDate(startOfToday.getDate() - 29); // últimos 30 días
          // 4 buckets (S1..S4) donde S4 incluye hoy
          labels = ['S1','S2','S3','S4'];
          break;

          case '6M': {
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          startDate.setMonth(startDate.getMonth() - 6); // primer día del mes hace 6 meses
          // labels: meses desde startDate hasta mes actual
          const cursor = new Date(startDate);
          while (cursor <= now) {
              labels.push(monthNames[cursor.getMonth()]);
              cursor.setMonth(cursor.getMonth() + 1);
          }
          break;
          }

          case '1A':
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1); // mismo mes, año anterior
          // labels: 12 meses (pueden iniciar antes si hoy no cae exactamente en límite)
          for (let i = 0; i < 12; i++) {
              const m = (startDate.getMonth() + i) % 12;
              const y = startDate.getFullYear() + Math.floor((startDate.getMonth() + i) / 12);
              labels.push(monthNames[(startDate.getMonth() + i) % 12]);
          }
          break;

          case 'Total':
          // splitear en 3 buckets: Inicio / Mitad / Ahora
          startDate = new Date(allData[allData.length - 1].date); // fecha más antigua en allData (suponiendo orden descendente)
          labels = ['Inicio','Mitad','Ahora'];
          break;

          default:
          // fallback a 1S
          startDate = new Date(startOfToday);
          startDate.setDate(startOfToday.getDate() - 6);
          for (let d = new Date(startDate); d <= startOfToday; d.setDate(d.getDate() + 1)) {
              labels.push(weekdayInitial(new Date(d)));
          }
          break;
      }

      // Filtramos transacciones dentro del rango (si startDate es null usamos todo)
      const filtered = startDate ? allData.filter(t => t.date >= startDate && t.date <= now) : allData.slice();

      // total global (puedes seguir mostrando total de todo time)
      const totalCalc = allData.reduce((acc, t) => acc + (t.tipo === 'ingreso' ? t.monto : -t.monto), 0);

      // diferencia en el rango
      const diff = filtered.reduce((acc, t) => acc + (t.tipo === 'ingreso' ? t.monto : -t.monto), 0);
      const prevTotal = totalCalc - diff;
      const perc = prevTotal !== 0 ? (diff / prevTotal) * 100 : 0;

      // buckets inicializados con 0 (mismo tamaño que labels)
      const buckets = new Array(labels.length).fill(0);

      // función para calcular índice en buckets según range y date
      const indexForDate = (date: Date) => {
          if (range === '1S') {
          // index = difference in days from startDate (0..6)
          const diffDays = Math.floor((date.getTime() - startDate.getTime()) / (24 * 3600 * 1000));
          return Math.max(0, Math.min(labels.length - 1, diffDays));
          }
          if (range === '1M') {
          // dividir rango de 30 días en 4 buckets (S1..S4)
          const totalDays = Math.ceil((startOfToday.getTime() - startDate.getTime()) / (24 * 3600 * 1000)) + 1; // ~30
          const dayIndex = Math.floor((date.getTime() - startDate.getTime()) / (24 * 3600 * 1000));
          const bucketSize = Math.ceil(totalDays / 4);
          const idx = Math.floor(dayIndex / bucketSize);
          return Math.max(0, Math.min(labels.length - 1, idx));
          }
          if (range === '6M' || range === '1A') {
          // calcular diferencia en meses desde startDate
          let monthDiff = (date.getFullYear() - startDate.getFullYear()) * 12 + (date.getMonth() - startDate.getMonth());
          // startDate corresponde al primer label (index 0) -> queremos mapear a 0..labels.length-1
          monthDiff = Math.max(0, monthDiff);
          return Math.max(0, Math.min(labels.length - 1, monthDiff));
          }
          if (range === 'Total') {
          // mapa proporcional entre startDate (fecha más vieja) y now
          const first = new Date(allData[allData.length - 1].date).getTime();
          const last = new Date(allData[0].date).getTime();
          const pos = (date.getTime() - first) / Math.max(1, (last - first));
          const idx = Math.floor(pos * (labels.length - 1));
          return Math.max(0, Math.min(labels.length - 1, idx));
          }
          return 0;
      };

      // rellenar buckets con sumas
      filtered.forEach(t => {
          const d = new Date(t.date);
          const idx = indexForDate(d);
          buckets[idx] += (t.tipo === 'ingreso' ? t.monto : -t.monto);
      });

      // Asegurar que el último label represente hoy (si por alguna razón no coincide, lo forzamos)
      // (Para 1S y 1M y meses esto ya se cumple por construcción; dejamos de todos modos)
      // Ya labels están en orden cronológico: oldest .. today

      // Finalmente actualizamos estados
      if(totalCalc < 0){
          setColorSaldo('#ff4d4d');
      }
      setTotal(totalCalc);
      setDiferencia(diff);
      setCambio(perc);
      setChartData(buckets);       // puntos en orden cronológico (izq -> antiguo, der -> hoy)
      setChartLabels(labels);
    }catch(e){
      console.error("Error en useEffect de procesamiento de datos:", e);
    }
  }, [range, allData, user]);

  const chartConfig = {
    backgroundGradientFrom: cardsColor,
    backgroundGradientTo: cardsColor,
    color: (opacity = 1) => `rgba(120, 82, 255, ${opacity})`,
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
        <View>
          <ThemedText style={{ fontSize: RFValue(13), color: '#aaa', marginBottom: 4 }}>
            Saldo total
          </ThemedText>
          {loading ? (
            <ActivityIndicator color={textColor} />
          ) : (
            <ThemedText
              style={{
                fontSize: RFValue(28),
                fontWeight: '700',
                color: colorSaldo,
                padding:5
              }}
            >
              ${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
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
            color: cambio < 0 ? '#ff4d4d' : '#00c851',
            marginTop: 4,
            fontSize: RFValue(14),
          }}
        >
          {cambio < 0 ? '▼' : '▲'} {Math.abs(cambio).toFixed(2)}% |{' '}
          {diferencia < 0 ? '-' : '+'}${Math.abs(diferencia).toLocaleString('es-MX', {
            minimumFractionDigits: 2,
          })}{' '}
          MXN ({range})
        </ThemedText>
      )}

      {/* --- Contenedor animado --- */}
      <Animated.View style={[{ width: '100%', marginTop: RFValue(10) }, animatedStyle]}>
        {!loading && chartData.length > 0 && (
          <LineChart
            data={{
                labels:chartLabels, // 👈 labels invertidos
                datasets: [{ data: [...chartData] }], // 👈 datos invertidos
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
          {['1S', '1M', '6M', '1A', 'Total'].map((r, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => setRange(r)}
              style={{
                paddingVertical: 4,
                paddingHorizontal: 10,
                borderRadius: 6,
                backgroundColor:
                  range === r ? 'rgba(120,82,255,0.2)' : 'transparent',
                marginHorizontal: 3,
              }}
            >
              <ThemedText style={{ fontSize: RFValue(11) }}>{r}</ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    </ThemedView>
  );
}
