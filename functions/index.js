/**
 * Firebase Cloud Functions para notificaciones push de Konta
 * 
 * Requiere:
 * - npm install firebase-admin firebase-functions
 * 
 * Deployment:
 * - firebase deploy --only functions
 */

const admin = require('firebase-admin');
const functions = require('firebase-functions');
const { google } = require('googleapis');
const { onMessagePublished } = require('firebase-functions/v2/pubsub');
const { onCall, HttpsError } = require('firebase-functions/v2/https');

admin.initializeApp();
const db = admin.firestore();

// Configuración de URLs de Expo
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const KONTA_ANDROID_PACKAGE = process.env.KONTA_ANDROID_PACKAGE || 'com.cesar1357.konta';
const PLAY_RT_SUBSCRIPTION_TOPIC = process.env.PLAY_RT_SUBSCRIPTION_TOPIC || 'play-subscription-events';

const googleAuth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/androidpublisher'],
});

const androidpublisher = google.androidpublisher({
  version: 'v3',
  auth: googleAuth,
});

function mapPlaySubscriptionState(subscriptionState) {
  const state = subscriptionState || 'SUBSCRIPTION_STATE_UNSPECIFIED';
  const activeStates = new Set([
    'SUBSCRIPTION_STATE_ACTIVE',
    'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  ]);

  return {
    state,
    active: activeStates.has(state),
  };
}

function getLatestLineItem(subscription) {
  const lineItems = Array.isArray(subscription?.lineItems) ? subscription.lineItems : [];
  if (lineItems.length === 0) return null;

  return [...lineItems].sort((a, b) => {
    const aExpiry = Number(a?.expiryTime || 0);
    const bExpiry = Number(b?.expiryTime || 0);
    return bExpiry - aExpiry;
  })[0];
}

async function findUserByPurchaseToken(purchaseToken) {
  const snap = await db
    .collection('users')
    .where('supportSubscription.purchaseToken', '==', purchaseToken)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].id;
}

async function upsertSupportSubscription(uid, payload) {
  await db.collection('users').doc(uid).set(
    {
      supportSubscription: {
        source: 'google_play_server',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...payload,
      },
    },
    { merge: true }
  );
}

async function verifyPlaySubscriptionAndPersist({ uid, purchaseToken, packageName }) {
  const targetPackageName = packageName || KONTA_ANDROID_PACKAGE;

  const response = await androidpublisher.purchases.subscriptionsv2.get({
    packageName: targetPackageName,
    token: purchaseToken,
  });

  const subscription = response?.data || {};
  const { active, state } = mapPlaySubscriptionState(subscription.subscriptionState);
  const latestLineItem = getLatestLineItem(subscription);

  const productId = latestLineItem?.productId || 'konta_support';
  const expiryTime = latestLineItem?.expiryTime ? new Date(latestLineItem.expiryTime) : null;
  const autoRenewEnabled = latestLineItem?.autoRenewingPlan?.autoRenewEnabled;

  await upsertSupportSubscription(uid, {
    active,
    pending: false,
    sku: productId,
    productId,
    packageName: targetPackageName,
    purchaseToken,
    orderId: subscription.latestOrderId || null,
    state,
    expiryTime,
    autoRenewEnabled: typeof autoRenewEnabled === 'boolean' ? autoRenewEnabled : null,
    lastVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    uid,
    productId,
    state,
    active,
    orderId: subscription.latestOrderId || null,
    expiryTime: latestLineItem?.expiryTime || null,
  };
}

/**
 * Obtiene los tokens de push de dispositivos con notificaciones activadas para un usuario
 */
async function getEnabledPushTokens(userId) {
  try {
    const devicesSnapshot = await db.collection(`users/${userId}/devices`)
      .where('notificationsEnabled', '==', true)
      .get();
    
    const tokens = [];
    devicesSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.pushToken) {
        tokens.push(data.pushToken);
      }
    });
    
    return tokens;
  } catch (error) {
    console.error('Error obteniendo tokens de push:', error);
    return [];
  }
}
/**
 * Envía una notificación push a través de Expo
 * Ahora acepta un array de tokens para enviar a múltiples dispositivos
 */
async function sendPushNotification(pushTokens, title, body, data = {}) {
  if (!Array.isArray(pushTokens)) {
    pushTokens = [pushTokens]; // Para compatibilidad con llamadas individuales
  }
  
  const results = [];
  for (const pushToken of pushTokens) {
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
        results.push(false);
      } else {
        console.log('Notificación enviada exitosamente:', jsonData);
        results.push(true);
      }
    } catch (error) {
      console.error('Error en sendPushNotification:', error);
      results.push(false);
    }
  }
  
  return results.some(result => result); // Retorna true si al menos una se envió
}

/**
 * Endpoint de prueba para enviar un push remoto al usuario especificado.
 * Útil para validar que el token y las credenciales de Expo/FCM están configuradas.
 */
exports.sendTestPush = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  const uid = req.query.uid || req.body?.uid;
  if (!uid) {
    return res.status(400).json({ error: 'Missing uid parameter' });
  }

  try {
    const pushTokens = await getEnabledPushTokens(uid);

    if (pushTokens.length === 0) {
      return res.status(404).json({ error: 'User has no enabled devices with push tokens' });
    }

    const title = 'Hola';
    const body = 'Sigues ahí?';

    const sent = await sendPushNotification(pushTokens, title, body, {
      type: 'test',
      source: 'remote-test',
    });

    if (!sent) {
      return res.status(500).json({ error: 'Failed to send push notification' });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error en sendTestPush:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Verifica diariamente si hay ahorros sin movimientos y envía notificaciones
 * Se ejecuta a las 10:00 AM cada día
 */
exports.notifyAhorrosSinMovimientos = functions.scheduler
  .onSchedule(
    {
      schedule: '0 10 * * *',
      timeZone: 'America/Mexico_City',
    },
    async (context) => {
    console.log('Iniciando verificación de ahorros sin movimientos');

    try {
      const usersSnapshot = await db.collection('users').get();

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        
        // Obtener tokens de dispositivos con notificaciones activadas
        const pushTokens = await getEnabledPushTokens(userId);
        if (pushTokens.length === 0) {
          console.log(`Usuario ${userId} no tiene dispositivos con notificaciones activadas`);
          continue;
        }

        // Obtener los ahorros del usuario
        const ahorrosSnapshot = await db
          .collection(`users/${userId}/ahorros`)
          .get();

        for (const ahorroDoc of ahorrosSnapshot.docs) {
          const ahorroData = ahorroDoc.data();
          const ahorroId = ahorroDoc.id;

          // Verificar movimientos en los últimos 7 días
          const seiseDiasAtras = new Date();
          seiseDiasAtras.setDate(seiseDiasAtras.getDate() - 7);

          const movimientosRecientes = await db
            .collection(`users/${userId}/ahorros/${ahorroId}/movimientos`)
            .where('creado', '>=', admin.firestore.Timestamp.fromDate(seiseDiasAtras))
            .get();

          // Si no hay movimientos en los últimos 7 días, enviar notificación
          if (movimientosRecientes.empty) {
            const title = '💰 Mantén activo tu ahorro';
            const body = `No has agregado dinero a "${ahorroData.nombre}" en 7 días. ¡Continúa ahorrando!`;

            await sendPushNotification(pushTokens, title, body, {
              type: 'ahorros',
              ahorroId,
              ahorroNombre: ahorroData.nombre,
            });

            console.log(
              `Notificación enviada para ahorro ${ahorroId} del usuario ${userId}`
            );
          }
        }
      }

      console.log('Verificación de ahorros completada');
      return null;
    } catch (error) {
      console.error('Error en notifyAhorrosSinMovimientos:', error);
      return null;
    }
  });

/**
 * Verifica diariamente si no hay transacciones en los últimos 7 días
 * Se ejecuta a las 10:30 AM cada día
 */
exports.notifyTransaccionesSinMovimiento = functions.scheduler
  .onSchedule(
    {
      schedule: '30 10 * * *',
      timeZone: 'America/Mexico_City',
    },
    async (context) => {
      console.log('Verificando transacciones sin movimiento');

      try {
        const usersSnapshot = await db.collection('users').get();

        for (const userDoc of usersSnapshot.docs) {
          const userId = userDoc.id;
          const pushTokens = await getEnabledPushTokens(userId);
          if (pushTokens.length === 0) continue;

          const diasAtras = new Date();
          diasAtras.setDate(diasAtras.getDate() - 5);

          const transaccionesRecientes = await db
            .collection(`users/${userId}/transacciones`)
            .where('fecha', '>=', admin.firestore.Timestamp.fromDate(diasAtras))
            .get();

          if (!transaccionesRecientes.empty) continue;

          const hasOlderTransaccion = !(await db
            .collection(`users/${userId}/transacciones`)
            .limit(1)
            .get()).empty;

          if (!hasOlderTransaccion) continue;

          const title = '📌 Registro de transacciones inactivo';
          const body = 'No has registrado ningún movimiento en los últimos 7 días. Agrega un gasto o ingreso para mantener tu control financiero actualizado.';

          await sendPushNotification(pushTokens, title, body, {
            type: 'transacciones',
            periodo: 'sin-movimiento',
          });

          console.log(`Notificación de transacciones sin movimiento enviada a ${userId}`);
        }

        console.log('Verificación de transacciones sin movimiento completada');
        return null;
      } catch (error) {
        console.error('Error en notifyTransaccionesSinMovimiento:', error);
        return null;
      }
    });

/**
 * Verifica diariamente los gastos recurrentes que deben cobrar hoy
 * Se ejecuta a las 8:00 AM cada día
 */
exports.notifyGastosRecurrentes = functions.scheduler
  .onSchedule(
    {
      schedule: '0 8 * * *',
      timeZone: 'America/Mexico_City',
    },
    async (context) => {
    console.log('Verificando gastos recurrentes para hoy');

    try {
      const usersSnapshot = await db.collection('users').get();
      const today = new Date().getDate();

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        
        // Obtener tokens de dispositivos con notificaciones activadas
        const pushTokens = await getEnabledPushTokens(userId);
        if (pushTokens.length === 0) continue;

        // Obtener gastos recurrentes activos
        const gastosSnapshot = await db
          .collection(`users/${userId}/gastosRecurrentes`)
          .where('activo', '==', true)
          .where('diaPago', '==', today)
          .get();

        if (!gastosSnapshot.empty) {
          let totalGastos = 0;
          let gastosDetalle = [];

          for (const gastoDoc of gastosSnapshot.docs) {
            const gastoData = gastoDoc.data();
            totalGastos += gastoData.monto || 0;
            gastosDetalle.push(gastoData.nombre);
          }

          const title = '💳 Pago recurrente hoy';
          const body =
            gastosDetalle.length === 1
              ? `Tu gasto "${gastosDetalle[0]}" de $${totalGastos.toLocaleString('es-MX')} se ejecuta hoy.`
              : `${gastosDetalle.length} pagos recurrentes por $${totalGastos.toLocaleString('es-MX')} se ejecutan hoy.`;

          await sendPushNotification(pushTokens, title, body, {
            type: 'recurrente',
            totalGastos,
            gastos: gastosDetalle.join(', '),
          });

          console.log(`Notificación de gastos recurrentes enviada a ${userId}`);
        }
      }

      console.log('Verificación de gastos recurrentes completada');
      return null;
    } catch (error) {
      console.error('Error en notifyGastosRecurrentes:', error);
      return null;
    }
  });

/**
 * Verifica diariamente los ingresos recurrentes que deben cobrar hoy
 * Se ejecuta a las 9:00 AM cada día
 */
exports.notifyIngresosRecurrentes = functions.scheduler
  .onSchedule(
    {
      schedule: '0 9 * * *',
      timeZone: 'America/Mexico_City',
    },
    async (context) => {
    console.log('Verificando ingresos recurrentes para hoy');

    try {
      const usersSnapshot = await db.collection('users').get();
      const today = new Date().getDate();

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        
        // Obtener tokens de dispositivos con notificaciones activadas
        const pushTokens = await getEnabledPushTokens(userId);
        if (pushTokens.length === 0) continue;

        // Obtener ingresos recurrentes activos
        const ingresosSnapshot = await db
          .collection(`users/${userId}/ingresosRecurrentes`)
          .where('activo', '==', true)
          .where('diaPago', '==', today)
          .get();

        if (!ingresosSnapshot.empty) {
          let totalIngresos = 0;
          let ingresosDetalle = [];

          for (const ingresoDoc of ingresosSnapshot.docs) {
            const ingresoData = ingresoDoc.data();
            totalIngresos += ingresoData.monto || 0;
            ingresosDetalle.push(ingresoData.nombre);
          }

          const title = '💰 Ingreso recurrente hoy';
          const body =
            ingresosDetalle.length === 1
              ? `Tu ingreso "${ingresosDetalle[0]}" de $${totalIngresos.toLocaleString('es-MX')} se recibe hoy.`
              : `${ingresosDetalle.length} ingresos recurrentes por $${totalIngresos.toLocaleString('es-MX')} se reciben hoy.`;

          await sendPushNotification(pushTokens, title, body, {
            type: 'recurrente',
            totalIngresos,
            ingresos: ingresosDetalle.join(', '),
          });

          console.log(`Notificación de ingresos recurrentes enviada a ${userId}`);
        }
      }

      console.log('Verificación de ingresos recurrentes completada');
      return null;
    } catch (error) {
      console.error('Error en notifyIngresosRecurrentes:', error);
      return null;
    }
  });

/**
 * Procesa transacciones recurrentes automáticamente
 * Se ejecuta a las 6:00 AM cada día
 */
exports.processRecurringTransactions = functions.scheduler
  .onSchedule(
    {
      schedule: '0 6 * * *',
      timeZone: 'America/Mexico_City',
    },
    async (context) => {
    console.log('Procesando transacciones recurrentes');

    try {
      const usersSnapshot = await db.collection('users').get();
      const ahora = new Date();

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;

        // Colecciones separadas
        const refs = [
          { ref: `users/${userId}/gastosRecurrentes`, tipo: "egreso" },
          { ref: `users/${userId}/ingresosRecurrentes`, tipo: "ingreso" },
        ];

        for (const { ref, tipo } of refs) {
          const snap = await db.collection(ref).get();
          const recurrentes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

          for (const g of recurrentes) {
            if (!g.activo) continue;
            console.log(`Procesando ${tipo}:`, g.nombre);

            const ultimaFecha = new Date(
              g.lastUpdate?.seconds ? g.lastUpdate.seconds * 1000 : g.lastUpdate || Date.now()
            );
            const meses = obtenerMesesEntre(ultimaFecha, ahora);

            for (const m of meses) {
              const fechaTransaccion = new Date(Date.UTC(m.año, m.mes, g.diaPago, 12, 0, 0));
              console.log(`Fecha transacción calculada: ${fechaTransaccion.toISOString()} para diaPago: ${g.diaPago}, mes: ${m.mes + 1}/${m.año}`);
              const inicioMes = new Date(m.año, m.mes, 1);
              const finMes = new Date(m.año, m.mes + 1, 0);

              // Si la fecha de transacción aún no llegó, no generar la transacción
              if (fechaTransaccion > ahora) {
                console.log(`Se omite ${tipo} recurrente ${g.nombre} para ${m.mes + 1}/${m.año} porque el día de pago aún no llega.`);
                continue;
              }

              // Buscar si ya existe una transacción de ese recurrente en el mes
              const transaccionesRef = db.collection(`users/${userId}/transacciones`);
              const snapTrans = await transaccionesRef.where("recurrenteId", "==", g.id).get();

              const existe = snapTrans.docs.some((d) => {
                const f = d.data().fecha?.toDate?.() || new Date(d.data().fecha);
                return f >= inicioMes && f <= finMes;
              });

              if (!existe) {
                console.log(`Creando transacción de ${tipo} para ${m.mes + 1}/${m.año}`);
                const transData = {
                  descripcion: g.nombre,
                  monto: g.monto,
                  tipo,
                  fecha: admin.firestore.Timestamp.fromDate(fechaTransaccion),
                  recurrenteId: g.id,
                  creadoAutomaticamente: true,
                };

                if (tipo === "egreso") {
                  transData.presupuestoCategoria = g.categoria || "General";
                } else {
                  transData.presupuestoCategoria = null;
                }

                await transaccionesRef.add(transData);

                // Actualizar lastUpdate
                await db.collection(ref).doc(g.id).update({
                  lastUpdate: admin.firestore.Timestamp.fromDate(ahora)
                });
              } else {
                console.log(`Ya existe transacción de ${tipo} para ${m.mes + 1}/${m.año}`);
              }
            }
          }
        }
      }

      console.log('Procesamiento de transacciones recurrentes completado');
      return null;
    } catch (error) {
      console.error('Error en processRecurringTransactions:', error);
      return null;
    }
  });

// Utilidad auxiliar: genera todos los meses entre 2 fechas
function obtenerMesesEntre(inicio, fin) {
  const meses = [];
  let año = inicio.getFullYear();
  let mes = inicio.getMonth();

  while (año < fin.getFullYear() || (año === fin.getFullYear() && mes <= fin.getMonth())) {
    meses.push({ año, mes });
    mes++;
    if (mes > 11) {
      mes = 0;
      año++;
    }
  }
  return meses;
}

exports.notifyMetaAhorroProxima = functions.firestore
  .onDocumentUpdated('users/{userId}/ahorros/{ahorroId}', async event => {
    try {
      if (!event || !event.params) {
        console.error('Event or params undefined in notifyMetaAhorroProxima', event);
        return null;
      }
      const { userId, ahorroId } = event.params;
      const newData = event.data.after.data();
      const oldData = event.data.before.data();

      // Si no hay meta definida, salir
      if (!newData.meta || newData.meta === 0) return null;

      const porcentajeAnterior = oldData.cantidadActual / newData.meta;
      const porcentajeNuevo = newData.cantidadActual / newData.meta;

      // Si cruzamos el 80%, enviar notificación
      if (porcentajeAnterior < 0.8 && porcentajeNuevo >= 0.8) {
        try {
          const pushTokens = await getEnabledPushTokens(userId);
          if (pushTokens.length === 0) return null;

          const title = '🎉 ¡Meta casi cumplida!';
          const body = `Tu ahorro "${newData.nombre}" alcanzó el 80% de tu objetivo. ¡Casi lo logras!`;

          await sendPushNotification(pushTokens, title, body, {
            type: 'ahorros',
            ahorroId,
            ahorroNombre: newData.nombre,
          });

          console.log(`Notificación de meta próxima enviada a ${userId}`);
        } catch (error) {
          console.error('Error en notifyMetaAhorroProxima:', error);
        }
      }

      return null;
    } catch (error) {
      console.error('Error general en notifyMetaAhorroProxima:', error);
      return null;
    }
  });

/**
 * Notificación cuando se cumple completamente una meta de ahorro
 */
exports.notifyMetaAhorroCompleta = functions.firestore
  .onDocumentUpdated('users/{userId}/ahorros/{ahorroId}', async event => {
    try {
      if (!event || !event.params) {
        console.error('Event or params undefined in notifyMetaAhorroCompleta', event);
        return null;
      }
      const { userId, ahorroId } = event.params;
      const newData = event.data.after.data();
      const oldData = event.data.before.data();

      // Si no hay meta definida, salir
      if (!newData.meta || newData.meta === 0) return null;

      const seCompleto =
        oldData.cantidadActual < newData.meta &&
        newData.cantidadActual >= newData.meta;

      if (seCompleto) {
        try {
          const pushTokens = await getEnabledPushTokens(userId);
          if (pushTokens.length === 0) return null;

          const title = '🏆 ¡Meta completada!';
          const body = `¡Felicidades! Completaste tu objetivo de "${newData.nombre}". Puedes crear una nueva meta.`;

          await sendPushNotification(pushTokens, title, body, {
            type: 'ahorros',
            ahorroId,
            ahorroNombre: newData.nombre,
          });

          console.log(`Notificación de meta completa enviada a ${userId}`);
        } catch (error) {
          console.error('Error en notifyMetaAhorroCompleta:', error);
        }
      }

      return null;
    } catch (error) {
      console.error('Error general en notifyMetaAhorroCompleta:', error);
      return null;
    }
  });

/**
 * Verifica presupuestos diarios y envía alertas
 * Se ejecuta cada hora para monitoreo en tiempo real
 */
exports.notifyPresupuestosDiarios = functions.scheduler
  .onSchedule(
    {
      schedule: '0 * * * *', // Cada hora
      timeZone: 'America/Mexico_City',
    },
    async (context) => {
    console.log('Verificando presupuestos diarios');

    try {
      const usersSnapshot = await db.collection('users').get();
      const hoy = new Date();
      const inicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0);
      const finDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const userData = userDoc.data();

        // Verificar si tiene presupuesto diario
        if (!userData.presupuestos?.dia || userData.presupuestos.dia === 0) continue;

        const presupuestoDiario = userData.presupuestos.dia;

        // Obtener tokens de dispositivos con notificaciones activadas
        const pushTokens = await getEnabledPushTokens(userId);
        if (pushTokens.length === 0) continue;

        // Calcular gastos del día actual
        const transaccionesRef = db.collection(`users/${userId}/transacciones`);
        const gastosDia = await transaccionesRef
          .where('tipo', '==', 'egreso')
          .where('fecha', '>=', admin.firestore.Timestamp.fromDate(inicioDia))
          .where('fecha', '<=', admin.firestore.Timestamp.fromDate(finDia))
          .get();

        let totalGastosDia = 0;
        gastosDia.forEach(doc => {
          totalGastosDia += doc.data().monto || 0;
        });

        const porcentajeGastado = (totalGastosDia / presupuestoDiario) * 100;

        // Alertas de proximidad (80%)
        if (porcentajeGastado >= 80 && porcentajeGastado < 100) {
          const restante = presupuestoDiario - totalGastosDia;
          const title = '⚠️ Presupuesto diario casi agotado';
          const body = `Has gastado $${totalGastosDia.toLocaleString('es-MX')} de tu presupuesto diario de $${presupuestoDiario.toLocaleString('es-MX')}. Te quedan $${restante.toLocaleString('es-MX')}.`;

          await sendPushNotification(pushTokens, title, body, {
            type: 'presupuesto',
            periodo: 'diario',
            gastado: totalGastosDia,
            presupuesto: presupuestoDiario,
            porcentaje: Math.round(porcentajeGastado),
          });

          console.log(`Alerta de presupuesto diario próximo enviada a ${userId}`);
        }

        // Alerta de rebase (100%+)
        if (porcentajeGastado >= 100) {
          const excedente = totalGastosDia - presupuestoDiario;
          const title = '🚨 Presupuesto diario excedido';
          const body = `Has excedido tu presupuesto diario por $${excedente.toLocaleString('es-MX')}. Gastaste $${totalGastosDia.toLocaleString('es-MX')} de $${presupuestoDiario.toLocaleString('es-MX')}.`;

          await sendPushNotification(pushTokens, title, body, {
            type: 'presupuesto',
            periodo: 'diario',
            gastado: totalGastosDia,
            presupuesto: presupuestoDiario,
            excedente: excedente,
            porcentaje: Math.round(porcentajeGastado),
          });

          console.log(`Alerta de presupuesto diario excedido enviada a ${userId}`);
        }
      }

      console.log('Verificación de presupuestos diarios completada');
      return null;
    } catch (error) {
      console.error('Error en notifyPresupuestosDiarios:', error);
      return null;
    }
  });

/**
 * Verifica presupuestos semanales y envía alertas
 * Se ejecuta diariamente a las 10:00 PM
 */
exports.notifyPresupuestosSemanales = functions.scheduler
  .onSchedule(
    {
      schedule: '0 22 * * *', // 10:00 PM diario
      timeZone: 'America/Mexico_City',
    },
    async (context) => {
    console.log('Verificando presupuestos semanales');

    try {
      const usersSnapshot = await db.collection('users').get();
      const hoy = new Date();

      // Calcular inicio y fin de semana (lunes a domingo)
      const diaSemana = hoy.getDay(); // 0 = domingo, 1 = lunes
      const diasDesdeLunes = diaSemana === 0 ? 6 : diaSemana - 1;
      const inicioSemana = new Date(hoy);
      inicioSemana.setDate(hoy.getDate() - diasDesdeLunes);
      inicioSemana.setHours(0, 0, 0, 0);

      const finSemana = new Date(inicioSemana);
      finSemana.setDate(inicioSemana.getDate() + 6);
      finSemana.setHours(23, 59, 59, 999);

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const userData = userDoc.data();

        // Verificar si tiene presupuesto semanal
        if (!userData.presupuestos?.semana || userData.presupuestos.semana === 0) continue;

        const presupuestoSemanal = userData.presupuestos.semana;

        // Obtener tokens de dispositivos con notificaciones activadas
        const pushTokens = await getEnabledPushTokens(userId);
        if (pushTokens.length === 0) continue;

        // Calcular gastos de la semana actual
        const transaccionesRef = db.collection(`users/${userId}/transacciones`);
        const gastosSemana = await transaccionesRef
          .where('tipo', '==', 'egreso')
          .where('fecha', '>=', admin.firestore.Timestamp.fromDate(inicioSemana))
          .where('fecha', '<=', admin.firestore.Timestamp.fromDate(finSemana))
          .get();

        let totalGastosSemana = 0;
        gastosSemana.forEach(doc => {
          totalGastosSemana += doc.data().monto || 0;
        });

        const porcentajeGastado = (totalGastosSemana / presupuestoSemanal) * 100;

        // Alertas de proximidad (80%)
        if (porcentajeGastado >= 80 && porcentajeGastado < 100) {
          const restante = presupuestoSemanal - totalGastosSemana;
          const title = '⚠️ Presupuesto semanal casi agotado';
          const body = `Has gastado $${totalGastosSemana.toLocaleString('es-MX')} de tu presupuesto semanal de $${presupuestoSemanal.toLocaleString('es-MX')}. Te quedan $${restante.toLocaleString('es-MX')}.`;

          await sendPushNotification(pushTokens, title, body, {
            type: 'presupuesto',
            periodo: 'semanal',
            gastado: totalGastosSemana,
            presupuesto: presupuestoSemanal,
            porcentaje: Math.round(porcentajeGastado),
          });

          console.log(`Alerta de presupuesto semanal próximo enviada a ${userId}`);
        }

        // Alerta de rebase (100%+)
        if (porcentajeGastado >= 100) {
          const excedente = totalGastosSemana - presupuestoSemanal;
          const title = '🚨 Presupuesto semanal excedido';
          const body = `Has excedido tu presupuesto semanal por $${excedente.toLocaleString('es-MX')}. Gastaste $${totalGastosSemana.toLocaleString('es-MX')} de $${presupuestoSemanal.toLocaleString('es-MX')}.`;

          await sendPushNotification(pushTokens, title, body, {
            type: 'presupuesto',
            periodo: 'semanal',
            gastado: totalGastosSemana,
            presupuesto: presupuestoSemanal,
            excedente: excedente,
            porcentaje: Math.round(porcentajeGastado),
          });

          console.log(`Alerta de presupuesto semanal excedido enviada a ${userId}`);
        }
      }

      console.log('Verificación de presupuestos semanales completada');
      return null;
    } catch (error) {
      console.error('Error en notifyPresupuestosSemanales:', error);
      return null;
    }
  });

/**
 * Verifica presupuestos mensuales y envía alertas
 * Se ejecuta diariamente a las 11:00 PM
 */
exports.notifyPresupuestosMensuales = functions.scheduler
  .onSchedule(
    {
      schedule: '0 23 * * *', // 11:00 PM diario
      timeZone: 'America/Mexico_City',
    },
    async (context) => {
    console.log('Verificando presupuestos mensuales');

    try {
      const usersSnapshot = await db.collection('users').get();
      const hoy = new Date();
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1, 0, 0, 0);
      const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const userData = userDoc.data();

        // Verificar si tiene presupuesto mensual
        if (!userData.presupuestos?.mes || userData.presupuestos.mes === 0) continue;

        const presupuestoMensual = userData.presupuestos.mes;

        // Obtener tokens de dispositivos con notificaciones activadas
        const pushTokens = await getEnabledPushTokens(userId);
        if (pushTokens.length === 0) continue;

        // Calcular gastos del mes actual
        const transaccionesRef = db.collection(`users/${userId}/transacciones`);
        const gastosMes = await transaccionesRef
          .where('tipo', '==', 'egreso')
          .where('fecha', '>=', admin.firestore.Timestamp.fromDate(inicioMes))
          .where('fecha', '<=', admin.firestore.Timestamp.fromDate(finMes))
          .get();

        let totalGastosMes = 0;
        gastosMes.forEach(doc => {
          totalGastosMes += doc.data().monto || 0;
        });

        const porcentajeGastado = (totalGastosMes / presupuestoMensual) * 100;

        // Alertas de proximidad (80%)
        if (porcentajeGastado >= 80 && porcentajeGastado < 100) {
          const restante = presupuestoMensual - totalGastosMes;
          const title = '⚠️ Presupuesto mensual casi agotado';
          const body = `Has gastado $${totalGastosMes.toLocaleString('es-MX')} de tu presupuesto mensual de $${presupuestoMensual.toLocaleString('es-MX')}. Te quedan $${restante.toLocaleString('es-MX')}.`;

          await sendPushNotification(pushTokens, title, body, {
            type: 'presupuesto',
            periodo: 'mensual',
            gastado: totalGastosMes,
            presupuesto: presupuestoMensual,
            porcentaje: Math.round(porcentajeGastado),
          });

          console.log(`Alerta de presupuesto mensual próximo enviada a ${userId}`);
        }

        // Alerta de rebase (100%+)
        if (porcentajeGastado >= 100) {
          const excedente = totalGastosMes - presupuestoMensual;
          const title = '🚨 Presupuesto mensual excedido';
          const body = `Has excedido tu presupuesto mensual por $${excedente.toLocaleString('es-MX')}. Gastaste $${totalGastosMes.toLocaleString('es-MX')} de $${presupuestoMensual.toLocaleString('es-MX')}.`;

          await sendPushNotification(pushTokens, title, body, {
            type: 'presupuesto',
            periodo: 'mensual',
            gastado: totalGastosMes,
            presupuesto: presupuestoMensual,
            excedente: excedente,
            porcentaje: Math.round(porcentajeGastado),
          });

          console.log(`Alerta de presupuesto mensual excedido enviada a ${userId}`);
        }
      }

      console.log('Verificación de presupuestos mensuales completada');
      return null;
    } catch (error) {
      console.error('Error en notifyPresupuestosMensuales:', error);
      return null;
    }
  });

/**
 * Verifica presupuestos personalizados por categoría y envía alertas
 * Se ejecuta cada 6 horas para monitoreo frecuente
 */
exports.notifyPresupuestosPersonalizados = functions.scheduler
  .onSchedule(
    {
      schedule: '0 */6 * * *', // Cada 6 horas
      timeZone: 'America/Mexico_City',
    },
    async (context) => {
    console.log('Verificando presupuestos personalizados');

    try {
      const usersSnapshot = await db.collection('users').get();
      const hoy = new Date();
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1, 0, 0, 0);
      const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;

        // Obtener tokens de dispositivos con notificaciones activadas
        const pushTokens = await getEnabledPushTokens(userId);
        if (pushTokens.length === 0) continue;

        // Obtener presupuestos personalizados del usuario
        const presupuestosRef = db.collection(`users/${userId}/presupuestosPersonalizados`);
        const presupuestosSnapshot = await presupuestosRef.get();

        for (const presupuestoDoc of presupuestosSnapshot.docs) {
          const presupuestoData = presupuestoDoc.data();
          const categoria = presupuestoData.categoria;
          const limite = presupuestoData.limite;

          if (!limite || limite === 0) continue;

          // Calcular gastos de la categoría en el mes actual
          const transaccionesRef = db.collection(`users/${userId}/transacciones`);
          const gastosCategoria = await transaccionesRef
            .where('tipo', '==', 'egreso')
            .where('presupuestoCategoria', '==', categoria)
            .where('fecha', '>=', admin.firestore.Timestamp.fromDate(inicioMes))
            .where('fecha', '<=', admin.firestore.Timestamp.fromDate(finMes))
            .get();

          let totalGastosCategoria = 0;
          gastosCategoria.forEach(doc => {
            totalGastosCategoria += doc.data().monto || 0;
          });

          const porcentajeGastado = (totalGastosCategoria / limite) * 100;

          // Alertas de proximidad (80%)
          if (porcentajeGastado >= 80 && porcentajeGastado < 100) {
            const restante = limite - totalGastosCategoria;
            const title = `⚠️ Presupuesto "${categoria}" casi agotado`;
            const body = `Has gastado $${totalGastosCategoria.toLocaleString('es-MX')} de tu presupuesto de $${limite.toLocaleString('es-MX')} en "${categoria}". Te quedan $${restante.toLocaleString('es-MX')}.`;

            await sendPushNotification(pushTokens, title, body, {
              type: 'presupuesto',
              periodo: 'personalizado',
              categoria: categoria,
              gastado: totalGastosCategoria,
              presupuesto: limite,
              porcentaje: Math.round(porcentajeGastado),
            });

            console.log(`Alerta de presupuesto personalizado próximo enviada a ${userId} para ${categoria}`);
          }

          // Alerta de rebase (100%+)
          if (porcentajeGastado >= 100) {
            const excedente = totalGastosCategoria - limite;
            const title = `🚨 Presupuesto "${categoria}" excedido`;
            const body = `Has excedido tu presupuesto de "${categoria}" por $${excedente.toLocaleString('es-MX')}. Gastaste $${totalGastosCategoria.toLocaleString('es-MX')} de $${limite.toLocaleString('es-MX')}.`;

            await sendPushNotification(pushTokens, title, body, {
              type: 'presupuesto',
              periodo: 'personalizado',
              categoria: categoria,
              gastado: totalGastosCategoria,
              presupuesto: limite,
              excedente: excedente,
              porcentaje: Math.round(porcentajeGastado),
            });

            console.log(`Alerta de presupuesto personalizado excedido enviada a ${userId} para ${categoria}`);
          }
        }
      }

      console.log('Verificación de presupuestos personalizados completada');
      return null;
    } catch (error) {
      console.error('Error en notifyPresupuestosPersonalizados:', error);
      return null;
    }
  });

/**
 * Verifica una suscripción de Google Play desde backend y actualiza Firestore.
 * Uso recomendado:
 * - Después de una compra exitosa
 * - En sincronización manual desde la app
 */
// Change this:
// exports.verifyPlaySubscription = functions.https.onCall(async (data, context) => { ... })

// To this (v2 signature):
exports.verifyPlaySubscription = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  const data = request.data;
  
  const requestedUid = typeof data?.uid === 'string' ? data.uid : null;
  const purchaseToken = typeof data?.purchaseToken === 'string' ? data.purchaseToken : null;
  const packageName = typeof data?.packageName === 'string' ? data.packageName : null;

  if (!callerUid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para verificar la suscripción.');
  }

  const uid = requestedUid || callerUid;
  if (uid !== callerUid) {
    throw new HttpsError('permission-denied', 'No puedes verificar suscripciones de otro usuario.');
  }

  try {
    return await verifyPlaySubscriptionAndPersist({ uid, purchaseToken, packageName });
  } catch (error) {
    console.error('verifyPlaySubscription error:', error);

    // Token inválido o suscripción no encontrada en Play => marcar como inactiva.
    if (error?.code === 404 || error?.response?.status === 404) {
      await upsertSupportSubscription(uid, {
        active: false,
        pending: false,
        packageName: packageName || KONTA_ANDROID_PACKAGE,
        purchaseToken,
        state: 'NOT_FOUND',
        lastVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        uid,
        active: false,
        state: 'NOT_FOUND',
      };
    }

    throw new HttpsError('internal', 'No se pudo verificar la suscripción en servidor.');
  }
});

exports.verifyPlaySubscription = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  const data = request.data;
  
  const requestedUid = typeof data?.uid === 'string' ? data.uid : null;
  const purchaseToken = typeof data?.purchaseToken === 'string' ? data.purchaseToken : null;
  const packageName = typeof data?.packageName === 'string' ? data.packageName : null;

  if (!callerUid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para verificar la suscripción.');
  }

  const uid = requestedUid || callerUid;
  if (uid !== callerUid) {
    throw new HttpsError('permission-denied', 'No puedes verificar suscripciones de otro usuario.');
  }

  try {
    return await verifyPlaySubscriptionAndPersist({ uid, purchaseToken, packageName });
  } catch (error) {
    console.error('verifyPlaySubscription error:', error);

    // Token inválido o suscripción no encontrada en Play => marcar como inactiva.
    if (error?.code === 404 || error?.response?.status === 404) {
      await upsertSupportSubscription(uid, {
        active: false,
        pending: false,
        packageName: packageName || KONTA_ANDROID_PACKAGE,
        purchaseToken,
        state: 'NOT_FOUND',
        lastVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        uid,
        active: false,
        state: 'NOT_FOUND',
      };
    }

    throw new HttpsError('internal', 'No se pudo verificar la suscripción en servidor.');
  }
});


/**
 * Fallback programado para revalidar suscripciones en servidor.
 * Corre aunque el usuario no abra la app y ayuda si RTDN falla o se retrasa.
 */
exports.reverifyPlaySubscriptionsScheduled = functions.scheduler
  .onSchedule(
    {
      schedule: '0 */6 * * *',
      timeZone: 'America/Mexico_City',
    },
    async () => {
      console.log('Iniciando revalidación programada de suscripciones de Google Play');

      try {
        const usersSnapshot = await db.collection('users').select('supportSubscription').get();

        let checked = 0;
        let activeCount = 0;
        let inactiveCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const userDoc of usersSnapshot.docs) {
          const uid = userDoc.id;
          const supportSubscription = userDoc.data()?.supportSubscription || {};
          const purchaseToken = supportSubscription?.purchaseToken || null;
          const packageName = supportSubscription?.packageName || KONTA_ANDROID_PACKAGE;

          if (!purchaseToken) {
            skippedCount += 1;
            continue;
          }

          checked += 1;

          try {
            const result = await verifyPlaySubscriptionAndPersist({
              uid,
              purchaseToken,
              packageName,
            });

            if (result.active) activeCount += 1;
            else inactiveCount += 1;
          } catch (error) {
            if (error?.code === 404 || error?.response?.status === 404) {
              inactiveCount += 1;
              await upsertSupportSubscription(uid, {
                active: false,
                pending: false,
                packageName,
                purchaseToken,
                state: 'NOT_FOUND',
                lastVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              continue;
            }

            errorCount += 1;
            console.error('Error revalidando suscripción programada:', {
              uid,
              message: error?.message || String(error),
            });
          }
        }

        console.log('Revalidación programada completada:', {
          checked,
          activeCount,
          inactiveCount,
          skippedCount,
          errorCount,
        });
        return null;
      } catch (error) {
        console.error('Error general en reverifyPlaySubscriptionsScheduled:', error);
        return null;
      }
    }
  );

/**
 * RTDN de Google Play (Pub/Sub).
 * Configura el tópico en Play Console con el mismo valor de PLAY_RT_SUBSCRIPTION_TOPIC.
 */
exports.onPlaySubscriptionRtdn = onMessagePublished(PLAY_RT_SUBSCRIPTION_TOPIC, async (event) => {
  try {
    const pubsubMessage = event?.data?.message;
    const payload = pubsubMessage?.json || (() => {
      try {
        if (!pubsubMessage?.data) return {};
        const decoded = Buffer.from(pubsubMessage.data, 'base64').toString('utf8');
        return JSON.parse(decoded);
      } catch {
        return {};
      }
    })();

    const packageName = payload?.packageName || KONTA_ANDROID_PACKAGE;
    const subscriptionNotification = payload?.subscriptionNotification || null;
    const purchaseToken = subscriptionNotification?.purchaseToken || null;

    if (!purchaseToken) {
      console.log('RTDN recibido sin purchaseToken, se ignora. Payload:', payload);
      return null;
    }

    const uid = await findUserByPurchaseToken(purchaseToken);
    if (!uid) {
      console.log('RTDN sin usuario local asociado al token:', purchaseToken);
      return null;
    }

    try {
      const result = await verifyPlaySubscriptionAndPersist({ uid, purchaseToken, packageName });

      await db.collection('users').doc(uid).collection('subscriptionEvents').add({
        type: 'rtdn-verified',
        notificationType: subscriptionNotification?.notificationType ?? null,
        packageName,
        purchaseToken,
        result,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log('RTDN procesado y suscripción actualizada:', { uid, state: result.state, active: result.active });
      return null;
    } catch (verifyError) {
      console.error('Error verificando RTDN en Google Play:', verifyError);

      if (verifyError?.code === 404 || verifyError?.response?.status === 404) {
        await upsertSupportSubscription(uid, {
          active: false,
          pending: false,
          packageName,
          purchaseToken,
          state: 'NOT_FOUND',
          lastVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await db.collection('users').doc(uid).collection('subscriptionEvents').add({
          type: 'rtdn-not-found',
          notificationType: subscriptionNotification?.notificationType ?? null,
          packageName,
          purchaseToken,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      return null;
    }
  } catch (error) {
    console.error('Error general procesando RTDN:', error);
    return null;
  }
});
