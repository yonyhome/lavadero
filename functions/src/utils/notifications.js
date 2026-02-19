/**
 * Utilidades para envío de notificaciones push usando Firebase Cloud Messaging
 */

const admin = require("firebase-admin");
const db = admin.firestore();

/**
 * Envía una notificación push a un usuario específico
 * @param {string} userId - ID del usuario (placa)
 * @param {string} title - Título de la notificación
 * @param {string} body - Cuerpo de la notificación
 * @param {Object} data - Datos adicionales (opcional)
 * @returns {Promise<Object>} - Resultado del envío
 */
async function sendToUser(userId, title, body, data = {}) {
  try {
    // Obtener el FCM token del usuario
    const userDoc = await db.collection("users").doc(userId).get();
    
    if (!userDoc.exists) {
      console.warn(`Usuario ${userId} no encontrado`);
      return { success: false, error: "User not found" };
    }
    
    const user = userDoc.data();
    const fcmToken = user.fcmToken;
    
    if (!fcmToken) {
      console.warn(`Usuario ${userId} no tiene FCM token`);
      return { success: false, error: "No FCM token" };
    }
    
    // Construir el mensaje
    const message = {
      notification: {
        title,
        body,
      },
      data: {
        ...data,
        userId,
        timestamp: new Date().toISOString(),
      },
      token: fcmToken,
      android: {
        priority: "high",
        notification: {
          sound: "default",
          color: "#0ea5e9",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
      webpush: {
        notification: {
          icon: "/logo192.png",
          badge: "/logo192.png",
          vibrate: [200, 100, 200],
        },
        fcmOptions: {
          link: "/order", // Al hacer click en la notificación, lleva a la orden activa
        },
      },
    };
    
    // Enviar
    const response = await admin.messaging().send(message);
    
    console.log(`✅ Notificación enviada a ${userId}:`, response);
    
    return { success: true, messageId: response };
  } catch (error) {
    console.error(`❌ Error enviando notificación a ${userId}:`, error);
    
    // Si el token es inválido, eliminarlo del usuario
    if (error.code === "messaging/invalid-registration-token" ||
        error.code === "messaging/registration-token-not-registered") {
      try {
        await db.collection("users").doc(userId).update({
          fcmToken: admin.firestore.FieldValue.delete(),
        });
        console.log(`🗑️ Token inválido eliminado del usuario ${userId}`);
      } catch (updateError) {
        console.error("Error eliminando token inválido:", updateError);
      }
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * Envía notificaciones a múltiples usuarios
 * @param {Array<string>} userIds - Array de IDs de usuarios
 * @param {string} title - Título de la notificación
 * @param {string} body - Cuerpo de la notificación
 * @param {Object} data - Datos adicionales (opcional)
 * @returns {Promise<Object>} - Estadísticas del envío
 */
async function sendToMultipleUsers(userIds, title, body, data = {}) {
  try {
    console.log(`📤 Enviando notificación a ${userIds.length} usuarios`);
    
    const results = await Promise.allSettled(
        userIds.map((userId) => sendToUser(userId, title, body, data))
    );
    
    const stats = {
      total: results.length,
      successful: 0,
      failed: 0,
      errors: [],
    };
    
    results.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value.success) {
        stats.successful++;
      } else {
        stats.failed++;
        stats.errors.push({
          userId: userIds[index],
          error: result.value?.error || result.reason?.message || "Unknown error",
        });
      }
    });
    
    console.log(`📊 Estadísticas de envío:`, stats);
    
    return stats;
  } catch (error) {
    console.error("Error en envío múltiple:", error);
    throw error;
  }
}

/**
 * Envía notificación broadcast a todos los usuarios con FCM token
 * @param {string} title - Título de la notificación
 * @param {string} body - Cuerpo de la notificación
 * @param {Object} data - Datos adicionales (opcional)
 * @returns {Promise<Object>} - Estadísticas del envío
 */
async function sendBroadcast(title, body, data = {}) {
  try {
    console.log("📢 Enviando notificación broadcast");
    
    // Obtener todos los usuarios con FCM token
    const usersSnapshot = await db.collection("users")
        .where("fcmToken", "!=", null)
        .get();
    
    if (usersSnapshot.empty) {
      console.warn("No hay usuarios con FCM token");
      return { total: 0, successful: 0, failed: 0 };
    }
    
    const userIds = usersSnapshot.docs.map((doc) => doc.id);
    
    return await sendToMultipleUsers(userIds, title, body, data);
  } catch (error) {
    console.error("Error en broadcast:", error);
    throw error;
  }
}

/**
 * Envía notificación a usuarios que cumplen una condición
 * @param {Function} condition - Función que recibe user data y retorna boolean
 * @param {string} title - Título de la notificación
 * @param {string} body - Cuerpo de la notificación
 * @param {Object} data - Datos adicionales (opcional)
 * @returns {Promise<Object>} - Estadísticas del envío
 */
async function sendConditional(condition, title, body, data = {}) {
  try {
    console.log("🔍 Enviando notificación condicional");
    
    // Obtener todos los usuarios
    const usersSnapshot = await db.collection("users").get();
    
    if (usersSnapshot.empty) {
      console.warn("No hay usuarios");
      return { total: 0, successful: 0, failed: 0 };
    }
    
    // Filtrar usuarios que cumplen la condición y tienen FCM token
    const eligibleUserIds = usersSnapshot.docs
        .filter((doc) => {
          const user = doc.data();
          return user.fcmToken && condition(user);
        })
        .map((doc) => doc.id);
    
    console.log(`📋 ${eligibleUserIds.length} usuarios cumplen la condición`);
    
    if (eligibleUserIds.length === 0) {
      return { total: 0, successful: 0, failed: 0 };
    }
    
    return await sendToMultipleUsers(eligibleUserIds, title, body, data);
  } catch (error) {
    console.error("Error en envío condicional:", error);
    throw error;
  }
}

/**
 * Notificación de orden completada
 * @param {string} userId - ID del usuario
 * @param {Object} order - Datos de la orden
 * @returns {Promise<Object>}
 */
async function notifyOrderCompleted(userId, order) {
  const title = "¡Tu lavado está listo! 🎉";
  const body = `Tu ${order.service?.name || "lavado"} ha sido completado. ¡Gracias por elegirnos!`;
  
  const data = {
    type: "order_completed",
    orderId: order.id || "",
    serviceName: order.service?.name || "",
  };
  
  return await sendToUser(userId, title, body, data);
}

/**
 * Notificación de lavado gratis ganado
 * @param {string} userId - ID del usuario
 * @param {number} washesRequired - Lavados requeridos para el premio
 * @returns {Promise<Object>}
 */
async function notifyFreeWashEarned(userId, washesRequired) {
  const title = "🎁 ¡Ganaste un lavado GRATIS!";
  const body = `¡Felicitaciones! Completaste ${washesRequired} lavados. Tu próximo lavado es completamente gratis.`;
  
  const data = {
    type: "free_wash_earned",
    washesRequired: washesRequired.toString(),
  };
  
  return await sendToUser(userId, title, body, data);
}

/**
 * Notificación de recordatorio para usuarios inactivos
 * @param {string} userId - ID del usuario
 * @param {number} daysSinceLastVisit - Días desde última visita
 * @returns {Promise<Object>}
 */
async function notifyInactiveUser(userId, daysSinceLastVisit) {
  const title = "¡Te extrañamos! 🏍️";
  const body = `Han pasado ${daysSinceLastVisit} días desde tu última visita. ¡Vuelve y mantén tu moto reluciente!`;
  
  const data = {
    type: "inactive_reminder",
    daysSinceLastVisit: daysSinceLastVisit.toString(),
  };
  
  return await sendToUser(userId, title, body, data);
}

/**
 * Notificación cuando se asigna un trabajador (orden → in_progress)
 * @param {string} userId - ID del usuario (placa)
 * @param {Object} order - Datos de la orden
 * @returns {Promise<Object>}
 */
async function notifyOrderInProgress(userId, order) {
  const workerName = order.worker?.name || "nuestro equipo";
  const title = "¡Tu moto está siendo lavada! 🏍️";
  const body = `${workerName} ya comenzó con tu ${order.service?.name || "servicio"}.`;

  const data = {
    type: "order_in_progress",
    orderId: order.id || "",
    workerName,
    serviceName: order.service?.name || "",
  };

  return await sendToUser(userId, title, body, data);
}

/**
 * Notificación personalizada del administrador
 * @param {Array<string>|string} target - "all" o array de userIds
 * @param {string} title - Título
 * @param {string} body - Mensaje
 * @param {Object} data - Datos adicionales
 * @returns {Promise<Object>}
 */
async function notifyCustom(target, title, body, data = {}) {
  if (target === "all") {
    return await sendBroadcast(title, body, {
      ...data,
      type: "custom_admin",
    });
  } else if (Array.isArray(target)) {
    return await sendToMultipleUsers(target, title, body, {
      ...data,
      type: "custom_admin",
    });
  } else {
    throw new Error("Target debe ser 'all' o un array de userIds");
  }
}

/**
 * Notificación a todos los administradores cuando llega una nueva orden.
 * Lee los FCM tokens de la colección "admins" (campo fcmTokens: string[]).
 * @param {Object} order - Datos de la orden recién creada (incluye .id)
 * @returns {Promise<void>}
 */
async function notifyAdminNewOrder(order) {
  try {
    const adminsSnap = await db.collection("admins").get();
    if (adminsSnap.empty) return;

    const tokens = [];
    adminsSnap.forEach((doc) => {
      const data = doc.data();
      if (Array.isArray(data.fcmTokens)) {
        tokens.push(...data.fcmTokens.filter(Boolean));
      }
    });

    if (tokens.length === 0) return;

    const title = "🛵 Nueva orden recibida";
    const body = `${order.userId} solicitó ${order.service?.name || "un servicio"}.`;

    const messages = tokens.map((token) => ({
      notification: { title, body },
      data: {
        type: "new_order",
        orderId: order.id || "",
        userId: order.userId || "",
        serviceName: order.service?.name || "",
        timestamp: new Date().toISOString(),
      },
      token,
      android: { priority: "high", notification: { sound: "default", color: "#0ea5e9" } },
      apns: { payload: { aps: { sound: "default", badge: 1 } } },
      webpush: {
        notification: { icon: "/logo192.png", badge: "/logo192.png", vibrate: [200, 100, 200] },
        fcmOptions: { link: "/admin/dashboard" },
      },
    }));

    const results = await Promise.allSettled(
        messages.map((msg) => admin.messaging().send(msg))
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    console.log(`✅ Notificación nueva orden enviada a ${sent}/${tokens.length} admins`);
  } catch (error) {
    console.error("❌ Error notificando a admins:", error);
  }
}

module.exports = {
  sendToUser,
  sendToMultipleUsers,
  sendBroadcast,
  sendConditional,
  notifyOrderCompleted,
  notifyOrderInProgress,
  notifyAdminNewOrder,
  notifyFreeWashEarned,
  notifyInactiveUser,
  notifyCustom,
};