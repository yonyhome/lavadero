// functions/utils/validators.js - VERSIÓN CORREGIDA
const admin = require("firebase-admin");
const db = admin.firestore();

/**
 * Obtiene una orden activa del usuario
 * 🔥 CORREGIDO: Busca tanto 'pending' como 'in_progress'
 */
async function getActiveOrder(userId) {
  try {
    // Buscar pending
    const pendingQuery = await db.collection('orders')
        .where('userId', '==', userId)
        .where('status', '==', 'pending')
        .limit(1)
        .get();
    
    if (!pendingQuery.empty) {
      const doc = pendingQuery.docs[0];
      return { id: doc.id, ...doc.data() };
    }
    
    // Buscar in_progress
    const inProgressQuery = await db.collection('orders')
        .where('userId', '==', userId)
        .where('status', '==', 'in_progress')
        .limit(1)
        .get();
    
    if (!inProgressQuery.empty) {
      const doc = inProgressQuery.docs[0];
      return { id: doc.id, ...doc.data() };
    }
    
    return null;
  } catch (error) {
    console.error('Error getting active order:', error);
    throw error;
  }
}

/**
 * Verifica si un usuario tiene lavados gratis disponibles
 */
async function hasFreeWashesAvailable(userId) {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return false;
    }
    
    const user = userDoc.data();
    const freeWashes = user.stats?.freeWashesAvailable || 0;
    
    return freeWashes > 0;
  } catch (error) {
    console.error('Error checking free washes:', error);
    return false;
  }
}

/**
 * Obtiene la configuración de la aplicación
 */
async function getAppSettings() {
  try {
    const settingsDoc = await db.collection('settings').doc('app_config').get();
    
    if (!settingsDoc.exists) {
      console.warn('⚠️ No se encontró configuración de app, usando valores por defecto');
      return {
        promotions: {
          washesRequiredForFree: 6
        },
        notifications: {
          orderCompleted: true,
          freeWashAvailable: true,
          orderStarted: true,
          reminderAfterDays: 30
        }
      };
    }
    
    return settingsDoc.data();
  } catch (error) {
    console.error('Error getting app settings:', error);
    throw error;
  }
}

/**
 * Valida si una orden puede ser cancelada
 */
async function canCancelOrder(orderId) {
  try {
    const orderDoc = await db.collection('orders').doc(orderId).get();
    
    if (!orderDoc.exists) {
      return { canCancel: false, reason: 'Orden no encontrada' };
    }
    
    const order = orderDoc.data();
    
    // No se puede cancelar si ya está completada
    if (order.status === 'completed') {
      return { canCancel: false, reason: 'La orden ya está completada' };
    }
    
    // No se puede cancelar si ya está cancelada
    if (order.status === 'cancelled') {
      return { canCancel: false, reason: 'La orden ya está cancelada' };
    }
    
    return { canCancel: true };
  } catch (error) {
    console.error('Error validating order cancellation:', error);
    return { canCancel: false, reason: 'Error al validar' };
  }
}

/**
 * Obtiene el servicio básico (menor precio)
 */
async function getBasicService() {
  try {
    const servicesSnapshot = await db.collection('services')
        .where('isActive', '==', true)
        .orderBy('price', 'asc')
        .limit(1)
        .get();
    
    if (servicesSnapshot.empty) {
      return null;
    }
    
    const doc = servicesSnapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error('Error getting basic service:', error);
    return null;
  }
}

module.exports = {
  getActiveOrder,
  hasFreeWashesAvailable,
  getAppSettings,
  canCancelOrder,
  getBasicService
};