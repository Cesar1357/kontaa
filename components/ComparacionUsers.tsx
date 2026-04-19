import { Ionicons } from "@expo/vector-icons";
import {
    collection,
    getDocs,
    limit,
    query,
    where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { db } from "../config/firebase";
import { useAuth } from "../hooks/useAuth";

export default function CardComparativaTransacciones() {
  const { user } = useAuth();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cargarComparativa = async () => {
      if (!user) return;

      try {
        const ahora = new Date();
        const hace7dias = new Date();
        hace7dias.setDate(ahora.getDate() - 7);

        // 🔹 1. Obtener hasta 5 usuarios
        const usersSnap = await getDocs(query(collection(db, "users"), limit(5)))

        let totalGlobalIngresos = 0;
        let totalGlobalEgresos = 0;
        let usuariosContados = 0;
        let totalUserIngresos = 0;
        let totalUserEgresos = 0;

        for (const u of usersSnap.docs) {
          const transSnap = await getDocs(
            query(
              collection(db, `users/${u.id}/transacciones`),
              where("fecha", ">=", hace7dias)
            )
          );

          let ingresos = 0;
          let egresos = 0;

          transSnap.forEach((doc) => {
            const data = doc.data();
            if (typeof data.monto === "number" && typeof data.tipo === "string") {
              if (data.tipo === "ingreso") ingresos += data.monto;
              else if (data.tipo === "egreso") egresos += data.monto;
            }
          });

          if (ingresos > 0 || egresos > 0) usuariosContados++;

          if (u.id === user.uid) {
            totalUserIngresos = ingresos;
            totalUserEgresos = egresos;
          } else {
            totalGlobalIngresos += ingresos;
            totalGlobalEgresos += egresos;
          }
        }

        // 🔹 2. Promedios globales (sin incluir al usuario actual)
        const divisor = Math.max(usuariosContados - 1, 1);
        const promedioIng = totalGlobalIngresos / divisor;
        const promedioEgr = totalGlobalEgresos / divisor;

        // 🔹 3. Crear mensaje
        let texto = "Sin datos suficientes aún 🕓";

        if (usuariosContados > 1) {
          const diffIng = promedioIng
            ? ((totalUserIngresos - promedioIng) / promedioIng) * 100
            : 0;
          const diffEgr = promedioEgr
            ? ((totalUserEgresos - promedioEgr) / promedioEgr) * 100
            : 0;

          if (diffIng > 0)
            texto = `Has tenido un ${diffIng.toFixed(1)}% más ingresos que el promedio esta semana 💰`;
          else if (diffIng < 0)
            texto = `Has tenido un ${Math.abs(
              diffIng.toFixed(1)
            )}% menos ingresos que el promedio esta semana 💸`;
          else texto = "Tus ingresos están justo en el promedio 🔄";

          if (totalUserEgresos > 0 && promedioEgr > 0) {
            if (diffEgr > 0)
              texto += `\nHas gastado un ${diffEgr.toFixed(
                1
              )}% más que el promedio 💳`;
            else if (diffEgr < 0)
              texto += `\nHas gastado un ${Math.abs(
                diffEgr.toFixed(1)
              )}% menos que el promedio 💎`;
          }
        }

        setMensaje(texto);
      } catch (e) {
        console.error("Error en comparativa de transacciones:", e);
        setMensaje("No se pudo obtener la comparación 😕");
      } finally {
        setLoading(false);
      }
    };

    cargarComparativa();
  }, [user]);

  if (loading) {
    return (
      <View style={styles.simpleCard}>
        <ActivityIndicator size="small" color="#5c6bf2" style={{ marginRight: 8 }} />
        <Text style={styles.simpleCardText}>Analizando tus transacciones...</Text>
      </View>
    );
  }

  if (!mensaje) return null;

  return (
    <View style={styles.simpleCard}>
      <Ionicons name="trending-up" size={22} color="#5c6bf2" style={{ marginRight: 8 }} />
      <Text style={styles.simpleCardText}>{mensaje}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  simpleCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1c1c1e",
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 10,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  simpleCardText: {
    flex: 1,
    color: "white",
    fontSize: 15,
  },
});
