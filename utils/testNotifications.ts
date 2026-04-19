/**
 * Utilidad de prueba para notificaciones push
 * Uso: Llamar desde la app para enviar notificaciones de prueba
 */

import { db } from '@/config/firebase';
import * as Notifications from 'expo-notifications';
import { doc, getDoc } from 'firebase/firestore';

/**
 * Envía una notificación local de prueba (sin pasar por servidor)
 * Útil para debuggear mientras desarrollas
 */
export async function sendLocalTestNotification(
  title: string,
  body: string,
  data?: Record<string, any>
) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: 'default',
        badge: 1,
      },
      trigger: {
        type: 'timeInterval',
        seconds: 2, // Envía en 2 segundos
      },
    });

    console.log('Notificación local de prueba programada');
  } catch (error) {
    console.error('Error enviando notificación local:', error);
  }
}

/**
 * Obtiene el push token del usuario actual
 * Útil para tests y debugging
 */
export async function getPushTokenForCurrentUser(userId: string): Promise<string | null> {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    const pushToken = userDoc.data()?.pushToken;
    return pushToken || null;
  } catch (error) {
    console.error('Error obteniendo push token:', error);
    return null;
  }
}

/**
 * Conjunto de notificaciones de prueba
 */
export const testNotifications = {
  ahorroSinMovimientos: {
    title: '💰 Mantén activo tu ahorro',
    body: 'No has agregado dinero a "Emergencia" en 7 días. ¡Continúa ahorrando!',
    data: { type: 'ahorros', ahorroId: 'test-id' },
  },

  metaProxima: {
    title: '🎉 ¡Meta casi cumplida!',
    body: 'Tu ahorro "Vacaciones" alcanzó el 90% de tu objetivo ($4,500 de $5,000).',
    data: { type: 'ahorros', ahorroId: 'test-id' },
  },

  metaCompleta: {
    title: '🏆 ¡Meta completada!',
    body: '¡Felicidades! Completaste tu objetivo de "iPad nuevo".',
    data: { type: 'ahorros', ahorroId: 'test-id' },
  },

  gastoRecurrente: {
    title: '💳 Pago recurrente hoy',
    body: 'Tu gasto "Netflix" de $150 se ejecuta hoy.',
    data: { type: 'recurrente' },
  },

  presupuestoAlerta: {
    title: '⚠️ Presupuesto cerca del límite',
    body: 'Has usado el 85% de tu presupuesto en "Comida".',
    data: { type: 'presupuesto' },
  },

  presupuestoExcedido: {
    title: '❌ Presupuesto excedido',
    body: 'Excediste tu presupuesto de "Entretenimiento" por $250.',
    data: { type: 'presupuesto' },
  },
};

/**
 * Hook para testear notificaciones durante desarrollo
 * Úsalo en un componente de Settings o Dev
 */
export function useTestNotifications() {
  return {
    sendTestNotification: async (key: keyof typeof testNotifications) => {
      const notification = testNotifications[key];
      await sendLocalTestNotification(notification.title, notification.body, notification.data);
    },

    sendAllTestNotifications: async () => {
      for (const key in testNotifications) {
        const notification = testNotifications[key as keyof typeof testNotifications];
        await Notifications.scheduleNotificationAsync({
          content: {
            title: notification.title,
            body: notification.body,
            data: notification.data,
            sound: 'default',
            badge: 1,
          },
          trigger: {
            type: 'timeInterval',
            seconds: Object.keys(testNotifications).indexOf(key) * 3 + 1,
          },
        });
      }

      console.log('Todas las notificaciones de prueba programadas');
    },
  };
}
