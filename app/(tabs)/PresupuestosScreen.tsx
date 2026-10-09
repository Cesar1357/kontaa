import { ThemedText } from '@/components/ThemedText';
import { useAuth } from "@/hooks/useAuth";
import { useThemeColor } from '@/hooks/useThemeColor';
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from "expo-linear-gradient";

import { useLocalSearchParams } from 'expo-router';
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
import React, { useEffect, useMemo, useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    NativeModules,
    Platform,
    Text,
    ToastAndroid,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import { ScrollView, TextInput } from "react-native-gesture-handler";
import Animated, { Layout } from "react-native-reanimated";
import { RFValue } from 'react-native-responsive-fontsize';
import { db } from "../../config/firebase";

export default function PresupuestosScreen() {
  const { user } = useAuth();
  const currentUserId = (user as { uid?: string } | null)?.uid ?? null;
  const params = useLocalSearchParams<{ section?: string }>();
  const [presupuestos, setPresupuestos] = useState<any[]>([{ categoria: "Otros" }, { categoria: "Ahorro", temporal: true }]);
  const [presupuestoGeneral, setPresupuestoGeneral] = useState<any>({
    dia: 0,
    semana: 0,
    mes: 0,
  });

  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [nuevaCategoria, setNuevaCategoria] = useState("");
  const [nuevoLimite, setNuevoLimite] = useState("");
  const [seccionActiva, setSeccionActiva] = useState<"general" | "personalizados" | "preestablecidos" | "recurrentes">("personalizados");
  const [transacciones, setTransacciones] = useState<any[]>([]);
  const [groupUsageTransactions, setGroupUsageTransactions] = useState<any[]>([]);

  const [modalEditar, setModalEditar] = useState(false);
  const [presupuestoEditar, setPresupuestoEditar] = useState<any | null>(null);
  const [nuevoValorEditar, setNuevoValorEditar] = useState("");
  const [nuevoValorEditarFecha, setNuevoValorEditarFecha] = useState("");

  

  const [tipoRecurrenteActivo, setTipoRecurrenteActivo] = useState<"gastos" | "ingresos">("gastos");

  const [preestablecidosMain, setPreestablecidosMain] = useState<any[]>([]);
  const [preestablecidosSubs, setPreestablecidosSubs] = useState<any[]>([]);
  const [mostrarNuevoPreestablecido, setMostrarNuevoPreestablecido] = useState(false);
  const [nuevoMainNombre, setNuevoMainNombre] = useState("");
  const [nuevoMainIcono, setNuevoMainIcono] = useState("");
  const [nuevoMainImagen, setNuevoMainImagen] = useState("");
  const [mainExpandidoId, setMainExpandidoId] = useState<string | null>(null);
  const [mainConNuevoSubId, setMainConNuevoSubId] = useState<string | null>(null);
  const [editandoMainId, setEditandoMainId] = useState<string | null>(null);
  const [editandoSubId, setEditandoSubId] = useState<string | null>(null);
  const [editarMainNombre, setEditarMainNombre] = useState("");
  const [editarMainIcono, setEditarMainIcono] = useState("");
  const [editarSubNombre, setEditarSubNombre] = useState("");
  const [editarSubTipo, setEditarSubTipo] = useState<"ingreso" | "egreso">("ingreso");
  const [editarSubMonto, setEditarSubMonto] = useState("");
  const [editarSubIcono, setEditarSubIcono] = useState("");
  const [editarSubRapido, setEditarSubRapido] = useState(true);
  const [editarSubPresupuestoCategoria, setEditarSubPresupuestoCategoria] = useState("");
  const [nuevoSubNombre, setNuevoSubNombre] = useState("");
  const [nuevoSubTipo, setNuevoSubTipo] = useState<"ingreso" | "egreso">("ingreso");
  const [nuevoSubMonto, setNuevoSubMonto] = useState("");
  const [nuevoSubIcono, setNuevoSubIcono] = useState("");
  const [nuevoSubRapido, setNuevoSubRapido] = useState(true);
  const [nuevoSubPresupuestoCategoria, setNuevoSubPresupuestoCategoria] = useState("");
  const [showAddQuickWidgetPrompt, setShowAddQuickWidgetPrompt] = useState(false);
  const [quickWidgetPromptAlreadyAnswered, setQuickWidgetPromptAlreadyAnswered] = useState(false);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const initialSectionHandledRef = React.useRef(false);

  const FREE_LIMIT = 2;

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
  const backModalColor = useThemeColor({ light: '', dark: '' }, 'transaccionModal');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');
  const primaryDarkColor = useThemeColor({ light: '', dark: '' }, 'primaryDark');
  const headerColors: [string, string] = [primaryColor, primaryDarkColor || primaryColor];

  // 📡 Presupuestos personalizados
  useEffect(() => {
    if (!currentUserId) return;
    try{
      const ref = collection(db, `users/${currentUserId}/presupuestosPersonalizados`);
      const unsub = onSnapshot(ref, (snap) => {
        const data: any[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const categories = new Set(data.map((item) => item.categoria));
        setPresupuestos([
          ...data,
          ...(categories.has('Otros') ? [] : [{ categoria: 'Otros' }]),
          ...(categories.has('Ahorro') ? [] : [{ categoria: 'Ahorro', temporal: true }]),
        ]);
      });
      return () => unsub();
    } catch(e){
      console.error("Error en useEffect de presupuestos personalizados:", e);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      setGroupUsageTransactions([]);
      return;
    }

    const ref = collection(db, `users/${currentUserId}/transacciones`);
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      setGroupUsageTransactions(snapshot.docs
        .map((transactionDoc) => ({ id: transactionDoc.id, ...(transactionDoc.data() as any) }))
        .filter((transaction) => transaction.grupoId));
    });

    return () => unsubscribe();
  }, [currentUserId]);

  // 📡 Presupuestos generales
  useEffect(() => {
    if (!currentUserId) return;
    try{
      const ref = doc(db, `users/${currentUserId}`);
      const unsub = onSnapshot(ref, (snap) => {
        const data = snap.data();
        if (snap.exists() && data?.presupuestos) {
          setPresupuestoGeneral(data.presupuestos);
        }
        setSubscriptionActive(Boolean(data?.supportSubscription?.active));
      });
      return () => unsub();
    } catch(e){
      console.error("Error en useEffect de presupuestos generales:", e);
    }
  }, [currentUserId]);

  // 📡 Transacciones del mes actual
  useEffect(() => {
    if (!currentUserId) return;
    try{
      const ref = collection(db, `users/${currentUserId}/transacciones`);
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
  }, [currentUserId]);

  useEffect(() => {
  if (!currentUserId) return;

  // Referencias a Firestore
  const refGastos = collection(db, `users/${currentUserId}/gastosRecurrentes`);
  const refIngresos = collection(db, `users/${currentUserId}/ingresosRecurrentes`);

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
}, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;

    const refMain = collection(db, `users/${currentUserId}/preestablecidosMain`);
    const refSubs = collection(db, `users/${currentUserId}/preestablecidosSubs`);

    const unsubMain = onSnapshot(refMain, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPreestablecidosMain(data);
    });

    const unsubSubs = onSnapshot(refSubs, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPreestablecidosSubs(data);
    });

    return () => {
      unsubMain();
      unsubSubs();
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      setQuickWidgetPromptAlreadyAnswered(false);
      setShowAddQuickWidgetPrompt(false);
      return;
    }

    const loadQuickWidgetPromptChoice = async () => {
      try {
        const key = `konta.widget.quickActionsPrompt.choice.${currentUserId}`;
        const savedChoice = await AsyncStorage.getItem(key);
        setQuickWidgetPromptAlreadyAnswered(savedChoice !== null);
      } catch (error) {
        console.log('No se pudo cargar la preferencia del widget de accesos rapidos:', error);
      }
    };

    loadQuickWidgetPromptChoice();
  }, [currentUserId]);

  useEffect(() => {
    if (initialSectionHandledRef.current) return;
    if (params.section !== 'preestablecidos') return;

    initialSectionHandledRef.current = true;
    setSeccionActiva('preestablecidos');
  }, [params.section]);

  const orderedGroups = useMemo(() => {
    const lastUsedByGroup = new Map<string, number>();
    groupUsageTransactions.forEach((transaction) => {
      const timestamp = transaction.fecha?.toDate?.()?.getTime?.() || (transaction.fecha ? new Date(transaction.fecha).getTime() : 0);
      const current = lastUsedByGroup.get(transaction.grupoId) || 0;
      if (timestamp > current) lastUsedByGroup.set(transaction.grupoId, timestamp);
    });

    return [...preestablecidosMain].sort((a, b) => {
      const aLastUsed = lastUsedByGroup.get(a.id) || 0;
      const bLastUsed = lastUsedByGroup.get(b.id) || 0;
      return bLastUsed - aLastUsed || String(a.nombre || '').localeCompare(String(b.nombre || ''));
    });
  }, [groupUsageTransactions, preestablecidosMain]);

// 🧮 Gasto de cada presupuesto personalizado (incluyendo los recurrentes activos)
  const transaccionRecurrenteDelMes = (recurrenteId: string) => {
    return transacciones.some((t) => {
      if (t.recurrenteId !== recurrenteId) return false;
      const fecha = t.fecha?.toDate?.() || new Date(t.fecha);
      return fecha >= startOfMonth && fecha <= endOfMonth;
    });
  };

  const getTransactionBudgetAmount = (transaction: any, category?: string) => {
    if (!transaction.groupItems?.length) {
      const transactionCategory = transaction.origen === 'transferencia-ahorro' || transaction.origen === 'retiro-ahorro'
        ? 'Ahorro'
        : transaction.presupuestoCategoria;
      return !category || transactionCategory === category ? Number(transaction.monto || 0) : 0;
    }

    return transaction.groupItems.reduce((total: number, item: any) => {
      const itemCategory = item.categoria || null;
      if (category ? itemCategory !== category : itemCategory) return total;
      return total + Number(item.monto || 0) * Number(item.quantity || 1);
    }, 0);
  };

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
    if (t.groupItems?.length) return t.groupItems.some((item: any) => !item.categoria || !categoriasExistentes.includes(item.categoria));
    const transactionCategory = t.origen === 'transferencia-ahorro' || t.origen === 'retiro-ahorro'
      ? 'Ahorro'
      : t.presupuestoCategoria;
    const categoriaInexistente =
      transactionCategory &&
      !categoriasExistentes.includes(transactionCategory);
    return (
      !transactionCategory || (categoriaInexistente && transactionCategory !== 'Ahorro')
    );
  });

  const gastoTransacciones = transaccionesRelacionadas.reduce((acc, t) => acc + getTransactionBudgetAmount(t), 0);

  const recurrentesRelacionados = gastosRecurrentes.filter((g) => {
    const categoriaInexistente =
      g.categoria && !categoriasExistentes.includes(g.categoria);
    return (
      g.activo &&
      (!g.categoria || categoriaInexistente || g.categoria === "General") &&
      !transaccionRecurrenteDelMes(g.id)
    );
  });

  const gastoPendiente = recurrentesRelacionados.reduce(
    (acc, g) => acc + (g.monto || 0),
    0
  );

  // 💰 Total gastado en “Otros”
  const gastado = gastoTransacciones;

  return { ...p, gastado, pendiente: gastoPendiente, limite: limiteRestante };
    } else {
      // Transacciones normales asociadas a la categoría del presupuesto
      const relacionadas = transacciones.filter((t) => t.tipo === "egreso" && getTransactionBudgetAmount(t, p.categoria) > 0);

      // Gasto total de esas transacciones
      const gastoTransacciones = relacionadas.reduce((acc, t) => acc + getTransactionBudgetAmount(t, p.categoria), 0);

      const recurrentesRelacionados = gastosRecurrentes.filter(
        (g) => g.activo && g.categoria === p.categoria && !transaccionRecurrenteDelMes(g.id)
      );

      const gastoPendiente = recurrentesRelacionados.reduce(
        (acc, g) => acc + (g.monto || 0),
        0
      );

      const gastado = gastoTransacciones;

      return { ...p, gastado, pendiente: gastoPendiente };
  }
  });
  

// Totales globales
  const totalGastado = presupuestosConGasto.reduce((acc, p) => acc + p.gastado, 0);
  const presupuestoMensual = presupuestoGeneral?.mes || presupuestoGeneral?.mensual || 0;
  const totalLimite = presupuestosConGasto
  .filter((p) => p.categoria !== "Otros")
  .reduce((acc, p) => acc + (p.limite || 0), 0);
  const porcentajeOcupado = presupuestoMensual > 0 ? (totalLimite / presupuestoMensual) * 100 : 0;
  const porcentajeUtilizado = presupuestoMensual > 0 ? (totalGastado / presupuestoMensual) * 100 : 0;
  const getBudgetBarColor = (value: number) => {
    if (value < 80) return '#22c55e';
    if (value < 100) return '#f59e0b';
    return '#ef4444';
  };
  const ocupadoColor = getBudgetBarColor(porcentajeOcupado);
  const utilizadoColor = getBudgetBarColor(porcentajeUtilizado);
  const porcentajeUsado = porcentajeOcupado.toFixed(1);

  // ➕ Agregar presupuesto personalizado
  const agregarPresupuesto = async () => {
    if (!currentUserId) return;
    if (!nuevaCategoria || !nuevoLimite) return;

    const personalizadosCount = presupuestos.filter((p) => p.categoria !== "Otros").length;
    if (!subscriptionActive && personalizadosCount >= FREE_LIMIT) {
      Alert.alert("Limite de plan gratuito", "Puedes crear hasta 2 presupuestos personalizados sin suscripcion.");
      return;
    }

    const limite = parseFloat(nuevoLimite);
    if (isNaN(limite) || limite <= 0) {
      Alert.alert("Error", "Ingresa un límite válido.");
      return;
    }
    try {
      const ref = doc(collection(db, `users/${currentUserId}/presupuestosPersonalizados`));
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
    if (!currentUserId) return;
    const recurrentesCount = gastosRecurrentes.length + ingresosRecurrentes.length;
    if (!subscriptionActive && recurrentesCount >= FREE_LIMIT) {
      Alert.alert("Limite de plan gratuito", "Puedes crear hasta 2 recurrentes sin suscripcion.");
      return;
    }

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
      
      const ref = doc(collection(db, `users/${currentUserId}/gastosRecurrentes`));
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
  if (!currentUserId) return;
  const recurrentesCount = gastosRecurrentes.length + ingresosRecurrentes.length;
  if (!subscriptionActive && recurrentesCount >= FREE_LIMIT) {
    Alert.alert("Limite de plan gratuito", "Puedes crear hasta 2 recurrentes sin suscripcion.");
    return;
  }

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


  const ref = doc(collection(db, `users/${currentUserId}/ingresosRecurrentes`));
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
  if (!currentUserId || !presupuestoEditar) return;
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
        doc(db, `users/${currentUserId}/presupuestosPersonalizados`, presupuestoEditar.id),
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
          doc(db, `users/${currentUserId}/gastosRecurrentes`, presupuestoEditar.id),
          dataActualizacion
        );
      }
      // --- INGRESOS RECURRENTES ---
      else if (tipoRecurrenteActivo === "ingresos") {
        dataActualizacion.monto = valor;
        if (diaPago) dataActualizacion.diaPago = parseInt(diaPago);

        await updateDoc(
          doc(db, `users/${currentUserId}/ingresosRecurrentes`, presupuestoEditar.id),
          dataActualizacion
        );
      }
      setNuevoValorEditarFecha("");
    }

    // --- PRESUPUESTOS GENERALES ---
    else {
      await updateDoc(doc(db, `users/${currentUserId}`), {
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
    if (!currentUserId) return;
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
              ? doc(db, "users", currentUserId, "gastosRecurrentes", id)
              : doc(db, "users", currentUserId, "ingresosRecurrentes", id);
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
    if (!currentUserId) return;
    const docRef =
      tipo === "gastos"
        ? doc(db, "users", currentUserId, "gastosRecurrentes", id)
        : doc(db, "users", currentUserId, "ingresosRecurrentes", id);

    await updateDoc(docRef, {
      activo: nuevoEstado,
      lastUpdate: new Date(),
    });
  };


  // ❌ Eliminar presupuesto personalizado
  const eliminarPresupuesto = async (id: string) => {
    if (!currentUserId) return;
    Alert.alert("Eliminar", "¿Deseas eliminar este presupuesto?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, `users/${currentUserId}/presupuestosPersonalizados`, id));
          } catch (e) {
            console.error(e);
            Alert.alert("Error", "No se pudo eliminar.");
          }
        },
      },
    ]);
  };

  const agregarPreestablecidoMain = async () => {
    if (!currentUserId) return;
    if (!subscriptionActive && preestablecidosMain.length >= FREE_LIMIT) {
      Alert.alert("Limite de plan gratuito", "Puedes crear hasta 2 grupos sin suscripcion.");
      return;
    }

    if (!nuevoMainNombre.trim() || !nuevoMainIcono.trim()) {
      Alert.alert("Error", "Ingresa un nombre e icono para el grupo.");
      return;
    }

    const ref = doc(collection(db, `users/${currentUserId}/preestablecidosMain`));
    await setDoc(ref, {
      nombre: nuevoMainNombre.trim(),
      icono: nuevoMainIcono.trim() || "💼",
      accesoRapido: true,
      createdAt: new Date()
    });

    setNuevoMainNombre("");
    setNuevoMainIcono("");
    setNuevoMainImagen("");
    setMostrarNuevoPreestablecido(false);
  };

  const toggleGrupoAccesoRapido = async (id: string, activo: boolean) => {
    if (!currentUserId) return;
    await updateDoc(doc(db, `users/${currentUserId}/preestablecidosMain`, id), {
      accesoRapido: activo,
      updatedAt: new Date(),
    });
  };

  const agregarPreestablecidoSub = async (mainId: string) => {
    if (!currentUserId) return;
    if (!subscriptionActive && preestablecidosSubs.length >= FREE_LIMIT) {
      Alert.alert("Limite de plan gratuito", "Puedes crear hasta 2 acciones de grupo sin suscripcion.");
      return;
    }

    if (!mainId || !nuevoSubNombre.trim() || !nuevoSubMonto || !nuevoSubIcono.trim()) {
      Alert.alert("Error", "Completa grupo, nombre, monto e icono.");
      return;
    }

    const monto = parseFloat(nuevoSubMonto);
    if (isNaN(monto) || monto <= 0) {
      Alert.alert("Error", "Monto inválido.");
      return;
    }

    const main = preestablecidosMain.find((m) => m.id === mainId);
    const ref = doc(collection(db, `users/${currentUserId}/preestablecidosSubs`));
    const quickActionsCount = preestablecidosSubs.filter((s) => s.accesoRapido).length;
    const shouldPromptWidget = nuevoSubRapido && quickActionsCount === 0 && !quickWidgetPromptAlreadyAnswered;

    await setDoc(ref, {
      mainId,
      mainNombre: main?.nombre || "Sin grupo",
      nombre: nuevoSubNombre.trim(),
      tipo: nuevoSubTipo,
      montoDefault: monto,
      icono: nuevoSubIcono.trim() || "⚡",
      presupuestoCategoria: nuevoSubTipo === "egreso" ? (nuevoSubPresupuestoCategoria || null) : null,
      accesoRapido: nuevoSubRapido,
      widgetStarred: false,
      createdAt: new Date(),
    });

    setNuevoSubNombre("");
    setNuevoSubMonto("");
    setNuevoSubIcono("");
    setNuevoSubPresupuestoCategoria("");
    setNuevoSubRapido(true);
    setMainConNuevoSubId(null);

    if (shouldPromptWidget) {
      setShowAddQuickWidgetPrompt(true);
    }
  };

  const iniciarEdicionMain = (main: any) => {
    setEditandoMainId(main.id);
    setEditarMainNombre(main.nombre || "");
    setEditarMainIcono(main.icono || "💼");
    setMainConNuevoSubId(null);
    setEditandoSubId(null);
  };

  const guardarEdicionMain = async () => {
    if (!currentUserId || !editandoMainId) return;
    if (!editarMainNombre.trim() || !editarMainIcono.trim()) {
      Alert.alert("Error", "Ingresa un nombre e icono válidos para el grupo.");
      return;
    }

    await updateDoc(doc(db, `users/${currentUserId}/preestablecidosMain`, editandoMainId), {
      nombre: editarMainNombre.trim(),
      icono: editarMainIcono.trim() || "💼",
      updatedAt: new Date(),
    });

    setEditandoMainId(null);
    setEditarMainNombre("");
    setEditarMainIcono("");
  };

  const iniciarEdicionSub = (sub: any) => {
    setEditandoSubId(sub.id);
    setEditarSubNombre(sub.nombre || "");
    setEditarSubTipo(sub.tipo === "egreso" ? "egreso" : "ingreso");
    setEditarSubMonto(String(sub.montoDefault ?? ""));
    setEditarSubIcono(sub.icono || "⚡");
    setEditarSubRapido(Boolean(sub.accesoRapido));
    setEditarSubPresupuestoCategoria(sub.presupuestoCategoria || "");
    setMainConNuevoSubId(null);
    setEditandoMainId(null);
  };

  const guardarEdicionSub = async () => {
    if (!currentUserId || !editandoSubId) return;
    if (!editarSubNombre.trim() || !editarSubIcono.trim()) {
      Alert.alert("Error", "Completa el nombre e icono de la acción.");
      return;
    }

    const monto = parseFloat(editarSubMonto);
    if (isNaN(monto) || monto <= 0) {
      Alert.alert("Error", "Monto inválido para la acción.");
      return;
    }

    const subActual = preestablecidosSubs.find((s) => s.id === editandoSubId);
    await updateDoc(doc(db, `users/${currentUserId}/preestablecidosSubs`, editandoSubId), {
      nombre: editarSubNombre.trim(),
      tipo: editarSubTipo,
      montoDefault: monto,
      icono: editarSubIcono.trim() || "⚡",
      presupuestoCategoria: editarSubTipo === "egreso" ? (editarSubPresupuestoCategoria || null) : null,
      accesoRapido: editarSubRapido,
      mainNombre: subActual?.mainNombre || "Sin grupo",
      updatedAt: new Date(),
    });

    setEditandoSubId(null);
    setEditarSubNombre("");
    setEditarSubTipo("ingreso");
    setEditarSubMonto("");
    setEditarSubIcono("");
    setEditarSubRapido(true);
    setEditarSubPresupuestoCategoria("");
  };

  const setQuickWidgetPromptChoice = async (choice: 'added' | 'dismissed') => {
    if (!currentUserId) return;

    try {
      const key = `konta.widget.quickActionsPrompt.choice.${currentUserId}`;
      await AsyncStorage.setItem(key, choice);
      setQuickWidgetPromptAlreadyAnswered(true);
    } catch (error) {
      console.log('No se pudo guardar la preferencia del widget de accesos rapidos:', error);
    }
  };

  const handleDismissQuickWidgetPrompt = async () => {
    await setQuickWidgetPromptChoice('dismissed');
    setShowAddQuickWidgetPrompt(false);
  };

  const handleAddQuickWidgetFromPresupuestos = async () => {
    try {
      const widgetModule = NativeModules.KontaWidgetModule;
      if (Platform.OS === 'android' && widgetModule?.requestPinQuickActionsWidget) {
        const requested = await widgetModule.requestPinQuickActionsWidget();
        if (!requested) {
          ToastAndroid.show('No se pudo abrir el selector de widgets en este dispositivo', ToastAndroid.SHORT);
          return;
        }

        await setQuickWidgetPromptChoice('added');
        setShowAddQuickWidgetPrompt(false);
        ToastAndroid.show('Listo. Elige donde quieres colocar el widget de accesos rapidos', ToastAndroid.SHORT);
        return;
      }

      ToastAndroid.show('Esta opcion solo esta disponible en Android', ToastAndroid.SHORT);
    } catch (error) {
      console.log('No se pudo solicitar el widget de accesos rapidos:', error);
      ToastAndroid.show('No se pudo abrir el selector de widgets', ToastAndroid.SHORT);
    }
  };

  const toggleSubRapido = async (id: string, estado: boolean) => {
    if (!currentUserId) return;
    await updateDoc(doc(db, `users/${currentUserId}/preestablecidosSubs`, id), {
      accesoRapido: estado,
      updatedAt: new Date(),
    });
  };

  const toggleSubWidgetStar = async (id: string, estado: boolean) => {
    if (!currentUserId) return;

    const estrellasActuales = preestablecidosSubs.filter((s) => s.widgetStarred).length;
    if (estado && estrellasActuales >= 3) {
      Alert.alert("Límite alcanzado", "Solo puedes marcar 3 acciones para el widget.");
      return;
    }

    await updateDoc(doc(db, `users/${currentUserId}/preestablecidosSubs`, id), {
      widgetStarred: estado,
      updatedAt: new Date(),
    });
  };

  const eliminarPreestablecidoMain = async (id: string) => {
    if (!currentUserId) return;
    Alert.alert("Eliminar", "Se eliminará el grupo y sus acciones.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          const subs = preestablecidosSubs.filter((s) => s.mainId === id);
          await Promise.all(subs.map((s) => deleteDoc(doc(db, `users/${currentUserId}/preestablecidosSubs`, s.id))));
          await deleteDoc(doc(db, `users/${currentUserId}/preestablecidosMain`, id));
        },
      },
    ]);
  };

  const eliminarPreestablecidoSub = async (id: string) => {
    if (!currentUserId) return;
    Alert.alert("Eliminar", "¿Deseas eliminar esta acción del grupo?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          await deleteDoc(doc(db, `users/${currentUserId}/preestablecidosSubs`, id));
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: 24 }}
        style={{
          flex: 1,
          backgroundColor: backgroundColor2,
          padding: 16,
          paddingTop: 80,
        }}
      >
      
      {/* ENCABEZADO */}
      <LinearGradient
        colors={headerColors}
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

        <View style={{ marginTop: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ color: '#fff', opacity: 0.82, fontSize: 12 }}>Presupuesto ocupado</Text>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{porcentajeUsado}%</Text>
          </View>

          <View style={{ height: 10, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${Math.min(porcentajeOcupado, 100)}%`,
                backgroundColor: `${ocupadoColor}66`,
                borderRadius: 999,
              }}
            />

            <View
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${Math.min(porcentajeUtilizado, 100)}%`,
                backgroundColor: utilizadoColor,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.7)',
              }}
            />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <Text style={{ color: '#fff', opacity: 0.75, fontSize: 11 }}>Utilizado</Text>
            <Text style={{ color: '#fff', opacity: 0.9, fontSize: 11, fontWeight: '700' }}>{porcentajeUtilizado.toFixed(1)}%</Text>
          </View>
        </View>
      </LinearGradient>

      {/* BOTONES DE SECCIÓN */}
      <View
        style={{
          flexDirection: "column",
          backgroundColor: cardsMain,
          borderRadius: 12,
          overflow: "hidden",
          marginBottom: 20,
        }}
      >
        <View
          style={{
            flexDirection: "row",
          }}
        >
          {["general", "personalizados"].map((tipo) => (
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
                {tipo === "general"
                  ? "Generales"
                  : tipo === "personalizados"
                  ? "Personalizados"
                  : tipo === "preestablecidos"
                  ? "Grupos"
                  : "Recurrentes"}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
        <View
          style={{
            flexDirection: "row",
          }}
        >
          {["preestablecidos", "recurrentes"].map((tipo) => (
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
                {tipo === "general"
                  ? "Generales"
                  : tipo === "personalizados"
                  ? "Personalizados"
                  : tipo === "preestablecidos"
                  ? "Grupos"
                  : "Recurrentes"}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {seccionActiva === "preestablecidos" && (
        <>
          {showAddQuickWidgetPrompt && (
            <View
              style={{
                backgroundColor: graficaFondoColor,
                borderRadius: 14,
                padding: 14,
                borderWidth: 1,
                borderColor: '#6366f155',
                marginBottom: 12,
              }}
            >
              <ThemedText style={{ fontSize: 15, fontWeight: '700', marginBottom: 4 }}>
                Agrega tu widget de accesos rapidos
              </ThemedText>
              <Text style={{ color: '#a1a1aa', marginBottom: 10, fontSize: 12 }}>
                Ya creaste tu primera accion rapida. Agregala en tu pantalla principal para usarla en un toque.
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <TouchableOpacity
                  onPress={handleDismissQuickWidgetPrompt}
                  style={{
                    borderRadius: 8,
                    paddingVertical: 9,
                    paddingHorizontal: 12,
                    borderWidth: 1,
                    borderColor: '#6366f155',
                    marginRight: 8,
                  }}
                >
                  <ThemedText style={{ fontSize: 12, fontWeight: '700' }}>Cerrar</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleAddQuickWidgetFromPresupuestos}
                  style={{
                    backgroundColor: '#6366f1',
                    borderRadius: 8,
                    paddingVertical: 9,
                    paddingHorizontal: 12,
                  }}
                >
                  <ThemedText style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Agregar widget</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <TouchableOpacity
            onPress={() => setMostrarNuevoPreestablecido(!mostrarNuevoPreestablecido)}
            style={{
              backgroundColor: "#6366f1",
              borderRadius: 20,
              paddingVertical: 12,
              marginBottom: 16,
              alignItems: "center",
            }}
          >
            <ThemedText style={{ color: "#fff", fontWeight: "600" }}>
              {mostrarNuevoPreestablecido ? "Cancelar" : "Nuevo grupo"}
            </ThemedText>
          </TouchableOpacity>

          {mostrarNuevoPreestablecido && (
            <Animated.View layout={Layout.springify()} style={{ backgroundColor: graficaFondoColor, borderRadius: 16, padding: 16, marginBottom: 16 }}>
              <TextInput
                placeholder="Nombre (ej. Trabajo)"
                placeholderTextColor="#888"
                value={nuevoMainNombre}
                onChangeText={setNuevoMainNombre}
                style={{ color: textColor, borderBottomColor: "#333", borderBottomWidth: 1, marginBottom: 12, paddingVertical: 4 }}
              />
              <TextInput
                placeholder="Icono o emoji (ej. 💼)"
                placeholderTextColor="#888"
                value={nuevoMainIcono}
                maxLength={2}
                onChangeText={setNuevoMainIcono}
                style={{ color: textColor, borderBottomColor: "#333", borderBottomWidth: 1, marginBottom: 12, paddingVertical: 4 }}
              />
              <TouchableOpacity onPress={agregarPreestablecidoMain} style={{ backgroundColor: "#6366f1", paddingVertical: 10, borderRadius: 12, alignItems: "center" }}>
                        <ThemedText style={{ color: "#fff", fontWeight: "600" }}>Guardar grupo</ThemedText>
              </TouchableOpacity>
            </Animated.View>
          )}

          {preestablecidosMain.length === 0 ? (
            <Text style={{ color: "#999", textAlign: "center", marginTop: 8 }}>
              Aún no hay grupos. Crea uno para agregar acciones.
            </Text>
          ) : (
            orderedGroups.map((main) => {
              const subsMain = preestablecidosSubs.filter((s) => s.mainId === main.id);
              const expandido = mainExpandidoId === main.id;
              const mostrandoNuevoSub = mainConNuevoSubId === main.id;

              return (
                <View key={main.id} style={{ backgroundColor: graficaFondoColor, borderRadius: 12, padding: 12, marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <TouchableOpacity onPress={() => setMainExpandidoId(expandido ? null : main.id)} style={{ flex: 1 }}>
                      <ThemedText style={{ fontWeight: "700", fontSize: 16 }}>
                        {(main.icono || "💼") + " " + main.nombre}
                      </ThemedText>
                      <Text style={{ color: "#aaa", fontSize: 12, marginTop: 2 }}>
                        {subsMain.length} acciones
                      </Text>
                    </TouchableOpacity>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, justifyContent: "center" }}>
                      <TouchableOpacity onPress={() => toggleGrupoAccesoRapido(main.id, main.accesoRapido === false)}>
                        <Text style={{ color: main.accesoRapido === false ? "#999" : "#3edc81", fontWeight: "600" }}>
                          {main.accesoRapido === false ? "Sin acceso" : "Acceso rápido"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setMainConNuevoSubId(mostrandoNuevoSub ? null : main.id)}>
                          {mostrandoNuevoSub ? 
                          <Ionicons name="close-outline" size={20} color="#5c6bf2" /> : 
                          <Ionicons name="add-outline" size={20} color="#5c6bf2" />}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => iniciarEdicionMain(main)}>
                        <Ionicons name="create-outline" size={20} color="#5c6bf2" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => eliminarPreestablecidoMain(main.id)}>
                        <Ionicons name="trash-outline" size={20} color="red" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {editandoMainId === main.id && (
                    <Animated.View layout={Layout.springify()} style={{ backgroundColor: cardsMain, borderRadius: 12, padding: 12, marginBottom: 10 }}>
                      <TextInput
                        placeholder="Nombre del grupo"
                        placeholderTextColor="#888"
                        value={editarMainNombre}
                        onChangeText={setEditarMainNombre}
                        style={{ color: textColor, borderBottomColor: "#333", borderBottomWidth: 1, marginBottom: 10, paddingVertical: 4 }}
                      />
                      <TextInput
                        placeholder="Icono o emoji"
                        placeholderTextColor="#888"
                        value={editarMainIcono}
                        maxLength={2}
                        onChangeText={setEditarMainIcono}
                        style={{ color: textColor, borderBottomColor: "#333", borderBottomWidth: 1, marginBottom: 12, paddingVertical: 4 }}
                      />
                      <TouchableOpacity onPress={guardarEdicionMain} style={{ backgroundColor: "#6366f1", paddingVertical: 10, borderRadius: 10, alignItems: "center" }}>
                        <Text style={{ color: "#fff", fontWeight: "600" }}>Guardar grupo</Text>
                      </TouchableOpacity>
                    </Animated.View>
                  )}

                  {mostrandoNuevoSub && (
                    <Animated.View layout={Layout.springify()} style={{ backgroundColor: cardsMain, borderRadius: 12, padding: 12, marginBottom: 10 }}>
                      <TextInput
                        placeholder="Nombre de la acción (ej. Cheque)"
                        placeholderTextColor="#888"
                        value={nuevoSubNombre}
                        onChangeText={setNuevoSubNombre}
                        style={{ color: textColor, borderBottomColor: "#333", borderBottomWidth: 1, marginBottom: 10, paddingVertical: 4 }}
                      />
                      <View style={{ flexDirection: "row", marginBottom: 10 }}>
                        <TouchableOpacity
                          onPress={() => setNuevoSubTipo("ingreso")}
                          style={[styles.tipoBtn, { backgroundColor: nuevoSubTipo === "ingreso" ? "#3edc81" : "#2a2a2a" } as const]}
                        >
                          <Text style={{ color: nuevoSubTipo === "ingreso" ? "black" : "white", fontWeight: "600" }}>Ingreso</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setNuevoSubTipo("egreso")}
                          style={[styles.tipoBtn, { backgroundColor: nuevoSubTipo === "egreso" ? "#ff6363" : "#2a2a2a" } as const]}
                        >
                          <Text style={{ color: nuevoSubTipo === "egreso" ? "black" : "white", fontWeight: "600" }}>Egreso</Text>
                        </TouchableOpacity>
                      </View>
                      <TextInput
                        placeholder="Monto por defecto"
                        placeholderTextColor="#888"
                        keyboardType="numeric"
                        value={nuevoSubMonto}
                        onChangeText={setNuevoSubMonto}
                        style={{ color: textColor, borderBottomColor: "#333", borderBottomWidth: 1, marginBottom: 10, paddingVertical: 4 }}
                      />

                      {nuevoSubTipo === "egreso" && presupuestos.length > 0 && (
                        <View style={{ marginBottom: 10 }}>
                          <Text style={{ color: textColor, marginBottom: 6, fontWeight: "500" }}>
                            Asociar a presupuesto:
                          </Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <TouchableOpacity
                              onPress={() => setNuevoSubPresupuestoCategoria("")}
                              style={[
                                styles.presupuestoBtn,
                                { backgroundColor: !nuevoSubPresupuestoCategoria ? "#6366f1" : "#2a2a2a" },
                              ]}
                            >
                              <Text style={{ color: "white" }}>Ninguno</Text>
                            </TouchableOpacity>

                            {presupuestos
                              .filter((p) => p.categoria !== "Otros")
                              .map((p) => (
                                <TouchableOpacity
                                  key={p.id || p.categoria}
                                  onPress={() =>
                                    setNuevoSubPresupuestoCategoria(
                                      nuevoSubPresupuestoCategoria === p.categoria ? "" : p.categoria
                                    )
                                  }
                                  style={[
                                    styles.presupuestoBtn,
                                    {
                                      backgroundColor:
                                        nuevoSubPresupuestoCategoria === p.categoria ? "#6366f1" : "#2a2a2a",
                                    },
                                  ]}
                                >
                                  <Text style={{ color: "white" }}>{p.categoria}</Text>
                                </TouchableOpacity>
                              ))}
                          </ScrollView>
                        </View>
                      )}

                      <TextInput
                        placeholder="Icono o emoji (ej. ⚡)"
                        placeholderTextColor="#888"
                        value={nuevoSubIcono}
                        maxLength={2}
                        onChangeText={setNuevoSubIcono}
                        style={{ color: textColor, borderBottomColor: "#333", borderBottomWidth: 1, marginBottom: 10, paddingVertical: 4 }}
                      />
                      <TouchableOpacity
                        onPress={() => setNuevoSubRapido(!nuevoSubRapido)}
                        style={{ marginBottom: 12, backgroundColor: nuevoSubRapido ? "#3edc81" : "#444", borderRadius: 8, paddingVertical: 8, alignItems: "center" }}
                      >
                        <Text style={{ color: nuevoSubRapido ? "black" : "white", fontWeight: "600" }}>
                          {nuevoSubRapido ? "Acceso rápido: Activo" : "Acceso rápido: Inactivo"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => agregarPreestablecidoSub(main.id)} style={{ backgroundColor: "#6366f1", paddingVertical: 10, borderRadius: 10, alignItems: "center" }}>
                        <Text style={{ color: "#fff", fontWeight: "600" }}>Guardar acción</Text>
                      </TouchableOpacity>
                    </Animated.View>
                  )}

                  {expandido && (
                    <View>
                      {subsMain.length === 0 ? (
                        <Text style={{ color: "#999", fontSize: 12 }}>Este grupo no tiene acciones todavía.</Text>
                      ) : (
                        subsMain.map((item) => (
                          <View key={item.id} style={{ backgroundColor: cardsMain, borderRadius: 10, padding: 10, marginBottom: 8 }}>
                            <TouchableOpacity
                              activeOpacity={0.9}
                              onPress={() => {
                                if (editandoSubId === item.id) {
                                  setEditandoSubId(null);
                                  return;
                                }
                                iniciarEdicionSub(item);
                              }}
                            >
                              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                <View style={{ flex: 1 }}>
                                  <ThemedText style={{ fontWeight: "700" }}>{(item.icono || "⚡") + " " + item.nombre}</ThemedText>
                                  <Text style={{ color: "#aaa", fontSize: 12 }}>
                                    {item.tipo} • ${Number(item.montoDefault || 0).toFixed(2)}
                                  </Text>
                                </View>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                  <TouchableOpacity
                                    onPress={() => toggleSubWidgetStar(item.id, !item.widgetStarred)}
                                    style={{ backgroundColor: item.widgetStarred ? "#f59e0b" : "#555", borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, justifyContent: "center", alignItems: "center", }}
                                  >
                                    <Text style={{ color: item.widgetStarred ? "black" : "white", fontWeight: "600", marginBottom: 3 }}>★</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => toggleSubRapido(item.id, !item.accesoRapido)}
                                    style={{ backgroundColor: item.accesoRapido ? "#3edc81" : "#555", borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 }}
                                  >
                                    <Text style={{ color: item.accesoRapido ? "black" : "white", fontWeight: "600" }}>
                                      {item.accesoRapido ? "Rápido" : "Off"}
                                    </Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity onPress={() => eliminarPreestablecidoSub(item.id)}>
                                    <Text style={{ color: "#f87171", fontWeight: "600" }}>Eliminar</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            </TouchableOpacity>

                            {editandoSubId === item.id && (
                              <Animated.View layout={Layout.springify()} style={{ marginTop: 10, backgroundColor: "rgba(255,255,255,0.02)", borderRadius: 8, padding: 10 }}>
                                <TextInput
                                  placeholder="Nombre de la acción"
                                  placeholderTextColor="#888"
                                  value={editarSubNombre}
                                  onChangeText={setEditarSubNombre}
                                  style={{ color: textColor, borderBottomColor: "#333", borderBottomWidth: 1, marginBottom: 10, paddingVertical: 4 }}
                                />
                                <View style={{ flexDirection: "row", marginBottom: 10 }}>
                                  <TouchableOpacity
                                    onPress={() => setEditarSubTipo("ingreso")}
                                    style={[styles.tipoBtn, { backgroundColor: editarSubTipo === "ingreso" ? "#3edc81" : "#2a2a2a" } as const]}
                                  >
                                    <Text style={{ color: editarSubTipo === "ingreso" ? "black" : "white", fontWeight: "600" }}>Ingreso</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => setEditarSubTipo("egreso")}
                                    style={[styles.tipoBtn, { backgroundColor: editarSubTipo === "egreso" ? "#ff6363" : "#2a2a2a" } as const]}
                                  >
                                    <Text style={{ color: editarSubTipo === "egreso" ? "black" : "white", fontWeight: "600" }}>Egreso</Text>
                                  </TouchableOpacity>
                                </View>
                                <TextInput
                                  placeholder="Monto por defecto"
                                  placeholderTextColor="#888"
                                  keyboardType="numeric"
                                  value={editarSubMonto}
                                  onChangeText={setEditarSubMonto}
                                  style={{ color: textColor, borderBottomColor: "#333", borderBottomWidth: 1, marginBottom: 10, paddingVertical: 4 }}
                                />
                                {editarSubTipo === "egreso" && presupuestos.length > 0 && (
                                  <View style={{ marginBottom: 10 }}>
                                    <Text style={{ color: textColor, marginBottom: 6, fontWeight: "500" }}>Asociar a presupuesto:</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                      <TouchableOpacity
                                        onPress={() => setEditarSubPresupuestoCategoria("")}
                                        style={[styles.presupuestoBtn, { backgroundColor: !editarSubPresupuestoCategoria ? "#6366f1" : "#2a2a2a" }]}
                                      >
                                        <Text style={{ color: "white" }}>Ninguno</Text>
                                      </TouchableOpacity>
                                      {presupuestos.filter((p) => p.categoria !== "Otros").map((p) => (
                                        <TouchableOpacity
                                          key={p.id || p.categoria}
                                          onPress={() => setEditarSubPresupuestoCategoria(editarSubPresupuestoCategoria === p.categoria ? "" : p.categoria)}
                                          style={[styles.presupuestoBtn, { backgroundColor: editarSubPresupuestoCategoria === p.categoria ? "#6366f1" : "#2a2a2a" }]}
                                        >
                                          <Text style={{ color: "white" }}>{p.categoria}</Text>
                                        </TouchableOpacity>
                                      ))}
                                    </ScrollView>
                                  </View>
                                )}
                                <TextInput
                                  placeholder="Icono o emoji"
                                  placeholderTextColor="#888"
                                  value={editarSubIcono}
                                  maxLength={2}
                                  onChangeText={setEditarSubIcono}
                                  style={{ color: textColor, borderBottomColor: "#333", borderBottomWidth: 1, marginBottom: 10, paddingVertical: 4 }}
                                />
                                <TouchableOpacity
                                  onPress={() => setEditarSubRapido(!editarSubRapido)}
                                  style={{ marginBottom: 12, backgroundColor: editarSubRapido ? "#3edc81" : "#444", borderRadius: 8, paddingVertical: 8, alignItems: "center" }}
                                >
                                  <Text style={{ color: editarSubRapido ? "black" : "white", fontWeight: "600" }}>
                                    {editarSubRapido ? "Acceso rápido: Activo" : "Acceso rápido: Inactivo"}
                                  </Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={guardarEdicionSub} style={{ backgroundColor: "#6366f1", paddingVertical: 10, borderRadius: 10, alignItems: "center" }}>
                                  <Text style={{ color: "#fff", fontWeight: "600" }}>Guardar cambios</Text>
                                </TouchableOpacity>
                              </Animated.View>
                            )}
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}

          <View style={{ height: 120 }} />
        </>
      )}

      {/* PRESUPUESTOS GENERALES */}
      {seccionActiva === "general" && (
        <Animated.View layout={Layout.springify()}>
          {Object.entries(presupuestoGeneral as Record<string, number>).map(([categoria, valor]) => (
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
                  <Text style={{ color: "#aaa" }}>${Number(valor || 0).toFixed(2)}</Text>
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
            const isTemporary = Boolean(p.temporal);
            const porcentaje = p.limite ? Math.min((p.gastado / p.limite) * 100, 100) : 0;
            const porcentajeConPrevisto = p.limite
              ? Math.min(((p.gastado + (p.pendiente || 0)) / p.limite) * 100, 100)
              : 0;
            const pendientePorcentaje = Math.max(porcentajeConPrevisto - porcentaje, 0);
            const color =
              porcentaje < 70
                ? "#4ade80"
                : porcentaje < 90
                ? "#facc15"
                : "#f87171";

            return (
              <View
                key={p.id || p.categoria}
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
                    {isTemporary ? `Gasto: $${p.gastado.toFixed(2)} · Sin límite` : `$${p.gastado.toFixed(2)} / $${p.limite.toFixed(2)}`}
                  </ThemedText>
                </View>
                {!isTemporary && (
                <View
                  style={{
                    height: 8,
                    backgroundColor: progressBg,
                    borderRadius: 10,
                    overflow: "hidden",
                    marginBottom: 10,
                    flexDirection: "row",
                  }}
                >
                  <View
                    style={{
                      height: "100%",
                      width: `${porcentaje}%`,
                      backgroundColor: color,
                    }}
                  />
                  {pendientePorcentaje > 0 && (
                    <View
                      style={{
                        height: "100%",
                        width: `${pendientePorcentaje}%`,
                        backgroundColor: "rgba(99,102,241,0.45)",
                      }}
                    />
                  )}
                </View>
                )}
                {p.pendiente > 0 && (
                  <ThemedText style={{ color: '#9ca3af', fontSize: 12, marginBottom: 8 }}>
                    +${p.pendiente.toFixed(2)} previsto para este mes
                  </ThemedText>
                )}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "flex-end",
                    gap: 16,
                  }}
                >
                  {p.categoria !== "Otros" && !isTemporary && (
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
                backgroundColor: graficaFondoColor,
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
                  <ThemedText style={{ fontWeight: "600" }}>
                    {item.nombre}
                  </ThemedText>
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
          <TouchableWithoutFeedback onPress={() => setModalEditar(false)}>
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
            >
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
                    backgroundColor: backModalColor,
                    borderRadius: 16,
                    padding: 20,
                  }}
                >
                  <ThemedText style={{ fontSize: 18, fontWeight: "600", marginBottom: 12 }}>
                    Editar {presupuestoEditar?.tipo === "recurrente"? presupuestoEditar?.nombre: presupuestoEditar?.categoria}
                  </ThemedText>
                  <TextInput
                    placeholder="Nuevo valor"
                    placeholderTextColor="#888"
                    keyboardType="numeric"
                    value={nuevoValorEditar}
                    onChangeText={setNuevoValorEditar}
                    style={{
                      color: "#888",
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
                        color: "#888",
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
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
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
    alignItems: "center" as const,
  },
  presupuestoBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 8,
  },
};