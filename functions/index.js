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

admin.initializeApp();
const db = admin.firestore();

// Configuración de URLs de Expo
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Envía una notificación push a través de Expo
 */
async function sendPushNotification(pushToken, title, body, data = {}) {
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

    console.log('Notificación enviada exitosamente:', jsonData);
    return true;
  } catch (error) {
    console.error('Error en sendPushNotification:', error);
    return false;
  }
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
    const userDoc = await db.collection('users').doc(uid.toString()).get();
    const userData = userDoc.data();
    const pushToken = userData?.pushToken;

    if (!pushToken) {
      return res.status(404).json({ error: 'User has no pushToken' });
    }

    const title = '🧪 Prueba de notificación';
    const body = 'Esta es una notificación de prueba desde Firebase Functions.';

    const sent = await sendPushNotification(pushToken, title, body, {
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
        const userData = userDoc.data();
        const pushToken = userData.pushToken;

        if (!pushToken) {
          console.log(`Usuario ${userId} no tiene push token`);
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

            await sendPushNotification(pushToken, title, body, {
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
        const userData = userDoc.data();
        const pushToken = userData.pushToken;

        if (!pushToken) continue;

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

          await sendPushNotification(pushToken, title, body, {
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
        const userData = userDoc.data();
        const pushToken = userData.pushToken;

        if (!pushToken) continue;

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

          await sendPushNotification(pushToken, title, body, {
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
  .onDocumentUpdated('users/{userId}/ahorros/{ahorroId}', async (change, context) => {
    const { userId, ahorroId } = context.params;
    const newData = change.after.data();
    const oldData = change.before.data();

    // Si no hay meta definida, salir
    if (!newData.meta || newData.meta === 0) return null;

    const porcentajeAnterior = oldData.cantidadActual / newData.meta;
    const porcentajeNuevo = newData.cantidadActual / newData.meta;

    // Si cruzamos el 90%, enviar notificación
    if (porcentajeAnterior < 0.9 && porcentajeNuevo >= 0.9) {
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        const pushToken = userDoc.data()?.pushToken;

        if (!pushToken) return null;

        const title = '🎉 ¡Meta casi cumplida!';
        const body = `Tu ahorro "${newData.nombre}" alcanzó el 90% de tu objetivo. ¡Casi lo logras!`;

        await sendPushNotification(pushToken, title, body, {
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
  });

/**
 * Notificación cuando se cumple completamente una meta de ahorro
 */
exports.notifyMetaAhorroCompleta = functions.firestore
  .onDocumentUpdated('users/{userId}/ahorros/{ahorroId}', async (change, context) => {
    const { userId, ahorroId } = context.params;
    const newData = change.after.data();
    const oldData = change.before.data();

    // Si no hay meta definida, salir
    if (!newData.meta || newData.meta === 0) return null;

    const seCompleto =
      oldData.cantidadActual < newData.meta &&
      newData.cantidadActual >= newData.meta;

    if (seCompleto) {
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        const pushToken = userDoc.data()?.pushToken;

        if (!pushToken) return null;

        const title = '🏆 ¡Meta completada!';
        const body = `¡Felicidades! Completaste tu objetivo de "${newData.nombre}". Puedes crear una nueva meta.`;

        await sendPushNotification(pushToken, title, body, {
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
  });
