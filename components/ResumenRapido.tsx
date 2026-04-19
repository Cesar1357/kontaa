// components/ResumenRapido.tsx
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { db } from "@/config/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Ionicons } from "@expo/vector-icons";
import { endOfDay, endOfMonth, endOfWeek, startOfDay, startOfMonth, startOfWeek, subDays, subMonths, subWeeks } from "date-fns";
import { collection, onSnapshot, query, Timestamp, where } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Dimensions, TouchableOpacity, View } from "react-native";
import { LineChart } from "react-native-chart-kit";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { RFValue } from "react-native-responsive-fontsize";

const screenWidth = Dimensions.get("window").width;

export default function ResumenRapido() {
  const { user } = useAuth();
  const [range, setRange] = useState<"D" | "S" | "M">("S"); // por defecto Semana
  const [loading, setLoading] = useState(true);

  const [currentTotal, setCurrentTotal] = useState<number>(0); 
  const [previousTotal, setPreviousTotal] = useState<number>(0); 
  const [trendPoints, setTrendPoints] = useState<number[]>([]);
  const [expanded, setExpanded] = useState(false);

  const cardsColor = useThemeColor({light:'',dark:''},'cardsMain');
  const textColor = useThemeColor({light:'',dark:''},'text');
  const resumenRapidoColor = useThemeColor({light:'',dark:''},'resumenRapido');
  
  const [actualizar, setActualizar] = useState(0);

  // animación (opcional, usa para resaltar cambio)
  const scale = useSharedValue(1);
  useEffect(() => {
    // pequeño pulso cuando cambian los totales
    scale.value = withTiming(1.03, { duration: 160 }, () => {
      scale.value = withTiming(1, { duration: 200 });
    });
  }, [currentTotal, previousTotal]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

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

  // calcula intervalos según range
  const computeRanges = () => {
    try{
        const now = new Date();
        if (range === "D") {
        const startCurr = startOfDay(now);
        const endCurr = endOfDay(now);
        const startPrev = startOfDay(subDays(now, 1));
        const endPrev = endOfDay(subDays(now, 1));
        // trend: últimos 7 días
        const trendFrom = startOfDay(subDays(now, 6));
        return { startCurr, endCurr, startPrev, endPrev, trendFrom, trendUnit: "day" as const };
        }
        if (range === "S") {
        // consideramos semana con inicio en lunes
        const startCurr = startOfWeek(now, { weekStartsOn: 1 });
        const endCurr = endOfWeek(now, { weekStartsOn: 1 });
        const startPrev = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
        const endPrev = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
        const trendFrom = startOfDay(subDays(now, 13)); // últimas 2 semanas para trend
        return { startCurr, endCurr, startPrev, endPrev, trendFrom, trendUnit: "day" as const };
        }
        // 'M'
        const startCurr = startOfMonth(now);
        const endCurr = endOfMonth(now);
        const startPrev = startOfMonth(subMonths(now, 1));
        const endPrev = endOfMonth(subMonths(now, 1));
        const trendFrom = startOfMonth(subMonths(now, 5)); // últimos 6 meses
        return { startCurr, endCurr, startPrev, endPrev, trendFrom, trendUnit: "month" as const };
    }catch(e){
        console.error("Error en computeRanges de ResumenRapido:", e);
        return {
            startCurr: new Date(),
            endCurr: new Date(),
            startPrev: new Date(),
            endPrev: new Date(),
            trendFrom: new Date(),
            trendUnit: "day" as const,
        };
    }
  };

  // escucha los datos necesarios usando onSnapshot
  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);
    try{
        const { startCurr, endCurr, startPrev, endPrev, trendFrom } = computeRanges();

        // consultamos desde trendFrom hasta ahora para tener todo lo necesario (trend + both periods)
        const ref = collection(db, `users/${user.uid}/transacciones`);
        const q = query(ref, where("fecha", ">=", Timestamp.fromDate(trendFrom)), where("fecha", "<=", Timestamp.fromDate(new Date())));

        const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
            const docs = snapshot.docs.map((d) => {
            const data = d.data() as any;
            return {
                ...data,
                // aseguramos tener Date en .date
                date: data.fecha?.toDate ? data.fecha.toDate() : new Date(data.fecha),
                tipo: data.tipo,
                monto: data.monto ?? data.cantidad ?? 0,
            };
            });

            // filtrar gastos (egresos) por periodo actual y previo
            const curr = docs.filter((t) => t.tipo === "egreso")
                            .filter((t) => t.date >= startCurr && t.date <= endCurr);
            const prev = docs.filter((t) => t.tipo === "egreso")
                            .filter((t) => t.date >= startPrev && t.date <= endPrev);

            const currTotal = curr.reduce((s, t) => s + (t.monto || 0), 0);
            const prevTotal = prev.reduce((s, t) => s + (t.monto || 0), 0);

            // crear trendPoints (según unidad: day o month)
            const { trendUnit } = computeRanges();
            let points: number[] = [];

            if (trendUnit === "day") {
            // generar array de días desde trendFrom hasta hoy
            const from = trendFrom;
            const to = new Date();
            const days: Date[] = [];
            for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
                days.push(new Date(d));
            }
            points = days.map((day) => {
                const sum = docs
                .filter((t) => (t.tipo === "egreso"))
                .filter((t) => {
                    return t.date.getFullYear() === day.getFullYear() &&
                        t.date.getMonth() === day.getMonth() &&
                        t.date.getDate() === day.getDate();
                })
                .reduce((s, t) => s + (t.monto || 0), 0);
                return sum;
            });
            } else {
            // monthly points: desde trendFrom hasta este mes
            const from = new Date(trendFrom.getFullYear(), trendFrom.getMonth(), 1);
            const to = new Date();
            const months: { y: number; m: number }[] = [];
            let cursor = new Date(from);
            while (cursor <= to) {
                months.push({ y: cursor.getFullYear(), m: cursor.getMonth() });
                cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
            }
            points = months.map(({ y, m }) => {
                const sum = docs
                .filter((t) => (t.tipo === "egreso"))
                .filter((t) => t.date.getFullYear() === y && t.date.getMonth() === m)
                .reduce((s, t) => s + (t.monto || 0), 0);
                return sum;
            });
            }

            setCurrentTotal(currTotal);
            setPreviousTotal(prevTotal);
            setTrendPoints(points);
            setLoading(false);
        },
        (err) => {
            console.error("ResumenRapido -> onSnapshot err", err);
            setLoading(false);
        }
        );

        return () => unsubscribe();
    } catch(e){
        console.error("Error en useEffect de ResumenRapido:", e);
        setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, range, actualizar]);

  // cálculo de porcentaje y mensaje
  const { percentChange, arrow, colorText, message } = useMemo(() => {
    try{
        const curr = currentTotal;
        const prev = previousTotal;
        let percent = 0;
        if (prev === 0 && curr === 0) percent = 0;
        else if (prev === 0) percent = 100; // todo nuevo gasto
        else percent = ((curr - prev) / Math.abs(prev)) * 100;

        const isIncrease = percent > 0;
        const arrowIcon = isIncrease ? "caret-up" : "caret-down";
        const color = isIncrease ? "#ff4d4d" : "#00c851"; // rojo aumento / verde disminución

        // mensaje
        let msg = "";
        if (curr === 0 && prev === 0) msg = "No hay gastos registrados en el periodo actual ni en el anterior.";
        else if (curr === 0) msg = "Perfecto — no gastaste en el periodo actual.";
        else {
        const verb = isIncrease ? "más" : "menos";
        msg = `Has gastado ${Math.abs(percent).toFixed(0)}% ${verb} que en el periodo anterior.`;
        }

        return { percentChange: Math.abs(percent), arrow: arrowIcon, colorText: color, message: msg };
    }catch(e){
        console.error("Error en useMemo de ResumenRapido:", e);
        return { percentChange: 0, arrow: "remove" as const, colorText: textColor, message: "" };
    }
  }, [currentTotal, previousTotal, actualizar]);

  // mini chart config (similar al BalanceHeader)
  const chartConfig = {
    backgroundGradientFrom: cardsColor,
    backgroundGradientTo: cardsColor,
    color: (opacity = 1) => resumenRapidoColor,
    strokeWidth: 2,
    propsForDots: { r: "0" },
    propsForBackgroundLines: { stroke: resumenRapidoColor },
    labelColor: (opacity = 1) => resumenRapidoColor,
  };

  // labels for chart (auto-generate short blanks or points depending on unit)
  const chartLabels = useMemo(() => {
    // if trendPoints length small, show labels for last items, else blanks to avoid crowd
    if (trendPoints.length <= 7) {
      // create simple labels like 'D-6', ... or months
      return trendPoints.map((_, i) => "");
    }
    return trendPoints.map(() => "");
  }, [trendPoints, actualizar]);

  try{
    return (
        <ThemedView
        style={{
            backgroundColor: cardsColor,
            borderRadius: 14,
            paddingVertical: RFValue(16),
            paddingHorizontal: RFValue(14),
            marginVertical: RFValue(8),
            alignItems: "center",
            width: "95%",
            alignSelf: "center",
        }}
        >
        <Animated.View style={[{ width: "100%" }, animatedStyle]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", width: "100%" }}>
            <View>
                <ThemedText style={{ fontSize: RFValue(13), color: "#aaa", marginBottom: 4 }}>
                Resumen rápido
                </ThemedText>
                <ThemedText style={{ fontSize: RFValue(20), fontWeight: "700" }}>
                {currentTotal === 0 && previousTotal === 0 ? "$0.00" : `$${currentTotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`}
                </ThemedText>
            </View>
                {loading ? (
                <ActivityIndicator color={textColor} />
                ) : (
                <View style={{ alignItems: "flex-end" }}>
                    <View style={{ marginTop: 4, alignItems: "center" }}>
                    <Ionicons name={percentChange === 0 ? "remove" : (currentTotal > previousTotal ? "caret-up" : "caret-down")} size={RFValue(18)} color={colorText} />
                    <ThemedText style={{ color: colorText, marginTop: 4, fontSize: RFValue(12) }}>
                        {percentChange === 0 ? "0%" : `${percentChange.toFixed(0)}%`}
                    </ThemedText>
                    </View>
                </View>
                )}
            </View>

            {/* Mensaje */}
            {!loading && (
            <ThemedText style={{ color: "#ccc", marginTop: 8, fontSize: RFValue(13), textAlign: "center" }}>
            {message}
            </ThemedText>
            )}

            {/* Mini chart (visible solo si hay puntos) */}
            {trendPoints.length > 0 && !loading && (
            <View style={{ marginTop: RFValue(10), width: "100%", alignItems: "center" }}>
                <LineChart
                data={{
                    labels: chartLabels,
                    datasets: [{ data: trendPoints }],
                }}
                width={screenWidth * 0.82}
                height={RFValue(110)}
                chartConfig={chartConfig}
                withDots={false}
                withInnerLines={false}
                withOuterLines={false}
                style={{ borderRadius: 10 }}
                bezier
                fromZero
                />
            </View>
            )}

            {/* Rango selector */}
            <View style={{ flexDirection: "row", justifyContent: "center", marginTop: RFValue(8) }}>
            {[
                { key: "D", label: "Día" },
                { key: "S", label: "Semana" },
                { key: "M", label: "Mes" },
            ].map((opt) => (
                <TouchableOpacity
                key={opt.key}
                onPress={() => setRange(opt.key as "D" | "S" | "M")}
                style={{
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    backgroundColor: range === opt.key ? "rgba(255, 229, 174, 0.57)" : "transparent",
                    marginHorizontal: 6,
                }}
                >
                <ThemedText style={{ fontSize: RFValue(12) }}>{opt.label}</ThemedText>
                </TouchableOpacity>
            ))}
            </View>
        </Animated.View>
        </ThemedView>
    );
    }catch(e){
        console.error("Error en render de ResumenRapido:", e);
        return null;
    }
}
