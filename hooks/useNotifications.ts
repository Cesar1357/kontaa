import { db } from '@/config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { router } from "expo-router";
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useRef } from 'react';
import { useAuth } from './useAuth';

// Configurar el manejador de notificaciones
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const useNotifications = () => {
  const { user, loading } = useAuth();
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    if (loading || !user?.uid) return;

    // Registrar el dispositivo y obtener el token
    const registerPushToken = async () => {
      try {
        // Solicitar permisos
        const { status } = await Notifications.requestPermissionsAsync();
        
        if (status !== 'granted') {
          console.log('Notificaciones rechazadas');
          return;
        }

        // Obtener el token push
        const token = await Notifications.getExpoPushTokenAsync({
          projectId: 'c1fead5b-2ca8-483f-89f5-794a158fc281', // Reemplazar con tu projectId de Expo
        });

        console.log('Push Token:', token.data);

        // Generar o obtener deviceId único
        let deviceId = await AsyncStorage.getItem('deviceId');
        if (!deviceId) {
          deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await AsyncStorage.setItem('deviceId', deviceId);
        }

        // Guardar el dispositivo en Firestore
        await setDoc(
          doc(db, `users/${user.uid}/devices/${deviceId}`),
          {
            pushToken: token.data,
            notificationsEnabled: true, // Por defecto activadas
            deviceId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (error) {
        console.error('Error al registrar push token:', error);
      }
    };

    registerPushToken();

    // Listener para cuando llega una notificación mientras la app está abierta
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('Notificación recibida:', notification);
      }
    );

    // Listener para cuando el usuario toca una notificación
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as { type?: string } | undefined;
        console.log('Usuario interactuó con notificación:', data);

        // Aquí puedes manejar la navegación según el tipo de notificación
        if (data?.type === 'ahorros') {
          // Navegar a ahorros
          console.log('Navegar a ahorros');
          router.push("/(tabs)/AhorrosScreen")
        } else if (data?.type === 'recurrente') {
          // Navegar a presupuestos
          console.log('Navegar a presupuestos');
          router.push("/(tabs)/PresupuestosScreen")
        }
      }
    );


  }, [user, loading]);
};
 