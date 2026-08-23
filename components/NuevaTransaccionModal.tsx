import { ThemedText } from '@/components/ThemedText';
import { db } from "@/config/firebase";
import { useThemeColor } from '@/hooks/useThemeColor';
import { Ionicons } from '@expo/vector-icons';
import { addDoc, collection, onSnapshot } from "firebase/firestore";
import { MotiView } from "moti";
import { useEffect, useRef, useState } from "react";
import {
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
import { RFValue } from "react-native-responsive-fontsize";

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
  onSaved?: () => void;
  initialData?: {
    descripcion?: string;
    monto?: number;
    tipo?: "ingreso" | "egreso";
    preestablecidoMainId?: string;
    preestablecidoMainNombre?: string;
    preestablecidoSubId?: string;
    preestablecidoSubNombre?: string;
  } | null;
}

export default function NuevaTransaccionModal({ visible, onClose, userId, onSaved, initialData }: Props) {
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState("");
  const [tipo, setTipo] = useState<"ingreso" | "egreso" | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [presupuestos, setPresupuestos] = useState<any[]>([]);
  const [presupuestoSeleccionado, setPresupuestoSeleccionado] = useState<string | null>(null);
  const [preestablecidosMain, setPreestablecidosMain] = useState<any[]>([]);
  const [preestablecidoMainSeleccionado, setPreestablecidoMainSeleccionado] = useState<string | null>(null);
  const [descripcionSugerida, setDescripcionSugerida] = useState<string[]>([]);
  const [historialTransacciones, setHistorialTransacciones] = useState<any[]>([]);
  const [sugerenciaSeleccionada, setSugerenciaSeleccionada] = useState<string | null>(null);

  const backModalColor = useThemeColor({ light: '', dark: '' }, 'transaccionModal');

  const descripcionRef = useRef<TextInput>(null);
  const montoRef = useRef<TextInput>(null);
  const defaultSuggestions = [
    'Super',
    'Gasolina',
    'Comida',
    'Renta',
    'Salario',
    'Netflix',
    'Mercado',
    'Transporte',
    'Internet',
  ];

  const normalizeText = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const getSuggestionMatch = (value: string) => {
    const cleanValue = normalizeText(value);
    if (!cleanValue) return null;

    return historialTransacciones
      .map((item) => {
        const label = normalizeText(String(item?.descripcion || ''));
        let score = 0;

        if (!label) return { item, score: 0 };
        if (label === cleanValue) score = 100;
        else if (label.includes(cleanValue) || cleanValue.includes(label)) score = 70;
        else if (label.startsWith(cleanValue.slice(0, 4))) score = 40;

        return { item, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || Number(b.item?.monto || 0) - Number(a.item?.monto || 0))[0]?.item || null;
  };

  // 🔹 Escuchar los presupuestos personalizados del usuario
  useEffect(() => {
    if (!userId) return;
    const ref = collection(db, "users", userId, "presupuestosPersonalizados");
    const unsub = onSnapshot(ref, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPresupuestos(arr);
    });
    return () => unsub();
  }, [userId]);

  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        descripcionRef.current?.focus();
      }, 300);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !initialData) return;

    setDescripcion(initialData.descripcion || "");
    setMonto(initialData.monto ? String(initialData.monto) : "");
    setTipo(initialData.tipo || null);
    setPreestablecidoMainSeleccionado(initialData.preestablecidoMainId || null);
    setSugerenciaSeleccionada(null);
  }, [visible, initialData]);

  useEffect(() => {
    if (!userId) return;

    const ref = collection(db, "users", userId, "preestablecidosMain");
    const unsub = onSnapshot(ref, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPreestablecidosMain(arr);
    });

    return () => unsub();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const ref = collection(db, "users", userId, "transacciones");
    const unsub = onSnapshot(ref, (snap) => {
      const records = snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }));
      setHistorialTransacciones(records);

      const counts = new Map<string, number>();

      records.forEach((data) => {
        const rawName = String(data?.descripcion || '').trim();
        if (!rawName) return;

        const normalized = rawName.replace(/\s+/g, ' ');
        counts.set(normalized, (counts.get(normalized) || 0) + 1);
      });

      const userSuggestions = [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name]) => name)
        .slice(0, 8);

      const mergedSuggestions = [...new Set([...userSuggestions, ...defaultSuggestions])].slice(0, 10);
      setDescripcionSugerida(mergedSuggestions);
    });

    return () => unsub();
  }, [userId]);

  const visibleSuggestions = descripcion
    ? descripcionSugerida.filter((item) => item.toLowerCase().includes(descripcion.toLowerCase())).slice(0, 6)
    : descripcionSugerida.slice(0, 6);

  const handleGuardar = async () => {
    if (!descripcion || !monto || !tipo) return;
    setGuardando(true);

    const mainSeleccionado = preestablecidosMain.find((m) => m.id === preestablecidoMainSeleccionado) || null;

    try {
      await addDoc(collection(db, "users", userId, "transacciones"), {
        descripcion,
        monto: parseFloat(monto),
        tipo,
        fecha: new Date(),
        presupuestoCategoria: presupuestos.find(p => p.id === presupuestoSeleccionado)?.categoria || null,
        preestablecidoMainId: mainSeleccionado?.id || initialData?.preestablecidoMainId || null,
        preestablecidoMainNombre: mainSeleccionado?.nombre || initialData?.preestablecidoMainNombre || null,
        preestablecidoSubId: initialData?.preestablecidoSubId || null,
        preestablecidoSubNombre: initialData?.preestablecidoSubNombre || null,
      });

      // Limpiar campos
      setDescripcion("");
      setMonto("");
      setTipo(null);
      setPresupuestoSeleccionado(null);
      setPreestablecidoMainSeleccionado(null);
      onSaved?.();
      onClose();
      ToastAndroid.show("Movimiento registrado", ToastAndroid.SHORT);
    } catch (e) {
      console.error("Error al guardar transacción:", e);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <TouchableWithoutFeedback>
            <MotiView
              from={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'timing', duration: 240 }}
              style={{
                width: '86%',
                backgroundColor: backModalColor,
                borderRadius: 20,
                padding: RFValue(18),
                maxHeight: '90%',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.18,
                shadowRadius: 30,
                elevation: 10,
              }}
            >
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <ThemedText
                      style={{
                        fontSize: RFValue(18),
                        fontWeight: '700',
                      }}
                    >
                      Nueva transacción
                    </ThemedText>
                    <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
                      <Ionicons name="close" size={24} color="#999" />
                    </TouchableOpacity>
                  </View>

              <TextInput
                ref={descripcionRef}
                placeholder="Descripción"
                placeholderTextColor="#999"
                style={styles.input}
                value={descripcion}
                onChangeText={(text) => {
                  setDescripcion(text);

                  if (!text.trim()) {
                    setMonto('');
                    setTipo(null);
                    setPresupuestoSeleccionado(null);
                    setPreestablecidoMainSeleccionado(null);
                    setSugerenciaSeleccionada(null);
                    return;
                  }

                  if (sugerenciaSeleccionada && sugerenciaSeleccionada !== text) {
                    setMonto('');
                    setTipo(null);
                    setPresupuestoSeleccionado(null);
                    setPreestablecidoMainSeleccionado(null);
                    setSugerenciaSeleccionada(null);
                  }
                }}
                autoCapitalize="sentences"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => montoRef.current?.focus()}
              />

              {!sugerenciaSeleccionada && visibleSuggestions.length > 0 && (
                <View style={{ marginBottom: 10 }}>
                  <Text style={{ color: '#ccc', marginBottom: 6, fontWeight: '500' }}>Sugerencias</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
                    {visibleSuggestions.map((item) => (
                      <TouchableOpacity
                        key={item}
                        onPress={() => {
                          const match = getSuggestionMatch(item);
                          setDescripcion(item);
                          setSugerenciaSeleccionada(item);

                          setMonto(match?.monto !== undefined && match?.monto !== null ? String(match.monto) : '');
                          setTipo(match?.tipo || null);

                          const categoryMatch = match?.presupuestoCategoria
                            ? presupuestos.find((p) => p?.categoria === match.presupuestoCategoria) || null
                            : null;

                          setPresupuestoSeleccionado(categoryMatch ? categoryMatch.id : null);
                          setPreestablecidoMainSeleccionado(match?.preestablecidoMainId || null);

                          setTimeout(() => montoRef.current?.focus(), 60);
                        }}
                        style={[
                          styles.presupuestoBtn,
                          { backgroundColor: '#2a2a2a', borderWidth: 1, borderColor: '#3b3b3b' },
                        ]}
                      >
                        <Text style={{ color: 'white' }}>{item}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <TextInput
                ref={montoRef}
                placeholder="Monto"
                placeholderTextColor="#999"
                keyboardType="numeric"
                style={styles.input}
                value={monto}
                onChangeText={setMonto}
                returnKeyType="done"
                onSubmitEditing={handleGuardar}
              />

              {/* Selector de tipo */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
                <TouchableOpacity
                  onPress={() => setTipo("ingreso")}
                  style={[
                    styles.tipoBtn,
                    { backgroundColor: tipo === "ingreso" ? "#3edc81" : "#2a2a2a" },
                  ]}
                >
                  <Text style={{ color: tipo === "ingreso" ? "black" : "white", fontWeight: "600" }}>
                    Ingreso
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setTipo("egreso")}
                  style={[
                    styles.tipoBtn,
                    { backgroundColor: tipo === "egreso" ? "#ff6363" : "#2a2a2a" },
                  ]}
                >
                  <Text style={{ color: tipo === "egreso" ? "black" : "white", fontWeight: "600" }}>
                    Egreso
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 🔹 Selector de presupuesto personalizado */}
              {presupuestos.length > 0 && tipo === "egreso" && (
                <View style={{ marginBottom: 10 }}>
                  <Text style={{ color: "#ccc", marginBottom: 6, fontWeight: "500" }}>
                    Asociar a presupuesto:
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <TouchableOpacity
                      onPress={() => setPresupuestoSeleccionado(null)}
                      style={[
                        styles.presupuestoBtn,
                        { backgroundColor: !presupuestoSeleccionado ? "#6366f1" : "#2a2a2a" },
                      ]}
                    >
                      <Text style={{ color: "white" }}>Ninguno</Text>
                    </TouchableOpacity>

                    {presupuestos.map((p) => (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() =>
                          setPresupuestoSeleccionado(
                            presupuestoSeleccionado === p.id ? null : p.id
                          )
                        }
                        style={[
                          styles.presupuestoBtn,
                          {
                            backgroundColor:
                              presupuestoSeleccionado === p.id ? "#6366f1" : "#2a2a2a",
                          },
                        ]}
                      >
                        <Text style={{ color: "white" }}>{p.categoria}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {preestablecidosMain.length > 0 && (
                <View style={{ marginBottom: 10 }}>
                  <Text style={{ color: "#ccc", marginBottom: 6, fontWeight: "500" }}>
                    Asociar a principal:
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <TouchableOpacity
                      onPress={() => setPreestablecidoMainSeleccionado(null)}
                      style={[
                        styles.presupuestoBtn,
                        { backgroundColor: !preestablecidoMainSeleccionado ? "#6366f1" : "#2a2a2a" },
                      ]}
                    >
                      <Text style={{ color: "white" }}>Ninguno</Text>
                    </TouchableOpacity>

                    {preestablecidosMain.map((main) => (
                      <TouchableOpacity
                        key={main.id}
                        onPress={() => setPreestablecidoMainSeleccionado(preestablecidoMainSeleccionado === main.id ? null : main.id)}
                        style={[
                          styles.presupuestoBtn,
                          {
                            backgroundColor: preestablecidoMainSeleccionado === main.id ? "#6366f1" : "#2a2a2a",
                          },
                        ]}
                      >
                        <Text numberOfLines={1} style={{ color: "white", maxWidth: 120 }}>
                          {(main.icono || "📁") + " " + (main.nombre || "Sin nombre")}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Botón guardar */}
              <TouchableOpacity
                onPress={handleGuardar}
                disabled={guardando}
                style={{
                  marginTop: 10,
                  backgroundColor: guardando ? "#555" : "#5c6bf2",
                  borderRadius: 10,
                  paddingVertical: 12,
                }}
              >
                <Text
                  style={{
                    color: "white",
                    textAlign: "center",
                    fontWeight: "700",
                    fontSize: 16,
                  }}
                >
                  {guardando ? "Guardando..." : "Guardar"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={onClose} style={{ marginTop: 10 }}>
                <Text
                  style={{
                    color: "#999",
                    textAlign: "center",
                    textDecorationLine: "underline",
                  }}
                >
                  Cancelar
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </MotiView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: "#2a2a2a",
    color: "white",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  tipoBtn: {
    flex: 1,
    marginHorizontal: 5,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  presupuestoBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 8,
    justifyContent: "center",
    alignItems: "center",
  },
});