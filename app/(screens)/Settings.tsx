import { NotificationTestPanel } from '@/components/NotificationTestPanel';
import { ThemedText } from '@/components/ThemedText';
import { useAppTheme } from '@/hooks/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal } from '@gorhom/bottom-sheet';
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { router, useLocalSearchParams } from 'expo-router';
import { sendEmailVerification, signOut, updateProfile } from "firebase/auth";
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { httpsCallableFromURL } from 'firebase/functions';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View
} from 'react-native';
import { Icon } from 'react-native-elements';
import {
  endConnection,
  finishTransaction,
  getAvailablePurchases,
  getSubscriptions,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestSubscription,
  type Purchase,
  type Subscription,
} from 'react-native-iap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db, functions as firebaseFunctions } from '../../config/firebase';

type SettingsModal = 'profile' | 'editProfile' | 'security' | 'notifications' | 'theme' | 'subscription' | 'suggestions' | null;

interface SettingOption {
  id: string;
  title: string;
  icon: string;
  onPress: () => void;
  description?: string;
}

interface SupportPlan {
  amount: number;
  offerToken: string;
  basePlanId: string | null;
  formattedPrice: string | null;
}

export default function Settings() {
  const params = useLocalSearchParams<{ openSubscription?: string }>();
  const { uid, loading, displayname, correo, metadata, user, emailVerified } = useAuth();
  const { themeMode, setThemeMode } = useAppTheme();
  
  // State Management
  const [activeModal, setActiveModal] = useState<SettingsModal>(null);
  const [newName, setNewName] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [localAuthEnabled, setLocalAuthEnabled] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [isTextVisible, setIsTextVisible] = useState(false);
  const [subscriptionData, setSubscriptionData] = useState<any>(null);
  const [selectedSupportAmount, setSelectedSupportAmount] = useState<number | 'custom'>(10);
  const [customSupportAmount, setCustomSupportAmount] = useState('');
  const [processingSubscription, setProcessingSubscription] = useState(false);
  const [iapReady, setIapReady] = useState(false);
  const [availableSubscriptions, setAvailableSubscriptions] = useState<Subscription[]>([]);
  const [syncingPlay, setSyncingPlay] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [suggestionText, setSuggestionText] = useState('');
  const [sendingSuggestion, setSendingSuggestion] = useState(false);
  const [showSubscriptionThanks, setShowSubscriptionThanks] = useState(false);
  const [lastSubscribedAmount, setLastSubscribedAmount] = useState<number | null>(null);

  // Modal References
  const modalRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['50%', '100%'], []);

  // Theme Colors
  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const backgroundColor = useThemeColor({ light: '', dark: '' }, 'background2');
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');
  const borderColor = useThemeColor({ light: '', dark: '' }, 'border');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');
  const themeBg = useThemeColor({ light: '', dark: '' }, 'transaccionModal');

  const verifyPlaySubscriptionCallable = useMemo(
  () => httpsCallableFromURL(firebaseFunctions, 'https://verifyplaysubscription-bzkc3rrioq-uc.a.run.app'),
  []
);

  const PLAY_PACKAGE = 'com.cesar1357.konta';
  const SUBSCRIPTION_PRODUCT_ID = 'konta_support';
  const supportedSkus = [SUBSCRIPTION_PRODUCT_ID];
  const openSubscriptionFromParamsHandledRef = useRef(false);
  const pendingPurchaseAmountRef = useRef<number | null>(null);
  const purchaseFlowActiveRef = useRef(false);
  const processedPurchaseKeyRef = useRef<string | null>(null);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const getAuthenticatedUserForSubscription = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || !uid || currentUser.uid !== uid) {
      return null;
    }

    // Fuerza token fresco para evitar `unauthenticated` intermitente en callable.
    await currentUser.getIdToken(true);
    return currentUser;
  };

  // Lifecycle Hooks
  const verifySubscriptionOnServer = async (purchaseToken: string | null | undefined) => {
    if (!uid || !purchaseToken) {
      return { ok: false, reason: 'missing_input' as const };
    }

    const currentUser = await getAuthenticatedUserForSubscription();
    if (!currentUser) {
      console.warn('Skipping server-side verification: auth session is not ready or does not match uid');
      return { ok: false, reason: 'auth_not_ready' as const };
    }

    try {
      const result = await verifyPlaySubscriptionCallable({
        purchaseToken,
        packageName: PLAY_PACKAGE,
      });
      return { ok: true, reason: 'verified' as const, data: result?.data || null };
    } catch (error) {
      const code = (error as { code?: string })?.code || '';
      if (code === 'functions/unauthenticated') {
        // Reintento corto por carrera de sesión al cambiar de cuenta.
        try {
          await sleep(800);
          await currentUser.getIdToken(true);
          const retry = await verifyPlaySubscriptionCallable({
            purchaseToken,
            packageName: PLAY_PACKAGE,
          });
          return { ok: true, reason: 'verified' as const, data: retry?.data || null };
        } catch (retryError) {
          console.error('Server-side subscription verification retry failed:', retryError);
          return { ok: false, reason: 'call_failed' as const };
        }
      }
      console.error('Server-side subscription verification failed:', error);
      return { ok: false, reason: 'call_failed' as const };
    }
  };

  useEffect(() => {
    const backAction = () => {
      if (activeModal) {
        modalRef.current?.dismiss();
        setActiveModal(null);
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [activeModal]);

  useEffect(() => {
    (async () => {
      try {
        const storedAuth = await AsyncStorage.getItem("localAuthEnabled");
        setLocalAuthEnabled(storedAuth === "true");
        
        // Obtener deviceId y cargar preferencia de notificaciones desde Firestore
        const deviceId = await AsyncStorage.getItem("deviceId");
        if (deviceId && uid) {
          const deviceDoc = await getDoc(doc(db, `users/${uid}/devices/${deviceId}`));
          if (deviceDoc.exists()) {
            const deviceData = deviceDoc.data();
            setNotificationsEnabled(deviceData.notificationsEnabled ?? true);
          }
        }
      } catch (error) {
        console.error("Error checking settings:", error);
      } finally {
        setChecking(false);
      }
    })();
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setSubscriptionData(null);
      return;
    }

    const loadSubscriptionData = async () => {
      try {
        const userDoc = await getDoc(doc(db, `users/${uid}`));
        const data = userDoc.data() || {};
        const supportData = (data as any).supportSubscription || null;
        setSubscriptionData(supportData);

        const amount = Number(supportData?.amount || supportData?.pendingAmount || 0);
        if (amount) {
          setSelectedSupportAmount(amount);
          setCustomSupportAmount(String(amount));
        }
      } catch (error) {
        console.error('Error loading subscription data:', error);
      }
    };

    loadSubscriptionData();
  }, [uid]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    let isMounted = true;
    const purchaseSub = purchaseUpdatedListener(async (purchase: Purchase) => {
      if (!uid) return;
      const sku = purchase.productId;
      if (!sku || !supportedSkus.includes(sku)) return;

      const purchaseKey = `${purchase.purchaseToken || ''}:${purchase.transactionId || ''}:${purchase.transactionDate || ''}`;
      if (processedPurchaseKeyRef.current === purchaseKey) {
        return;
      }

      try {
        await finishTransaction({ purchase, isConsumable: false });
        processedPurchaseKeyRef.current = purchaseKey;

        const amount = pendingPurchaseAmountRef.current || Number(subscriptionData?.pendingAmount || subscriptionData?.amount || 0);
        const wasUserInitiated = purchaseFlowActiveRef.current;
        const verified = await verifySubscriptionOnServer(purchase.purchaseToken);
        const verifiedData = (verified as any)?.data || null;
        const verifiedActive = Boolean((verifiedData as any)?.active);

        if (!(verified as any)?.ok) {
          if (wasUserInitiated) {
            Alert.alert('Verificación pendiente', 'La compra se registró, pero no se pudo verificar en servidor ahora. Intenta "Sincronizar con Google Play" en unos segundos.');
          }
          pendingPurchaseAmountRef.current = null;
          return;
        }

        if (!verifiedActive) {
          await setDoc(
            doc(db, `users/${uid}`),
            {
              supportSubscription: {
                ...(subscriptionData || {}),
                active: false,
                pending: false,
                amount,
                sku: SUBSCRIPTION_PRODUCT_ID,
                currency: 'MXN',
                source: 'google_play_billing',
                purchaseToken: purchase.purchaseToken ?? null,
                orderId: purchase.transactionId ?? null,
                updatedAt: new Date(),
              },
            },
            { merge: true }
          );

          setSubscriptionData((prev: any) => ({
            ...(prev || {}),
            active: false,
            pending: false,
            amount,
            sku: SUBSCRIPTION_PRODUCT_ID,
            source: 'google_play_billing',
          }));

          if (wasUserInitiated) {
            Alert.alert('Suscripción no verificada', 'Google Play no confirmó una suscripción activa para esta cuenta.');
          }
          pendingPurchaseAmountRef.current = null;
          return;
        }

        await setDoc(
          doc(db, `users/${uid}`),
          {
            supportSubscription: {
              active: true,
              pending: false,
              amount,
              sku: SUBSCRIPTION_PRODUCT_ID,
              currency: 'MXN',
              source: 'google_play_billing',
              purchaseToken: purchase.purchaseToken ?? null,
              orderId: purchase.transactionId ?? null,
              startedAt: subscriptionData?.startedAt || new Date(),
              lastVerifiedAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { merge: true }
        );

        setSubscriptionData((prev: any) => ({
          ...(prev || {}),
          active: true,
          pending: false,
          amount,
          sku: SUBSCRIPTION_PRODUCT_ID,
          source: 'google_play_billing',
        }));

        if (wasUserInitiated) {
          modalRef.current?.dismiss();
          setActiveModal(null);
          setLastSubscribedAmount(amount || null);
          setShowSubscriptionThanks(true);
        }

        pendingPurchaseAmountRef.current = null;
      } catch (error) {
        console.error('Error processing Play purchase:', error);
        if (purchaseFlowActiveRef.current) {
          Alert.alert('Error', 'No se pudo finalizar la compra con Google Play.');
        }
      } finally {
        purchaseFlowActiveRef.current = false;
        setProcessingSubscription(false);
      }
    });

    const errorSub = purchaseErrorListener((error) => {
      console.error('Play Billing purchase error:', error);
      const wasUserInitiated = purchaseFlowActiveRef.current;
      purchaseFlowActiveRef.current = false;
      pendingPurchaseAmountRef.current = null;
      setProcessingSubscription(false);
      if ((error as { code?: string }).code === 'E_USER_CANCELLED') return;
      if (!wasUserInitiated) return;
      Alert.alert('Compra no completada', 'No se pudo completar la suscripción en Google Play.');
    });

    const setupIap = async () => {
      try {
        let connected = false;

        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            connected = await initConnection();
            if (connected) break;
          } catch (attemptError) {
            console.warn(`Google Play Billing init attempt ${attempt} failed:`, attemptError);
            if (attempt === 2) throw attemptError;
          }

          await sleep(1200);
        }

        if (!connected || !isMounted) return;

        const products = (await getSubscriptions({
          skus: supportedSkus,
        })) || [];
        const firstProduct = products[0];
        const details = firstProduct && 'subscriptionOfferDetails' in firstProduct
          ? firstProduct.subscriptionOfferDetails ?? []
          : [];

        console.log('Subscription offer details count:', details.length);
        console.log('Subscription offer details raw:', JSON.stringify(details, null, 2));
        console.log(
          'Subscription offer summary:',
          details.map((offer: any) => ({
            basePlanId: offer?.basePlanId,
            offerId: offer?.offerId,
            offerToken: offer?.offerToken,
            pricingPhases: offer?.pricingPhases?.pricingPhaseList?.map((phase: any) => ({
              formattedPrice: phase?.formattedPrice,
              priceAmountMicros: phase?.priceAmountMicros,
              billingPeriod: phase?.billingPeriod,
            })),
          }))
        );
        
        if (isMounted) {
          setAvailableSubscriptions(Array.isArray(products) ? products as Subscription[] : []);
          setIapReady(true);
        }
      } catch (error) {
        console.error('Error initializing Google Play Billing:', error);
        if (isMounted) setIapReady(false);
      }
    };

    setupIap();

    return () => {
      isMounted = false;
      purchaseSub.remove();
      errorSub.remove();
      endConnection().catch(() => undefined);
    };
  }, [uid]);

  useEffect(() => {
    if (params.openSubscription !== '1' || openSubscriptionFromParamsHandledRef.current) return;
    openSubscriptionFromParamsHandledRef.current = true;
    openModal('subscription');
  }, [params.openSubscription]);

 

  // Functions
  const openModal = (modal: SettingsModal) => {
    setActiveModal(modal);
    modalRef.current?.present();
  };

  const closeModal = () => {
    modalRef.current?.dismiss();
    setActiveModal(null);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log("Sesión cerrada exitosamente ✅");
      router.dismissTo("/(sesion)/create");
    } catch (error) {
      console.error("Error al cerrar sesión ❌", error);
      ToastAndroid.showWithGravity(
        "Error al cerrar sesión",
        ToastAndroid.SHORT,
        ToastAndroid.BOTTOM
      );
    }
  };

  const handleUpdateProfile = async () => {
    if (!newName.trim()) {
      Alert.alert("Error", "El nombre no puede estar vacío");
      return;
    }

    if (newName.length > 30) {
      Alert.alert("Error", "El nombre no puede exceder 30 caracteres");
      return;
    }

    setIsUpdating(true);
    try {
      await updateProfile(user!, { displayName: newName });
      const ref = doc(db, "people", uid);
      await updateDoc(ref, { namep: newName });
      
      ToastAndroid.showWithGravity(
        "Nombre actualizado exitosamente",
        ToastAndroid.SHORT,
        ToastAndroid.BOTTOM
      );
      closeModal();
      setNewName("");
    } catch (error) {
      console.error("Error al actualizar:", error);
      Alert.alert("Error", "No pudimos actualizar tu perfil");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleBiometric = async (value: boolean) => {
    try {
      if (value) {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();

        if (!compatible) {
          Alert.alert("No disponible", "Tu dispositivo no tiene autenticación biométrica.");
          return;
        }
        if (!enrolled) {
          Alert.alert("No configurada", "Configura tu huella o PIN en los ajustes del sistema.");
          return;
        }

        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Verifica para activar autenticación",
        });

        if (result.success) {
          await AsyncStorage.setItem("localAuthEnabled", "true");
          setLocalAuthEnabled(true);
          ToastAndroid.showWithGravity(
            "Autenticación biométrica activada",
            ToastAndroid.SHORT,
            ToastAndroid.BOTTOM
          );
        }
      } else {
        await AsyncStorage.setItem("localAuthEnabled", "false");
        setLocalAuthEnabled(false);
        ToastAndroid.showWithGravity(
          "Autenticación biométrica desactivada",
          ToastAndroid.SHORT,
          ToastAndroid.BOTTOM
        );
      }
    } catch (e) {
      console.error("Error al cambiar autenticación local:", e);
      Alert.alert("Error", "No pudimos cambiar la autenticación biométrica");
    }
  };

  const handleToggleNotifications = async (value: boolean) => {
    try {
      const deviceId = await AsyncStorage.getItem("deviceId");
      if (deviceId && uid) {
        await updateDoc(doc(db, `users/${uid}/devices/${deviceId}`), {
          notificationsEnabled: value,
          updatedAt: new Date(),
        });
      }
      setNotificationsEnabled(value);
      ToastAndroid.showWithGravity(
        value ? "Notificaciones activadas" : "Notificaciones desactivadas",
        ToastAndroid.SHORT,
        ToastAndroid.BOTTOM
      );
    } catch (error) {
      console.error("Error al cambiar notificaciones:", error);
      Alert.alert("Error", "No pudimos cambiar las notificaciones");
    }
  };

  const handleOpenPlayStore = async () => {
    try {
      await Linking.openURL('market://details?id=com.cesar1357.konta');
    } catch (error) {
      try {
        await Linking.openURL('https://play.google.com/store/apps/details?id=com.cesar1357.konta');
      } catch (secondaryError) {
        Alert.alert('No se pudo abrir la Play Store', 'Intenta actualizar desde Play Store manualmente.');
      }
    }
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

  const handleSendVerificationEmail = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    try {
      setSendingVerification(true);
      await currentUser.reload();

      if (currentUser.emailVerified) {
        await setDoc(
          doc(db, `users/${currentUser.uid}`),
          {
            emailVerified: true,
            updatedAt: new Date(),
          },
          { merge: true }
        );

        ToastAndroid.showWithGravity('Tu correo ya está verificado.', ToastAndroid.SHORT, ToastAndroid.BOTTOM);
        return;
      }

      await sendEmailVerification(currentUser);
      ToastAndroid.showWithGravity('Te enviamos un correo de verificación.', ToastAndroid.SHORT, ToastAndroid.BOTTOM);
      Alert.alert('Correo enviado', 'Revisa tu bandeja de entrada o spam y luego vuelve a entrar para actualizar el estado.');
    } catch (error) {
      console.error('Error sending verification email:', error);
      Alert.alert('Error', 'No se pudo enviar el correo de verificación.');
    } finally {
      setSendingVerification(false);
    }
  };

  const handleSendSuggestion = async () => {
    const message = suggestionText.trim();
    if (!uid) return;

    if (message.length < 8) {
      Alert.alert('Sugerencia muy corta', 'Cuéntanos un poco más para poder evaluarla.');
      return;
    }

    try {
      setSendingSuggestion(true);
      await addDoc(collection(db, 'appSuggestions'), {
        uid,
        email: correo || null,
        displayName: displayname || null,
        message,
        source: 'settings',
        status: 'new',
        createdAt: serverTimestamp(),
      });

      setSuggestionText('');
      ToastAndroid.showWithGravity('Gracias, tu sugerencia fue enviada', ToastAndroid.SHORT, ToastAndroid.BOTTOM);
      closeModal();
    } catch (error) {
      console.error('Error sending suggestion:', error);
      Alert.alert('Error', 'No se pudo enviar tu sugerencia. Inténtalo de nuevo.');
    } finally {
      setSendingSuggestion(false);
    }
  };

  function getAmountToUse() {
    if (selectedSupportAmount === 'custom') {
      const parsed = Number(customSupportAmount);
      return Number.isNaN(parsed) ? 0 : parsed;
    }

    return selectedSupportAmount;
  }

  function getFormattedPlanPrice(offer: any) {
    const pricingPhases = offer?.pricingPhases?.pricingPhaseList || [];
    const recurringPhase = pricingPhases[pricingPhases.length - 1] || pricingPhases[0] || null;
    const priceAmountMicros = Number(recurringPhase?.priceAmountMicros ?? offer?.pricingPhases?.priceAmountMicros ?? 0);

    if (Number.isFinite(priceAmountMicros) && priceAmountMicros > 0) {
      return priceAmountMicros / 1000000;
    }

    const formattedPrice = recurringPhase?.formattedPrice || offer?.pricingPhases?.formattedPrice || '';
    const normalized = String(formattedPrice)
      .replace(/\s/g, '')
      .replace(/[^\d,.-]/g, '')
      .replace(/\.(?=.*\.)/g, '')
      .replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getSubscriptionPlans(subscription: Subscription | undefined): SupportPlan[] {
    if (!subscription || !('subscriptionOfferDetails' in subscription)) return [];

    return (subscription.subscriptionOfferDetails || [])
      .map((offer) => {
        const amount = getFormattedPlanPrice(offer);
        return {
          amount,
          offerToken: offer?.offerToken || null,
          basePlanId: offer?.basePlanId || null,
          formattedPrice: offer?.pricingPhases?.pricingPhaseList?.[offer?.pricingPhases?.pricingPhaseList?.length - 1]?.formattedPrice || null,
        };
      })
      .filter((plan): plan is SupportPlan => Boolean(plan.offerToken) && plan.amount > 0)
      .sort((a, b) => a.amount - b.amount);
  }

  const subscriptionProduct = availableSubscriptions.find((item) => item.productId === SUBSCRIPTION_PRODUCT_ID);
  const availableSupportPlans = useMemo(() => getSubscriptionPlans(subscriptionProduct), [subscriptionProduct]);
  const closestSupportPlan = useMemo(() => {
    const amount = getAmountToUse();
    if (!amount || availableSupportPlans.length === 0) return null;

    return availableSupportPlans.reduce((closest, plan) => {
      if (!closest) return plan;

      const closestDiff = Math.abs(closest.amount - amount);
      const currentDiff = Math.abs(plan.amount - amount);

      if (currentDiff < closestDiff) return plan;
      if (currentDiff === closestDiff && plan.amount < closest.amount) return plan;
      return closest;
    }, null as SupportPlan | null);
  }, [availableSupportPlans, customSupportAmount, selectedSupportAmount]);

  useEffect(() => {
    const amount = Number(subscriptionData?.amount || subscriptionData?.pendingAmount || 0);
    if (!amount || availableSupportPlans.length === 0) return;

    const hasExactPlan = availableSupportPlans.some((plan) => plan.amount === amount);
    if (!hasExactPlan) {
      setSelectedSupportAmount('custom');
      setCustomSupportAmount(String(amount));
    }
  }, [availableSupportPlans, subscriptionData?.amount, subscriptionData?.pendingAmount]);

  const syncSubscriptionFromPlay = async (showToastOnNoResult = true) => {
    if (!uid || Platform.OS !== 'android' || !iapReady) return;

    try {
      setSyncingPlay(true);
      const purchases = await getAvailablePurchases();
      const subscriptionPurchases = purchases.filter((purchase) => supportedSkus.includes(purchase.productId));

      if (subscriptionPurchases.length === 0) {
        await setDoc(
          doc(db, `users/${uid}`),
          {
            supportSubscription: {
              ...(subscriptionData || {}),
              active: false,
              pending: false,
              source: 'google_play_billing',
              lastVerifiedAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { merge: true }
        );
        setSubscriptionData((prev: any) => ({ ...(prev || {}), active: false, pending: false }));
        if (showToastOnNoResult) {
          ToastAndroid.showWithGravity('No se encontró una suscripción activa en Google Play', ToastAndroid.SHORT, ToastAndroid.BOTTOM);
        }
        return;
      }

      const latest = [...subscriptionPurchases].sort((a, b) => Number(b.transactionDate || 0) - Number(a.transactionDate || 0))[0];
      const amount = Number(subscriptionData?.amount || subscriptionData?.pendingAmount || 0);
      const verified = await verifySubscriptionOnServer(latest.purchaseToken);
      const verifiedData = (verified as any)?.data || null;
      const verifiedActive = Boolean((verifiedData as any)?.active);

      if (!(verified as any)?.ok) {
        Alert.alert('No se pudo verificar', 'No fue posible verificar la suscripción con servidor en este momento. Intenta de nuevo en unos segundos.');
        return;
      }

      if (!verifiedActive) {
        await setDoc(
          doc(db, `users/${uid}`),
          {
            supportSubscription: {
              ...(subscriptionData || {}),
              active: false,
              pending: false,
              source: 'google_play_billing',
              purchaseToken: latest.purchaseToken ?? null,
              orderId: latest.transactionId ?? null,
              lastVerifiedAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { merge: true }
        );

        setSubscriptionData((prev: any) => ({
          ...(prev || {}),
          active: false,
          pending: false,
          source: 'google_play_billing',
        }));

        Alert.alert('Sin suscripción activa', 'Google Play no confirmó una suscripción activa para esta cuenta.');
        return;
      }

      await setDoc(
        doc(db, `users/${uid}`),
        {
          supportSubscription: {
            ...(subscriptionData || {}),
            active: true,
            pending: false,
            ...(amount ? { amount } : {}),
            sku: SUBSCRIPTION_PRODUCT_ID,
            currency: 'MXN',
            source: 'google_play_billing',
            purchaseToken: latest.purchaseToken ?? null,
            orderId: latest.transactionId ?? null,
            lastVerifiedAt: new Date(),
            updatedAt: new Date(),
          },
        },
        { merge: true }
      );

      setSubscriptionData((prev: any) => ({
        ...(prev || {}),
        active: true,
        pending: false,
        ...(amount ? { amount } : {}),
        sku: SUBSCRIPTION_PRODUCT_ID,
        source: 'google_play_billing',
      }));

      ToastAndroid.showWithGravity('Suscripción sincronizada con Google Play', ToastAndroid.SHORT, ToastAndroid.BOTTOM);
    } catch (error) {
      console.error('Error syncing with Google Play:', error);
      Alert.alert('Error', 'No se pudo sincronizar el estado desde Google Play.');
    } finally {
      setSyncingPlay(false);
    }
  };

  const handleOpenPlaySubscription = async () => {
    if (!uid || Platform.OS !== 'android') return;

    const authenticatedUser = await getAuthenticatedUserForSubscription();
    if (!authenticatedUser) {
      Alert.alert('Sesión no lista', 'Vuelve a iniciar sesión y espera unos segundos antes de suscribirte.');
      return;
    }

    const amount = getAmountToUse();
    if (!amount || amount <= 0) {
      Alert.alert('Monto inválido', 'Selecciona un monto válido para continuar.');
      return;
    }

    const selectedPlan = closestSupportPlan;
    if (!selectedPlan) {
      Alert.alert('Monto no disponible', 'No se encontraron planes de Google Play para esta suscripción.');
      return;
    }

    if (!iapReady) {
      Alert.alert('Google Play no está listo', 'Espera unos segundos e inténtalo nuevamente.');
      return;
    }

    try {
      setProcessingSubscription(true);
      purchaseFlowActiveRef.current = true;
      pendingPurchaseAmountRef.current = amount;
      await setDoc(
        doc(db, `users/${uid}`),
        {
          supportSubscription: {
            ...(subscriptionData || {}),
            pending: true,
            pendingAmount: amount,
            pendingSku: SUBSCRIPTION_PRODUCT_ID,
            pendingBasePlanAmount: selectedPlan.amount,
            pendingBasePlanId: selectedPlan.basePlanId,
            currency: 'MXN',
            source: 'google_play_billing',
            updatedAt: new Date(),
          },
        },
        { merge: true }
      );

      await requestSubscription({
        subscriptionOffers: [
          {
            sku: SUBSCRIPTION_PRODUCT_ID,
            offerToken: selectedPlan.offerToken,
          },
        ],
        obfuscatedAccountIdAndroid: uid,
      });
    } catch (error) {
      console.error('Error opening Play subscription:', error);
      const code = (error as { code?: string }).code;

      // Algunos dispositivos lanzan error aquí aunque la compra continúa y se confirma por listener.
      if (code === 'E_USER_CANCELLED') {
        purchaseFlowActiveRef.current = false;
        pendingPurchaseAmountRef.current = null;
      }

      setProcessingSubscription(false);
    } finally {
      // Se termina en listener de compra o error.
    }
  };

  const handleDismissSubscriptionThanks = () => { 
    setShowSubscriptionThanks(false);
  };

  const handleDebugTriggerSubscriptionThanks = () => {
    const amount = getAmountToUse();
    modalRef.current?.dismiss();
    setActiveModal(null);
    setLastSubscribedAmount(amount > 0 ? amount : null);
    setShowSubscriptionThanks(true);
  };

  const handleOpenManageSubscriptions = async () => {
    try {
      await Linking.openURL(`https://play.google.com/store/account/subscriptions?package=${PLAY_PACKAGE}`);
    } catch (error) {
      Alert.alert('Error', 'No se pudo abrir la gestión de suscripciones en Google Play.');
    }
  };

  const handleManualSubscriptionSync = async () => {
    const authenticatedUser = await getAuthenticatedUserForSubscription();
    if (!authenticatedUser) {
      Alert.alert('Sesión no lista', 'Inicia sesión nuevamente antes de sincronizar con Google Play.');
      return;
    }
    await syncSubscriptionFromPlay(true);
  };

  const handleDisableSubscriptionLocally = async () => {
    if (!uid) return;
    Alert.alert('Desactivar en app', 'Esto solo desactiva beneficios en la app. La facturación se gestiona en Google Play.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desactivar',
        style: 'destructive',
        onPress: async () => {
          try {
            await setDoc(
              doc(db, `users/${uid}`),
              {
                supportSubscription: {
                  ...(subscriptionData || {}),
                  active: false,
                  pending: false,
                  updatedAt: new Date(),
                },
              },
              { merge: true }
            );
            setSubscriptionData((prev: any) => ({ ...(prev || {}), active: false, pending: false }));
          } catch (error) {
            console.error('Error disabling subscription locally:', error);
          }
        },
      },
    ]);
  };

  const themeOptions = [
    { label: 'Sistema', value: 'system' as const },
    { label: 'Claro', value: 'light' as const },
    { label: 'Oscuro', value: 'dark' as const },
    { label: 'Gris', value: 'grey' as const },
  ];

  const settingsOptions: SettingOption[] = [
    {
      id: 'profile',
      title: 'Cuenta',
      icon: 'person',
      description: 'Información personal y perfil',
      onPress: () => openModal('profile'),
    },
    {
      id: 'notifications',
      title: 'Notificaciones',
      icon: 'notifications',
      description: 'Gestiona tus notificaciones',
      onPress: () => openModal('notifications'),
    },
    {
      id: 'security',
      title: 'Seguridad',
      icon: 'shield-checkmark',
      description: 'Autenticación y protección',
      onPress: () => openModal('security'),
    },
    {
      id: 'theme',
      title: 'Tema',
      icon: 'color-palette',
      description: 'Cambiar el tema de la aplicación',
      onPress: () => openModal('theme'),
    },
    {
      id: 'subscription',
      title: 'Suscripción',
      icon: 'card',
      description: subscriptionData?.active ? 'Activa en MXN' : 'Gestiona apoyo desde Google Play',
      onPress: () => openModal('subscription'),
    },
    {
      id: 'suggestions',
      title: 'Sugerencias',
      icon: 'bulb',
      description: 'Comparte ideas para nuevas funciones',
      onPress: () => openModal('suggestions'),
    },
    {
      id: 'privacy',
      title: 'Política de privacidad',
      icon: 'document-text',
      description: 'Términos y condiciones',
      onPress: () => Linking.openURL("https://emperblack.wordpress.com/konta-politica-de-privacidad/"),
    },
  ];

  const renderSettingItem = (option: SettingOption) => (
    <TouchableOpacity
      key={option.id}
      onPress={option.onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 16,
        marginVertical: 4,
        marginHorizontal: 12,
        backgroundColor: cardsMain,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: `${textColor}15`,
      }}
    >
      <Icon
        type="ionicon"
        name={option.icon}
        color={textColor}
        size={24}
        containerStyle={{ marginRight: 12 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: textColor, marginBottom: 2 }}>
          {option.title}
        </Text>
        {option.description && (
          <Text style={{ fontSize: 12, color: `${textColor}80` }}>
            {option.description}
          </Text>
        )}
      </View>
      <Icon
        type="ionicon"
        name="chevron-forward"
        color={`${textColor}60`}
        size={20}
      />
    </TouchableOpacity>
  );

  const renderProfileModal = () => (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 20 }}
      style={{ backgroundColor: themeBg }}
    >
      <Text style={{ fontSize: 28, fontWeight: 'bold', color: textColor, marginBottom: 30, textAlign: 'center' }}>
        Mi Perfil
      </Text>

      {/* Profile Info Card */}
      <View style={{ backgroundColor: cardsMain, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', color: textColor, marginBottom: 8 }}>
          Nombre
        </Text>
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: primaryColor, marginBottom: 16 }}>
          {displayname || "Sin nombre"}
        </Text>

        <TouchableOpacity
          onPress={() => openModal('editProfile')}
          style={{
            backgroundColor: primaryColor,
            borderRadius: 8,
            padding: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>
            Editar Nombre
          </Text>
        </TouchableOpacity>
      </View>

      {/* Contact Info Card */}
      <View style={{ backgroundColor: cardsMain, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: `${textColor}80`, marginBottom: 8 }}>
          Correo Electrónico
        </Text>
        <Text style={{ fontSize: 16, color: textColor, marginBottom: 16, fontWeight: '500' }}>
          {correo}
        </Text>

        <Text style={{ fontSize: 14, fontWeight: '500', color: `${textColor}80`, marginBottom: 8 }}>
          Verificación
        </Text>
        <Text style={{ fontSize: 14, color: emailVerified ? '#22c55e' : '#f59e0b', marginBottom: 10, fontWeight: '700' }}>
          {emailVerified ? 'Correo verificado' : 'Correo pendiente de verificación'}
        </Text>

        {!emailVerified && (
          <TouchableOpacity
            onPress={handleSendVerificationEmail}
            disabled={sendingVerification}
            style={{
              borderRadius: 8,
              paddingVertical: 10,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: `${primaryColor}55`,
              marginBottom: 16,
              opacity: sendingVerification ? 0.7 : 1,
            }}
          >
            <Text style={{ color: textColor, fontWeight: '700', fontSize: 13 }}>
              {sendingVerification ? 'Enviando...' : 'Enviar correo de verificación'}
            </Text>
          </TouchableOpacity>
        )}

        <Text style={{ fontSize: 14, fontWeight: '500', color: `${textColor}80`, marginBottom: 8 }}>
          ID de Usuario
        </Text>
        <Text style={{ fontSize: 12, color: `${textColor}60`, fontFamily: 'monospace', marginBottom: 16 }}>
          {uid?.substring(0, 20)}...
        </Text>

        <Text style={{ fontSize: 14, fontWeight: '500', color: `${textColor}80`, marginBottom: 8 }}>
          Cuenta Creada
        </Text>
        <Text style={{ fontSize: 16, color: textColor, fontWeight: '500' }}>
          {(metadata as { createdAt?: number } | undefined)?.createdAt
            ? new Date(Number((metadata as { createdAt?: number }).createdAt)).toLocaleDateString("es-MX", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : "Fecha no disponible"}
        </Text>
      </View>

      {/* Logout Button */}
      <TouchableOpacity
        onPress={() => 
          Alert.alert("Cerrar sesión", "¿Seguro que deseas cerrar sesión?", [
            {
              text: "Cancelar",
              style: "cancel",
            },
            {
              text: "Cerrar sesión",
              onPress: handleLogout,
              style: "destructive",
            },
          ])
        }
        style={{
          backgroundColor: '#DC3545',
          borderRadius: 8,
          padding: 14,
          alignItems: 'center',
          marginTop: 10,
        }}
      >
        <Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>
          Cerrar Sesión
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderEditProfileModal = () => (
    <View style={{ paddingHorizontal: 16, paddingVertical: 20, backgroundColor: themeBg, flex: 1 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', color: textColor, marginBottom: 20, textAlign: 'center' }}>
        Cambiar Nombre
      </Text>

      <TextInput
        style={{
          backgroundColor: cardsMain,
          color: textColor,
          borderRadius: 8,
          padding: 14,
          marginBottom: 20,
          fontSize: 16,
          borderWidth: 1,
          borderColor: `${primaryColor}40`,
        }}
        onChangeText={setNewName}
        placeholder="Nuevo nombre"
        placeholderTextColor={`${textColor}60`}
        maxLength={30}
        editable={!isUpdating}
      />

      <Text style={{ color: `${textColor}80`, fontSize: 12, marginBottom: 20 }}>
        {newName.length}/30 caracteres
      </Text>

      <TouchableOpacity
        onPress={handleUpdateProfile}
        disabled={isUpdating}
        style={{
          backgroundColor: isUpdating ? `${primaryColor}80` : primaryColor,
          borderRadius: 8,
          padding: 14,
          alignItems: 'center',
        }}
      >
        {isUpdating ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={{ color: 'white', fontWeight: '600', fontSize: 16 }}>
            Actualizar
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderNotificationsModal = () => (
    <View style={{ paddingHorizontal: 16, paddingVertical: 20, backgroundColor: themeBg }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', color: textColor, marginBottom: 24, textAlign: 'center' }}>
        Notificaciones
      </Text>

      {/* Push Notifications */}
      <View style={{ backgroundColor: cardsMain, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: textColor, marginBottom: 4 }}>
              Notificaciones Push
            </Text>
            <Text style={{ fontSize: 12, color: `${textColor}80` }}>
              {notificationsEnabled ? 'Activadas' : 'Desactivadas'}
            </Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleToggleNotifications}
            thumbColor={notificationsEnabled ? primaryColor : '#888'}
            trackColor={{ false: '#3a3a3a', true: `${primaryColor}40` }}
          />
        </View>
      </View>

      {/* Info Section */}
      <View style={{ backgroundColor: cardsMain, borderRadius: 12, padding: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: textColor, marginBottom: 8 }}>
          ℹ️ Sobre las notificaciones
        </Text>
        <Text style={{ fontSize: 12, color: `${textColor}80`, lineHeight: 18 }}>
          • Ahorros sin movimientos{'\n'}
          • Gastos e ingresos recurrentes{'\n'}
          • Meta de ahorro próxima{'\n'}
          • Meta de ahorro completada
        </Text>
      </View>
    </View>
  );

  const renderThemeModal = () => (
    <View style={{ marginVertical: 20 }}>
      <View style={{ marginHorizontal: 12, marginBottom: 12, padding: 16, backgroundColor: cardsMain, borderRadius: 12, borderWidth: 1, borderColor: `${textColor}15` }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: textColor, marginBottom: 12 }}>
          Apariencia
        </Text>
        <Text style={{ fontSize: 12, color: `${textColor}80`, marginBottom: 12 }}>
          Elige cómo quieres ver la app.
        </Text>
        {themeOptions.map((option) => {
          const selected = themeMode === option.value;
          const greyLocked = option.value === 'grey' && !subscriptionData?.active;
          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => {
                if (greyLocked) {
                  Alert.alert('Tema premium', 'El tema gris está disponible solo con suscripción premium activa.');
                  return;
                }
                setThemeMode(option.value);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 10,
                marginTop: 6,
                backgroundColor: selected ? `${primaryColor}16` : 'transparent',
                borderWidth: 1,
                borderColor: selected ? `${primaryColor}40` : borderColor,
                opacity: greyLocked ? 0.45 : 1,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: textColor, fontWeight: selected ? '700' : '500' }}>
                  {option.label}
                </Text>
                {greyLocked && (
                  <Text style={{ color: `${textColor}90`, fontSize: 11, fontWeight: '700', marginLeft: 8 }}>
                    Premium
                  </Text>
                )}
              </View>
              {selected ? (
                <Icon type="ionicon" name="checkmark-circle" color={primaryColor} size={20} />
              ) : (
                <Icon
                  type="ionicon"
                  name={greyLocked ? 'lock-closed' : 'ellipse-outline'}
                  color={greyLocked ? `${textColor}70` : `${textColor}80`}
                  size={20}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderSecurityModal = () => (
    <View style={{ paddingHorizontal: 16, paddingVertical: 20, backgroundColor: themeBg }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', color: textColor, marginBottom: 24, textAlign: 'center' }}>
        Seguridad
      </Text>

      <View style={{ backgroundColor: cardsMain, borderRadius: 12, padding: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: textColor, marginBottom: 4 }}>
              Autenticación Biométrica
            </Text>
            <Text style={{ fontSize: 12, color: `${textColor}80` }}>
              {checking ? 'Verificando...' : localAuthEnabled ? 'Activada' : 'Desactivada'}
            </Text>
          </View>
          {!checking && (
            <Switch
              value={localAuthEnabled}
              onValueChange={handleToggleBiometric}
              thumbColor={localAuthEnabled ? primaryColor : '#888'}
              trackColor={{ false: '#3a3a3a', true: `${primaryColor}40` }}
            />
          )}
        </View>
      </View>
    </View>
  );

  const renderSubscriptionModal = () => {
    const amount = getAmountToUse();
    const isActive = Boolean(subscriptionData?.active);
    const isPending = Boolean(subscriptionData?.pending);
    const primaryActionLabel = closestSupportPlan
      ? selectedSupportAmount === 'custom'
        ? `Suscribirme con ${closestSupportPlan.amount} MXN`
        : `Suscribirme con ${amount} MXN`
      : 'Suscribirme en Google Play';

    return (
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 20 }} style={{ backgroundColor: themeBg }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: textColor, marginBottom: 20, textAlign: 'center' }}>
          Suscripción de apoyo
        </Text>

        <View style={{ backgroundColor: cardsMain, borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <Text style={{ color: textColor, fontWeight: '700', marginBottom: 6 }}>Estado actual</Text>
          <Text style={{ color: `${textColor}cc`, marginBottom: 4 }}>
            {isActive ? 'Activa' : isPending ? 'Pendiente de confirmación' : 'Sin suscripción activa'}
          </Text>
          {!!subscriptionData?.amount && (
            <Text style={{ color: `${textColor}99`, fontSize: 12 }}>
              Monto: {subscriptionData.amount} MXN
            </Text>
          )}
          {!!subscriptionData?.sku && (
            <Text style={{ color: `${textColor}99`, fontSize: 12 }}>
              SKU: {subscriptionData.sku}
            </Text>
          )}
        </View>

        <View style={{ backgroundColor: cardsMain, borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <Text style={{ color: textColor, fontWeight: '700', marginBottom: 10 }}>Elige tu apoyo</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {availableSupportPlans.map((plan) => {
              const selected = selectedSupportAmount === plan.amount;
              const recommended = selectedSupportAmount === 'custom' && closestSupportPlan?.amount === plan.amount;
              return (
                <TouchableOpacity
                  key={`support-${plan.amount}-${plan.basePlanId || 'base'}`}
                  onPress={() => {
                    setSelectedSupportAmount(plan.amount);
                    setCustomSupportAmount(String(plan.amount));
                  }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    marginRight: 8,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: recommended ? '#f59e0b' : `${primaryColor}55`,
                    backgroundColor: selected ? primaryColor : recommended ? '#f59e0b22' : `${primaryColor}16`,
                  }}
                >
                  <Text style={{ color: selected ? '#fff' : textColor, fontWeight: '700' }}>{plan.amount} MXN</Text>
                  <Text style={{ color: selected ? '#fff' : `${textColor}b0`, fontSize: 11, marginTop: 2 }}>
                    {plan.formattedPrice || `${plan.amount} MXN`}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              onPress={() => setSelectedSupportAmount('custom')}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                marginRight: 8,
                marginBottom: 8,
                justifyContent: 'center',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: `${primaryColor}55`,
                backgroundColor: selectedSupportAmount === 'custom' ? primaryColor : `${primaryColor}16`,
              }}
            >
              <Text style={{ color: selectedSupportAmount === 'custom' ? '#fff' : textColor, fontWeight: '700', textAlign: 'center' }}>Otro</Text>
            </TouchableOpacity>
          </View>

          {selectedSupportAmount === 'custom' && (
            <View style={{ marginTop: 4 }}>
              <TextInput
                value={customSupportAmount}
                onChangeText={setCustomSupportAmount}
                keyboardType="numeric"
                placeholder="Monto personalizado en MXN"
                placeholderTextColor={`${textColor}60`}
                style={{
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: `${primaryColor}35`,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: textColor,
                }}
              />
              {closestSupportPlan && (
                <Text style={{ color: `${textColor}80`, fontSize: 12, marginTop: 8 }}>
                  Se usará el plan más cercano: {closestSupportPlan.amount} MXN
                  {closestSupportPlan.formattedPrice ? ` (${closestSupportPlan.formattedPrice})` : ''}.
                </Text>
              )}
            </View>
          )}

          <Text style={{ color: `${textColor}80`, fontSize: 12, marginTop: 10 }}>
            Beneficios iguales para todos los montos. Sin suscripción, algunas funciones se limitan a 2 elementos.
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleOpenPlaySubscription}
          disabled={processingSubscription || syncingPlay || !amount || !closestSupportPlan || !iapReady}
          style={{
            backgroundColor: primaryColor,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
            marginBottom: 10,
            opacity: processingSubscription || syncingPlay || !amount || !closestSupportPlan || !iapReady ? 0.7 : 1,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>
            {processingSubscription ? 'Procesando...' : primaryActionLabel}
          </Text>
        </TouchableOpacity>

          <ThemedText style={{ paddingVertical:6, fontSize: 12, color: `${textColor}80`, marginBottom: 10 }}>
            Debug
          </ThemedText>

        {/* <TouchableOpacity
          onPress={handleDebugTriggerSubscriptionThanks}
          style={{
            borderWidth: 1,
            borderColor: `${primaryColor}55`,
            borderRadius: 10,
            paddingVertical: 11,
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <Text style={{ color: textColor, fontWeight: '700' }}>
            Probar overlay de agradecimiento
          </Text>
        </TouchableOpacity> */}

        <TouchableOpacity
          onPress={handleManualSubscriptionSync}
          disabled={processingSubscription || syncingPlay || !iapReady}
          style={{
            borderWidth: 1,
            borderColor: `${primaryColor}55`,
            borderRadius: 10,
            paddingVertical: 11,
            alignItems: 'center',
            marginBottom: 10,
            opacity: processingSubscription || syncingPlay || !iapReady ? 0.7 : 1,
          }}
        >
          <Text style={{ color: textColor, fontWeight: '700' }}>
            {syncingPlay ? 'Sincronizando...' : 'Sincronizar con Google Play'}
          </Text>
        </TouchableOpacity>

        {!iapReady && Platform.OS === 'android' && (
          <Text style={{ color: `${textColor}80`, fontSize: 12, marginBottom: 10 }}>
            Conectando con Google Play Billing...
          </Text>
        )}

        <TouchableOpacity
          onPress={handleOpenManageSubscriptions}
          style={{
            borderWidth: 1,
            borderColor: `${textColor}25`,
            borderRadius: 10,
            paddingVertical: 11,
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <Text style={{ color: textColor, fontWeight: '600' }}>Gestionar en Google Play</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleDisableSubscriptionLocally}
          style={{
            borderWidth: 1,
            borderColor: '#ef4444',
            borderRadius: 10,
            paddingVertical: 11,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#ef4444', fontWeight: '700' }}>Desactivar beneficios en app</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  const renderSuggestionsModal = () => (
    <View style={{ paddingHorizontal: 16, paddingVertical: 20, backgroundColor: themeBg, flex: 1 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', color: textColor, marginBottom: 12, textAlign: 'center' }}>
        Sugerencias
      </Text>

      <Text style={{ color: `${textColor}b3`, fontSize: 13, marginBottom: 14, textAlign: 'center' }}>
        ¿Qué te gustaría ver en Konta? Tu idea nos ayuda a priorizar nuevas funciones.
      </Text>

      <TextInput
        value={suggestionText}
        onChangeText={setSuggestionText}
        multiline
        numberOfLines={6}
        textAlignVertical="top"
        maxLength={400}
        placeholder="Ejemplo: Me gustaría exportar movimientos a Excel..."
        placeholderTextColor={`${textColor}66`}
        style={{
          minHeight: 150,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: `${primaryColor}40`,
          backgroundColor: cardsMain,
          color: textColor,
          paddingHorizontal: 12,
          paddingVertical: 12,
          marginBottom: 8,
        }}
      />

      <Text style={{ color: `${textColor}80`, fontSize: 11, marginBottom: 14 }}>
        {suggestionText.trim().length}/400 caracteres
      </Text>

      <TouchableOpacity
        onPress={handleSendSuggestion}
        disabled={sendingSuggestion}
        style={{
          backgroundColor: primaryColor,
          borderRadius: 10,
          paddingVertical: 12,
          alignItems: 'center',
          opacity: sendingSuggestion ? 0.7 : 1,
        }}
      >
        {sendingSuggestion ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: '#fff', fontWeight: '700' }}>Enviar sugerencia</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={{ backgroundColor: backgroundColor, flex: 1 }}>
      <ScrollView style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 20 }}>
          <ThemedText style={{ fontSize: 32, fontWeight: 'bold', marginBottom: 8, paddingTop:5, height: 35 }}>
            Ajustes
          </ThemedText>
          <Text style={{ fontSize: 14, color: `${textColor}80` }}>
            Administra tu cuenta y preferencias
          </Text>
        </View>

        <NotificationTestPanel visible={isTextVisible} />

        {!emailVerified && (
          <View
            style={{
              marginHorizontal: 12,
              marginTop: 4,
              marginBottom: 10,
              padding: 14,
              backgroundColor: `${primaryColor}12`,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: `${primaryColor}45`,
            }}
          >
            <Text style={{ color: textColor, fontWeight: '700', marginBottom: 6 }}>
              Verifica tu correo
            </Text>
            <Text style={{ color: `${textColor}cc`, fontSize: 12, marginBottom: 10 }}>
              Para mayor seguridad de tu cuenta y suscripción, confirma tu correo electrónico.
            </Text>
            <TouchableOpacity
              onPress={handleSendVerificationEmail}
              disabled={sendingVerification}
              style={{
                alignSelf: 'flex-start',
                backgroundColor: primaryColor,
                borderRadius: 8,
                paddingVertical: 9,
                paddingHorizontal: 12,
                opacity: sendingVerification ? 0.7 : 1,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                {sendingVerification ? 'Enviando...' : 'Enviar verificación'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Settings Options */}
        <View style={{ marginVertical: 20 }}>
          {settingsOptions.map(renderSettingItem)}
        </View>

        {/* About Section */}
        <View style={{ marginHorizontal: 12, marginVertical: 20, paddingHorizontal: 16, paddingVertical: 16, backgroundColor: cardsMain, borderRadius: 12, borderWidth: 1, borderColor: `${textColor}15` }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: textColor, marginBottom: 8 }}>
            Sobre Konta
          </Text>
          <Text style={{ fontSize: 12, color: `${textColor}80`, lineHeight: 18 }}>
            Konta es tu asistente financiero personal. Ayudándote a gestionar tus finanzas de forma inteligente y sencilla.
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: `${textColor}60`, textAlign: 'center' }}>
              v3.0.0   | 
            </Text>
            <TouchableOpacity
              onPress={handleOpenInstagram}
              style={{
                alignSelf: 'center',
                borderRadius: 999,
                paddingVertical: 9,
                paddingHorizontal: 14,
                backgroundColor: '#E1306C',
                flexDirection: 'row',
                alignItems: 'center',
                marginLeft: 8,
                justifyContent: 'center',
              }}
            >
              <Ionicons name="logo-instagram" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold', marginLeft: 8, textAlign: 'center' }}>
                @emperblack
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Test Button */}
        <TouchableOpacity
          onPress={() => setIsTextVisible(!isTextVisible)}
          style={{ paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 1, opacity: 0, color: `${textColor}40` }}>
            Modo desarrollador
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Bottom Sheet Modal */}
      <BottomSheetModal
        ref={modalRef}
        index={1}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        backdropComponent={BottomSheetBackdrop}
        onDismiss={() => setActiveModal(null)}
        backgroundStyle={{ backgroundColor: themeBg }}
        handleIndicatorStyle={{ backgroundColor: primaryColor }}
      >
        {activeModal === 'profile' && renderProfileModal()}
        {activeModal === 'editProfile' && renderEditProfileModal()}
        {activeModal === 'notifications' && renderNotificationsModal()}
        {activeModal === 'security' && renderSecurityModal()}
        {activeModal === 'theme' && renderThemeModal()}
        {activeModal === 'subscription' && renderSubscriptionModal()}
        {activeModal === 'suggestions' && renderSuggestionsModal()}
      </BottomSheetModal>

      {showSubscriptionThanks && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: '#00000088',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 24,
            zIndex: 1000,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 380,
              borderRadius: 16,
              paddingVertical: 22,
              paddingHorizontal: 18,
              backgroundColor: cardsMain,
              borderWidth: 1,
              borderColor: `${primaryColor}40`,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 42, marginBottom: 6 }}>🎉</Text>
            <Text style={{ color: textColor, fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 8 }}>
              ¡Muchísimas gracias!
            </Text>
            <Text style={{ color: `${textColor}cc`, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 16 }}>
              Tu apoyo es muy bien recibido.
              {lastSubscribedAmount ? ` Gracias por suscribirte con ${lastSubscribedAmount} MXN.` : ' Gracias por tu suscripción.'}
            </Text>
            <Pressable
              onPress={handleDismissSubscriptionThanks}
              style={{
                paddingHorizontal: 18,
                paddingVertical: 11,
                borderRadius: 10,
                backgroundColor: primaryColor,
                minWidth: 140,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Continuar</Text>
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

