/**
 * Trigger: Se ejecuta cuando se crea una nueva orden
 * Responsabilidades:
 * - Validar que el usuario no tenga otra orden activa
 * - Validar lavado gratis si aplica
 * - Actualizar estadísticas del usuario
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {getActiveOrder, hasFreeWashesAvailable} = require("../utils/validators");
const {notifyAdminNewOrder} = require("../utils/notifications");

const db = admin.firestore();

exports.onOrderCreate = functions.firestore
    .document("orders/{orderId}")
    .onCreate(async (snap, context) => {
      const orderId = context.params.orderId;
      const order = snap.data();
      
      console.log(`🆕 Nueva orden creada: ${orderId}`);
      console.log("Datos de la orden:", order);
      
      try {
        // 1. Validar que el usuario no tenga otra orden activa
        const activeOrder = await getActiveOrder(order.userId);
        
        if (activeOrder && activeOrder.id !== orderId) {
          console.warn(`⚠️ Usuario ${order.userId} ya tiene orden activa: ${activeOrder.id}`);
          
          // Cancelar esta nueva orden automáticamente
          await snap.ref.update({
            status: "cancelled",
            cancelledBy: "system",
            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
            cancelReason: "El usuario ya tiene una orden activa",
          });
          
          console.log(`❌ Orden ${orderId} cancelada automáticamente`);
          return;
        }
        
        // 2. Si es lavado gratis, validar que el usuario tenga disponibles
        if (order.isFreeWash === true) {
          const hasFreewashes = await hasFreeWashesAvailable(order.userId);
          
          if (!hasFreewashes) {
            console.warn(`⚠️ Usuario ${order.userId} no tiene lavados gratis disponibles`);
            
            // Cancelar la orden
            await snap.ref.update({
              status: "cancelled",
              cancelledBy: "system",
              cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
              cancelReason: "No tiene lavados gratis disponibles",
              isFreeWash: false, // Corregir el flag
            });
            
            console.log(`❌ Orden ${orderId} cancelada por falta de lavados gratis`);
            return;
          }
          
          // Si tiene lavados gratis, decrementar el contador AHORA
          // (se restaurará si se cancela)
          await db.collection("users").doc(order.userId).update({
            "stats.freeWashesAvailable": admin.firestore.FieldValue.increment(-1),
          });
          
          console.log(`✅ Lavado gratis deducido del usuario ${order.userId}`);
        }
        
        // 3. Actualizar estadísticas del usuario
        const userRef = db.collection("users").doc(order.userId);
        
        await userRef.update({
          "stats.totalOrders": admin.firestore.FieldValue.increment(1),
          "stats.lastVisit": admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        console.log(`📊 Estadísticas actualizadas para usuario ${order.userId}`);

        // 4. Notificar al admin que llegó una nueva orden
        await notifyAdminNewOrder({ id: orderId, ...order });

        console.log(`✅ Orden ${orderId} procesada correctamente`);
      } catch (error) {
        console.error(`❌ Error procesando orden ${orderId}:`, error);
        
        // En caso de error crítico, registrar pero no bloquear
        // El admin podrá ver y resolver manualmente
        await snap.ref.update({
          processingError: error.message,
          processingErrorAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });