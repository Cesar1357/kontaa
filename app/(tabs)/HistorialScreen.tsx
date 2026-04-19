import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from "react";
import { Dimensions, TouchableOpacity, View } from "react-native";
import Animated, { FadeInDown, FadeOutUp, Layout, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { RFValue } from 'react-native-responsive-fontsize';
import { db } from '../../config/firebase';

import { ThemedText } from '@/components/ThemedText';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from "@/hooks/useThemeColor";
import { format } from "date-fns";
import { LinearGradient } from "expo-linear-gradient";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { LineChart as LineChart2 } from 'react-native-chart-kit';
import { ScrollView } from 'react-native-gesture-handler';
import { LineChart } from "react-native-gifted-charts";
import DateTimePickerModal from 'react-native-modal-datetime-picker';

const screenWidth = Dimensions.get('window').width;

export default function HistorialScreen() {
  const { user } = useAuth();
  const [transacciones, setTransacciones] = useState<any[]>([]);
  const [filtro, setFiltro] = useState("total");
  const [isExpanded, setIsExpanded] = useState(false);
  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const backgroundColor = useThemeColor({ light: '', dark: '' }, 'background2');
  const graficaFondoColor = useThemeColor({ light: '', dark: '' }, 'graficaHistorial');
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const progressBg = useThemeColor({ light: '', dark: '' }, 'progressBg');

  const [filtered, setFiltered] = useState<any[]>([]);
  const [filteredChart, setFilteredChart] = useState<any[]>([]);

  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [dateStep, setDateStep] = useState<'start' | 'end'>('start');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [range, setRange] = useState<'Total' | '1S' | '1A' | '1M'>('Total');

  const height = useSharedValue(0);
  const opacity = useSharedValue(0);
    
  const toggleExpanded = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    height.value = withTiming(next ? 415 : 0, { duration: 400 });
    opacity.value = withTiming(next ? 1 : 0, { duration: 300 });
};

const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
    overflow: 'hidden',
}));

  useEffect(() => {
    if (!user) return;
    const ref = collection(db, `users/${user.uid}/transacciones`);
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
  }, [user]);

  const total = transacciones.reduce(
    (acc, t) => acc + (t.tipo === "ingreso" ? t.monto : -t.monto),
    0
  );

  const chartData = filteredChart
    .slice(0, 10)
    .map((t) => ({
      value: t.tipo === "ingreso" ? t.monto : -t.monto,
      label: format(t.fecha?.toDate(), "dd/MM"),
    }));

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
          return dateB - dateA;
        });
        setFiltered(filteredData);
        var filteredData2 = [...filteredData];
        setFilteredChart(filteredData2.reverse());
      }, [transacciones, range, startDate, endDate]);
    
      const chartData2 = filtered.reduce(
        (acc, t) => acc + (t.tipo === 'ingreso' ? t.monto : -t.monto),
        0
      );
    
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
          setStartDate(date);
          setTimeout(() => showPicker('end'), 400);
        } else {
          setEndDate(date);
        }
      };
    
      const formattedRange =
        startDate && endDate
          ? `${startDate.toLocaleDateString('es-MX', {
              day: '2-digit',
              month: 'short',
            })} - ${endDate.toLocaleDateString('es-MX', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}`
          : 'Seleccionar';

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
              padding:5,
              color: "white"
            }}
          >
            ${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
          </ThemedText>
        </LinearGradient>
      </Animated.View>

      {/* FILTROS */}
      <Animated.View entering={FadeInDown.delay(200)} exiting={FadeOutUp}>
        <ThemedText style={{ fontSize: 16 }}>Filtrar por:</ThemedText>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <View style={{ flexDirection: "row" }}>
            <TouchableOpacity
                onPress={() => showPicker('start')}
                style={{
                paddingVertical: 4,
                paddingHorizontal: 10,
                borderRadius: 6,
                backgroundColor: 'rgba(120,82,255,0.2)',
                }}
            >
                <ThemedText style={{ fontSize: RFValue(11) }}>
                Fecha: {formattedRange}
                </ThemedText>
            </TouchableOpacity>
            {["Total", "1S","1M", "1A"].map((f) => (
              <TouchableOpacity
                key={f}
                onPress={() => {
                    setRange(f as any);
                    setStartDate(null);
                    setEndDate(null);
                    }}
                
                style={{
                  backgroundColor:
                    range === f ? "#6366f1" : progressBg,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 20,
                  marginHorizontal: 4,
                }}
              >
                <ThemedText style={{ textTransform: "capitalize" }}>
                  {f}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
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
          marginTop:15
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
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={true}
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
                noOfSections={4}
                yAxisThickness={0}
                xAxisColor="transparent"
                yAxisColor="transparent"
                />
            </ScrollView>
            {filtered.length > 0 ? (
            <LineChart2
                data={{
                labels: filteredChart.map((t) =>
                    new Date(t.date).toLocaleDateString('es-MX', {
                    day: '2-digit',
                    month: 'numeric',
                    })
                ),
                datasets: [
                    {
                    data: filteredChart.map((t) =>
                        t.tipo === 'ingreso' ? t.monto : -t.monto
                    ),
                    },
                ],
                }}
                width={screenWidth * 0.85}
                height={RFValue(150)}
                chartConfig={chartConfig}
                bezier
                withDots={false}
                style={{ borderRadius: 10 }}
                />
            ) : null}
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

          {transacciones.length === 0 ? (
            <ThemedText style={{ color: "#aaa", textAlign: "center", marginTop: 10 }}>
              No hay transacciones registradas
            </ThemedText>
          ) : (
            filtered.map((tx) => (
              <View
                key={tx.id}
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
                  <View>
                    <View style={{flexDirection:"row"}}>
                      <ThemedText style={{ fontWeight: "500" }}>
                        {tx.descripcion || "Sin descripción"}
                      </ThemedText>
                      {tx.creadoAutomaticamente && (
                        <ThemedText style={{ color: "#888", fontSize: 11, marginLeft: 2 }}>
                          (Automático)
                        </ThemedText>
                      )}
                    </View>
                    <ThemedText style={{ color: "#aaa", fontSize: 12 }}>
                      {format(tx.fecha?.toDate(), "dd/MM/yyyy")}
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
              </View>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}
