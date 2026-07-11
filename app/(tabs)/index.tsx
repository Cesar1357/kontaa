import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Haptics from 'expo-haptics';
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  Linking,
  NativeModules,
  Platform,
  StyleSheet,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';

import { StatusBar } from 'expo-status-bar';
import { sendEmailVerification, type User } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '../../config/firebase';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';

import BalanceHeader from '@/components/BalanceHeader';
import BudgetHeader from '@/components/BudgetHeader';
import CardComparativa from "@/components/ComparacionUsers";
import FugasGastoCard from '@/components/FugasGastoCard';
import HomeSectionsOrderModal, { HOME_SECTIONS_CONFIG_DEFAULT, type HomeSectionConfig, type HomeSectionKey } from '@/components/HomeSectionsOrderModal';
import MetaMensualCard from '@/components/MetaMensualCard';
import NuevaTransaccionModal from "@/components/NuevaTransaccionModal";
import ProximosRecurrentesCard from '@/components/ProximosRecurrentesCard';
import QuickAccessPanel from '@/components/QuickAccessPanel';
import ResumenRapido from '@/components/ResumenRapido';
import RiesgoPresupuestoCard from '@/components/RiesgoPresupuestoCard';
import SaludFinancieraCard from '@/components/SaludFinancieraCard';


const HOME_SECTIONS_DEFAULT: HomeSectionKey[] = [
  'quick-access',
  'weekly',
  'health',
  'upcoming',
  'budget-risk',
  'leaks',
  'goal',
  'budget',
  'summary',
  'compare',
];

const ONBOARDING_STEPS = [
  {
    icon: 'sparkles-outline' as const,
    title: 'Bienvenido a Konta',
    description: 'Te ayudamos a registrar ingresos, egresos y metas de ahorro sin complicarte.',
  },
  {
    icon: 'flash-outline' as const,
    title: 'Accesos rapidos y widgets',
    description: 'Crea acciones frecuentes para registrar movimientos en un toque desde Inicio o desde tus widgets.',
  },
  {
    icon: 'wallet-outline' as const,
    title: 'Presupuestos y control',
    description: 'Asocia gastos a categorias para ver cuanto llevas y mantenerte dentro de tus limites.',
  },
  {
    icon: 'bar-chart-outline' as const,
    title: 'Historial y progreso',
    description: 'Revisa tendencias, filtra periodos y sigue tu racha para mejorar tus habitos financieros.',
  },
  {
    icon: 'school-outline' as const,
    title: 'Sobre el creador',
    description: 'Me presento, mi nombre es César Alnair, tengo 18 años y estoy por entrar a la universidad. Empecé esta app para poder tener control sobre mis finanzas. Pero ahora quiero que todos puedan beneficiarse. Tu apoyo me ayudaría muchísimo a mi economía, y a cambio, prometo traer actualizaciones de vez en cuando.',
  },
  {
    icon: 'heart-outline' as const,
    title: 'Suscripcion de apoyo',
    description: 'Todas las suscripciones tienen los mismos beneficios. Sin suscripcion, funciones personalizadas quedan limitadas a 2 elementos.',
  },
];




export default function Inicio() {
  const cardMainColor = useThemeColor({light:'',dark:''},'cardMain');
  const textColor = useThemeColor({light:'',dark:''},'text');
  const primaryColor = useThemeColor({light:'',dark:''},'primary');
  const borderColor = useThemeColor({light:'',dark:''},'border');

  const [user, setUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [weeklySummary, setWeeklySummary] = useState({ ingresos: 0, gastos: 0, movimientos: 0, ahorro: 0 });
  const [streakInfo, setStreakInfo] = useState({ current: 0, longest: 0, message: 'Tu racha comienza hoy' });
  const [gamification, setGamification] = useState({
    badge: '🌱 Primer paso',
    level: 1,
    nextGoal: 3,
    progress: 0,
    weeklyTarget: 5,
    weeklyTargetMet: false,
    challengeMessage: 'Registra tu primer movimiento para empezar.',
  });
  const [celebrationVisible, setCelebrationVisible] = useState(false);
  const [celebrationMessage, setCelebrationMessage] = useState('');
  const [cardPulse, setCardPulse] = useState(false);
  const [isGamificationExpanded, setIsGamificationExpanded] = useState(true);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [preestablecidosRapidos, setPreestablecidosRapidos] = useState<any[]>([]);
  const [prefillTransaccion, setPrefillTransaccion] = useState<any | null>(null);
  const [quickActionTick, setQuickActionTick] = useState(0);
  const [quickAccessPromoDismissed, setQuickAccessPromoDismissed] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [homeSectionsConfig, setHomeSectionsConfig] = useState<HomeSectionConfig[]>(HOME_SECTIONS_CONFIG_DEFAULT);
  const [pendingWidgetAction, setPendingWidgetAction] = useState<any | null>(null);
  const [pendingOpenTransactionModal, setPendingOpenTransactionModal] = useState(false);
  const [showAddCreateWidgetPrompt, setShowAddCreateWidgetPrompt] = useState(false);
  const [showAddQuickActionsWidgetPrompt, setShowAddQuickActionsWidgetPrompt] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const handledWidgetActionRef = useRef<Set<string>>(new Set());

  const scrollY = useRef(new Animated.Value(0)).current;
  const celebrationAnim = useRef(new Animated.Value(0)).current;
  const cardPulseAnim = useRef(new Animated.Value(1)).current;
  const confettiAnims = useRef(Array.from({ length: 10 }, () => new Animated.Value(0))).current;
  const lastMilestoneRef = useRef<number | null>(null);
  const weeklyTargetSeenRef = useRef(false);

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 40],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      alignContent: "center",
    },
    celebrationOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 40,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(10, 12, 24, 0.22)',
    },
    celebrationCard: {
      paddingHorizontal: 22,
      paddingVertical: 24,
      borderRadius: 24,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.24,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
    },
  });

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((authenticatedUser) => {
      setUser(authenticatedUser || null);
      setAuthResolved(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!authResolved) return;

    const loadOnboarding = async () => {
      try {
        const storageScope = user?.uid || 'device';
        const key = `konta.onboarding.v1.${storageScope}`;
        const seen = await AsyncStorage.getItem(key);
        if (seen === 'true') return;

        setOnboardingStep(0);
        setShowOnboardingModal(true);
      } catch (error) {
        console.log('No se pudo cargar onboarding:', error);
      }
    };

    loadOnboarding();
  }, [authResolved, user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setSubscriptionActive(false);
      return;
    }

    const userRef = doc(db, 'users', user.uid);
    const unsub = onSnapshot(userRef, (snap) => {
      const data = snap.data() || {};
      const support = (data as any).supportSubscription;
      setSubscriptionActive(Boolean(support?.active));
    });

    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    const loadGamificationPreference = async () => {
      try {
        const saved = await AsyncStorage.getItem('konta.gamification.expanded');
        if (saved !== null) {
          setIsGamificationExpanded(saved === 'true');
        }
      } catch (error) {
        console.log('No se pudo cargar la preferencia del bloque:', error);
      }
    };

    loadGamificationPreference();
  }, []);

  useEffect(() => {
    const checkForUpdate = async () => {
      try {
        const kontaRef = doc(db, 'general', "konta");
        const kontaSnap = await getDoc(kontaRef);
        const kontaData = kontaSnap.data();

        const installedVersion = Application.nativeApplicationVersion || '0.0.0';

        console.log('Versión instalada:', installedVersion, 'Versión Play Store:', kontaData?.version);
        if (installedVersion < kontaData?.version) {
          setUpdateAvailable(true);
        }
      } catch (error) {
        console.log('No se pudo verificar la actualización:', error);
      }
    };

    checkForUpdate();
  }, []);

  useEffect(() => {
    if (!user?.uid) return;

    const ref = collection(db, 'users', user.uid, 'preestablecidosSubs');
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const rapidosOrdenados = data
        .filter((item: any) => item.accesoRapido)
        .sort((a: any, b: any) => {
          const starsDiff = Number(Boolean(b.widgetStarred)) - Number(Boolean(a.widgetStarred));
          if (starsDiff !== 0) return starsDiff;

          const aTime = (a.updatedAt?.seconds || a.createdAt?.seconds || 0) as number;
          const bTime = (b.updatedAt?.seconds || b.createdAt?.seconds || 0) as number;
          return bTime - aTime;
        });

      setPreestablecidosRapidos(rapidosOrdenados);
    });

    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    const loadPromoPreference = async () => {
      try {
        const key = `konta.quickAccessPromo.dismissed.${user.uid}`;
        const dismissed = await AsyncStorage.getItem(key);
        setQuickAccessPromoDismissed(dismissed === 'true');
      } catch (error) {
        console.log('No se pudo cargar la preferencia del anuncio de accesos rápidos:', error);
      }
    };

    loadPromoPreference();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setShowAddCreateWidgetPrompt(false);
      return;
    }

    const loadCreateWidgetPromptPreference = async () => {
      try {
        const key = `konta.widget.createPrompt.choice.${user.uid}`;
        const savedChoice = await AsyncStorage.getItem(key);
        setShowAddCreateWidgetPrompt(savedChoice === null);
      } catch (error) {
        console.log('No se pudo cargar la preferencia del widget de crear transaccion:', error);
      }
    };

    loadCreateWidgetPromptPreference();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setShowAddQuickActionsWidgetPrompt(false);
      return;
    }

    const loadQuickActionsWidgetPromptPreference = async () => {
      try {
        const key = `konta.widget.quickActionsPrompt.choice.${user.uid}`;
        const savedChoice = await AsyncStorage.getItem(key);
        setShowAddQuickActionsWidgetPrompt(savedChoice === null && preestablecidosRapidos.length > 0);
      } catch (error) {
        console.log('No se pudo cargar la preferencia del widget de accesos rapidos:', error);
      }
    };

    loadQuickActionsWidgetPromptPreference();
  }, [user?.uid, preestablecidosRapidos.length]);

  useEffect(() => {
    if (!user?.uid) return;

    const loadHomeConfig = async () => {
      try {
        const key = `konta.home.sectionsConfig.${user.uid}`;
        const raw = await AsyncStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw) as HomeSectionConfig[];
          const filtered = parsed.filter((item) => HOME_SECTIONS_DEFAULT.includes(item.key));
          const missing = HOME_SECTIONS_DEFAULT
            .filter((keyItem) => !filtered.some((item) => item.key === keyItem))
            .map((keyItem) => ({ key: keyItem, visible: true }));
          setHomeSectionsConfig([...filtered, ...missing]);
          return;
        }

        // Migracion desde el formato anterior solo-de-orden.
        const oldKey = `konta.home.sectionsOrder.${user.uid}`;
        const oldRaw = await AsyncStorage.getItem(oldKey);
        if (oldRaw) {
          const oldOrder = JSON.parse(oldRaw) as HomeSectionKey[];
          const filteredOld = oldOrder.filter((item) => HOME_SECTIONS_DEFAULT.includes(item));
          const missingOld = HOME_SECTIONS_DEFAULT.filter((item) => !filteredOld.includes(item));
          const merged = [...filteredOld, ...missingOld].map((keyItem) => ({ key: keyItem, visible: true }));
          setHomeSectionsConfig(merged);
        }
      } catch (error) {
        console.log('No se pudo cargar la configuracion del inicio:', error);
      }
    };

    loadHomeConfig();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    const persistHomeConfig = async () => {
      try {
        const key = `konta.home.sectionsConfig.${user.uid}`;
        await AsyncStorage.setItem(key, JSON.stringify(homeSectionsConfig));
      } catch (error) {
        console.log('No se pudo guardar la configuracion del inicio:', error);
      }
    };

    persistHomeConfig();
  }, [homeSectionsConfig, user?.uid]);

  const toggleGamification = async () => {
    const nextValue = !isGamificationExpanded;
    setIsGamificationExpanded(nextValue);
    try {
      await AsyncStorage.setItem('konta.gamification.expanded', String(nextValue));
    } catch (error) {
      console.log('No se pudo guardar la preferencia del bloque:', error);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value);

  const handleOpenPlayStore = async () => {
    try {
      await Linking.openURL('market://details?id=com.cesar1357.konta');
    } catch (error) {
      try {
        await Linking.openURL('https://play.google.com/store/apps/details?id=com.cesar1357.konta');
      } catch (secondaryError) {
        console.log('No se pudo abrir la Play Store:', secondaryError);
      }
    }
  };

  const registrarDesdePreestablecido = async (item: any) => {
    if (!user?.uid) return;
    try {
      await addDoc(collection(db, 'users', user.uid, 'transacciones'), {
        descripcion: item.nombre || 'Movimiento rápido',
        monto: Number(item.montoDefault || 0),
        tipo: item.tipo,
        fecha: new Date(),
        presupuestoCategoria: item.presupuestoCategoria || null,
        preestablecidoMainId: item.mainId || null,
        preestablecidoMainNombre: item.mainNombre || null,
        preestablecidoSubId: item.id || null,
        preestablecidoSubNombre: item.nombre || null,
      });
      setQuickActionTick((prev) => prev + 1);
      ToastAndroid.show('Movimiento rápido registrado', ToastAndroid.SHORT);
    } catch (error) {
      console.log('No se pudo registrar el acceso rápido:', error);
    }
  };

  const ejecutarWidgetAction = async (action: any) => {
    if (!action || !user?.uid) return;

    const uniqueKey = `${action.subId || action.subNombre || action.descripcion || 'widget'}-${action.token || ''}`;
    if (handledWidgetActionRef.current.has(uniqueKey)) return;
    handledWidgetActionRef.current.add(uniqueKey);

    try {
      await addDoc(collection(db, 'users', user.uid, 'transacciones'), {
        descripcion: action.subNombre || action.descripcion || 'Movimiento widget',
        monto: Number(action.monto || 0),
        tipo: action.tipo === 'egreso' ? 'egreso' : 'ingreso',
        fecha: new Date(),
        presupuestoCategoria: action.presupuestoCategoria || null,
        preestablecidoMainId: action.mainId || null,
        preestablecidoMainNombre: action.mainNombre || null,
        preestablecidoSubId: action.subId || null,
        preestablecidoSubNombre: action.subNombre || null,
      });
      setQuickActionTick((prev) => prev + 1);
      ToastAndroid.show('Movimiento del widget registrado', ToastAndroid.SHORT);
    } catch (error) {
      console.log('No se pudo ejecutar la accion del widget:', error);
    }
  };

  const parseWidgetActionFromUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      const isLegacyWidgetRoute = url.startsWith('konta://widget-action');
      const isRootWidgetRoute = parsed.searchParams.get('widgetAction') === '1';
      if (!isLegacyWidgetRoute && !isRootWidgetRoute) return null;

      const tipo = parsed.searchParams.get('tipo') || 'ingreso';
      const monto = Number(parsed.searchParams.get('monto') || '0');
      const subNombre = decodeURIComponent(parsed.searchParams.get('subNombre') || '');
      const subId = decodeURIComponent(parsed.searchParams.get('subId') || '');
      const mainId = decodeURIComponent(parsed.searchParams.get('mainId') || '');
      const mainNombre = decodeURIComponent(parsed.searchParams.get('mainNombre') || '');
      const presupuestoCategoria = decodeURIComponent(parsed.searchParams.get('presupuestoCategoria') || '');
      const token = parsed.searchParams.get('token') || `${Date.now()}`;

      if (!monto || monto <= 0) return null;

      return { tipo, monto, subNombre, subId, mainId, mainNombre, presupuestoCategoria, token };
    } catch (error) {
      return null;
    }
  };

  const shouldOpenCreateTransactionFromUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      const isLegacyCreateRoute = url.startsWith('konta://widget-new-transaction');
      const isRootCreateRoute = parsed.searchParams.get('newTransaction') === '1';
      return isLegacyCreateRoute || isRootCreateRoute;
    } catch (error) {
      return url.includes('newTransaction=1') || url.startsWith('konta://widget-new-transaction');
    }
  };

  const setCreateWidgetPromptChoice = async (choice: 'added' | 'dismissed') => {
    if (!user?.uid) return;

    try {
      const key = `konta.widget.createPrompt.choice.${user.uid}`;
      await AsyncStorage.setItem(key, choice);
    } catch (error) {
      console.log('No se pudo guardar la preferencia del widget de crear transaccion:', error);
    }
  };

  const handleDismissCreateWidgetPrompt = async () => {
    await setCreateWidgetPromptChoice('dismissed');
    setShowAddCreateWidgetPrompt(false);
  };

  const handleAddCreateWidget = async () => {
    try {
      const widgetModule = NativeModules.KontaWidgetModule;
      if (Platform.OS === 'android' && widgetModule?.requestPinNewTransactionWidget) {
        const requested = await widgetModule.requestPinNewTransactionWidget();
        if (!requested) {
          ToastAndroid.show('No se pudo abrir el selector de widgets en este dispositivo', ToastAndroid.SHORT);
          return;
        }

        await setCreateWidgetPromptChoice('added');
        setShowAddCreateWidgetPrompt(false);
        ToastAndroid.show('Listo. Elige donde quieres colocar el widget +', ToastAndroid.SHORT);
        return;
      }

      ToastAndroid.show('Esta opcion solo esta disponible en Android', ToastAndroid.SHORT);
    } catch (error) {
      console.log('No se pudo solicitar el widget de crear transaccion:', error);
      ToastAndroid.show('No se pudo abrir el selector de widgets', ToastAndroid.SHORT);
    }
  };

  const setQuickActionsWidgetPromptChoice = async (choice: 'added' | 'dismissed') => {
    if (!user?.uid) return;

    try {
      const key = `konta.widget.quickActionsPrompt.choice.${user.uid}`;
      await AsyncStorage.setItem(key, choice);
    } catch (error) {
      console.log('No se pudo guardar la preferencia del widget de accesos rapidos:', error);
    }
  };

  const handleDismissQuickActionsWidgetPrompt = async () => {
    await setQuickActionsWidgetPromptChoice('dismissed');
    setShowAddQuickActionsWidgetPrompt(false);
  };

  const handleAddQuickActionsWidget = async () => {
    try {
      const widgetModule = NativeModules.KontaWidgetModule;
      if (Platform.OS === 'android' && widgetModule?.requestPinQuickActionsWidget) {
        const requested = await widgetModule.requestPinQuickActionsWidget();
        if (!requested) {
          ToastAndroid.show('No se pudo abrir el selector de widgets en este dispositivo', ToastAndroid.SHORT);
          return;
        }

        await setQuickActionsWidgetPromptChoice('added');
        setShowAddQuickActionsWidgetPrompt(false);
        ToastAndroid.show('Listo. Elige donde quieres colocar el widget de accesos rapidos', ToastAndroid.SHORT);
        return;
      }

      ToastAndroid.show('Esta opcion solo esta disponible en Android', ToastAndroid.SHORT);
    } catch (error) {
      console.log('No se pudo solicitar el widget de accesos rapidos:', error);
      ToastAndroid.show('No se pudo abrir el selector de widgets', ToastAndroid.SHORT);
    }
  };

  const persistOnboardingSeen = async () => {
    try {
      const storageScope = user?.uid || 'device';
      const key = `konta.onboarding.v1.${storageScope}`;
      await AsyncStorage.setItem(key, 'true');
    } catch (error) {
      console.log('No se pudo guardar onboarding:', error);
    }
  };

  const handleSkipOnboarding = async () => {
    await persistOnboardingSeen();
    setShowOnboardingModal(false);
    setOnboardingStep(0);
  };

  const handleNextOnboarding = async () => {
    if (onboardingStep >= ONBOARDING_STEPS.length - 1) {
      await persistOnboardingSeen();
      setShowOnboardingModal(false);
      setOnboardingStep(0);
      return;
    }

    setOnboardingStep((prev) => prev + 1);
  };

  const handlePrevOnboarding = () => {
    setOnboardingStep((prev) => Math.max(0, prev - 1));
  };

  const handleOpenSubscriptionSettings = async () => {
    await persistOnboardingSeen();
    setShowOnboardingModal(false);
    setOnboardingStep(0);
    router.push({ pathname: '/(screens)/Settings', params: { openSubscription: '1' } });
  };

  const handleOpenInstagram = async () => {
    try {
      await Linking.openURL('instagram://user?username=emperblack');
    } catch (error) {
      try {
        await Linking.openURL('https://www.instagram.com/emperblack/');
      } catch (fallbackError) {
        console.log('No se pudo abrir Instagram:', fallbackError);
      }
    }
  };

  const handleOpenOrderCustomization = () => {
    if (subscriptionActive) {
      setShowOrderModal(true);
      return;
    }

    Alert.alert(
      'Función Premium',
      'Personalizar el orden de Inicio está disponible con suscripción activa.',
      [
        { text: 'Ahora no', style: 'cancel' },
        {
          text: 'Ver suscripción',
          onPress: () => router.push({ pathname: '/(screens)/Settings', params: { openSubscription: '1' } }),
        },
      ],
    );
  };

  const handleSendVerificationEmail = async () => {
    if (!user) return;

    try {
      setSendingVerification(true);
      await user.reload();

      if (user.emailVerified) {
        await setDoc(
          doc(db, 'users', user.uid),
          {
            emailVerified: true,
            updatedAt: new Date(),
          },
          { merge: true },
        );

        if (Platform.OS === 'android') {
          ToastAndroid.showWithGravity('Tu correo ya está verificado.', ToastAndroid.SHORT, ToastAndroid.BOTTOM);
        }
        return;
      }

      await sendEmailVerification(user);
      if (Platform.OS === 'android') {
        ToastAndroid.showWithGravity('Te enviamos un correo de verificación.', ToastAndroid.SHORT, ToastAndroid.BOTTOM);
      }
    } catch (error) {
      console.log('No se pudo enviar verificación:', error);
    } finally {
      setSendingVerification(false);
    }
  };

  const dismissQuickAccessPromo = async () => {
    if (!user?.uid) return;

    try {
      const key = `konta.quickAccessPromo.dismissed.${user.uid}`;
      await AsyncStorage.setItem(key, 'true');
      setQuickAccessPromoDismissed(true);
    } catch (error) {
      console.log('No se pudo guardar la preferencia del anuncio de accesos rápidos:', error);
    }
  };

  const goToCreateQuickAccess = async () => {
    await dismissQuickAccessPromo();
    router.push({ pathname: '/(tabs)/PresupuestosScreen', params: { section: 'preestablecidos' } });
  };

  useEffect(() => {
    const handleIncomingUrl = (url: string) => {
      const shouldOpenCreate = shouldOpenCreateTransactionFromUrl(url);
      if (shouldOpenCreate) {
        if (user?.uid) {
          setPrefillTransaccion(null);
          setModalVisible(true);
        } else {
          setPendingOpenTransactionModal(true);
        }
        return;
      }

      const action = parseWidgetActionFromUrl(url);
      if (!action) return;

      if (user?.uid) {
        ejecutarWidgetAction(action);
      } else {
        setPendingWidgetAction(action);
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleIncomingUrl(url);
    });

    const subscription = Linking.addEventListener('url', ({ url }) => handleIncomingUrl(url));
    return () => subscription.remove();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || !pendingOpenTransactionModal) return;
    setPrefillTransaccion(null);
    setModalVisible(true);
    setPendingOpenTransactionModal(false);
  }, [user?.uid, pendingOpenTransactionModal]);

  useEffect(() => {
    if (!user?.uid || !pendingWidgetAction) return;
    ejecutarWidgetAction(pendingWidgetAction);
    setPendingWidgetAction(null);
  }, [user?.uid, pendingWidgetAction]);

  useEffect(() => {
    if (!user?.uid) return;

    const starred = preestablecidosRapidos.filter((item: any) => item.widgetStarred).slice(0, 3);
    const fallback = preestablecidosRapidos.slice(0, 3);
    const widgetActions = (starred.length > 0 ? starred : fallback).slice(0, 3).map((item: any) => ({
      tipo: item.tipo,
      monto: Number(item.montoDefault || 0),
      presupuestoCategoria: item.presupuestoCategoria || '',
      subNombre: item.nombre || '',
      subId: item.id || '',
      mainId: item.mainId || '',
      mainNombre: item.mainNombre || '',
      icono: item.icono || '⚡',
    }));

    let attempts = 0;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const publishQuickActions = () => {
      const widgetModule = NativeModules.KontaWidgetModule;
      if (widgetModule?.saveQuickActionsWidgetData) {
        widgetModule
          .saveQuickActionsWidgetData(JSON.stringify(widgetActions))
          .catch?.((error: any) => console.log('No se pudo actualizar acciones del widget:', error));
        return;
      }

      if (attempts < 6) {
        attempts += 1;
        retryTimeout = setTimeout(publishQuickActions, 350);
      }
    };

    publishQuickActions();

    return () => {
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [preestablecidosRapidos, user?.uid]);

  const openQuickInModal = (item: any) => {
    setPrefillTransaccion({
      descripcion: item.nombre || '',
      monto: Number(item.montoDefault || 0),
      tipo: item.tipo,
      preestablecidoMainId: item.mainId || null,
      preestablecidoMainNombre: item.mainNombre || null,
      preestablecidoSubId: item.id || null,
      preestablecidoSubNombre: item.nombre || null,
    });
    setModalVisible(true);
  };

  const renderHomeSection = (section: HomeSectionKey) => {
    if (section === 'quick-access') {
      return (
        <QuickAccessPanel
          quickActions={preestablecidosRapidos}
          quickAccessPromoDismissed={quickAccessPromoDismissed}
          primaryColor={primaryColor}
          borderColor={borderColor}
          textColor={textColor}
          onDismissPromo={dismissQuickAccessPromo}
          onCreatePress={goToCreateQuickAccess}
          onQuickPress={registrarDesdePreestablecido}
          onQuickLongPress={openQuickInModal}
        />
      );
    }

    if (section === 'weekly') {
      return (
        <Animated.View
          style={{
            width: '95%',
            borderRadius: 16,
            transform: [{ scale: cardPulseAnim }],
          }}
        >
          <ThemedView
            style={{
              width: '100%',
              borderRadius: 16,
              padding: 14,
              marginBottom: 12,
              marginTop: 12,
              borderWidth: 1,
              borderColor,
              backgroundColor: cardMainColor,
              shadowColor: '#000',
              shadowOpacity: 0.08,
              shadowOffset: { width: 0, height: 12 },
              shadowRadius: 22,
              elevation: 5,
            }}
          >
            <TouchableOpacity onPress={toggleGamification} activeOpacity={0.8}>
              <ThemedView style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isGamificationExpanded ? 8 : 0, backgroundColor: 'transparent' }}>
                <ThemedText style={{ fontSize: 16, fontWeight: '700' }}>Tu racha y resumen</ThemedText>
                <ThemedView style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: cardMainColor }}>
                  <ThemedText style={{ fontSize: 12, color: primaryColor, fontWeight: '600', marginRight: 6, backgroundColor: cardMainColor }}>
                    {streakInfo.current} días
                  </ThemedText>
                  <Ionicons name={isGamificationExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={primaryColor} />
                </ThemedView>
              </ThemedView>
            </TouchableOpacity>

            {isGamificationExpanded && (
              <>
                <ThemedView style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, backgroundColor: cardMainColor }}>
                  <Ionicons name="flame" size={20} color={primaryColor} />
                  <ThemedText style={{ marginLeft: 8, fontSize: 14, fontWeight: '600' }}>{streakInfo.message}</ThemedText>
                </ThemedView>

                <ThemedText style={{ fontSize: 12, marginBottom: 10, opacity: 0.8 }}>
                  Mejor racha: {streakInfo.longest} días · {weeklySummary.movimientos} movimientos esta semana
                </ThemedText>

                <ThemedView style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', backgroundColor: cardMainColor }}>
                  <ThemedView style={{ width: '48%', borderRadius: 12, padding: 10, marginBottom: 8, backgroundColor: `${primaryColor}12` }}>
                    <ThemedText style={{ fontSize: 12, opacity: 0.75 }}>Ingresos</ThemedText>
                    <ThemedText style={{ fontSize: 15, fontWeight: '700', marginTop: 4 }}>{formatCurrency(weeklySummary.ingresos)}</ThemedText>
                  </ThemedView>
                  <ThemedView style={{ width: '48%', borderRadius: 12, padding: 10, marginBottom: 8, backgroundColor: `${primaryColor}12` }}>
                    <ThemedText style={{ fontSize: 12, opacity: 0.75 }}>Gastos</ThemedText>
                    <ThemedText style={{ fontSize: 15, fontWeight: '700', marginTop: 4 }}>{formatCurrency(weeklySummary.gastos)}</ThemedText>
                  </ThemedView>
                </ThemedView>

                <ThemedText style={{ fontSize: 13, fontWeight: '600', marginTop: 2 }}>
                  {weeklySummary.ahorro >= 0
                    ? `Tu balance semanal va bien: ${formatCurrency(weeklySummary.ahorro)} a favor.`
                    : `Tu balance semanal está en negativo: ${formatCurrency(Math.abs(weeklySummary.ahorro))}.`}
                </ThemedText>

                <ThemedView
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 14,
                    backgroundColor: `${primaryColor}16`,
                    borderWidth: 1,
                    borderColor,
                  }}
                >
                  <ThemedView style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, backgroundColor: 'transparent' }}>
                    <ThemedText style={{ fontSize: 14, fontWeight: '700', paddingHorizontal: 6 }}>Modo juego</ThemedText>
                    <ThemedText style={{ fontSize: 12, fontWeight: '700', color: primaryColor, paddingHorizontal: 6 }}>
                      Nivel {gamification.level}
                    </ThemedText>
                  </ThemedView>

                  <ThemedText style={{ fontSize: 13, fontWeight: '600', marginBottom: 6 }}>
                    {gamification.badge}
                  </ThemedText>

                  <ThemedText style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
                    Próximo logro: {streakInfo.current}/{gamification.nextGoal} días
                  </ThemedText>

                  <ThemedView style={{ height: 8, borderRadius: 999, backgroundColor: `${primaryColor}22`, overflow: 'hidden' }}>
                    <ThemedView style={{ height: 8, width: `${Math.max(6, gamification.progress * 100)}%`, borderRadius: 999, backgroundColor: primaryColor }} />
                  </ThemedView>

                  <ThemedText style={{ fontSize: 12, marginTop: 8, fontWeight: '600' }}>
                    {gamification.challengeMessage}
                  </ThemedText>
                </ThemedView>
              </>
            )}
          </ThemedView>
        </Animated.View>
      );
    }

    if (section === 'health') return <SaludFinancieraCard />;
    if (section === 'upcoming') return <ProximosRecurrentesCard />;
    if (section === 'budget-risk') return <RiesgoPresupuestoCard />;
    if (section === 'leaks') return <FugasGastoCard />;
    if (section === 'goal') return <MetaMensualCard />;
    if (section === 'budget') return <BudgetHeader />;
    if (section === 'summary') return <ResumenRapido />;
    if (section === 'compare') return <CardComparativa />;
    return null;
  };

  useEffect(() => {
    if (!user?.uid) return;

    const loadWeeklyInsight = async () => {
      try {
        const today = new Date();
        const start = new Date(today);
        start.setDate(today.getDate() - 6);
        start.setHours(0, 0, 0, 0);

        const end = new Date(today);
        end.setHours(23, 59, 59, 999);

        const snap = await getDocs(collection(db, 'users', user.uid, 'transacciones'));
        const transacciones = snap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));

        const filtered = transacciones.filter((item: any) => {
          const fecha = item.fecha?.toDate ? item.fecha.toDate() : new Date(item.fecha || 0);
          return fecha >= start && fecha <= end;
        });

        const ingresos = filtered
          .filter((item: any) => item.tipo === 'ingreso')
          .reduce((sum: number, item: any) => sum + Number(item.monto || 0), 0);

        const gastos = filtered
          .filter((item: any) => item.tipo === 'egreso')
          .reduce((sum: number, item: any) => sum + Number(item.monto || 0), 0);

        const ahorro = ingresos - gastos;
        setWeeklySummary({
          ingresos,
          gastos,
          movimientos: filtered.length,
          ahorro,
        });

        const streakRef = doc(db, 'users', user.uid);
        const streakSnap = await getDoc(streakRef);
        const previous = streakSnap.data()?.streak || {};
        const todayKey = today.toISOString().slice(0, 10);
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const yesterdayKey = yesterday.toISOString().slice(0, 10);

        let nextCurrent = 1;
        if (previous.lastActiveDate === todayKey) {
          nextCurrent = Number(previous.current || 1);
        } else if (previous.lastActiveDate === yesterdayKey) {
          nextCurrent = Number(previous.current || 0) + 1;
        }

        const nextLongest = Math.max(Number(previous.longest || 0), nextCurrent);
        const nextMessage = nextCurrent >= 7
          ? `¡Racha de ${nextCurrent} días! Sigue así.`
          : nextCurrent >= 3
            ? `Racha de ${nextCurrent} días. Muy bien.`
            : 'Tu racha comienza hoy';

        const nextGoal = nextCurrent >= 7 ? 14 : nextCurrent >= 3 ? 7 : 3;
        const progress = Math.min(1, nextCurrent / nextGoal);
        const badge = nextCurrent >= 14
          ? '🏆 Máxima racha'
          : nextCurrent >= 7
            ? '🔥 Racha de fuego'
            : nextCurrent >= 3
              ? '⚡ En impulso'
              : '🌱 Primer paso';
        const weeklyTarget = 5;
        const weeklyTargetMet = filtered.length >= weeklyTarget;
        const challengeMessage = weeklyTargetMet
          ? `¡Perfecto! Alcanzaste ${filtered.length} movimientos esta semana.`
          : `Faltan ${weeklyTarget - filtered.length} movimientos para tu meta semanal.`;

        const milestoneReached = [3, 7, 14].includes(nextCurrent) && lastMilestoneRef.current !== nextCurrent;
        const weeklyGoalUnlocked = weeklyTargetMet && !weeklyTargetSeenRef.current;

        if (milestoneReached) {
          lastMilestoneRef.current = nextCurrent;
          setCelebrationMessage(`¡Logro desbloqueado! Racha de ${nextCurrent} días.`);
          setCelebrationVisible(true);
          setCardPulse(true);
          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (error) {
            console.log('No se pudo activar la vibración de logro:', error);
          }
        } else if (weeklyGoalUnlocked) {
          weeklyTargetSeenRef.current = true;
          setCelebrationMessage(`¡Meta semanal cumplida! ${filtered.length} movimientos.`);
          setCelebrationVisible(true);
          setCardPulse(true);
          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (error) {
            console.log('No se pudo activar la vibración de logro:', error);
          }
        }

        setStreakInfo({ current: nextCurrent, longest: nextLongest, message: nextMessage });
        setGamification({
          badge,
          level: Math.max(1, Math.floor((nextCurrent + nextLongest) / 2)),
          nextGoal,
          progress,
          weeklyTarget,
          weeklyTargetMet,
          challengeMessage,
        });

        try {
          const widgetModule = NativeModules.KontaWidgetModule;
          if (widgetModule?.saveWidgetData) {
            await widgetModule.saveWidgetData(nextCurrent, filtered.length, ahorro, nextMessage);
          }
        } catch (widgetError) {
          console.log('No se pudo actualizar el widget:', widgetError);
        }

        await setDoc(streakRef, { streak: { current: nextCurrent, longest: nextLongest, lastActiveDate: todayKey } }, { merge: true });
      } catch (error) {
        console.error('Error cargando resumen semanal:', error);
      }
    };

    loadWeeklyInsight();
  }, [user?.uid, modalVisible, quickActionTick]);

  useEffect(() => {
    if (!celebrationVisible) return;

    const confettiAnimations = confettiAnims.map((anim, index) =>
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 220,
          delay: index * 40,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 320,
          useNativeDriver: true,
        }),
      ])
    );

    Animated.parallel([
      Animated.sequence([
        Animated.timing(celebrationAnim, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(celebrationAnim, {
          toValue: 0,
          duration: 240,
          delay: 1400,
          useNativeDriver: true,
        }),
      ]),
      Animated.stagger(40, confettiAnimations),
    ]).start(() => setCelebrationVisible(false));
  }, [celebrationVisible, celebrationAnim]);

  useEffect(() => {
    if (!cardPulse) return;

    Animated.sequence([
      Animated.timing(cardPulseAnim, { toValue: 1.03, duration: 140, useNativeDriver: true }),
      Animated.timing(cardPulseAnim, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.timing(cardPulseAnim, { toValue: 1.03, duration: 140, useNativeDriver: true }),
      Animated.timing(cardPulseAnim, { toValue: 1, duration: 140, useNativeDriver: true }),
    ]).start(() => setCardPulse(false));
  }, [cardPulse, cardPulseAnim]);

  useEffect(() => {
    const backAction = () => { 
      if(modalVisible) {
        console.log("Modal is open, closing it");
        setModalVisible(false);
        console.log("Cerrando modal");
        return true;
      }
      console.log("Nada abierto");
      return false; // Permite el comportamiento por defecto (ir atrás)
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [modalVisible]);
  
  // 🔹 Detectar si el header ya desapareció (para deshabilitar el botón)
  useEffect(() => {
    const listener = scrollY.addListener(({ value }) => {
      setIsHeaderHidden(value > 90); // si el scroll pasa de 90, lo ocultamos
    });
    return () => scrollY.removeListener(listener);
  }, [scrollY]);


  return (
    <ThemedView style={styles.container}>
      <StatusBar style="auto" />

      {showOnboardingModal && (
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            zIndex: 60,
            backgroundColor: 'rgba(6, 8, 20, 0.64)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 16,
          }}
        >
          <ThemedView
            style={{
              width: '100%',
              maxWidth: 420,
              borderRadius: 22,
              padding: 18,
              borderWidth: 1,
              borderColor: `${primaryColor}35`,
              backgroundColor: cardMainColor,
              shadowColor: '#000',
              shadowOpacity: 0.2,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 10 },
              elevation: 12,
            }}
          >
            <ThemedView style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'transparent' }}>
              <ThemedText style={{ fontSize: 12, fontWeight: '700', opacity: 0.8 }}>
                Recorrido rapido
              </ThemedText>
              <TouchableOpacity onPress={handleSkipOnboarding} style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
                <ThemedText style={{ fontSize: 12, fontWeight: '700', color: '#94a3b8' }}>Omitir</ThemedText>
              </TouchableOpacity>
            </ThemedView>

            <ThemedView
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 10,
                marginBottom: 10,
                backgroundColor: `${primaryColor}20`,
                borderWidth: 1,
                borderColor: `${primaryColor}55`,
              }}
            >
              <Ionicons name={ONBOARDING_STEPS[onboardingStep].icon} size={28} color={primaryColor} />
            </ThemedView>

            <ThemedText style={{ fontSize: 20, fontWeight: '800', marginBottom: 8 }}>
              {ONBOARDING_STEPS[onboardingStep].title}
            </ThemedText>
            <ThemedText style={{ fontSize: 13, opacity: 0.86, lineHeight: 20 }}>
              {ONBOARDING_STEPS[onboardingStep].description}
            </ThemedText>

            {ONBOARDING_STEPS[onboardingStep].title === 'Sobre el creador' && (
              <TouchableOpacity
                onPress={handleOpenInstagram}
                style={{
                  marginTop: 14,
                  borderRadius: 12,
                  paddingVertical: 11,
                  paddingHorizontal: 14,
                  backgroundColor: '#E1306C',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="logo-instagram" size={18} color="#fff" />
                <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 12, marginLeft: 8 }}>
                  @emperblack
                </ThemedText>
              </TouchableOpacity>
            )}

            {onboardingStep === ONBOARDING_STEPS.length - 1 && (
              <ThemedView style={{ marginTop: 12, marginBottom: 6, backgroundColor: 'transparent' }}>
                <ThemedText style={{ fontSize: 11, opacity: 0.75, marginBottom: 8 }}>
                  La suscripción y su estado se gestionan directamente con Google Play desde Ajustes.
                </ThemedText>

                <TouchableOpacity
                  disabled={subscriptionActive}
                  onPress={handleOpenSubscriptionSettings}
                  style={{
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    backgroundColor: subscriptionActive ? '#16a34a' : primaryColor,
                    marginBottom: 8,
                  }}
                >
                  <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                    {subscriptionActive ? 'Suscripción activa' : 'Ir a Google Play en Ajustes'}
                  </ThemedText>
                </TouchableOpacity>
              </ThemedView>
            )}

            <ThemedView style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 14, backgroundColor: 'transparent' }}>
              {ONBOARDING_STEPS.map((_, index) => (
                <View
                  key={`dot-${index}`}
                  style={{
                    width: onboardingStep === index ? 20 : 8,
                    height: 8,
                    borderRadius: 99,
                    marginRight: 6,
                    backgroundColor: onboardingStep === index ? primaryColor : `${primaryColor}35`,
                  }}
                />
              ))}
            </ThemedView>

            <ThemedView style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'transparent' }}>
              <TouchableOpacity
                disabled={onboardingStep === 0}
                onPress={handlePrevOnboarding}
                style={{
                  borderRadius: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderWidth: 1,
                  borderColor: `${primaryColor}45`,
                  opacity: onboardingStep === 0 ? 0.4 : 1,
                }}
              >
                <ThemedText style={{ fontWeight: '700', fontSize: 12 }}>Atras</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleNextOnboarding}
                style={{
                  borderRadius: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  backgroundColor: primaryColor,
                }}
              >
                <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                  {onboardingStep === ONBOARDING_STEPS.length - 1 ? 'Más tarde' : 'Siguiente'}
                </ThemedText>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        </View>
      )}

      {celebrationVisible && (
        <Animated.View pointerEvents="none" style={styles.celebrationOverlay}>
          <Animated.View
            style={{
              opacity: celebrationAnim,
              transform: [
                { scale: celebrationAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
                { rotate: celebrationAnim.interpolate({ inputRange: [0, 1], outputRange: ['-2deg', '2deg'] }) },
              ],
            }}
          >
            <ThemedView style={styles.celebrationCard}>
              {confettiAnims.map((anim, index) => {
                const left = (index % 5) * 18 + 8;
                const top = index * 8 + 4;
                return (
                  <Animated.View
                    key={index}
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left,
                      top,
                      opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
                      transform: [
                        { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) },
                        { rotate: anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) },
                      ],
                    }}
                  >
                    <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: ['#f59e0b', '#5c6bf2', '#10b981', '#ec4899', '#f43f5e'][index % 5] }} />
                  </Animated.View>
                );
              })}
              <ThemedText style={{ fontSize: 28, fontWeight: '800', marginBottom: 6 }}>🎉</ThemedText>
              <ThemedText style={{ fontSize: 18, fontWeight: '700', textAlign: 'center' }}>
                {celebrationMessage}
              </ThemedText>
              <ThemedText style={{ fontSize: 13, opacity: 0.8, marginTop: 6, textAlign: 'center' }}>
                Sigue así, tu próxima meta ya está cerca.
              </ThemedText>
            </ThemedView>
          </Animated.View>
        </Animated.View>
      )}

      {/* 🔹 HEADER animado */}
      <Animated.View
        style={{
          marginLeft: 10,
          marginTop: 80,
          alignSelf: "flex-start",
          zIndex: 10,
          justifyContent: "space-between",
          flexDirection: "row",
          width: "94%",
          opacity: headerOpacity,
        }}
      >
        <ThemedText
          style={{
            fontSize: 30,
            fontWeight: "800",
            alignSelf: "flex-start",
            padding: 5,
          }}
        >
          Hola {user ? user.displayName : "Usuario"}
        </ThemedText>

        <TouchableOpacity
          disabled={isHeaderHidden}
          onPress={() => router.push("/(screens)/Settings")}
          style={{
            bottom: 5,
          }}
        >
          <Ionicons name="settings" size={27} color={textColor} />
        </TouchableOpacity>
      </Animated.View>

      {/* 🔹 ScrollView animado */}
      <Animated.ScrollView
        style={{ width: "100%", zIndex: 9, marginTop: -80 }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        <ThemedView
          style={{
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 10,
            marginTop: 100,
            justifyContent: "space-between",
            backgroundColor: cardMainColor,
            alignContent: "center",
            alignItems: "center",
          }}
        >
          {updateAvailable && (
            <ThemedView
              style={{
                width: '95%',
                borderRadius: 16,
                padding: 14,
                marginTop: 12,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: `${primaryColor}40`,
                backgroundColor: `${primaryColor}14`,
              }}
            >
              <ThemedView style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, backgroundColor: 'transparent' }}>
                <Ionicons name="cloud-download-outline" size={18} color={primaryColor} />
                <ThemedText style={{ marginLeft: 8, fontSize: 15, fontWeight: '700' }}>
                  Hay una actualización disponible
                </ThemedText>
              </ThemedView>
              <ThemedText style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>
                Actualiza la app para disfrutar de las últimas mejoras y correcciones.
              </ThemedText>
              <TouchableOpacity
                onPress={handleOpenPlayStore}
                style={{ backgroundColor: primaryColor, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, alignSelf: 'flex-start' }}
              >
                <ThemedText style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                  Actualizar ahora
                </ThemedText>
              </TouchableOpacity>
            </ThemedView>
          )}

          {user && !user.emailVerified && (
            <ThemedView
              style={{
                width: '95%',
                borderRadius: 16,
                padding: 14,
                marginTop: 12,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: `${primaryColor}40`,
                backgroundColor: `${primaryColor}12`,
              }}
            >
              <ThemedText style={{ fontSize: 15, fontWeight: '700', marginBottom: 4 }}>
                Verifica tu correo
              </ThemedText>
              <ThemedText style={{ fontSize: 12, opacity: 0.82, marginBottom: 10 }}>
                Para proteger tu cuenta y tus suscripciones, confirma tu correo electrónico.
              </ThemedText>
              <TouchableOpacity
                onPress={handleSendVerificationEmail}
                disabled={sendingVerification}
                style={{
                  backgroundColor: primaryColor,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  alignSelf: 'flex-start',
                  opacity: sendingVerification ? 0.75 : 1,
                }}
              >
                <ThemedText style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                  {sendingVerification ? 'Enviando...' : 'Enviar verificación'}
                </ThemedText>
              </TouchableOpacity>
            </ThemedView>
          )}

          {showAddCreateWidgetPrompt && (
            <ThemedView
              style={{
                width: '95%',
                borderRadius: 16,
                padding: 14,
                marginTop: 12,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: `${primaryColor}40`,
                backgroundColor: `${primaryColor}12`,
              }}
            >
              <ThemedText style={{ fontSize: 15, fontWeight: '700', marginBottom: 4 }}>
                Agrega el widget de nueva transaccion
              </ThemedText>
              <ThemedText style={{ fontSize: 12, opacity: 0.82, marginBottom: 10 }}>
                Toca + en tu pantalla principal y abriremos directo el modal para registrar un movimiento.
              </ThemedText>
              <ThemedView style={{ flexDirection: 'row', justifyContent: 'flex-end', backgroundColor: 'transparent' }}>
                <TouchableOpacity
                  onPress={handleDismissCreateWidgetPrompt}
                  style={{
                    borderRadius: 8,
                    paddingVertical: 9,
                    paddingHorizontal: 12,
                    borderWidth: 1,
                    borderColor: `${primaryColor}45`,
                    marginRight: 8,
                  }}
                >
                  <ThemedText style={{ fontSize: 12, fontWeight: '700' }}>Cerrar</ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleAddCreateWidget}
                  style={{
                    backgroundColor: primaryColor,
                    borderRadius: 8,
                    paddingVertical: 9,
                    paddingHorizontal: 12,
                  }}
                >
                  <ThemedText style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Agregar widget</ThemedText>
                </TouchableOpacity>
              </ThemedView>
            </ThemedView>
          )}

          {showAddQuickActionsWidgetPrompt && (
            <ThemedView
              style={{
                width: '95%',
                borderRadius: 16,
                padding: 14,
                marginTop: 12,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: `${primaryColor}40`,
                backgroundColor: `${primaryColor}10`,
              }}
            >
              <ThemedText style={{ fontSize: 15, fontWeight: '700', marginBottom: 4 }}>
                Agrega tu widget de accesos rapidos
              </ThemedText>
              <ThemedText style={{ fontSize: 12, opacity: 0.82, marginBottom: 10 }}>
                Ya creaste tu primera accion rapida. Puedes ponerla en tu pantalla principal para registrar en un toque.
              </ThemedText>
              <ThemedView style={{ flexDirection: 'row', justifyContent: 'flex-end', backgroundColor: 'transparent' }}>
                <TouchableOpacity
                  onPress={handleDismissQuickActionsWidgetPrompt}
                  style={{
                    borderRadius: 8,
                    paddingVertical: 9,
                    paddingHorizontal: 12,
                    borderWidth: 1,
                    borderColor: `${primaryColor}45`,
                    marginRight: 8,
                  }}
                >
                  <ThemedText style={{ fontSize: 12, fontWeight: '700' }}>Cerrar</ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleAddQuickActionsWidget}
                  style={{
                    backgroundColor: primaryColor,
                    borderRadius: 8,
                    paddingVertical: 9,
                    paddingHorizontal: 12,
                  }}
                >
                  <ThemedText style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Agregar widget</ThemedText>
                </TouchableOpacity>
              </ThemedView>
            </ThemedView>
          )}

          <BalanceHeader />
          <TouchableOpacity
            onPress={handleOpenOrderCustomization}
            style={{
              alignSelf: 'flex-end',
              marginRight: 10,
              marginTop: 6,
              marginBottom: 2,
              backgroundColor: subscriptionActive ? `${primaryColor}18` : `${primaryColor}12`,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderWidth: 1,
              borderColor: subscriptionActive ? `${primaryColor}35` : `${primaryColor}25`,
            }}
          >
            <ThemedText style={{ fontSize: 12, fontWeight: '700', opacity: subscriptionActive ? 1 : 0.8 }}>
              {subscriptionActive ? 'Personalizar orden' : 'Personalizar orden • Suscripción'}
            </ThemedText>
          </TouchableOpacity>

          {homeSectionsConfig.filter((item) => item.visible).map((item) => (
            <React.Fragment key={item.key}>{renderHomeSection(item.key)}</React.Fragment>
          ))}

          {/* Quick access permanece visible si hay promo pendiente aunque el usuario oculto la seccion */}
          {!homeSectionsConfig.some((item) => item.key === 'quick-access' && item.visible) && preestablecidosRapidos.length === 0 && !quickAccessPromoDismissed && (
            <React.Fragment key="quick-access-promo-fallback">{renderHomeSection('quick-access')}</React.Fragment>
          )}

          <ThemedView style={{ height: 50 }} />
        </ThemedView>
      </Animated.ScrollView>

      <HomeSectionsOrderModal
        visible={showOrderModal && subscriptionActive}
        sections={homeSectionsConfig}
        onClose={() => setShowOrderModal(false)}
        onChangeSections={setHomeSectionsConfig}
      />

      {/* 🔹 Botón flotante */}
      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        style={{
          position: "absolute",
          zIndex: 20,
          bottom: 30,
          right: 20,
          backgroundColor: "#5c6bf2",
          borderRadius: 28,
          width: 56,
          height: 56,
          justifyContent: "center",
          alignItems: "center",
          shadowColor: "#000",
          shadowOpacity: 0.3,
          shadowOffset: { width: 0, height: 3 },
          shadowRadius: 6,
          elevation: 8,

        }}
      >
        <Ionicons name="add" size={30} color="white" />
      </TouchableOpacity>

      <NuevaTransaccionModal
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          setPrefillTransaccion(null);
        }}
        userId={user?.uid ?? ""}
        initialData={prefillTransaccion}
        onSaved={() => {
          if (user?.uid) {
            setWeeklySummary((prev) => ({ ...prev, movimientos: prev.movimientos + 1 }));
          }
        }}
      />
    </ThemedView>
  );
}
