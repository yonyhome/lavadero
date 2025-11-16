/**
 * Trigger: Se ejecuta cuando una orden cambia a estado "cancelled"
 * Responsabilidades:
 * - Restaurar lavado gratis si era una redención
 * - Incrementar contador de cancelaciones
 * - Registrar auditoría
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

exports.onOrderCancel = functions.firestore
    .document("orders/{orderId}")
    .onUpdate(async (change, context) => {
      const orderId = context.params.orderId;
      const beforeData = change.before.data();
      const afterData = change.after.data();
      
      // Solo procesar si el status cambió a "cancelled"
      if (beforeData.status === "cancelled" || afterData.status !== "cancelled") {
        return null;
      }
      
      console.log(`❌ Orden cancelada: ${orderId}`);
      console.log("Cancelada por:", afterData.cancelledBy);
      console.log("Razón:", afterData.cancelReason || "No especificada");
      
      try {
        const userId = afterData.userId;
        const userRef = db.collection("users").doc(userId);
        
        // Actualizar en transacción para garantizar consistencia
        await db.runTransaction(async (transaction) => {
          const userDoc = await transaction.get(userRef);
          
          if (!userDoc.exists) {
            throw new Error(`Usuario ${userId} no encontrado`);
          }
          
          const updates = {
            "stats.cancelledOrders": admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          
          // Si era un lavado gratis, restaurar el contador
          if (afterData.isFreeWash === true) {
            updates["stats.freeWashesAvailable"] = 
              admin.firestore.FieldValue.increment(1);
            
            console.log(`♻️ Lavado gratis restaurado para usuario ${userId}`);
          }
          
          transaction.update(userRef, updates);
        });
        
        console.log(`📊 Estadísticas de cancelación actualizadas para usuario ${userId}`);
        
        // Log de auditoría (opcional, para tracking)
        await db.collection("orderAudit").add({
          orderId,
          userId,
          action: "cancelled",
          cancelledBy: afterData.cancelledBy || "unknown",
          cancelReason: afterData.cancelReason || null,
          isFreeWash: afterData.isFreeWash || false,
          serviceName: afterData.service?.name || null,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        console.log(`✅ Cancelación de orden ${orderId} procesada correctamente`);
      } catch (error) {
        console.error(`❌ Error procesando cancelación de orden ${orderId}:`, error);
        
        // Registrar el error en la orden
        await change.after.ref.update({
          cancellationError: error.message,
          cancellationErrorAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      
      return null;
    });