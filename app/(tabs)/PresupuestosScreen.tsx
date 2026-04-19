import { ThemedText } from '@/components/ThemedText';
import { useAuth } from "@/hooks/useAuth";
import { useThemeColor } from '@/hooks/useThemeColor';
import { LinearGradient } from "expo-linear-gradient";
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { ScrollView, TextInput } from "react-native-gesture-handler";
import Animated, { Layout } from "react-native-reanimated";
import { RFValue } from 'react-native-responsive-fontsize';
import { db } from "../../config/firebase";

export default function PresupuestosScreen() {
  const { user } = useAuth();
  const [presupuestos, setPresupuestos] = useState<any[]>([{ categoria: "Otros" }]);
  const [presupuestoGeneral, setPresupuestoGeneral] = useState<any>({
    dia: 0,
    semana: 0,
    mes: 0,
  });

  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [nuevaCategoria, setNuevaCategoria] = useState("");
  const [nuevoLimite, setNuevoLimite] = useState("");
  const [seccionActiva, setSeccionActiva] = useState<"general" | "personalizados" | "recurrentes">("personalizados");
  const [transacciones, setTransacciones] = useState<any[]>([]);

  const [modalEditar, setModalEditar] = useState(false);
  const [presupuestoEditar, setPresupuestoEditar] = useState<any | null>(null);
  const [nuevoValorEditar, setNuevoValorEditar] = useState("");
  const [nuevoValorEditarFecha, setNuevoValorEditarFecha] = useState("");

  

  const [tipoRecurrenteActivo, setTipoRecurrenteActivo] = useState<"gastos" | "ingresos">("gastos");

  const [gastosRecurrentes, setGastosRecurrentes] = useState<any[]>([]);
  const [ingresosRecurrentes, setIngresosRecurrentes] = useState<any[]>([]);

  const [mostrarNuevoRecurrente, setMostrarNuevoRecurrente] = useState(false);
  const [nuevoNombreRecurrente, setNuevoNombreRecurrente] = useState("");
  const [nuevaCategoriaRecurrente, setNuevaCategoriaRecurrente] = useState("");
  const [nuevoMontoRecurrente, setNuevoMontoRecurrente] = useState("");
  const [nuevaFrecuencia, setNuevaFrecuencia] = useState("Mensual");
  const [nuevoDiaPago, setNuevoDiaPago] = useState("");

  // 📅 Fechas del mes actual
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const backgroundColor = useThemeColor({ light: '', dark: '' }, 'background');
  const backgroundColor2 = useThemeColor({ light: '', dark: '' }, 'background2');
  const graficaFondoColor = useThemeColor({ light: '', dark: '' }, 'graficaHistorial');
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const progressBg = useThemeColor({ light: '', dark: '' }, 'progressBg');

  // 📡 Presupuestos personalizados
  useEffect(() => {
    if (!user) return;
    try{
      const ref = collection(db, `users/${user.uid}/presupuestosPersonalizados`);
      const unsub = onSnapshot(ref, (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPresupuestos(data.concat([{ categoria: "Otros" }]));
      });
      return () => unsub();
    } catch(e){
      console.error("Error en useEffect de presupuestos personalizados:", e);
    }
  }, [user]);

  // 📡 Presupuestos generales
  useEffect(() => {
    if (!user) return;
    try{
      const ref = doc(db, `users/${user.uid}`);
      const unsub = onSnapshot(ref, (snap) => {
        if (snap.exists() && snap.data().presupuestos) {
          setPresupuestoGeneral(snap.data().presupuestos);
          
        }
      });
      return () => unsub();
    } catch(e){
      console.error("Error en useEffect de presupuestos generales:", e);
    }
  }, [user]);

  // 📡 Transacciones del mes actual
  useEffect(() => {
    if (!user) return;
    try{
      const ref = collection(db, `users/${user.uid}/transacciones`);
      const q = query(
        ref,
        where("fecha", ">=", Timestamp.fromDate(startOfMonth)),
        where("fecha", "<=", Timestamp.fromDate(endOfMonth))
      );

      const unsub = onSnapshot(q, (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setTransacciones(data);
      });

      return () => unsub();
    } catch(e){
      console.error("Error en useEffect de transacciones:", e);
    }
  }, [user]);

  useEffect(() => {
  if (!user) return;

  // Referencias a Firestore
  const refGastos = collection(db, `users/${user.uid}/gastosRecurrentes`);
  const refIngresos = collection(db, `users/${user.uid}/ingresosRecurrentes`);

  // Escuchar gastos recurrentes
  const unsubGastos = onSnapshot(refGastos, (snap) => {
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setGastosRecurrentes(data);
  });

  // Escuchar ingresos recurrentes
  const unsubIngresos = onSnapshot(refIngresos, (snap) => {
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setIngresosRecurrentes(data);
  });

  // Limpiar ambos listeners
  return () => {
    unsubGastos();
    unsubIngresos();
  };
}, [user]);

// 🧮 Gasto de cada presupuesto personalizado (incluyendo los recurrentes activos)
  const presupuestosConGasto = presupuestos.map((p) => {
    console.log("Calculando gasto para presupuesto:", p);
    if(p.categoria === "Otros"){
      // 🧮 Sumar límites de todos los demás presupuestos personalizados
  const sumaOtrosLimites = presupuestos
    .filter((x) => x.categoria !== "Otros" && x.activo !== false)
    .reduce((acc, x) => acc + (x.limite || 0), 0);

  // 🧮 Obtener el presupuesto mensual general
  const presupuestoMensual =
    presupuestoGeneral?.mes || presupuestoGeneral?.mensual || 0;

  // 🧮 Calcular el límite disponible restante
  const limiteRestante = Math.max(presupuestoMensual - sumaOtrosLimites, 0);

  // 📋 Categorías existentes (de presupuestos activos)
  const categoriasExistentes = presupuestos.map((x) => x.categoria);

  // 🧾 Transacciones sin categoría o cuya categoría ya no existe
  const transaccionesRelacionadas = transacciones.filter((t) => {
    if (t.tipo !== "egreso") return false; // solo egresos
    const categoriaInexistente =
      t.presupuestoCategoria &&
      !categoriasExistentes.includes(t.presupuestoCategoria);
    return (
      !t.presupuestoCategoria || categoriaInexistente
    );
  });

  const gastoTransacciones = transaccionesRelacionadas.reduce(
    (acc, t) => acc + (t.monto || 0),
    0
  );

  // 🌀 Gastos recurrentes sin categoría o cuya categoría ya no existe
  const recurrentesRelacionados = gastosRecurrentes.filter((g) => {
    const categoriaInexistente =
      g.categoria && !categoriasExistentes.includes(g.categoria);
    return (
      g.activo &&
      (!g.categoria || categoriaInexistente || g.categoria === "General")
    );
  });

  const gastoRecurrentes = recurrentesRelacionados.reduce(
    (acc, g) => acc + (g.monto || 0),
    0
  );

  // 💰 Total gastado en “Otros”
  const gastado = gastoTransacciones + gastoRecurrentes;

  return { ...p, gastado, limite: limiteRestante };
    }else{
      // Transacciones normales asociadas a la categoría del presupuesto
      const relacionadas = transacciones.filter(
        (t) => t.tipo === "egreso" && t.presupuestoCategoria === p.categoria
      );

      // Gasto total de esas transacciones
      const gastoTransacciones = relacionadas.reduce((acc, t) => acc + (t.monto || 0), 0);

      // 🌀 Gastos recurrentes activos que pertenecen a la misma categoría
      const recurrentesRelacionados = gastosRecurrentes.filter(
        (g) => g.activo && g.categoria === p.categoria
      );

      // Suma de los montos de los recurrentes
      const gastoRecurrentes = recurrentesRelacionados.reduce(
        (acc, g) => acc + (g.monto || 0),
        0
      );

      // Gasto total del presupuesto = transacciones + recurrentes
      const gastado = gastoTransacciones + gastoRecurrentes;

      return { ...p, gastado };
  }
  });
  

// Totales globales
  const totalGastado = presupuestosConGasto.reduce((acc, p) => acc + p.gastado, 0);
  const presupuestoMensual = presupuestoGeneral?.mes || presupuestoGeneral?.mensual || 0;
  const totalLimite = presupuestosConGasto
  .filter((p) => p.categoria !== "Otros")
  .reduce((acc, p) => acc + (p.limite || 0), 0);
  const porcentajeUsado = ((totalLimite / presupuestoMensual) * 100 || 0).toFixed(1);

  // ➕ Agregar presupuesto personalizado
  const agregarPresupuesto = async () => {
    if (!nuevaCategoria || !nuevoLimite) return;
    const limite = parseFloat(nuevoLimite);
    if (isNaN(limite) || limite <= 0) {
      Alert.alert("Error", "Ingresa un límite válido.");
      return;
    }
    try {
      const ref = doc(collection(db, `users/${user.uid}/presupuestosPersonalizados`));
      await setDoc(ref, {
        categoria: nuevaCategoria,
        limite,
        creado: new Date(),
      });
      setNuevaCategoria("");
      setNuevoLimite("");
      setMostrarNuevo(false);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "No se pudo agregar el presupuesto.");
    }
  };

   const agregarRecurrente = async () => {
    if(tipoRecurrenteActivo === "gastos"){
      if (!nuevoNombreRecurrente || !nuevoMontoRecurrente) return;
      const monto = parseFloat(nuevoMontoRecurrente);
      const diaPagoNum = parseInt(nuevoDiaPago);
      if (diaPagoNum && (diaPagoNum < 1 || diaPagoNum > 28)) {
        Alert.alert("Error", "El día de pago debe estar entre 1 y 28.");
        return;
      }
      if (isNaN(monto) || monto <= 0) {
        Alert.alert("Error", "Monto inválido.");
        return;
      }
      
      const ref = doc(collection(db, `users/${user.uid}/gastosRecurrentes`));
      await setDoc(ref, {
        nombre: nuevoNombreRecurrente,
        categoria: nuevaCategoriaRecurrente || "General",
        monto,
        frecuencia: nuevaFrecuencia,
        diaPago: diaPagoNum || 1,
        creado: new Date(),
        lastUpdate: new Date(),
        activo:true,
      });
      setNuevoNombreRecurrente("");
      setNuevaCategoriaRecurrente("");
      setNuevoMontoRecurrente("");
      setNuevaFrecuencia("Mensual");
      setNuevoDiaPago("");
      setMostrarNuevoRecurrente(false);
    }else{
      agregarRecurrenteIngreso();
    }
  };

  const agregarRecurrenteIngreso = async () => {
    console.log("agregando ingreso recurrente");
  if (!nuevoNombreRecurrente || !nuevoMontoRecurrente) return;
    const monto = parseFloat(nuevoMontoRecurrente);
    const diaPagoNum = parseInt(nuevoDiaPago);
    if (diaPagoNum && (diaPagoNum < 1 || diaPagoNum > 28)) {
      Alert.alert("Error", "El día de pago debe estar entre 1 y 28.");
      return;
    }
    if (isNaN(monto) || monto <= 0) {
      Alert.alert("Error", "Monto inválido.");
      return;
    }


  const ref = doc(collection(db, `users/${user.uid}/ingresosRecurrentes`));
    await setDoc(ref, {
      nombre: nuevoNombreRecurrente,
      monto,
      frecuencia: nuevaFrecuencia,
      diaPago: diaPagoNum || 1,
      creado: new Date(),
      lastUpdate: new Date(),
      activo:true,
    });
    setNuevoNombreRecurrente("");
    setNuevaCategoriaRecurrente("");
    setNuevoMontoRecurrente("");
    setNuevaFrecuencia("Mensual");
    setNuevoDiaPago("");
    setMostrarNuevoRecurrente(false);
};

  // ✏️ Editar presupuesto o recurrente
  const abrirModalEditar = (presupuesto: any, tipo: "general" | "personalizado" | "recurrente") => {
    setPresupuestoEditar({ ...presupuesto, tipo });
    setNuevoValorEditar(String(presupuesto.limite || presupuesto.valor || presupuesto.monto || ""));
    setModalEditar(true);
  };

 const guardarEdicion = async () => {
  const valor = parseFloat(nuevoValorEditar);
  const diaPago = nuevoValorEditarFecha; // aquí es un número de 1–28

  if (isNaN(valor) || valor <= 0) {
    Alert.alert("Error", "Ingresa un valor válido.");
    return;
  }

  try {
    const dataActualizacion: any = {};

    // --- PRESUPUESTOS PERSONALIZADOS ---
    if (presupuestoEditar.tipo === "personalizado") {
      dataActualizacion.limite = valor;
      await updateDoc(
        doc(db, `users/${user.uid}/presupuestosPersonalizados`, presupuestoEditar.id),
        dataActualizacion
      );
    }

    // --- GASTOS RECURRENTES ---
    else if (presupuestoEditar.tipo === "recurrente") {
      if(tipoRecurrenteActivo === "gastos"){
        dataActualizacion.monto = valor;
        // ✅ Solo actualiza el día si el usuario lo modificó
        if (diaPago) dataActualizacion.diaPago = parseInt(diaPago);

        await updateDoc(
          doc(db, `users/${user.uid}/gastosRecurrentes`, presupuestoEditar.id),
          dataActualizacion
        );
      }
      // --- INGRESOS RECURRENTES ---
      else if (tipoRecurrenteActivo === "ingresos") {
        dataActualizacion.monto = valor;
        if (diaPago) dataActualizacion.diaPago = parseInt(diaPago);

        await updateDoc(
          doc(db, `users/${user.uid}/ingresosRecurrentes`, presupuestoEditar.id),
          dataActualizacion
        );
      }
      setNuevoValorEditarFecha("");
    }

    // --- PRESUPUESTOS GENERALES ---
    else {
      await updateDoc(doc(db, `users/${user.uid}`), {
        [`presupuestos.${presupuestoEditar.categoria}`]: valor,
      });
    }

    setModalEditar(false);
    setPresupuestoEditar(null);
  } catch (e) {
    console.error(e);
    Alert.alert("Error", "No se pudo actualizar el valor.");
  }
};

  // ❌ Eliminar recurrente (gasto o ingreso)
  const eliminarRecurrente = async (
    id: string,
    tipo: "gastos" | "ingresos"
  ) => {
    const mensaje =
      tipo === "gastos"
        ? "¿Deseas eliminar este gasto recurrente?"
        : "¿Deseas eliminar este ingreso recurrente?";

    Alert.alert("Eliminar", mensaje, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          const docRef =
            tipo === "gastos"
              ? doc(db, "users", user.uid, "gastosRecurrentes", id)
              : doc(db, "users", user.uid, "ingresosRecurrentes", id);
          await deleteDoc(docRef);
        },
      },
    ]);
  };

  const toggleRecurrenteActivo = async (
    id: string,
    nuevoEstado: boolean,
    tipo: "gastos" | "ingresos"
  ) => {
    const docRef =
      tipo === "gastos"
        ? doc(db, "users", user.uid, "gastosRecurrentes", id)
        : doc(db, "users", user.uid, "ingresosRecurrentes", id);

    await updateDoc(docRef, {
      activo: nuevoEstado,
      lastUpdate: new Date(),
    });
  };


  // ❌ Eliminar presupuesto personalizado
  const eliminarPresupuesto = async (id: string) => {
    Alert.alert("Eliminar", "¿Deseas eliminar este presupuesto?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, `users/${user.uid}/presupuestosPersonalizados`, id));
          } catch (e) {
            console.error(e);
            Alert.alert("Error", "No se pudo eliminar.");
          }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: backgroundColor2,
        padding: 16,
        paddingTop: 80,
      }}
    >
      
      {/* ENCABEZADO */}
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
        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "600" }}>Presupuestos</Text>
        <Text
          style={{
            color: "#fff",
            fontSize: 32,
            fontWeight: "700",
            marginTop: 6,
          }}
        >
          ${totalGastado.toFixed(2)} / ${presupuestoGeneral.mes.toFixed(2)}
        </Text>
        <Text style={{ color: "#fff", opacity: 0.8, marginTop: 4 }}>
            Presupuesto ocupado:{" "}
            {porcentajeUsado}%
          </Text>
          <Text style={{ color: "#fff", opacity: 0.8, marginTop: 4 }}>
            Presupuesto utilizado:{" "}
            {((totalGastado / presupuestoGeneral.mes) * 100 || 0).toFixed(1)}%
          </Text>
      </LinearGradient>

      {/* BOTONES DE SECCIÓN */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: cardsMain,
          borderRadius: 12,
          overflow: "hidden",
          marginBottom: 20,
        }}
      >
        {["general", "personalizados","recurrentes"].map((tipo) => (
          <TouchableOpacity
            key={tipo}
            onPress={() => setSeccionActiva(tipo as any)}
            style={{
              flex: 1,
              backgroundColor: seccionActiva === tipo ? "#6366f1" : "transparent",
              paddingVertical: 10,
              alignItems: "center",
            }}
          >
            <ThemedText style={{ fontWeight: "600" }}>
              {tipo === "general" ? "Generales" : tipo === "personalizados" ? "Personalizados" : "Recurrentes"}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      {/* PRESUPUESTOS GENERALES */}
      {seccionActiva === "general" && (
        <Animated.View layout={Layout.springify()}>
          {Object.entries(presupuestoGeneral).map(([categoria, valor]) => (
            <View
              key={categoria}
              style={{
                backgroundColor: graficaFondoColor,
                borderRadius: 16,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: textColor, fontSize: 16, fontWeight: "600" }}>
                  {categoria.charAt(0).toUpperCase() + categoria.slice(1)}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: "#aaa" }}>${valor.toFixed(2)}</Text>
                  <TouchableOpacity
                    onPress={() => abrirModalEditar({ categoria, valor }, "general")}
                  >
                    <Text style={{ color: "#5c6bf2", fontWeight: "600" }}>Editar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </Animated.View>
      )}

      {/* PRESUPUESTOS PERSONALIZADOS */}
      {seccionActiva === "personalizados" && (
        <>
          <TouchableOpacity
            onPress={() => setMostrarNuevo(!mostrarNuevo)}
            style={{
              backgroundColor: "#6366f1",
              borderRadius: 20,
              paddingVertical: 12,
              marginBottom: 16,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>
              {mostrarNuevo ? "Cancelar" : "Nuevo presupuesto"}
            </Text>
          </TouchableOpacity>

          {mostrarNuevo && (
            <Animated.View
              layout={Layout.springify()}
              style={{
                backgroundColor: graficaFondoColor,
                borderRadius: 16,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <TextInput
                placeholder="Categoría"
                placeholderTextColor="#888"
                value={nuevaCategoria}
                onChangeText={setNuevaCategoria}
                style={{
                  color: "#fff",
                  borderBottomColor: "#333",
                  borderBottomWidth: 1,
                  marginBottom: 12,
                  paddingVertical: 4,
                }}
              />
              <TextInput
                placeholder="Límite (MXN)"
                placeholderTextColor="#888"
                keyboardType="numeric"
                value={nuevoLimite}
                onChangeText={setNuevoLimite}
                style={{
                  color: "#fff",
                  borderBottomColor: "#333",
                  borderBottomWidth: 1,
                  marginBottom: 16,
                  paddingVertical: 4,
                }}
              />
              <TouchableOpacity
                onPress={agregarPresupuesto}
                style={{
                  backgroundColor: "#6366f1",
                  paddingVertical: 10,
                  borderRadius: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>Guardar</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {presupuestosConGasto.map((p) => {
            const porcentaje = Math.min((p.gastado / p.limite) * 100, 100);
            const color =
              porcentaje < 70
                ? "#4ade80"
                : porcentaje < 90
                ? "#facc15"
                : "#f87171";

            return (
              <View
                key={p.id}
                style={{
                  backgroundColor: graficaFondoColor,
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 12,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <ThemedText style={{ fontSize: 16, fontWeight: "600" }}>
                    {p.categoria}
                  </ThemedText>
                  <ThemedText style={{  }}>
                    ${p.gastado.toFixed(2)} / ${p.limite.toFixed(2)}
                  </ThemedText>
                </View>
                <View
                  style={{
                    height: 8,
                    backgroundColor: progressBg,
                    borderRadius: 10,
                    overflow: "hidden",
                    marginBottom: 10,
                  }}
                >
                  <View
                    style={{
                      height: "100%",
                      width: `${porcentaje}%`,
                      backgroundColor: color,
                      borderRadius: 10,
                    }}
                  />
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "flex-end",
                    gap: 16,
                  }}
                >
                  {p.categoria !== "Otros" && (
                    <>
                      <TouchableOpacity onPress={() => abrirModalEditar(p, "personalizado")}>
                        <Text style={{ color: "#5c6bf2", fontWeight: "600" }}>Editar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => eliminarPresupuesto(p.id)}>
                        <Text style={{ color: "#f87171", fontWeight: "600" }}>Eliminar</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            );
          })}
          <View style={{ height: 100 }} />
        </>
      )}

      {/* PRESUPUESTOS RECURRENTES */}
      {seccionActiva === "recurrentes" && (
      <>
        {/* Sub-tabs dentro de Recurrentes */}
        <View
          style={{
            flexDirection: "row",
            backgroundColor: cardsMain,
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 20,
          }}
        >
          {["gastos", "ingresos"].map((tipo) => (
            <TouchableOpacity
              key={tipo}
              onPress={() => setTipoRecurrenteActivo(tipo as any)}
              style={{
                flex: 1,
                backgroundColor: tipoRecurrenteActivo === tipo ? "#6366f1" : "transparent",
                paddingVertical: 10,
                alignItems: "center",
              }}
            >
              <ThemedText style={{ fontWeight: "600" }}>
                {tipo === "gastos" ? "Gastos" : "Ingresos"}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        <ThemedText
          style={{
            fontSize: RFValue(18),
            fontWeight: "700",
            marginBottom: 10,
          }}
        >
          {tipoRecurrenteActivo === "gastos"
            ? "Gastos recurrentes"
            : "Ingresos recurrentes"}
        </ThemedText>

        {/* Botón nuevo recurrente */}
        <TouchableOpacity
          onPress={() => setMostrarNuevoRecurrente(!mostrarNuevoRecurrente)}
          style={{
            backgroundColor: "#6366f1",
            borderRadius: 20,
            paddingVertical: 12,
            marginBottom: 16,
            marginTop: 10,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>
            {mostrarNuevoRecurrente
              ? "Cancelar"
              : tipoRecurrenteActivo === "gastos"
              ? "Nuevo gasto"
              : "Nuevo ingreso"}
          </Text>
        </TouchableOpacity>

        {/* Formulario de nuevo recurrente */}
        {mostrarNuevoRecurrente && (
          <Animated.View
            layout={Layout.springify()}
            style={{
              backgroundColor: graficaFondoColor,
              borderRadius: 16,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <TextInput
              placeholder={`Nombre (ej. ${tipoRecurrenteActivo === "gastos" ? "Luz, Internet" : "Sueldo, Intereses"})`}
              placeholderTextColor="#888"
              value={nuevoNombreRecurrente}
              onChangeText={setNuevoNombreRecurrente}
              style={{
                color: textColor,
                borderBottomColor: "#333",
                borderBottomWidth: 1,
                marginBottom: 12,
                paddingVertical: 4,
              }}
            />
              {presupuestos.length && tipoRecurrenteActivo === "gastos" && (
              <View style={{ marginBottom: 10 }}>
                <Text style={{ color: textColor, marginBottom: 6, fontWeight: "500" }}>
                  Asociar a presupuesto:
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <TouchableOpacity
                    onPress={() => setNuevaCategoriaRecurrente("")}
                    style={[
                      styles.presupuestoBtn,
                      { backgroundColor: !nuevaCategoriaRecurrente ? "#6366f1" : "#2a2a2a" },
                    ]}
                  >
                    <Text style={{ color: "white" }}>Ninguno</Text>
                  </TouchableOpacity>

                  {presupuestos.map((p) => (
                    p.categoria !== "Otros" && (
                      <TouchableOpacity
                        key={p.categoria}
                        onPress={() =>
                          setNuevaCategoriaRecurrente(
                            nuevaCategoriaRecurrente === p.categoria ? "" : p.categoria
                          )
                        }
                        style={[
                          styles.presupuestoBtn,
                          {
                            backgroundColor:
                              nuevaCategoriaRecurrente === p.categoria ? "#6366f1" : "#2a2a2a",
                          },
                        ]}
                      >
                        <Text style={{ color: "white" }}>{p.categoria}</Text>
                      </TouchableOpacity>
                    )
                  ))}
                </ScrollView>
              </View>
            )}
            <TextInput
              placeholder="Monto (MXN)"
              placeholderTextColor="#888"
              keyboardType="numeric"
              value={nuevoMontoRecurrente}
              onChangeText={setNuevoMontoRecurrente}
              style={{
                color: textColor,
                borderBottomColor: "#333",
                borderBottomWidth: 1,
                marginBottom: 12,
                paddingVertical: 4,
              }}
            />

            <TextInput
              placeholder="Día del pago (1-28)"
              placeholderTextColor="#888"
              keyboardType="numeric"
              value={nuevoDiaPago}
              onChangeText={setNuevoDiaPago}
              style={{
                color: textColor,
                borderBottomColor: "#333",
                borderBottomWidth: 1,
                marginBottom: 16,
                paddingVertical: 4,
              }}
            />

            <TouchableOpacity
              onPress={agregarRecurrente}
              style={{
                backgroundColor: "#6366f1",
                paddingVertical: 10,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "600" }}>Guardar</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Listado */}
        {(tipoRecurrenteActivo === "gastos"
          ? gastosRecurrentes
          : ingresosRecurrentes
        ).length === 0 ? (
          <Text style={{ color: "#999", textAlign: "center", marginTop: 10 }}>
            No hay {tipoRecurrenteActivo} recurrentes aún.
          </Text>
        ) : (
          (tipoRecurrenteActivo === "gastos"
            ? gastosRecurrentes
            : ingresosRecurrentes
          ).map((item) => (
            <View
              key={item.id}
              style={{
                backgroundColor: "#2a2a2a",
                borderRadius: 12,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "white", fontWeight: "600" }}>
                    {item.nombre}
                  </Text>
                  <Text style={{ color: "#aaa", fontSize: 13 }}>
                    {tipoRecurrenteActivo === "gastos"? item.categoria : null} • ${item.monto.toFixed(2)}
                  </Text>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => toggleRecurrenteActivo(item.id, !item.activo, tipoRecurrenteActivo)}
                    style={{
                      backgroundColor: item.activo ? "#3edc81" : "#555",
                      borderRadius: 8,
                      paddingVertical: 4,
                      paddingHorizontal: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: item.activo ? "black" : "white",
                        fontWeight: "600",
                      }}
                    >
                      {item.activo ? "Activo" : "Inactivo"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => abrirModalEditar(item, "recurrente")}
                    style={{
                      backgroundColor: "#5c6bf2",
                      borderRadius: 8,
                      paddingVertical: 4,
                      paddingHorizontal: 10,
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "600" }}>Editar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => eliminarRecurrente(item.id, tipoRecurrenteActivo)}
                    style={{
                      backgroundColor: "#ff6363",
                      borderRadius: 8,
                      paddingVertical: 4,
                      paddingHorizontal: 10,
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "600" }}>Eliminar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 200 }} />
      </>
    )}
      

      {/* MODAL EDITAR */}
      <Modal visible={modalEditar} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: "85%",
              backgroundColor: "#1c1c1c",
              borderRadius: 16,
              padding: 20,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "600", marginBottom: 12 }}>
              Editar {presupuestoEditar?.tipo === "recurrente"? presupuestoEditar?.nombre: presupuestoEditar?.categoria}
            </Text>
            <TextInput
              placeholder="Nuevo valor"
              placeholderTextColor="#888"
              keyboardType="numeric"
              value={nuevoValorEditar}
              onChangeText={setNuevoValorEditar}
              style={{
                color: "#fff",
                borderBottomColor: "#333",
                borderBottomWidth: 1,
                marginBottom: 16,
                paddingVertical: 4,
              }}
            />
            {presupuestoEditar?.tipo === "recurrente" && (
              <TextInput
                placeholder="Nueva dia (1-28)"
                placeholderTextColor="#888"
                keyboardType="numeric"
                value={nuevoValorEditarFecha}
                onChangeText={setNuevoValorEditarFecha}
                style={{
                  color: "#fff",
                  borderBottomColor: "#333",
                  borderBottomWidth: 1,
                  marginBottom: 16,
                  paddingVertical: 4,
                }}
              />
            )}
            <TouchableOpacity
              onPress={guardarEdicion}
              style={{
                backgroundColor: "#5c6bf2",
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "600" }}>Guardar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalEditar(false)}>
              <Text style={{ color: "#aaa", textAlign: "center" }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
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