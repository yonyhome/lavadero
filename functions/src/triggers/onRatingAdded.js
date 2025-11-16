/**
 * Trigger: Se ejecuta cuando se agrega un rating a una orden completada
 * Responsabilidades:
 * - Recalcular promedio de rating del trabajador
 * - Alertar al admin si rating es bajo
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {calculateAverageRating} = require("../utils/calculations");

const db = admin.firestore();

exports.onRatingAdded = functions.firestore
    .document("orders/{orderId}")
    .onUpdate(async (change, context) => {
      const orderId = context.params.orderId;
      const beforeData = change.before.data();
      const afterData = change.after.data();
      
      // Solo procesar si se agregó un rating (antes no tenía, ahora sí)
      if (beforeData.rating || !afterData.rating) {
        return null;
      }
      
      console.log(`⭐ Rating agregado a orden ${orderId}`);
      console.log("Rating:", afterData.rating);
      
      try {
        const workerId = afterData.worker?.id;
        
        if (!workerId) {
          console.warn(`⚠️ Orden ${orderId} no tiene trabajador asignado`);
          return null;
        }
        
        // 1. Obtener todas las órdenes completadas del trabajador con rating
        const ordersSnapshot = await db.collection("orders")
            .where("worker.id", "==", workerId)
            .where("status", "==", "completed")
            .get();
        
        // Filtrar solo las que tienen rating
        const ratingsArray = [];
        ordersSnapshot.forEach((doc) => {
          const order = doc.data();
          if (order.rating && order.rating.stars) {
            ratingsArray.push({
              stars: order.rating.stars,
              orderId: doc.id,
            });
          }
        });
        
        console.log(`📊 Trabajador ${workerId}: ${ratingsArray.length} ratings encontrados`);
        
        if (ratingsArray.length === 0) {
          console.warn("No se encontraron ratings para calcular promedio");
          return null;
        }
        
        // 2. Calcular nuevo promedio
        const newAverage = calculateAverageRating(ratingsArray);
        
        console.log(`📈 Nuevo promedio de rating: ${newAverage}`);
        
        // 3. Actualizar trabajador
        const workerRef = db.collection("workers").doc(workerId);
        await workerRef.update({
          "stats.averageRating": newAverage,
          "stats.totalRatings": ratingsArray.length,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        console.log(`✅ Rating promedio actualizado para trabajador ${workerId}`);
        
        // 4. Si el rating es bajo (<3), crear alerta para el admin
        if (afterData.rating.stars < 3) {
          console.warn(`⚠️ Rating bajo detectado (${afterData.rating.stars} estrellas)`);
          
          await db.collection("alerts").add({
            type: "low_rating",
            orderId,
            workerId,
            workerName: afterData.worker?.name || "Desconocido",
            userId: afterData.userId,
            rating: afterData.rating.stars,
            comment: afterData.rating.comment || null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            resolved: false,
          });
          
          console.log("🚨 Alerta de rating bajo creada para el admin");
        }
        
        console.log(`✅ Rating procesado correctamente para orden ${orderId}`);
      } catch (error) {
        console.error(`❌ Error procesando rating de orden ${orderId}:`, error);
        
        // Registrar el error en la orden
        await change.after.ref.update({
          ratingProcessingError: error.message,
          ratingProcessingErrorAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      
      return null;
    });