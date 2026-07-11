import { ThemedText } from '@/components/ThemedText';
import { useAuth } from "@/hooks/useAuth";
import { useThemeColor } from '@/hooks/useThemeColor';
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
import React, { useEffect, useState } from "react";
import {
  Alert,
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
  const params = useLocalSearchParams<{ section?: string }>();
  const [presupuestos, setPresupuestos] = useState<any[]>([{ categoria: "Otros" }]);
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

  useEffect(() => {
    if (!user) return;

    const refMain = collection(db, `users/${user.uid}/preestablecidosMain`);
    const refSubs = collection(db, `users/${user.uid}/preestablecidosSubs`);

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
  }, [user]);

  useEffect(() => {
    if (!user?.uid) {
      setQuickWidgetPromptAlreadyAnswered(false);
      setShowAddQuickWidgetPrompt(false);
      return;
    }

    const loadQuickWidgetPromptChoice = async () => {
      try {
        const key = `konta.widget.quickActionsPrompt.choice.${user.uid}`;
        const savedChoice = await AsyncStorage.getItem(key);
        setQuickWidgetPromptAlreadyAnswered(savedChoice !== null);
      } catch (error) {
        console.log('No se pudo cargar la preferencia del widget de accesos rapidos:', error);
      }
    };

    loadQuickWidgetPromptChoice();
  }, [user?.uid]);

  useEffect(() => {
    if (initialSectionHandledRef.current) return;
    if (params.section !== 'preestablecidos') return;

    initialSectionHandledRef.current = true;
    setSeccionActiva('preestablecidos');
  }, [params.section]);

// 🧮 Gasto de cada presupuesto personalizado (incluyendo los recurrentes activos)
  const transaccionRecurrenteDelMes = (recurrenteId: string) => {
    return transacciones.some((t) => {
      if (t.recurrenteId !== recurrenteId) return false;
      const fecha = t.fecha?.toDate?.() || new Date(t.fecha);
      return fecha >= startOfMonth && fecha <= endOfMonth;
    });
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
      const relacionadas = transacciones.filter(
        (t) => t.tipo === "egreso" && t.presupuestoCategoria === p.categoria
      );

      // Gasto total de esas transacciones
      const gastoTransacciones = relacionadas.reduce((acc, t) => acc + (t.monto || 0), 0);

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
  const porcentajeUsado = ((totalLimite / presupuestoMensual) * 100 || 0).toFixed(1);

  // ➕ Agregar presupuesto personalizado
  const agregarPresupuesto = async () => {
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

  const agregarPreestablecidoMain = async () => {
    if (!user?.uid) return;
    if (!subscriptionActive && preestablecidosMain.length >= FREE_LIMIT) {
      Alert.alert("Limite de plan gratuito", "Puedes crear hasta 2 principales de preestablecidos sin suscripcion.");
      return;
    }

    if (!nuevoMainNombre.trim() || !nuevoMainIcono.trim()) {
      Alert.alert("Error", "Ingresa un nombre e icono para el principal.");
      return;
    }

    const ref = doc(collection(db, `users/${user.uid}/preestablecidosMain`));
    await setDoc(ref, {
      nombre: nuevoMainNombre.trim(),
      icono: nuevoMainIcono.trim() || "💼",
      createdAt: new Date()
    });

    setNuevoMainNombre("");
    setNuevoMainIcono("");
    setNuevoMainImagen("");
    setMostrarNuevoPreestablecido(false);
  };

  const agregarPreestablecidoSub = async (mainId: string) => {
    if (!user?.uid) return;
    if (!subscriptionActive && preestablecidosSubs.length >= FREE_LIMIT) {
      Alert.alert("Limite de plan gratuito", "Puedes crear hasta 2 acciones preestablecidas sin suscripcion.");
      return;
    }

    if (!mainId || !nuevoSubNombre.trim() || !nuevoSubMonto || !nuevoSubIcono.trim()) {
      Alert.alert("Error", "Completa principal, nombre, monto e icono.");
      return;
    }

    const monto = parseFloat(nuevoSubMonto);
    if (isNaN(monto) || monto <= 0) {
      Alert.alert("Error", "Monto inválido.");
      return;
    }

    const main = preestablecidosMain.find((m) => m.id === mainId);
    const ref = doc(collection(db, `users/${user.uid}/preestablecidosSubs`));
    const quickActionsCount = preestablecidosSubs.filter((s) => s.accesoRapido).length;
    const shouldPromptWidget = nuevoSubRapido && quickActionsCount === 0 && !quickWidgetPromptAlreadyAnswered;

    await setDoc(ref, {
      mainId,
      mainNombre: main?.nombre || "Sin principal",
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

  const setQuickWidgetPromptChoice = async (choice: 'added' | 'dismissed') => {
    if (!user?.uid) return;

    try {
      const key = `konta.widget.quickActionsPrompt.choice.${user.uid}`;
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
    if (!user?.uid) return;
    await updateDoc(doc(db, `users/${user.uid}/preestablecidosSubs`, id), {
      accesoRapido: estado,
      updatedAt: new Date(),
    });
  };

  const toggleSubWidgetStar = async (id: string, estado: boolean) => {
    if (!user?.uid) return;

    const estrellasActuales = preestablecidosSubs.filter((s) => s.widgetStarred).length;
    if (estado && estrellasActuales >= 3) {
      Alert.alert("Límite alcanzado", "Solo puedes marcar 3 acciones para el widget.");
      return;
    }

    await updateDoc(doc(db, `users/${user.uid}/preestablecidosSubs`, id), {
      widgetStarred: estado,
      updatedAt: new Date(),
    });
  };

  const eliminarPreestablecidoMain = async (id: string) => {
    if (!user?.uid) return;
    Alert.alert("Eliminar", "Se eliminará el principal y sus sub preestablecidos.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          const subs = preestablecidosSubs.filter((s) => s.mainId === id);
          await Promise.all(subs.map((s) => deleteDoc(doc(db, `users/${user.uid}/preestablecidosSubs`, s.id))));
          await deleteDoc(doc(db, `users/${user.uid}/preestablecidosMain`, id));
        },
      },
    ]);
  };

  const eliminarPreestablecidoSub = async (id: string) => {
    if (!user?.uid) return;
    Alert.alert("Eliminar", "¿Deseas eliminar este sub preestablecido?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          await deleteDoc(doc(db, `users/${user.uid}/preestablecidosSubs`, id));
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
                  ? "Preestablecidos"
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
                  ? "Preestablecidos"
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
              {mostrarNuevoPreestablecido ? "Cancelar" : "Nuevo principal"}
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
                onChangeText={setNuevoMainIcono}
                style={{ color: textColor, borderBottomColor: "#333", borderBottomWidth: 1, marginBottom: 12, paddingVertical: 4 }}
              />
              <TouchableOpacity onPress={agregarPreestablecidoMain} style={{ backgroundColor: "#6366f1", paddingVertical: 10, borderRadius: 12, alignItems: "center" }}>
                <ThemedText style={{ color: "#fff", fontWeight: "600" }}>Guardar principal</ThemedText>
              </TouchableOpacity>
            </Animated.View>
          )}

          {preestablecidosMain.length === 0 ? (
            <Text style={{ color: "#999", textAlign: "center", marginTop: 8 }}>
              Aún no hay principales. Crea uno para agregar acciones.
            </Text>
          ) : (
            preestablecidosMain.map((main) => {
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
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <TouchableOpacity onPress={() => setMainConNuevoSubId(mostrandoNuevoSub ? null : main.id)}>
                        <Text style={{ color: "#5c6bf2", fontWeight: "600" }}>
                          {mostrandoNuevoSub ? "Cerrar" : "Nueva acción"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => eliminarPreestablecidoMain(main.id)}>
                        <Text style={{ color: "#f87171", fontWeight: "600" }}>Eliminar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

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
                          style={[styles.tipoBtn, { backgroundColor: nuevoSubTipo === "ingreso" ? "#3edc81" : "#2a2a2a" }]}
                        >
                          <Text style={{ color: nuevoSubTipo === "ingreso" ? "black" : "white", fontWeight: "600" }}>Ingreso</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setNuevoSubTipo("egreso")}
                          style={[styles.tipoBtn, { backgroundColor: nuevoSubTipo === "egreso" ? "#ff6363" : "#2a2a2a" }]}
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
                        <Text style={{ color: "#999", fontSize: 12 }}>Este principal no tiene acciones todavía.</Text>
                      ) : (
                        subsMain.map((item) => (
                          <View key={item.id} style={{ backgroundColor: cardsMain, borderRadius: 10, padding: 10, marginBottom: 8 }}>
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
        </TouchableWithoutFeedback>
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