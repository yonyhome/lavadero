// functions/onOrderCreate.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { getActiveOrder, hasFreeWashesAvailable } = require("../utils/validators");

const db = admin.firestore();

exports.onOrderCreate = functions.firestore
  .document("orders/{orderId}")
  .onCreate(async (snap, context) => {
    const orderId = context.params.orderId;
    const order = snap.data();

    console.log(`🆕 Nueva orden creada: ${orderId}`);
    console.log("Datos de la orden:", order);

    try {
      // 1. Verificar si el usuario ya tiene una orden activa
      const activeOrder = await getActiveOrder(order.userId);

      if (activeOrder && activeOrder.id !== orderId) {
        console.warn(`⚠️ Usuario ${order.userId} ya tiene orden activa: ${activeOrder.id}`);

        await snap.ref.update({
          status: "cancelled",
          cancelledBy: "system",
          cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
          cancelReason: "El usuario ya tiene una orden activa",
        });

        console.log(`❌ Orden ${orderId} cancelada automáticamente`);
        return;
      }

      // 2. Validar uso de lavado gratis si aplica
      if (order.isFreeWash === true) {
        const hasFree = await hasFreeWashesAvailable(order.userId);

        if (!hasFree) {
          console.warn(`⚠️ Usuario ${order.userId} no tiene lavados gratis disponibles`);

          await snap.ref.update({
            status: "cancelled",
            cancelledBy: "system",
            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
            cancelReason: "No tiene lavados gratis disponibles",
            isFreeWash: false,
          });

          console.log(`❌ Orden ${orderId} cancelada por falta de lavados gratis`);
          return;
        }

        console.log(`✅ Usuario ${order.userId} tiene lavados gratis disponibles`);
      }

      // 3. Actualizar estadísticas del usuario
      const userRef = db.collection("users").doc(order.userId);

      await userRef.update({
        "stats.totalOrders": admin.firestore.FieldValue.increment(1),
        "stats.lastVisit": admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`📊 Estadísticas actualizadas para usuario ${order.userId}`);

      // ❌ IMPORTANTE:
      // Ya NO convertir la orden a "in_progress".
      // La orden quedará en "pending" hasta que un trabajador sea asignado.

      console.log(`✅ Orden ${orderId} permanece en estado "pending"`);

    } catch (error) {
      console.error(`❌ Error procesando orden ${orderId}:`, error);

      await snap.ref.update({
        processingError: error.message,
        processingErrorAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });
