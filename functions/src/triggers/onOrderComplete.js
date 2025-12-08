/**
 * Trigger: Se ejecuta cuando una orden cambia a estado "completed"
 * Responsabilidades:
 * - Incrementar órdenes completadas del usuario (SOLO si pagó)
 * - Calcular y asignar lavado gratis si aplica
 * - Actualizar estadísticas del trabajador
 * - Enviar notificaciones
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {shouldGetFreeWash} = require("../utils/calculations");
const {getAppSettings} = require("../utils/validators");
const {
  notifyOrderCompleted,
  notifyFreeWashEarned,
} = require("../utils/notifications");

const db = admin.firestore();

exports.onOrderComplete = functions.firestore
    .document("orders/{orderId}")
    .onUpdate(async (change, context) => {
      const orderId = context.params.orderId;
      const beforeData = change.before.data();
      const afterData = change.after.data();
      
      // Solo procesar si el status cambió a "completed"
      if (beforeData.status === "completed" || afterData.status !== "completed") {
        return null;
      }
      
      console.log(`✅ Orden completada: ${orderId}`);
      console.log("Método de pago:", afterData.paymentMethod);
      
      try {
        const userId = afterData.userId;
        const workerId = afterData.worker?.id;
        
        // Obtener configuración de la app
        const settings = await getAppSettings();
        const washesRequired = settings.promotions?.washesRequiredForFree || 6;
        
        // ✅ CORRECCIÓN: Verificar si es redención de lavado gratis
        const isRedeemingFreeWash = afterData.paymentMethod === "redeemed";
        
        // 1. Actualizar estadísticas del usuario en una transacción
        const userRef = db.collection("users").doc(userId);
        
        await db.runTransaction(async (transaction) => {
          const userDoc = await transaction.get(userRef);
          
          if (!userDoc.exists) {
            throw new Error(`Usuario ${userId} no encontrado`);
          }
          
          const userData = userDoc.data();
          const currentCompleted = userData.stats?.completedOrders || 0;
          
          // ✅ IMPORTANTE: Solo incrementar si NO es redención
          let newCompleted = currentCompleted;
          let earnedFreeWash = false;
          
          if (!isRedeemingFreeWash) {
            // Es un pago normal, incrementar contador
            newCompleted = currentCompleted + 1;
            earnedFreeWash = shouldGetFreeWash(newCompleted, washesRequired);
            console.log(`💰 Orden pagada - incrementando completedOrders: ${currentCompleted} → ${newCompleted}`);
          } else {
            // Es redención de lavado gratis, NO incrementar
            console.log(`🎁 Lavado gratis redimido - NO incrementar completedOrders (mantiene: ${currentCompleted})`);
          }
          
          const updates = {
            "stats.lastVisit": admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          
          // ✅ Solo incrementar completedOrders si NO es redención
          if (!isRedeemingFreeWash) {
            updates["stats.completedOrders"] = admin.firestore.FieldValue.increment(1);
          }
          
          // Si ganó lavado gratis, incrementar contador
          if (earnedFreeWash) {
            updates["stats.freeWashesAvailable"] = 
              admin.firestore.FieldValue.increment(1);
            console.log(`🎁 Usuario ${userId} ganó un lavado gratis!`);
          }
          
          transaction.update(userRef, updates);
          
          return {earnedFreeWash, newCompleted, isRedeemingFreeWash};
        }).then(async (result) => {
          if (result.isRedeemingFreeWash) {
            console.log(`✅ Usuario ${userId}: Lavado gratis redimido (completedOrders sin cambios)`);
          } else {
            console.log(`✅ Usuario ${userId}: ${result.newCompleted} lavados completados (pagados)`);
          }
          
          // 2. Enviar notificación de orden completada
          if (settings.notifications?.orderCompleted) {
            await notifyOrderCompleted(userId, afterData);
          }
          
          // 3. Si ganó lavado gratis, enviar notificación especial
          if (result.earnedFreeWash && settings.notifications?.freeWashAvailable) {
            await notifyFreeWashEarned(userId, washesRequired);
          }
        });
        
        // 4. Actualizar estadísticas del trabajador (si existe)
        if (workerId) {
          const workerRef = db.collection("workers").doc(workerId);
          const workerDoc = await workerRef.get();
          
          if (workerDoc.exists) {
            await workerRef.update({
              "stats.totalOrdersCompleted": admin.firestore.FieldValue.increment(1),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            
            console.log(`👷 Trabajador ${workerId} estadísticas actualizadas`);
          } else {
            console.warn(`⚠️ Trabajador ${workerId} no encontrado`);
          }
        }
        
        console.log(`✅ Orden ${orderId} procesada completamente`);
      } catch (error) {
        console.error(`❌ Error procesando orden completada ${orderId}:`, error);
        
        // Registrar el error en la orden
        await change.after.ref.update({
          completionError: error.message,
          completionErrorAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      
      return null;
    });