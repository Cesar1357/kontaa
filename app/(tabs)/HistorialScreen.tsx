import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from "react";
import { Alert, Dimensions, Platform, ToastAndroid, TouchableOpacity, View } from "react-native";
import Animated, { FadeInDown, FadeOutUp, Layout, useSharedValue, withTiming } from "react-native-reanimated";
import { RFValue } from 'react-native-responsive-fontsize';
import { db } from '../../config/firebase';

import { ThemedText } from '@/components/ThemedText';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from "@/hooks/useThemeColor";
import { endOfDay, format, startOfDay } from "date-fns";
import { LinearGradient } from "expo-linear-gradient";
import { collection, deleteDoc, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { LineChart as LineChart2 } from 'react-native-chart-kit';
import { ScrollView } from 'react-native-gesture-handler';
import { LineChart } from "react-native-gifted-charts";
import DateTimePickerModal from 'react-native-modal-datetime-picker';

const screenWidth = Dimensions.get('window').width;

export default function HistorialScreen() {
  const { user } = useAuth();
  const userId = (user as any)?.uid as string | undefined;
  const [transacciones, setTransacciones] = useState<any[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const backgroundColor = useThemeColor({ light: '', dark: '' }, 'background2');
  const graficaFondoColor = useThemeColor({ light: '', dark: '' }, 'graficaHistorial');
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const progressBg = useThemeColor({ light: '', dark: '' }, 'progressBg');

  const [filtered, setFiltered] = useState<any[]>([]);
  const [filteredChart, setFilteredChart] = useState<any[]>([]);
  const [chartDataLimit, setChartDataLimit] = useState<number>(15);

  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [dateStep, setDateStep] = useState<'start' | 'end'>('start');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [range, setRange] = useState<'Total' | '1S' | '1A' | '1M'>('Total');

  const height = useSharedValue(0);
  const opacity = useSharedValue(0);

  const rangeOptions = [
    { key: 'Total', label: 'Todos' },
    { key: '1S', label: '7 días' },
    { key: '1M', label: '30 días' },
    { key: '1A', label: '12 meses' },
  ];
    
  const toggleExpanded = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    height.value = withTiming(next ? 415 : 0, { duration: 400 });
    opacity.value = withTiming(next ? 1 : 0, { duration: 300 });
  };

  useEffect(() => {
    if (!userId) return;
    const ref = collection(db, `users/${userId}/transacciones`);
    const q = query(ref, orderBy("fecha", "desc"));

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        date: d.data().fecha?.toDate?.() || null,
      }));
      setTransacciones(data);
    });
    return () => unsub();
  }, [userId]);

  const total = transacciones.reduce(
    (acc, t) => acc + (t.tipo === "ingreso" ? t.monto : -t.monto),
    0
  );

  const ingresos = filtered.reduce(
    (acc, t) => acc + (t.tipo === 'ingreso' ? t.monto : 0),
    0
  );

  const egresos = filtered.reduce(
    (acc, t) => acc + (t.tipo === 'egreso' ? t.monto : 0),
    0
  );

  const neto = ingresos - egresos;

  // Determinar cuántos datos mostrar en la gráfica
  const chartDisplayCount = filteredChart.length < 5 ? filteredChart.length : Math.min(chartDataLimit, filteredChart.length);
  const chartDataToDisplay = filteredChart.slice(Math.max(0, filteredChart.length - chartDisplayCount), filteredChart.length);

  const chartData = chartDataToDisplay.map((t) => ({
    value: t.tipo === "ingreso" ? t.monto : -t.monto,
    label: format(t.date || new Date(), "dd/MM"),
  }));

  // Calcular rango dinámico para escala mejor adaptada
  const allValues = chartDataToDisplay.map(t => t.tipo === "ingreso" ? t.monto : -t.monto);
  const maxValue = Math.max(...allValues, 0);
  const minValue = Math.min(...allValues, 0);
  const dataRange = maxValue - minValue;
  const padding = dataRange * 0.1; // 10% padding
  const calculatedYMax = maxValue + padding;
  const calculatedYMin = minValue - padding;

  useEffect(() => {
    let filteredData = [...transacciones];
    const now = new Date();

    if (startDate && endDate) {
      filteredData = transacciones.filter(
        (t) => t.date && t.date >= startDate && t.date <= endDate
      );
    } else {
      switch (range) {
        case '1S':
          const weekAgo = new Date(now);
          weekAgo.setDate(now.getDate() - 7);
          filteredData = transacciones.filter((t) => t.date >= weekAgo);
          break;
        case '1M':
          const monthAgo = new Date(now);
          monthAgo.setMonth(now.getMonth() - 1);
          filteredData = transacciones.filter((t) => t.date >= monthAgo);
          break;
        case '1A':
          const yearAgo = new Date(now);
          yearAgo.setFullYear(now.getFullYear() - 1);
          filteredData = transacciones.filter((t) => t.date >= yearAgo);
          break;
        default:
          break;
      }
    }

    filteredData.sort((a, b) => {
      const dateA = a.date || new Date(0);
      const dateB = b.date || new Date(0);
      return dateB.getTime() - dateA.getTime();
    });

    setFiltered(filteredData);
    setFilteredChart([...filteredData].reverse());
  }, [transacciones, range, startDate, endDate]);

  const chartConfig = {
    backgroundGradientFrom: cardsMain,
    backgroundGradientTo: cardsMain,
    color: (opacity = 1) => `rgba(120,82,255,${opacity})`,
    strokeWidth: 2,
  };

  const showPicker = (type: 'start' | 'end') => {
    setDateStep(type);
    setDatePickerVisible(true);
  };

  const handleConfirm = (date: Date) => {
    setDatePickerVisible(false);
    if (dateStep === 'start') {
      setStartDate(startOfDay(date));
      setTimeout(() => showPicker('end'), 400);
    } else {
      setEndDate(endOfDay(date));
    }
  };

  const clearFilters = () => {
    setStartDate(null);
    setEndDate(null);
    setRange('Total');
  };

  const customRangeLabel = startDate && endDate
    ? `${format(startDate, 'dd/MM')} - ${format(endDate, 'dd/MM')}`
    : 'Seleccionar rango';

  const rangeLabel = startDate && endDate
    ? `Rango personalizado: ${customRangeLabel}`
    : `Mostrando: ${rangeOptions.find((opt) => opt.key === range)?.label || 'Todos'}`;

  const handleDeleteTransaction = (tx: any) => {
    if (!userId || !tx?.id) return;

    const description = tx.descripcion || 'esta transaccion';
    Alert.alert(
      'Eliminar transaccion',
      `¿Seguro que deseas eliminar ${description}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, `users/${userId}/transacciones`, tx.id));
              if (Platform.OS === 'android') {
                ToastAndroid.show('Transaccion eliminada', ToastAndroid.SHORT);
              }
            } catch (error) {
              console.log('No se pudo eliminar la transaccion:', error);
              if (Platform.OS === 'android') {
                ToastAndroid.show('No se pudo eliminar la transaccion', ToastAndroid.SHORT);
              }
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: backgroundColor,
        padding: 16,
        paddingTop: 80
      }}
    >
      {/* ENCABEZADO */}
      <Animated.View entering={FadeInDown.delay(100)} exiting={FadeOutUp}>
        <LinearGradient
          colors={["#6366f1", "#8b5cf6"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            padding: 20,
            borderRadius: 20,
            marginBottom: 20,
          }}
        >
          <ThemedText style={{ color: "white", fontSize: 18, fontWeight: "600" }}>
            Historial general
          </ThemedText>
          <ThemedText
            style={{
              fontSize: 32,
              fontWeight: "700",
              marginTop: 6,
              padding: 5,
              color: "white"
            }}
          >
            ${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
          </ThemedText>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 }}>
            <View style={{ flex: 1, padding: 14, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 18, marginRight: 8 }}>
              <ThemedText style={{ color: '#d1d5db', fontSize: 12 }}>Ingresos</ThemedText>
              <ThemedText style={{ color: '#a5f3fc', fontSize: 18, fontWeight: '700', marginTop: 8 }}>
                +${ingresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </ThemedText>
            </View>
            <View style={{ flex: 1, padding: 14, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 18, marginRight: 8 }}>
              <ThemedText style={{ color: '#d1d5db', fontSize: 12 }}>Egresos</ThemedText>
              <ThemedText style={{ color: '#fca5a5', fontSize: 18, fontWeight: '700', marginTop: 8 }}>
                -${egresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </ThemedText>
            </View>
            <View style={{ flex: 1, padding: 14, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 18 }}>
              <ThemedText style={{ color: '#d1d5db', fontSize: 12 }}>Saldo</ThemedText>
              <ThemedText style={{ color: neto >= 0 ? '#bbf7d0' : '#fda4af', fontSize: 18, fontWeight: '700', marginTop: 8 }}>
                ${neto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </ThemedText>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* FILTROS */}
      <Animated.View entering={FadeInDown.delay(200)} exiting={FadeOutUp} layout={Layout.springify()}>
        <View style={{ marginBottom: 16 }}>
          <ThemedText style={{ fontSize: 16, marginBottom: 10 }}>Filtrar movimientos</ThemedText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {rangeOptions.map((f) => (
              <TouchableOpacity
                key={f.key}
                onPress={() => {
                    setRange(f.key as 'Total' | '1S' | '1M' | '1A');
                    setStartDate(null);
                    setEndDate(null);
                    }}
                style={{
                  backgroundColor:
                    range === f.key && !startDate ? "#6366f1" : progressBg,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 20,
                  marginRight: 8,
                  marginBottom: 8,
                }}
              >
                <ThemedText style={{ color: range === f.key && !startDate ? '#fff' : '#ddd', fontSize: RFValue(12), textTransform: 'capitalize' }}>
                  {f.label}
                </ThemedText>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => showPicker('start')}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 20,
                backgroundColor: 'rgba(120,82,255,0.16)',
                marginRight: 8,
                marginBottom: 8,
              }}
            >
              <ThemedText style={{ fontSize: RFValue(12), color: textColor }}>
                Fecha: {customRangeLabel}
              </ThemedText>
            </TouchableOpacity>
            {(startDate || endDate) && (
              <TouchableOpacity
                onPress={clearFilters}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 20,
                  marginBottom: 8,
                }}
              >
                <ThemedText style={{ color: textColor, fontSize: RFValue(12) }}>
                  Limpiar
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
          <ThemedText style={{ color: '#9ca3af', fontSize: 12, marginTop: 10 }}>{rangeLabel}</ThemedText>
        </View>
      </Animated.View>
      <DateTimePickerModal
              isVisible={isDatePickerVisible}
              mode="date"
              onConfirm={handleConfirm}
              onCancel={() => setDatePickerVisible(false)}
            />

      {/* GRÁFICA */}
      <Animated.View
        entering={FadeInDown.delay(300)}
        exiting={FadeOutUp}
        layout={Layout.springify()} // 🔥 esto hace que las transacciones bajen
        
        style={{
          width: "100%",
          backgroundColor: cardsMain,
          borderRadius: 20,
          padding: 16,
          marginBottom: 10,
          marginTop:10
        }}
      >
        {/* Encabezado */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            alignContent:"center"
          }}
        >
          <ThemedText
            style={{
              fontWeight: "600",
              fontSize: 16,
            }}
          >
            Gráficas
          </ThemedText>
          <TouchableOpacity onPress={toggleExpanded}>
            <Ionicons
              name={isExpanded ? "chevron-up-outline" : "chevron-down-outline"}
              size={RFValue(26)}
              color={textColor}
            />
          </TouchableOpacity>
        </View>

        {/* Contenedor de la gráfica */}
        {isExpanded && (
          <Animated.View
            entering={FadeInDown}
            exiting={FadeOutUp}
            style={{ marginTop: 10 }}
          >
            {chartDataToDisplay.length > 0 ? (
              <>
                {/* Gráfica de área - Gifted Charts */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{
                    paddingHorizontal: 10,
                  }}
                >
                  <LineChart
                    data={chartData}
                    thickness={3}
                    color="#818cf8"
                    hideRules
                    areaChart
                    startFillColor="#6366f1"
                    endFillColor="#6366f100"
                    curved
                    noOfSections={Math.max(3, Math.ceil(Math.abs(calculatedYMax - calculatedYMin) / 100))}
                    yAxisThickness={0}
                    xAxisColor="transparent"
                    yAxisColor="transparent"
                  />
                </ScrollView>

                {/* Gráfica de línea - React Native Chart Kit */}
                <View style={{ marginTop: 16, overflow: 'hidden', borderRadius: 10 }}>
                  <LineChart2
                    data={{
                      labels: chartDataToDisplay.map((t) =>
                        format(t.date || new Date(), "dd/MM")
                      ),
                      datasets: [
                        {
                          data: chartDataToDisplay.map((t) =>
                            t.tipo === 'ingreso' ? t.monto : -t.monto
                          ),
                        },
                      ],
                    }}
                    width={screenWidth * 0.88}
                    height={RFValue(150)}
                    chartConfig={chartConfig}
                    bezier
                    withDots={true}
                    withVerticalLines={true}
                    withHorizontalLines={true}
                    style={{ borderRadius: 10 }}
                    yAxisInterval={Math.ceil(Math.abs(calculatedYMax - calculatedYMin) / 4) || 1}
                  />
                </View>

                <ThemedText style={{ color: '#9ca3af', fontSize: 12, marginTop: 12, textAlign: 'center' }}>
                  Mostrando {chartDataToDisplay.length} de {filteredChart.length} transacciones
                </ThemedText>

                {/* Selector de límite de datos */}
                <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', marginTop: 12, gap: 8 }}>
                  {[5, 15, 30, 50].map((limit) => (
                    <TouchableOpacity
                      key={limit}
                      onPress={() => setChartDataLimit(limit)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 12,
                        backgroundColor: chartDataLimit === limit ? '#6366f1' : 'rgba(120,82,255,0.2)',
                        borderWidth: 1,
                        borderColor: chartDataLimit === limit ? '#6366f1' : 'transparent',
                      }}
                    >
                      <ThemedText
                        style={{
                          fontSize: RFValue(11),
                          color: chartDataLimit === limit ? '#fff' : '#b0b9c1',
                          fontWeight: chartDataLimit === limit ? '600' : '400',
                        }}
                      >
                        {limit}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                  {filteredChart.length > 50 && (
                    <TouchableOpacity
                      onPress={() => setChartDataLimit(filteredChart.length)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 12,
                        backgroundColor: chartDataLimit === filteredChart.length ? '#6366f1' : 'rgba(120,82,255,0.2)',
                        borderWidth: 1,
                        borderColor: chartDataLimit === filteredChart.length ? '#6366f1' : 'transparent',
                      }}
                    >
                      <ThemedText
                        style={{
                          fontSize: RFValue(11),
                          color: chartDataLimit === filteredChart.length ? '#fff' : '#b0b9c1',
                          fontWeight: chartDataLimit === filteredChart.length ? '600' : '400',
                        }}
                      >
                        Todos
                      </ThemedText>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            ) : (
              <ThemedText style={{ color: '#aaa', textAlign: 'center', marginTop: 20 }}>
                No hay datos para mostrar
              </ThemedText>
            )}
          </Animated.View>
        )}
      </Animated.View>

      {/* LISTA DE TRANSACCIONES */}
      <View style={{ marginBottom: 150 }}>
        <View
          style={{
            backgroundColor: graficaFondoColor,
            borderRadius: 20,
            padding: 16,
            marginBottom: 30,
            marginTop:15
          }}
        >
          <ThemedText
            style={{
              fontWeight: "600",
              marginBottom: 8,
              fontSize: 16,
            }}
          >
            Transacciones
          </ThemedText>

          {filtered.length === 0 ? (
            <ThemedText style={{ color: "#aaa", textAlign: "center", marginTop: 10 }}>
              {transacciones.length === 0 ? "No hay transacciones registradas" : "No hay transacciones en el periodo seleccionado"}
            </ThemedText>
          ) : (
            filtered.map((tx) => (
              <TouchableOpacity
                key={tx.id}
                activeOpacity={0.75}
                onLongPress={() => handleDeleteTransaction(tx)}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{}}>
                    <View style={{flexDirection:"row", flexWrap: 'wrap'}}>
                      <ThemedText allowFontScaling textBreakStrategy="simple" numberOfLines={2} style={{ fontWeight: "500", maxWidth: 200}}>
                        {tx.descripcion || "Sin descripción"} 
                      </ThemedText>
                      {tx.creadoAutomaticamente && (
                        <ThemedText style={{ color: "#888", fontSize: 11, marginLeft: 6 }}>
                          (Automático)
                        </ThemedText>
                      )}
                      {tx.presupuestoCategoria && (
                        <ThemedText style={{ color: "#9ca3af", fontSize: 11, marginLeft: 6 }}>
                          #{tx.presupuestoCategoria}
                        </ThemedText>
                      )}
                      {tx.preestablecidoMainNombre && (
                        <ThemedText style={{ color: "#c4b5fd", fontSize: 11, marginLeft: 6 }}>
                          {tx.preestablecidoMainNombre}
                        </ThemedText>
                      )}
                    </View>
                    <ThemedText style={{ color: "#aaa", fontSize: 12 }}>
                      {format(tx.date || tx.fecha?.toDate?.(), "dd/MM/yyyy")}
                    </ThemedText>
                  </View>
                </View>

                <ThemedText
                  style={{
                    color: tx.tipo === "ingreso" ? "#4ade80" : "#f87171",
                    fontWeight: "600",
                  }}
                >
                  {tx.tipo === "ingreso" ? "+" : "-"}${tx.monto.toFixed(2)}
                </ThemedText>
              </TouchableOpacity>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}
