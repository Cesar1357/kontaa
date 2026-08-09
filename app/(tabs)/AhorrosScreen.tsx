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
import { useEffect, useRef, useState } from "react";
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
 * - Puede registrar transferencias entre ahorro y transacciones.
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
  const [sinPlazo, setSinPlazo] = useState(false);
  const [fechaLimite, setFechaLimite] = useState<string | null>(null); // ISO string optional
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);

  // detalle modal
  const [showDetalle, setShowDetalle] = useState(false);
  const [showTransacciones, setShowTransacciones] = useState(false);
  const [transaccionesData, setTransaccionesData] = useState<any[]>([]);
  const [cargandoMovimientos, setCargandoMovimientos] = useState(false);

  const [selected, setSelected] = useState<any>(null); // ahorro seleccionado
  const [movimientoMonto, setMovimientoMonto] = useState("");
  const [movimientoTipo, setMovimientoTipo] = useState<"deposito" | "retiro" | "transferencia" | "pasarATransacciones">("deposito");

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
  const borderColor = useThemeColor({ light: '', dark: '' }, 'border');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');
  const primaryDarkColor = useThemeColor({ light: '', dark: '' }, 'primaryDark');
  const modalOverlayColor = useThemeColor({ light: '', dark: '' }, 'transaccionModal');
  const iconColor = useThemeColor({ light: '', dark: '' }, 'icon');
  const headerColors: [string, string] = [primaryColor, primaryDarkColor || primaryColor];

  const styles = StyleSheet.create({
  headerCard: {
    padding: 18,
    borderRadius: 20,
  },
  headerTitle: { color: "white", fontSize: RFValue(20), fontWeight: "700" },
  headerSubtitle: { color: "rgba(255,255,255,0.88)", marginTop: 6 },

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
  cardDesc: { color: textColor, marginTop: 4, opacity: 0.7 },
  cardSmall: { color: textColor, marginTop: 6, opacity: 0.65 },

  progressBg: {
    height: 8,
    backgroundColor: progressBg,
    borderRadius: 10,
    overflow: "hidden",
  },
  progressFg: {
    height: "100%",
    backgroundColor: primaryColor,
    borderRadius: 10,
  },

  iconBtn: {
    backgroundColor: cardsMain,
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
    backgroundColor: cardsMain,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    color: textColor,
    borderWidth: 1,
    borderColor: borderColor,
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
    backgroundColor: cardsMain,
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: borderColor,
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
    setSinPlazo(false);
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
    setSinPlazo(false);
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

    if (!sinPlazo && !plazo && !fechaLimite) {
      Alert.alert("Error", "Selecciona un plazo (corto, mediano o largo) o una fecha probable.");
      return;
    }

    const now = new Date();
    let fechaObjetivo: Date | null = null;
    if (!sinPlazo && fechaLimite) {
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
    } else if (!sinPlazo && plazo) {
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
          plazo: sinPlazo ? null : plazo,
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
          plazo: sinPlazo ? null : plazo,
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
      setSinPlazo(false);
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

        if ((movimientoTipo === "retiro" || movimientoTipo === "transferencia" || movimientoTipo === "pasarATransacciones") && newAmount < 0) {
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

        if (movimientoTipo === "pasarATransacciones") {
          tx.set(doc(transaccionesRef), {
            descripcion: `Retiro de ahorro: ${selected.nombre}`,
            monto: montoNum,
            tipo: "ingreso",
            fecha: serverTimestamp(),
            creadoAutomaticamente: false,
            origen: "retiro-ahorro",
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
                : movimientoTipo === "transferencia"
                  ? "Transferencia desde saldo"
                  : "Retiro hacia transacciones",
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
    const hasFechaLimite = Boolean(a.fechaLimite?.seconds);
    const hasPlazo = Boolean(a.plazo);
    setPlazo(a.plazo || null);
    setSinPlazo(!hasPlazo && !hasFechaLimite);
    setFechaLimite(hasFechaLimite ? new Date(a.fechaLimite.seconds * 1000).toISOString().slice(0, 10) : null);
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
            colors={headerColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerCard}
          >
            <Text style={styles.headerTitle}>Ahorros</Text>
            <Text style={styles.headerSubtitle}>
              Crea metas, aporta y registra movimientos. Puedes transferir desde y hacia Transacciones.
            </Text>
          </LinearGradient>
        </Animated.View>

        <View style={{ height: 22 }} />

        {/* Lista */}
        <Animated.View layout={Layout.springify()}>
          {ahorros.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={{ color: textColor, opacity: 0.7 }}>No hay metas todavía. Crea una.</Text>
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
                        <Ionicons name="chevron-forward" size={20} color={iconColor} />
                      </TouchableOpacity>
                      <View style={{ height: 8 }} />
                      <TouchableOpacity onPress={() => editarMeta(a)} style={[styles.iconBtn, { backgroundColor: primaryColor }]}>
                        <Ionicons name="create-outline" size={18} color="white" />
                      </TouchableOpacity>
                      <View style={{ height: 8 }} />
                      <TouchableOpacity onPress={() => confirmarEliminar(a)} style={[styles.iconBtn, { backgroundColor: "#ef4444" }]}>
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
          backgroundColor: primaryColor,
          width: 56,
          height: 56,
          borderRadius: 28,
          justifyContent: "center",
          alignItems: "center",
          elevation: 8,
        }}
      >
        <Ionicons name="add" size={30} color={iconColor} />
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
                  <Ionicons name="close" size={24} color={iconColor} />
                </TouchableOpacity>
              </View>

              {cargandoMovimientos ? (
                <ActivityIndicator
                  size="large"
                  color={primaryColor}
                  style={{ marginTop: 20 }}
                />
              ) : transaccionesData.length === 0 ? (
                <Text
                  style={{
                    color: textColor,
                    opacity: 0.7,
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
                      <Text style={{ color: textColor, fontSize: 12, opacity: 0.75 }}>
                        {item.nota || "Sin descripción"}
                      </Text>
                      {item.creado?.seconds ? (
                        <Text style={{ color: textColor, fontSize: 11, marginTop: 2, opacity: 0.55 }}>
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
                placeholderTextColor={textColor}
                value={nombre}
                onChangeText={setNombre}
                style={styles.input}
              />

              <TextInput
                placeholder="Meta (MXN) (opcional)"
                placeholderTextColor={textColor}
                keyboardType="numeric"
                value={meta}
                onChangeText={setMeta}
                style={styles.input}
              />

              <TextInput
                placeholder="Descripción (opcional)"
                placeholderTextColor={textColor}
                value={descripcion}
                onChangeText={setDescripcion}
                style={styles.input}
              />
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, justifyContent: "space-between" }}>
                <ThemedText style={{ fontSize: 13, fontWeight: "600", marginBottom: 6 }}>
                  Plazo
                </ThemedText>
                <TouchableOpacity
                  onPress={() => {
                    setSinPlazo((prev) => {
                      const next = !prev;
                      if (next) {
                        setPlazo(null);
                        setFechaLimite(null);
                      }
                      return next;
                    });
                  }}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: sinPlazo ? primaryColor : borderColor,
                    backgroundColor: sinPlazo ? primaryColor : cardsMain,
                  }}
                >
                  <Text style={{ color: iconColor, fontSize: 12, fontWeight: "600" }}>Sin plazo</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: "row", marginBottom: 10, justifyContent: "center" }}>
                <TouchableOpacity
                  onPress={() => {
                    setSinPlazo(false);
                    setPlazo("corto");
                  }}
                  style={[
                    styles.smallBtn,
                    plazo === "corto" ? { backgroundColor: "#3edc81" } : { backgroundColor: cardsMain },
                  ]}
                >
                  <Text style={{ color: plazo === "corto" ? "black" : iconColor }}>Corto (1 mes)</Text>
                </TouchableOpacity>

                <View style={{ width: 8 }} />

                <TouchableOpacity
                  onPress={() => {
                    setSinPlazo(false);
                    setPlazo("mediano");
                  }}
                  style={[
                    styles.smallBtn,
                    plazo === "mediano" ? { backgroundColor: "#93c5fd" } : { backgroundColor: cardsMain },
                  ]}
                >
                  <Text style={{ color: plazo === "mediano" ? "black" : iconColor }}>Mediano (1 año)</Text>
                </TouchableOpacity>

                <View style={{ width: 8 }} />

                <TouchableOpacity
                  onPress={() => {
                    setSinPlazo(false);
                    setPlazo("largo");
                  }}
                  style={[
                    styles.smallBtn,
                    plazo === "largo" ? { backgroundColor: "#c084fc" } : { backgroundColor: cardsMain },
                  ]}
                >
                  <Text style={{ color: plazo === "largo" ? "black" : iconColor }}>Largo (2 años)</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={openFechaPicker}
                disabled={sinPlazo}
                style={[
                  styles.input,
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    opacity: sinPlazo ? 0.5 : 1,
                  },
                ]}
              >
                <Text style={{ color: fechaLimite ? iconColor : textColor, opacity: fechaLimite ? 1 : 0.65 }}>
                  {sinPlazo ? "Sin plazo seleccionado" : (fechaLimite || "Fecha probable (opcional)")}
                </Text>
                <Ionicons name="calendar-outline" size={18} color={textColor} />
              </TouchableOpacity>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <TouchableOpacity
                  onPress={() => {
                    // reset form
                    setNombre("");
                    setMeta("");
                    setDescripcion("");
                    setPlazo(null);
                    setSinPlazo(false);
                    setFechaLimite(null);
                    setShowNuevo(false);
                    setEditando(false);
                    setCantidadActual(0);
                    setSelected(null);
                  }}
                  style={[styles.btn, { backgroundColor: cardsMain, flex: 1, borderWidth: 1, borderColor: borderColor }]}
                >
                  <Text style={{ color: iconColor, textAlign: "center" }}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={guardarNuevo}
                  style={[styles.btn, { backgroundColor: primaryColor, flex: 1 }]}
                >
                  <Text style={{ color: iconColor, textAlign: "center" }}>Guardar</Text>
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

              <ThemedText style={{ color: textColor, opacity: 0.7, marginBottom: 6 }}>
                Actual: ${fmt(selected?.cantidadActual || 0)} • Meta: ${fmt(selected?.meta || 0)}
              </ThemedText>

              <View style={{ flexDirection: "row", marginBottom: 8 }}>
                <TouchableOpacity
                  onPress={() => setMovimientoTipo("deposito")}
                  style={[
                    styles.smallBtn,
                    movimientoTipo === "deposito" ? { backgroundColor: "#3edc81" } : { backgroundColor: cardsMain },
                  ]}
                >
                  <Text style={{ color: movimientoTipo === "deposito" ? "black" : iconColor }}>Depositar</Text>
                </TouchableOpacity>

                <View style={{ width: 8 }} />

                <TouchableOpacity
                  onPress={() => setMovimientoTipo("retiro")}
                  style={[
                    styles.smallBtn,
                    movimientoTipo === "retiro" ? { backgroundColor: "#ff8b8b" } : { backgroundColor: cardsMain },
                  ]}
                >
                  <Text style={{ color: movimientoTipo === "retiro" ? "black" : iconColor }}>Retirar</Text>
                </TouchableOpacity>

                <View style={{ width: 8 }} />

                <TouchableOpacity
                  onPress={() => setMovimientoTipo("transferencia")}
                  style={[
                    styles.smallBtn,
                    movimientoTipo === "transferencia" ? { backgroundColor: "#c084fc" } : { backgroundColor: cardsMain },
                  ]}
                >
                  <Text style={{ color: movimientoTipo === "transferencia" ? "black" : iconColor }}>A ahorro</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: "row", marginBottom: 8 }}>
                <TouchableOpacity
                  onPress={() => setMovimientoTipo("pasarATransacciones")}
                  style={[
                    styles.smallBtn,
                    { width: "100%" },
                    movimientoTipo === "pasarATransacciones" ? { backgroundColor: "#f59e0b" } : { backgroundColor: cardsMain },
                  ]}
                >
                  <Text style={{ color: movimientoTipo === "pasarATransacciones" ? "black" : iconColor, textAlign: "center" }}>
                    A transacciones
                  </Text>
                </TouchableOpacity>
              </View>

              <TextInput
                ref={movimientoInputRef}
                placeholder="Monto"
                placeholderTextColor={textColor}
                keyboardType="numeric"
                value={movimientoMonto}
                onChangeText={setMovimientoMonto}
                style={styles.input}
              />

              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <TouchableOpacity onPress={() => { setShowDetalle(false); setEditando(false); setSelected(null); }} style={[styles.btn, { backgroundColor: cardsMain, flex: 1, borderWidth: 1, borderColor: borderColor }]}>
                  <Text style={{ color: iconColor, textAlign: "center" }}>Cerrar</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={ejecutarMovimiento} style={[styles.btn, { backgroundColor: primaryColor, flex: 1 }]}>
                  <Text style={{ color: iconColor, textAlign: "center" }}>
                    {movimientoTipo === "deposito"
                      ? "Depositar"
                      : movimientoTipo === "retiro"
                        ? "Retirar"
                        : movimientoTipo === "transferencia"
                          ? "Transferir a ahorro"
                          : "Pasar a transacciones"}
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

