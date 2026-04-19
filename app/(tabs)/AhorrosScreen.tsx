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
import React, { useEffect, useState } from "react";
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
  View
} from "react-native";
import { FlatList } from "react-native-gesture-handler";
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
  const [ahorros, setAhorros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // UI modal/new
  const [showNuevo, setShowNuevo] = useState(false);
  const [nombre, setNombre] = useState("");
  const [meta, setMeta] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [fechaLimite, setFechaLimite] = useState<string | null>(null); // ISO string optional

  // detalle modal
  const [showDetalle, setShowDetalle] = useState(false);
  const [showTransacciones, setShowTransacciones] = useState(false);
  const [transaccionesData, setTransaccionesData] = useState<any[]>([]);
  const [cargandoMovimientos, setCargandoMovimientos] = useState(false);

  const [selected, setSelected] = useState<any>(null); // ahorro seleccionado
  const [movimientoMonto, setMovimientoMonto] = useState("");
  const [movimientoTipo, setMovimientoTipo] = useState<"deposito" | "retiro">("deposito");

  const [editando, setEditando] = useState(false);
  const [cantidadActual, setCantidadActual] = useState(0);

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
    borderRadius: 16,
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
    if (!user?.uid) return;
    const ref = collection(db, `users/${user.uid}/ahorros`);
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

  // util: formatea número con comas (sin decimales)
  const fmt = (n: number) =>
    n?.toLocaleString?.("es-MX", { maximumFractionDigits: 2, minimumFractionDigits: 0 }) ?? "0";

  // Crear nuevo ahorro
  const guardarNuevo = async () => {
    if (!nombre.trim()) {
      Alert.alert("Error", "Pon un nombre para la meta.");
      return;
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
        const ref = doc(db, `users/${user.uid}/ahorros`, selected.id);
        await updateDoc(ref, {
          nombre: nombre.trim(),
          meta: meta === "" ? "" : metaNum,
          cantidadActual: cantidadActual,
          descripcion: descripcion || "",
        });
        ToastAndroid.show("Meta actualizada", ToastAndroid.SHORT);
      } else {
        const ref = collection(db, `users/${user.uid}/ahorros`);
        await addDoc(ref, {
          nombre: nombre.trim(),
          meta: meta === "" ? "" : metaNum,
          cantidadActual: 0,
          descripcion: descripcion || "",
          creado: serverTimestamp(),
          fechaLimite: fechaLimite ? Timestamp.fromDate(new Date(fechaLimite)) : null,
        });
        ToastAndroid.show("Meta creada", ToastAndroid.SHORT);
      }
      
      // limpiar
      setNombre("");
      setMeta("");
      setDescripcion("");
      setFechaLimite(null);
      setShowNuevo(false);
      setEditando(false);
    } catch (e) {
      console.error("Error guardar ahorro:", e);
      Alert.alert("Error", "No se pudo crear la meta.");
    }
  };

  // Abrir detalle
  const abrirDetalle = (a: any) => {
    setSelected(a);
    setMovimientoMonto("");
    setMovimientoTipo("deposito");
    setShowDetalle(true);
  };

  const abrirTransacciones = async (a: any) => {
    if (!user?.uid) return;
    setSelected(a);
    setShowTransacciones(true);
    setCargandoMovimientos(true);

    try {
      const ref = doc(db, `users/${user.uid}/ahorros`, a.id);
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
    const montoNum = parseFloat(movimientoMonto.toString().replace(/,/g, ""));
    if (isNaN(montoNum) || montoNum <= 0) {
      Alert.alert("Error", "Ingresa un monto válido.");
      return;
    }

    const ahorroRef = doc(db, `users/${user.uid}/ahorros`, selected.id);
    const movsRef = collection(db, `users/${user.uid}/ahorros`, selected.id, "movimientos");

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ahorroRef);
        if (!snap.exists()) throw new Error("Meta no encontrada");

        const current = snap.data()?.cantidadActual || 0;
        const newAmount = movimientoTipo === "deposito" ? current + montoNum : current - montoNum;

        if (movimientoTipo === "retiro" && newAmount < 0) {
          throw new Error("No hay suficiente en la meta para retirar esa cantidad.");
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
          nota: movimientoTipo === "deposito" ? "Depósito manual" : "Retiro manual",
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
    Alert.alert("Eliminar meta", `¿Eliminar "${a.nombre}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, `users/${user.uid}/ahorros`, a.id));
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
        onPress={() => setShowNuevo(true)}
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
        <Ionicons name="add" size={28} color="white" />
      </TouchableOpacity>

       <Modal visible={showTransacciones} transparent animationType="fade">
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
                    <Text style={{ color: item.tipo === "deposito"? "#4ade80" : "#f87171", fontWeight: "bold" }}>
                      {item.tipo === "deposito" ? "➕" : "➖"} {fmt(item.monto)}
                    </Text>
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
      </Modal>
      {/* Modal Nuevo (reutilizable para edición básica) */}
      <Modal visible={showNuevo} transparent animationType="fade">
        <View style={styles.modalBack}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalCard}>
            <ThemedText style={{ fontSize: 20, fontWeight: "700", marginBottom: 8 }}>
              {selected ? "Editar meta" : "Nueva meta"}
            </ThemedText>

            <TextInput
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

            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                onPress={() => {
                  // reset form
                  setNombre("");
                  setMeta("");
                  setDescripcion("");
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
      </Modal>

      {/* Modal detalle: depositar / retirar */}
      <Modal visible={showDetalle} transparent animationType="fade">
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
            </View>

            <TextInput
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
                <Text style={{ color: "white", textAlign: "center" }}>{movimientoTipo === "deposito" ? "Depositar" : "Retirar"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// estilos

