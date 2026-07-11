// AhorrosScreen.tsx
import { ThemedText } from "@/components/ThemedText";
import { db } from "@/config/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { FlatList } from "react-native-gesture-handler";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import Animated, { Layout } from "react-native-reanimated";
import { RFValue } from "react-native-responsive-fontsize";
/**
 * AhorrosScreen
 * - Lista de metas de ahorro (cards)
 * - Modal para crear nueva meta
 * - Modal de detalle (depositar / retirar / ver movimientos rápidos)
 *
 * Notas:
 * - No toca transacciones.
 * - Guarda movimientos en subcollection "movimientos".
 */

export default function AhorrosScreen() {
  const { user } = useAuth();
  type PlazoAhorro = "corto" | "mediano" | "largo";
  const PLAZO_DIAS: Record<PlazoAhorro, number> = {
    corto: 30,
    mediano: 365,
    largo: 730,
  };
  const [ahorros, setAhorros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscriptionActive, setSubscriptionActive] = useState(false);

  const FREE_LIMIT = 2;

  // UI modal/new
  const [showNuevo, setShowNuevo] = useState(false);
  const [nombre, setNombre] = useState("");
  const [meta, setMeta] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [plazo, setPlazo] = useState<PlazoAhorro | null>(null);
  const [fechaLimite, setFechaLimite] = useState<string | null>(null); // ISO string optional
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);

  // detalle modal
  const [showDetalle, setShowDetalle] = useState(false);
  const [showTransacciones, setShowTransacciones] = useState(false);
  const [transaccionesData, setTransaccionesData] = useState<any[]>([]);
  const [cargandoMovimientos, setCargandoMovimientos] = useState(false);

  const [selected, setSelected] = useState<any>(null); // ahorro seleccionado
  const [movimientoMonto, setMovimientoMonto] = useState("");
  const [movimientoTipo, setMovimientoTipo] = useState<"deposito" | "retiro" | "transferencia">("deposito");

  const [editando, setEditando] = useState(false);
  const [cantidadActual, setCantidadActual] = useState(0);
  const nombreInputRef = useRef<TextInput>(null);
  const movimientoInputRef = useRef<TextInput>(null);

  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const backgroundColor = useThemeColor({ light: '', dark: '' }, 'background');
  const backgroundColor2 = useThemeColor({ light: '', dark: '' }, 'background2');
  const graficaFondoColor = useThemeColor({ light: '', dark: '' }, 'graficaHistorial');
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const cardMain = useThemeColor({ light: '', dark: '' }, 'cardMain');
  const progressBg = useThemeColor({ light: '', dark: '' }, 'progressBg');

  const styles = StyleSheet.create({
  headerCard: {
    padding: 18,
    borderRadius: 20,
  },
  headerTitle: { color: "white", fontSize: RFValue(20), fontWeight: "700" },
  headerSubtitle: { color: "#e6e6e6", marginTop: 6 },

  emptyContainer: {
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
  },

  card: {
    backgroundColor: graficaFondoColor,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: { fontSize: RFValue(16), fontWeight: "700" },
  cardDesc: { color: "#aaa", marginTop: 4 },
  cardSmall: { color: "#999", marginTop: 6 },

  progressBg: {
    height: 8,
    backgroundColor: progressBg,
    borderRadius: 10,
    overflow: "hidden",
  },
  progressFg: {
    height: "100%",
    backgroundColor: "#5c6bf2",
    borderRadius: 10,
  },

  iconBtn: {
    backgroundColor: progressBg,
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  modalBack: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: backgroundColor2,
    borderRadius: 12,
    padding: 16,
  },

  input: {
    backgroundColor: "#1b1b1b",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    color:"#999"
  },

  btn: {
    paddingVertical: 10,
    borderRadius: 10,
  },

  smallBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    width: "32%",
  },
   modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: backgroundColor,
    borderRadius: 14,
    padding: 16,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: textColor,
  },
  movCard: {
    backgroundColor: "#222",
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
});

  // efectos: escuchar ahorros
  useEffect(() => {
    const userId = (user as any)?.uid;
    if (!userId) return;
    const ref = collection(db, `users/${userId}/ahorros`);
    const q = query(ref, orderBy("creado", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAhorros(data);
        setLoading(false);
      },
      (err) => {
        console.error("Error al leer ahorros:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user]);

  useEffect(() => {
    const userId = (user as any)?.uid;
    if (!userId) {
      setSubscriptionActive(false);
      return;
    }

    const userRef = doc(db, `users/${userId}`);
    const unsub = onSnapshot(userRef, (snap) => {
      const data = snap.data() || {};
      setSubscriptionActive(Boolean((data as any).supportSubscription?.active));
    });

    return () => unsub();
  }, [user]);

  // util: formatea número con comas (sin decimales)
  const fmt = (n: number) =>
    n?.toLocaleString?.("es-MX", { maximumFractionDigits: 2, minimumFractionDigits: 0 }) ?? "0";

  const labelPlazo = (p?: string | null) => {
    if (p === "corto") return "Corto plazo";
    if (p === "mediano") return "Mediano plazo";
    if (p === "largo") return "Largo plazo";
    return "Sin plazo";
  };

  const parseFecha = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const toIsoDate = (date: Date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const abrirNuevo = () => {
    setSelected(null);
    setNombre("");
    setMeta("");
    setDescripcion("");
    setPlazo(null);
    setFechaLimite(null);
    setCantidadActual(0);
    setEditando(false);
    setShowNuevo(true);
  };

  const openFechaPicker = () => {
    setDatePickerVisible(true);
  };

  const handleFechaConfirm = (date: Date) => {
    setDatePickerVisible(false);
    setFechaLimite(toIsoDate(date));
  };

  // Crear nuevo ahorro
  const guardarNuevo = async () => {
    const userId = (user as any)?.uid;
    if (!userId) return;

    if (!editando && !subscriptionActive && ahorros.length >= FREE_LIMIT) {
      Alert.alert("Limite de plan gratuito", "Puedes crear hasta 2 metas de ahorro sin suscripcion.");
      return;
    }

    if (!nombre.trim()) {
      Alert.alert("Error", "Pon un nombre para la meta.");
      return;
    }

    if (!plazo && !fechaLimite) {
      Alert.alert("Error", "Selecciona un plazo (corto, mediano o largo) o una fecha probable.");
      return;
    }

    const now = new Date();
    let fechaObjetivo: Date | null = null;
    if (fechaLimite) {
      const parsed = parseFecha(fechaLimite);
      if (!parsed) {
        Alert.alert("Error", "La fecha probable debe estar en formato AAAA-MM-DD.");
        return;
      }
      if (parsed <= now) {
        Alert.alert("Error", "La fecha probable debe ser futura.");
        return;
      }
      fechaObjetivo = parsed;
    } else if (plazo) {
      const objetivo = new Date(now);
      objetivo.setDate(objetivo.getDate() + PLAZO_DIAS[plazo]);
      fechaObjetivo = objetivo;
    }

    var metaNum = 0;
    if(meta !== ""){
        metaNum = parseFloat(meta.toString().replace(/,/g, ""));
        if (isNaN(metaNum) || metaNum <= 0) {
            Alert.alert("Error", "Ingresa una meta válida.");
            return;
        }
    }
    
    try {
      if (editando) {
        const ref = doc(db, `users/${userId}/ahorros`, selected.id);
        await updateDoc(ref, {
          nombre: nombre.trim(),
          meta: meta === "" ? "" : metaNum,
          cantidadActual: cantidadActual,
          descripcion: descripcion || "",
          plazo: plazo,
          fechaLimite: fechaObjetivo ? Timestamp.fromDate(fechaObjetivo) : null,
        });
        ToastAndroid.show("Meta actualizada", ToastAndroid.SHORT);
      } else {
        const ref = collection(db, `users/${userId}/ahorros`);
        await addDoc(ref, {
          nombre: nombre.trim(),
          meta: meta === "" ? "" : metaNum,
          cantidadActual: 0,
          descripcion: descripcion || "",
          plazo: plazo,
          creado: serverTimestamp(),
          fechaLimite: fechaObjetivo ? Timestamp.fromDate(fechaObjetivo) : null,
        });
        ToastAndroid.show("Meta creada", ToastAndroid.SHORT);
      }
      
      // limpiar
      setNombre("");
      setMeta("");
      setDescripcion("");
      setPlazo(null);
      setFechaLimite(null);
      setShowNuevo(false);
      setEditando(false);
    } catch (e) {
      console.error("Error guardar ahorro:", e);
      Alert.alert("Error", "No se pudo crear la meta.");
    }
  };

  useEffect(() => {
    if (!showNuevo) return;

    const timer = setTimeout(() => {
      nombreInputRef.current?.focus();
    }, 250);

    return () => clearTimeout(timer);
  }, [showNuevo, editando]);

  // Abrir detalle
  const abrirDetalle = (a: any) => {
    setSelected(a);
    setMovimientoMonto("");
    setMovimientoTipo("deposito");
    setShowDetalle(true);
  };

  useEffect(() => {
    if (!showDetalle) return;

    const timer = setTimeout(() => {
      movimientoInputRef.current?.focus();
    }, 250);

    return () => clearTimeout(timer);
  }, [showDetalle]);

  const abrirTransacciones = async (a: any) => {
    const userId = (user as any)?.uid;
    if (!userId) return;
    setSelected(a);
    setShowTransacciones(true);
    setCargandoMovimientos(true);

    try {
      const ref = doc(db, `users/${userId}/ahorros`, a.id);
      const q = query(collection(ref, "movimientos"), orderBy("creado", "desc"));

      const unsub = onSnapshot(q, (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setTransaccionesData(data);
        setCargandoMovimientos(false);
      });

      return unsub;
    } catch (e) {
      console.error("Error al obtener movimientos:", e);
      Alert.alert("Error", "No se pudieron cargar las transacciones.");
      setCargandoMovimientos(false);
    }
  };

  // Depositar / retirar (transactional)
  const ejecutarMovimiento = async () => {
    if (!selected) return;
    const userId = (user as any)?.uid;
    if (!userId) return;
    const montoNum = parseFloat(movimientoMonto.toString().replace(/,/g, ""));
    if (isNaN(montoNum) || montoNum <= 0) {
      Alert.alert("Error", "Ingresa un monto válido.");
      return;
    }

    const ahorroRef = doc(db, `users/${userId}/ahorros`, selected.id);
    const movsRef = collection(db, `users/${userId}/ahorros`, selected.id, "movimientos");
    const transaccionesRef = collection(db, `users/${userId}/transacciones`);

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ahorroRef);
        if (!snap.exists()) throw new Error("Meta no encontrada");

        const current = snap.data()?.cantidadActual || 0;
        const newAmount = movimientoTipo === "deposito"
          ? current + montoNum
          : current - montoNum;

        if ((movimientoTipo === "retiro" || movimientoTipo === "transferencia") && newAmount < 0) {
          throw new Error("No hay suficiente en la meta para retirar esa cantidad.");
        }

        if (movimientoTipo === "transferencia") {
          tx.set(doc(transaccionesRef), {
            descripcion: `Transferencia a ahorro: ${selected.nombre}`,
            monto: montoNum,
            tipo: "egreso",
            fecha: serverTimestamp(),
            creadoAutomaticamente: false,
            origen: "transferencia-ahorro",
            ahorroId: selected.id,
            ahorroNombre: selected.nombre,
          });
        }

        // actualizar ahorro
        tx.update(ahorroRef, {
          cantidadActual: newAmount,
          actualizadoEn: serverTimestamp(),
        });

        // registrar movimiento en subcollection
        const movimientoDoc = {
          tipo: movimientoTipo,
          monto: montoNum,
          creado: serverTimestamp(),
          nota:
            movimientoTipo === "deposito"
              ? "Depósito manual"
              : movimientoTipo === "retiro"
                ? "Retiro manual"
                : "Transferencia desde saldo",
        };
        tx.set(doc(movsRef), movimientoDoc);
      });

      ToastAndroid.show("Movimiento registrado", ToastAndroid.SHORT);
      setShowDetalle(false);
    } catch (e: any) {
      console.error("Error movimiento:", e);
      Alert.alert("Error", e?.message || "No se pudo procesar el movimiento.");
    }
  };

  // Eliminar meta
  const confirmarEliminar = (a: any) => {
    const userId = (user as any)?.uid;
    if (!userId) return;
    Alert.alert("Eliminar meta", `¿Eliminar "${a.nombre}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, `users/${userId}/ahorros`, a.id));
            ToastAndroid.show("Meta eliminada", ToastAndroid.SHORT);
          } catch (e) {
            console.error("Error eliminar meta:", e);
            Alert.alert("Error", "No se pudo eliminar la meta.");
          }
        },
      },
    ]);
  };

  // Editar meta (solo nombre/meta/desc/fecha)
  const editarMeta = async (a: any) => {
    // abrimos modal tipo nuevo con los valores (simple flow)
    setSelected(a);
    setNombre(a.nombre || "");
    setMeta(String(a.meta || ""));
    setDescripcion(a.descripcion || "");
    setPlazo(a.plazo || null);
    setFechaLimite(a.fechaLimite ? new Date(a.fechaLimite.seconds * 1000).toISOString().slice(0, 10) : null);
    setShowNuevo(true);
    setEditando(true);
    setCantidadActual(a.cantidadActual || 0);
  };

  // UI
  return (
    <View style={{ flex: 1, backgroundColor: backgroundColor2 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 80 }}>
        <Animated.View layout={Layout.springify()}>
          <LinearGradient
            colors={["#6366f1", "#8b5cf6"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerCard}
          >
            <Text style={styles.headerTitle}>Ahorros</Text>
            <Text style={styles.headerSubtitle}>
              Crea metas, aporta y registra movimientos. No aparecen en Transacciones.
            </Text>
          </LinearGradient>
        </Animated.View>

        <View style={{ height: 22 }} />

        {/* Lista */}
        <Animated.View layout={Layout.springify()}>
          {ahorros.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={{ color: "#aaa" }}>No hay metas todavía. Crea una.</Text>
            </View>
          ) : (
            ahorros.map((a) => {
              const progreso = a.meta && a.meta > 0 ? Math.min((a.cantidadActual / a.meta) * 100, 100) : 0;
              return (
                <TouchableOpacity onPress={() => abrirTransacciones(a)} key={a.id} style={styles.card}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.cardTitle}>{a.nombre}</ThemedText>
                      {a.descripcion ? <ThemedText style={styles.cardDesc}>{a.descripcion}</ThemedText> : null}
                      <ThemedText style={styles.cardSmall}>
                        {fmt(a.cantidadActual || 0)} / {a.meta === "" ? "∞" : fmt(a.meta || 0)}
                      </ThemedText>
                      <ThemedText style={styles.cardSmall}>
                        {labelPlazo(a.plazo)}
                        {a.fechaLimite?.seconds
                          ? ` • Fecha probable: ${new Date(a.fechaLimite.seconds * 1000).toLocaleDateString("es-MX")}`
                          : ""}
                      </ThemedText>
                    </View>

                    <View style={{ marginLeft: 10, alignItems: "flex-end" }}>
                      <TouchableOpacity onPress={() => abrirDetalle(a)} style={styles.iconBtn}>
                        <Ionicons name="chevron-forward" size={20} color="white" />
                      </TouchableOpacity>
                      <View style={{ height: 8 }} />
                      <TouchableOpacity onPress={() => editarMeta(a)} style={[styles.iconBtn, { backgroundColor: "#5c6bf2" }]}>
                        <Ionicons name="create-outline" size={18} color="white" />
                      </TouchableOpacity>
                      <View style={{ height: 8 }} />
                      <TouchableOpacity onPress={() => confirmarEliminar(a)} style={[styles.iconBtn, { backgroundColor: "#ff6363" }]}>
                        <Ionicons name="trash-outline" size={18} color="white" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* barra progreso */}
                  <View style={{ marginTop: 12 }}>
                    <View style={styles.progressBg}>
                      <View style={[styles.progressFg, { width: `${progreso}%` }]} />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </Animated.View>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Botón flotante crear */}
      <TouchableOpacity
        onPress={abrirNuevo}
        style={{
          position: "absolute",
          bottom: 30,
          right: 20,
          backgroundColor: "#5c6bf2",
          width: 56,
          height: 56,
          borderRadius: 28,
          justifyContent: "center",
          alignItems: "center",
          elevation: 8,
        }}
      >
        <Ionicons name="add" size={30} color="white" />
      </TouchableOpacity>

       <Modal visible={showTransacciones} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowTransacciones(false)}>
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <ThemedText style={styles.modalTitle}>
                  Movimientos de {selected?.nombre || ""}
                </ThemedText>
                <TouchableOpacity onPress={() => setShowTransacciones(false)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>

              {cargandoMovimientos ? (
                <ActivityIndicator
                  size="large"
                  color="#5c6bf2"
                  style={{ marginTop: 20 }}
                />
              ) : transaccionesData.length === 0 ? (
                <Text
                  style={{
                    color: "#aaa",
                    textAlign: "center",
                    marginTop: 30,
                  }}
                >
                  No hay movimientos registrados.
                </Text>
              ) : (
                <FlatList
                  data={transaccionesData}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ marginTop: 10 }}
                  renderItem={({ item }) => (
                    <View style={styles.movCard}>
                      <ThemedText
                        style={{
                          color: item.tipo === "deposito" || item.tipo === "transferencia" ? "#4ade80" : "#f87171",
                          fontWeight: "600",
                        }}
                      >
                        {item.tipo === "deposito" || item.tipo === "transferencia" ? "+" : "-"}${item.monto.toFixed(2)}
                      </ThemedText>
                      <Text style={{ color: "#aaa", fontSize: 12 }}>
                        {item.nota || "Sin descripción"}
                      </Text>
                      {item.creado?.seconds ? (
                        <Text style={{ color: "#666", fontSize: 11, marginTop: 2 }}>
                          {new Date(
                            item.creado.seconds * 1000
                          ).toLocaleDateString()}
                        </Text>
                      ) : null}
                    </View>
                  )}
                />
              )}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {/* Modal Nuevo (reutilizable para edición básica) */}
      <Modal visible={showNuevo} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowNuevo(false)}>
          <View style={styles.modalBack}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalCard}>
              <ThemedText style={{ fontSize: 20, fontWeight: "700", marginBottom: 8 }}>
                {editando ? "Editar meta" : "Nueva meta"}
              </ThemedText>

              <TextInput
                ref={nombreInputRef}
                placeholder="Nombre"
                placeholderTextColor="#999"
                value={nombre}
                onChangeText={setNombre}
                style={styles.input}
              />

              <TextInput
                placeholder="Meta (MXN) (opcional)"
                placeholderTextColor="#999"
                keyboardType="numeric"
                value={meta}
                onChangeText={setMeta}
                style={styles.input}
              />

              <TextInput
                placeholder="Descripción (opcional)"
                placeholderTextColor="#999"
                value={descripcion}
                onChangeText={setDescripcion}
                style={styles.input}
              />

              <ThemedText style={{ fontSize: 13, fontWeight: "600", marginBottom: 6 }}>
                Plazo
              </ThemedText>
              <View style={{ flexDirection: "row", marginBottom: 10, justifyContent: "center" }}>
                <TouchableOpacity
                  onPress={() => setPlazo("corto")}
                  style={[
                    styles.smallBtn,
                    plazo === "corto" ? { backgroundColor: "#3edc81" } : { backgroundColor: "#2a2a2a" },
                  ]}
                >
                  <Text style={{ color: plazo === "corto" ? "black" : "white" }}>Corto (1 mes)</Text>
                </TouchableOpacity>

                <View style={{ width: 8 }} />

                <TouchableOpacity
                  onPress={() => setPlazo("mediano")}
                  style={[
                    styles.smallBtn,
                    plazo === "mediano" ? { backgroundColor: "#93c5fd" } : { backgroundColor: "#2a2a2a" },
                  ]}
                >
                  <Text style={{ color: plazo === "mediano" ? "black" : "white" }}>Mediano (1 año)</Text>
                </TouchableOpacity>

                <View style={{ width: 8 }} />

                <TouchableOpacity
                  onPress={() => setPlazo("largo")}
                  style={[
                    styles.smallBtn,
                    plazo === "largo" ? { backgroundColor: "#c084fc" } : { backgroundColor: "#2a2a2a" },
                  ]}
                >
                  <Text style={{ color: plazo === "largo" ? "black" : "white" }}>Largo (2 años)</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={openFechaPicker}
                style={[
                  styles.input,
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  },
                ]}
              >
                <Text style={{ color: fechaLimite ? "white" : "#999" }}>
                  {fechaLimite || "Fecha probable (opcional)"}
                </Text>
                <Ionicons name="calendar-outline" size={18} color="#999" />
              </TouchableOpacity>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <TouchableOpacity
                  onPress={() => {
                    // reset form
                    setNombre("");
                    setMeta("");
                    setDescripcion("");
                    setPlazo(null);
                    setFechaLimite(null);
                    setShowNuevo(false);
                    setEditando(false);
                    setCantidadActual(0);
                    setSelected(null);
                  }}
                  style={[styles.btn, { backgroundColor: "#2a2a2a", flex: 1 }]}
                >
                  <Text style={{ color: "white", textAlign: "center" }}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={guardarNuevo}
                  style={[styles.btn, { backgroundColor: "#5c6bf2", flex: 1 }]}
                >
                  <Text style={{ color: "white", textAlign: "center" }}>Guardar</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        minimumDate={new Date()}
        onConfirm={handleFechaConfirm}
        onCancel={() => setDatePickerVisible(false)}
      />

      {/* Modal detalle: depositar / retirar */}
      <Modal visible={showDetalle} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowDetalle(false)}>
          <View style={styles.modalBack}>
            <View style={styles.modalCard}>
              <ThemedText style={{ fontSize: 20, fontWeight: "700", marginBottom: 8 }}>
                {selected?.nombre || "Detalle"}
              </ThemedText>

              <ThemedText style={{ color: "#aaa", marginBottom: 6 }}>
                Actual: ${fmt(selected?.cantidadActual || 0)} • Meta: ${fmt(selected?.meta || 0)}
              </ThemedText>

              <View style={{ flexDirection: "row", marginBottom: 8 }}>
                <TouchableOpacity
                  onPress={() => setMovimientoTipo("deposito")}
                  style={[
                    styles.smallBtn,
                    movimientoTipo === "deposito" ? { backgroundColor: "#3edc81" } : { backgroundColor: "#2a2a2a" },
                  ]}
                >
                  <Text style={{ color: movimientoTipo === "deposito" ? "black" : "white" }}>Depositar</Text>
                </TouchableOpacity>

                <View style={{ width: 8 }} />

                <TouchableOpacity
                  onPress={() => setMovimientoTipo("retiro")}
                  style={[
                    styles.smallBtn,
                    movimientoTipo === "retiro" ? { backgroundColor: "#ff8b8b" } : { backgroundColor: "#2a2a2a" },
                  ]}
                >
                  <Text style={{ color: movimientoTipo === "retiro" ? "black" : "white" }}>Retirar</Text>
                </TouchableOpacity>

                <View style={{ width: 8 }} />

                <TouchableOpacity
                  onPress={() => setMovimientoTipo("transferencia")}
                  style={[
                    styles.smallBtn,
                    movimientoTipo === "transferencia" ? { backgroundColor: "#c084fc" } : { backgroundColor: "#2a2a2a" },
                  ]}
                >
                  <Text style={{ color: movimientoTipo === "transferencia" ? "black" : "white" }}>Transferir</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                ref={movimientoInputRef}
                placeholder="Monto"
                placeholderTextColor="#999"
                keyboardType="numeric"
                value={movimientoMonto}
                onChangeText={setMovimientoMonto}
                style={styles.input}
              />

              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <TouchableOpacity onPress={() => { setShowDetalle(false); setEditando(false); setSelected(null); }} style={[styles.btn, { backgroundColor: "#2a2a2a", flex: 1 }]}>
                  <Text style={{ color: "white", textAlign: "center" }}>Cerrar</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={ejecutarMovimiento} style={[styles.btn, { backgroundColor: "#5c6bf2", flex: 1 }]}>
                  <Text style={{ color: "white", textAlign: "center" }}>
                    {movimientoTipo === "deposito" ? "Depositar" : movimientoTipo === "retiro" ? "Retirar" : "Transferir"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

// estilos

