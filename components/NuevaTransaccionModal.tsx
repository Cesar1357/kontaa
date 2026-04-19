import { ThemedText } from '@/components/ThemedText';
import { db } from "@/config/firebase";
import { useThemeColor } from '@/hooks/useThemeColor';
import { addDoc, collection, onSnapshot } from "firebase/firestore";
import { MotiView } from "moti";
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import { RFValue } from "react-native-responsive-fontsize";

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
}

export default function NuevaTransaccionModal({ visible, onClose, userId }: Props) {
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState("");
  const [tipo, setTipo] = useState<"ingreso" | "egreso" | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [presupuestos, setPresupuestos] = useState<any[]>([]);
  const [presupuestoSeleccionado, setPresupuestoSeleccionado] = useState<string | null>(null);

  const backModalColor = useThemeColor({ light: '', dark: '' }, 'transaccionModal');

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

  const handleGuardar = async () => {
    if (!descripcion || !monto || !tipo) return;
    setGuardando(true);

    try {
      await addDoc(collection(db, "users", userId, "transacciones"), {
        descripcion,
        monto: parseFloat(monto),
        tipo,
        fecha: new Date(),
        presupuestoCategoria: presupuestos.find(p => p.id === presupuestoSeleccionado)?.categoria || null,
      });

      // Limpiar campos
      setDescripcion("");
      setMonto("");
      setTipo(null);
      setPresupuestoSeleccionado(null);
      onClose();
      ToastAndroid.show("Movimiento registrado", ToastAndroid.SHORT);
    } catch (e) {
      console.error("Error al guardar transacción:", e);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <MotiView
          from={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "timing", duration: 300 }}
          style={{
            width: "85%",
            backgroundColor: backModalColor,
            borderRadius: 16,
            padding: RFValue(20),
            maxHeight: "90%",
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <ThemedText
                style={{
                  fontSize: RFValue(18),
                  fontWeight: "700",
                  textAlign: "center",
                  marginBottom: 15,
                }}
              >
                Nueva transacción
              </ThemedText>

              <TextInput
                placeholder="Descripción"
                placeholderTextColor="#999"
                style={styles.input}
                value={descripcion}
                onChangeText={setDescripcion}
              />

              <TextInput
                placeholder="Monto"
                placeholderTextColor="#999"
                keyboardType="numeric"
                style={styles.input}
                value={monto}
                onChangeText={setMonto}
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
      </View>
    </Modal>
  );
}

const styles = {
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
  },
};