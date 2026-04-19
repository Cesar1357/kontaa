/**
 * Servicio para enviar notificaciones push manualmente desde la app
 * Usado principalmente para notificaciones inmediatas o de prueba
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushNotificationData {
  pushToken: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

/**
 * Envía una notificación push a través de Expo desde el servidor
 * Nota: Esta función debe ser llamada desde un endpoint del servidor,
 * no directamente desde la app
 */
export async function sendPushNotification({
  pushToken,
  title,
  body,
  data = {},
}: PushNotificationData): Promise<boolean> {
  try {
    const message = {
      to: pushToken,
      sound: 'default',
      title,
      body,
      data,
      badge: 1,
    };

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const jsonData = await response.json();

    if (jsonData.errors) {
      console.error('Error enviando notificación:', jsonData.errors);
      return false;
    }

    console.log('Notificación enviada:', jsonData);
    return true;
  } catch (error) {
    console.error('Error en sendPushNotification:', error);
    return false;
  }
}

const FUNCTIONS_BASE_URL = 'https://us-central1-konta-81b61.cloudfunctions.net';

export async function triggerRemoteTestNotification(userId: string) {
  try {
    const response = await fetch(
      `${FUNCTIONS_BASE_URL}/sendTestPush?uid=${encodeURIComponent(userId)}`,
      {
        method: 'GET',
      }
    );

    return response.ok;
  } catch (error) {
    console.error('Error al disparar prueba remota:', error);
    return false;
  }
}

/**
 * Plantillas de notificaciones para diferentes contextos
 */

export const notificationTemplates = {
  // Ahorros
  ahorrosSinMovimientos: (nombreAhorro: string) => ({
    title: '💰 Mantén activo tu ahorro',
    body: `No has agregado dinero a "${nombreAhorro}" en 7 días. ¡Continúa ahorrando!`,
    data: { type: 'ahorros' },
  }),

  metaProxima: (nombreAhorro: string, porcentaje: number) => ({
    title: '🎉 ¡Meta casi cumplida!',
    body: `Tu ahorro "${nombreAhorro}" alcanzó el ${porcentaje}% de tu objetivo.`,
    data: { type: 'ahorros' },
  }),

  metaCompleta: (nombreAhorro: string) => ({
    title: '🏆 ¡Meta completada!',
    body: `¡Felicidades! Completaste tu objetivo de "${nombreAhorro}".`,
    data: { type: 'ahorros' },
  }),

  // Presupuestos
  presupuestoCercaDelLimite: (categoria: string, porcentaje: number) => ({
    title: '⚠️ Presupuesto cerca del límite',
    body: `Has usado el ${porcentaje}% de tu presupuesto en "${categoria}".`,
    data: { type: 'presupuesto' },
  }),

  presupuestoExcedido: (categoria: string, exceso: number) => ({
    title: '❌ Presupuesto excedido',
    body: `Excediste tu presupuesto de "${categoria}" por $${exceso.toLocaleString('es-MX')}`,
    data: { type: 'presupuesto' },
  }),

  // Recurrentes
  gastoRecurrente: (gastos: string[], total: number) => ({
    title: '💳 Pago recurrente hoy',
    body:
      gastos.length === 1
        ? `Tu gasto "${gastos[0]}" de $${total.toLocaleString('es-MX')} se ejecuta hoy.`
        : `${gastos.length} pagos recurrentes por $${total.toLocaleString('es-MX')} se ejecutan hoy.`,
    data: { type: 'recurrente' },
  }),

  // Generales
  bienvenida: () => ({
    title: '👋 ¡Bienvenido a Konta!',
    body: 'Tus notificaciones están activadas. Recibirás actualizaciones sobre tus finanzas.',
    data: { type: 'general' },
  }),
};
