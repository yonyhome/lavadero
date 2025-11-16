/**
 * Scheduled Function: Recordatorios a usuarios inactivos
 * Se ejecuta todos los domingos a las 10:00 AM hora de Colombia
 * 
 * Envía notificaciones a usuarios que:
 * - No han visitado en más de 30 días
 * - Tienen al menos 1 lavado completado (clientes reales)
 * - Tienen FCM token activo
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {getAppSettings} = require("../utils/validators");
const {notifyInactiveUser} = require("../utils/notifications");

const db = admin.firestore();

exports.inactiveUsersReminder = functions.pubsub
    .schedule("0 10 * * 0") // Domingos a las 10:00 AM
    .timeZone("America/Bogota")
    .onRun(async (context) => {
      console.log("📬 Enviando recordatorios a usuarios inactivos...");
      
      try {
        // 1. Obtener configuración
        const settings = await getAppSettings();
        const reminderAfterDays = settings.notifications?.reminderAfterDays || 30;
        
        console.log(`📅 Buscando usuarios inactivos por más de ${reminderAfterDays} días`);
        
        // 2. Calcular fecha límite
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() - reminderAfterDays);
        const limitTimestamp = admin.firestore.Timestamp.fromDate(limitDate);
        
        // 3. Obtener usuarios inactivos
        const usersSnapshot = await db.collection("users")
            .where("stats.lastVisit", "<", limitTimestamp)
            .where("stats.completedOrders", ">", 0) // Solo clientes reales
            .get();
        
        console.log(`👥 Total de usuarios inactivos encontrados: ${usersSnapshot.size}`);
        
        if (usersSnapshot.empty) {
          console.log("ℹ️ No hay usuarios inactivos para notificar");
          return null;
        }
        
        // 4. Filtrar usuarios con FCM token
        const usersToNotify = [];
        
        usersSnapshot.forEach((doc) => {
          const user = doc.data();
          
          if (user.fcmToken) {
            const lastVisit = user.stats?.lastVisit?.toDate();
            const daysSince = Math.floor(
                (Date.now() - lastVisit.getTime()) / (1000 * 60 * 60 * 24)
            );
            
            usersToNotify.push({
              id: doc.id,
              name: user.name,
              daysSince,
              freeWashes: user.stats?.freeWashesAvailable || 0,
            });
          }
        });
        
        console.log(`📱 Usuarios con FCM token: ${usersToNotify.length}`);
        
        // 5. Limitar a 100 usuarios para evitar spam
        const MAX_NOTIFICATIONS = 100;
        const usersToProcess = usersToNotify.slice(0, MAX_NOTIFICATIONS);
        
        if (usersToNotify.length > MAX_NOTIFICATIONS) {
          console.warn(`⚠️ Limitando a ${MAX_NOTIFICATIONS} notificaciones`);
        }
        
        // 6. Enviar notificaciones
        let successCount = 0;
        let failCount = 0;
        const errors = [];
        
        for (const user of usersToProcess) {
          try {
            // Personalizar mensaje si tiene lavados gratis
            let customMessage = null;
            if (user.freeWashes > 0) {
              customMessage = `¡Tienes ${user.freeWashes} lavado${user.freeWashes > 1 ? "s" : ""} GRATIS esperándote! No dejes pasar esta oportunidad.`;
            }
            
            const result = await notifyInactiveUser(user.id, user.daysSince);
            
            // Si tiene lavados gratis, enviar notificación adicional
            if (customMessage && result.success) {
              await admin.messaging().send({
                notification: {
                  title: "🎁 ¡Tienes lavados gratis!",
                  body: customMessage,
                },
                data: {
                  type: "free_wash_reminder",
                  freeWashes: user.freeWashes.toString(),
                },
                token: (await db.collection("users").doc(user.id).get()).data().fcmToken,
              });
            }
            
            if (result.success) {
              successCount++;
              console.log(`✅ Notificación enviada a ${user.id} (${user.name})`);
            } else {
              failCount++;
              errors.push({userId: user.id, error: result.error});
            }
            
            // Pequeña pausa para no saturar FCM
            await new Promise((resolve) => setTimeout(resolve, 100));
          } catch (error) {
            failCount++;
            errors.push({userId: user.id, error: error.message});
            console.error(`❌ Error enviando a ${user.id}:`, error);
          }
        }
        
        // 7. Guardar log del proceso
        await db.collection("reminderLogs").add({
          type: "inactive_users",
          totalUsersFound: usersSnapshot.size,
          totalWithFCM: usersToNotify.length,
          totalProcessed: usersToProcess.length,
          successful: successCount,
          failed: failCount,
          errors: errors.length > 0 ? errors.slice(0, 10) : [], // Guardar max 10 errores
          reminderAfterDays,
          executedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        console.log(`✅ Recordatorios completados: ${successCount}/${usersToProcess.length}`);
        
        if (failCount > 0) {
          console.warn(`⚠️ ${failCount} notificaciones fallidas`);
        }
        
        return null;
      } catch (error) {
        console.error("❌ Error en recordatorios de usuarios inactivos:", error);
        
        // Guardar error en log
        await db.collection("reminderLogs").add({
          type: "inactive_users",
          error: error.message,
          executedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        throw error;
      }
    });