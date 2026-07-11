import { NotificationTestPanel } from '@/components/NotificationTestPanel';
import { ThemedText } from '@/components/ThemedText';
import { useAppTheme } from '@/hooks/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal } from '@gorhom/bottom-sheet/src';
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { router, useLocalSearchParams } from 'expo-router';
import { getAuth, sendEmailVerification, signOut, updateProfile } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
  Platform,
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
import { db } from '../../config/firebase';

type SettingsModal = 'profile' | 'editProfile' | 'security' | 'notifications' | 'theme' | 'subscription' | null;

interface SettingOption {
  id: string;
  title: string;
  icon: string;
  onPress: () => void;
  description?: string;
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
  const auth = getAuth();
  const PLAY_PACKAGE = 'com.cesar1357.konta';
  const SUBSCRIPTION_SKUS: Record<number, string> = {
    10: 'konta_support_10',
    15: 'konta_support_15',
    20: 'konta_support_20',
  };
  const SKU_TO_AMOUNT = Object.entries(SUBSCRIPTION_SKUS).reduce<Record<string, number>>((acc, [amount, sku]) => {
    acc[sku] = Number(amount);
    return acc;
  }, {});
  const supportedSkus = Object.values(SUBSCRIPTION_SKUS);
  const openSubscriptionFromParamsHandledRef = useRef(false);

  // Lifecycle Hooks
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
        if (amount && [10, 15, 20].includes(amount)) {
          setSelectedSupportAmount(amount as 10 | 15 | 20);
          setCustomSupportAmount('');
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

      try {
        await finishTransaction({ purchase, isConsumable: false });

        const amount = SKU_TO_AMOUNT[sku] || 0;
        await setDoc(
          doc(db, `users/${uid}`),
          {
            supportSubscription: {
              active: true,
              pending: false,
              amount,
              sku,
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
          sku,
          source: 'google_play_billing',
        }));
        ToastAndroid.showWithGravity('Suscripción activada con Google Play', ToastAndroid.SHORT, ToastAndroid.BOTTOM);
      } catch (error) {
        console.error('Error processing Play purchase:', error);
        Alert.alert('Error', 'No se pudo finalizar la compra con Google Play.');
      } finally {
        setProcessingSubscription(false);
      }
    });

    const errorSub = purchaseErrorListener((error) => {
      console.error('Play Billing purchase error:', error);
      setProcessingSubscription(false);
      if ((error as { code?: string }).code === 'E_USER_CANCELLED') return;
      Alert.alert('Compra no completada', 'No se pudo completar la suscripción en Google Play.');
    });

    const setupIap = async () => {
      try {
        const connected = await initConnection();
        if (!connected || !isMounted) return;

        const products = await getSubscriptions({
          skus: supportedSkus,
        });

        if (isMounted) {
          setAvailableSubscriptions(Array.isArray(products) ? products : []);
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
  }, [uid, subscriptionData?.startedAt]);

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

  const getAmountToUse = () => {
    if (selectedSupportAmount === 'custom') {
      const parsed = Number(customSupportAmount);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return selectedSupportAmount;
  };

  const getSkuForAmount = (amount: number) => SUBSCRIPTION_SKUS[amount] || null;

  const getAndroidOfferToken = (subscription: Subscription | undefined) => {
    if (!subscription || !('subscriptionOfferDetails' in subscription)) return null;
    return subscription.subscriptionOfferDetails?.[0]?.offerToken || null;
  };

  const getAndroidFormattedPrice = (subscription: Subscription | undefined) => {
    if (!subscription || !('subscriptionOfferDetails' in subscription)) return null;
    return subscription.subscriptionOfferDetails?.[0]?.pricingPhases?.pricingPhaseList?.[0]?.formattedPrice || null;
  };

  const getPriceLabelForAmount = (amount: number) => {
    const sku = getSkuForAmount(amount);
    if (!sku) return `${amount} MXN`;
    const product = availableSubscriptions.find((item) => item.productId === sku);
    return getAndroidFormattedPrice(product) || `${amount} MXN`;
  };

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
      const amount = SKU_TO_AMOUNT[latest.productId] || 0;

      await setDoc(
        doc(db, `users/${uid}`),
        {
          supportSubscription: {
            ...(subscriptionData || {}),
            active: true,
            pending: false,
            amount,
            sku: latest.productId,
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
        amount,
        sku: latest.productId,
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
    const amount = getAmountToUse();
    if (!amount || amount <= 0) {
      Alert.alert('Monto inválido', 'Selecciona un monto válido para continuar.');
      return;
    }

    const sku = getSkuForAmount(amount);
    if (!sku) {
      Alert.alert('Monto no disponible', 'Por ahora solo están disponibles los planes de 10, 15 y 20 MXN en Google Play.');
      return;
    }

    if (!iapReady) {
      Alert.alert('Google Play no está listo', 'Espera unos segundos e inténtalo nuevamente.');
      return;
    }

    try {
      setProcessingSubscription(true);
      await setDoc(
        doc(db, `users/${uid}`),
        {
          supportSubscription: {
            ...(subscriptionData || {}),
            pending: true,
            pendingAmount: amount,
            pendingSku: sku,
            currency: 'MXN',
            source: 'google_play_billing',
            updatedAt: new Date(),
          },
        },
        { merge: true }
      );

      const selectedSubscription = availableSubscriptions.find((item) => item.productId === sku);
      const selectedOfferToken = getAndroidOfferToken(selectedSubscription);

      if (!selectedOfferToken) {
        throw new Error(`No se encontró una oferta válida para la suscripción ${sku}.`);
      }

      await requestSubscription({
        subscriptionOffers: [
          {
            sku,
            offerToken: selectedOfferToken,
          },
        ],
        obfuscatedAccountIdAndroid: uid,
      });
    } catch (error) {
      console.error('Error opening Play subscription:', error);
      Alert.alert('Error', 'No se pudo iniciar la compra en Google Play.');
      setProcessingSubscription(false);
    } finally {
      // Se termina en listener de compra o error.
    }
  };

  const handleOpenManageSubscriptions = async () => {
    try {
      await Linking.openURL(`https://play.google.com/store/account/subscriptions?package=${PLAY_PACKAGE}`);
    } catch (error) {
      Alert.alert('Error', 'No se pudo abrir la gestión de suscripciones en Google Play.');
    }
  };

  const handleManualSubscriptionSync = async () => {
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
          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => setThemeMode(option.value)}
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
              }}
            >
              <Text style={{ color: textColor, fontWeight: selected ? '700' : '500' }}>
                {option.label}
              </Text>
              {selected ? (
                <Icon type="ionicon" name="checkmark-circle" color={primaryColor} size={20} />
              ) : (
                <Icon type="ionicon" name="ellipse-outline" color={`${textColor}80`} size={20} />
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
            {[10, 15, 20].map((value) => {
              const selected = selectedSupportAmount === value;
              return (
                <TouchableOpacity
                  key={`support-${value}`}
                  onPress={() => setSelectedSupportAmount(value)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    marginRight: 8,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: `${primaryColor}55`,
                    backgroundColor: selected ? primaryColor : `${primaryColor}16`,
                  }}
                >
                  <Text style={{ color: selected ? '#fff' : textColor, fontWeight: '700' }}>{value} MXN</Text>
                  <Text style={{ color: selected ? '#fff' : `${textColor}b0`, fontSize: 11, marginTop: 2 }}>
                    {getPriceLabelForAmount(value)}
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
                borderWidth: 1,
                borderColor: `${primaryColor}55`,
                backgroundColor: selectedSupportAmount === 'custom' ? primaryColor : `${primaryColor}16`,
              }}
            >
              <Text style={{ color: selectedSupportAmount === 'custom' ? '#fff' : textColor, fontWeight: '700' }}>Otro</Text>
            </TouchableOpacity>
          </View>

          {selectedSupportAmount === 'custom' && (
            <TextInput
              value={customSupportAmount}
              onChangeText={setCustomSupportAmount}
              keyboardType="numeric"
              placeholder="Monto personalizado en MXN"
              placeholderTextColor={`${textColor}60`}
              style={{
                marginTop: 4,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: `${primaryColor}35`,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: textColor,
              }}
            />
          )}

          <Text style={{ color: `${textColor}80`, fontSize: 12, marginTop: 10 }}>
            Beneficios iguales para todos los montos. Sin suscripción, algunas funciones se limitan a 2 elementos.
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleOpenPlaySubscription}
          disabled={processingSubscription || syncingPlay || !amount || selectedSupportAmount === 'custom'}
          style={{
            backgroundColor: primaryColor,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
            marginBottom: 10,
            opacity: processingSubscription || syncingPlay || selectedSupportAmount === 'custom' ? 0.7 : 1,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>
            {processingSubscription ? 'Procesando...' : 'Suscribirme en Google Play'}
          </Text>
        </TouchableOpacity>

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
              v2.0.0   | 
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
              }}
            >
              <Ionicons name="logo-instagram" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', marginLeft: 8 }}>
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
          <Text style={{ fontSize: 0, color: `${textColor}40` }}>
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
      </BottomSheetModal>
    </SafeAreaView>
  );
}

