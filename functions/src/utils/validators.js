/**
 * Utilidades para validaciones de datos
 */

const admin = require("firebase-admin");
const db = admin.firestore();

/**
 * Valida formato de placa colombiana
 * Formatos válidos: ABC123, ABC12D (3 letras + 3 dígitos/letras)
 * @param {string} plate - Placa a validar
 * @returns {boolean}
 */
function isValidPlate(plate) {
  if (!plate || typeof plate !== "string") return false;
  
  // Normalizar: mayúsculas, sin espacios ni guiones
  const normalizedPlate = plate.toUpperCase().replace(/[\s-]/g, "");
  
  // Formato: 3 letras + 3 caracteres alfanuméricos
  const plateRegex = /^[A-Z]{3}[0-9A-Z]{3}$/;
  
  return plateRegex.test(normalizedPlate);
}

/**
 * Normaliza una placa a formato estándar
 * @param {string} plate - Placa a normalizar
 * @returns {string}
 */
function normalizePlate(plate) {
  if (!plate) return "";
  return plate.toUpperCase().replace(/[\s-]/g, "");
}

/**
 * Verifica si un usuario tiene una orden activa
 * @param {string} userId - ID del usuario (placa)
 * @returns {Promise<Object|null>} - Orden activa o null
 */
async function getActiveOrder(userId) {
  try {
    const ordersRef = db.collection("orders");
    const snapshot = await ordersRef
        .where("userId", "==", userId)
        .where("status", "in", ["pending", "in_progress"])
        .limit(1)
        .get();
    
    if (snapshot.empty) return null;
    
    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
    };
  } catch (error) {
    console.error("Error checking active orders:", error);
    throw error;
  }
}

/**
 * Verifica si un servicio existe y está activo
 * @param {string} serviceId - ID del servicio
 * @returns {Promise<boolean>}
 */
async function isServiceActive(serviceId) {
  try {
    const serviceDoc = await db.collection("services").doc(serviceId).get();
    
    if (!serviceDoc.exists) return false;
    
    const service = serviceDoc.data();
    return service.isActive === true;
  } catch (error) {
    console.error("Error checking service:", error);
    return false;
  }
}

/**
 * Verifica si un trabajador existe y está activo
 * @param {string} workerId - ID del trabajador
 * @returns {Promise<boolean>}
 */
async function isWorkerActive(workerId) {
  try {
    const workerDoc = await db.collection("workers").doc(workerId).get();
    
    if (!workerDoc.exists) return false;
    
    const worker = workerDoc.data();
    return worker.isActive === true;
  } catch (error) {
    console.error("Error checking worker:", error);
    return false;
  }
}

/**
 * Verifica si un usuario existe
 * @param {string} userId - ID del usuario (placa)
 * @returns {Promise<boolean>}
 */
async function userExists(userId) {
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    return userDoc.exists;
  } catch (error) {
    console.error("Error checking user:", error);
    return false;
  }
}

/**
 * Obtiene la configuración de la aplicación
 * @returns {Promise<Object>}
 */
async function getAppSettings() {
  try {
    const settingsDoc = await db.collection("settings").doc("app_config").get();
    
    if (!settingsDoc.exists) {
      // Configuración por defecto si no existe
      return {
        promotions: {
          washesRequiredForFree: 6,
          freeWashExpirationDays: null,
        },
        notifications: {
          orderCompleted: true,
          freeWashAvailable: true,
          reminderAfterDays: 30,
        },
      };
    }
    
    return settingsDoc.data();
  } catch (error) {
    console.error("Error getting settings:", error);
    throw error;
  }
}

/**
 * Valida que un usuario tenga lavados gratis disponibles
 * @param {string} userId - ID del usuario
 * @returns {Promise<boolean>}
 */
async function hasFreeWashesAvailable(userId) {
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    
    if (!userDoc.exists) return false;
    
    const user = userDoc.data();
    return (user.stats?.freeWashesAvailable || 0) > 0;
  } catch (error) {
    console.error("Error checking free washes:", error);
    return false;
  }
}

/**
 * Valida que una orden pertenezca a un usuario
 * @param {string} orderId - ID de la orden
 * @param {string} userId - ID del usuario
 * @returns {Promise<boolean>}
 */
async function orderBelongsToUser(orderId, userId) {
  try {
    const orderDoc = await db.collection("orders").doc(orderId).get();
    
    if (!orderDoc.exists) return false;
    
    const order = orderDoc.data();
    return order.userId === userId;
  } catch (error) {
    console.error("Error checking order ownership:", error);
    return false;
  }
}

/**
 * Valida campos requeridos de una orden
 * @param {Object} orderData - Datos de la orden
 * @returns {Object} - { valid: boolean, errors: Array }
 */
function validateOrderData(orderData) {
  const errors = [];
  
  if (!orderData.userId) {
    errors.push("userId es requerido");
  }
  
  if (!orderData.service || !orderData.service.id) {
    errors.push("service.id es requerido");
  }
  
  if (!orderData.status) {
    errors.push("status es requerido");
  }
  
  const validStatuses = ["pending", "in_progress", "completed", "cancelled"];
  if (orderData.status && !validStatuses.includes(orderData.status)) {
    errors.push(`status debe ser uno de: ${validStatuses.join(", ")}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Valida que el email sea de un administrador
 * @param {string} email - Email a validar
 * @returns {boolean}
 */
function isAdminEmail(email) {
  // Lista de emails de administradores permitidos
  // En producción, esto debería venir de una configuración
  const adminEmails = [
    "admin@lavadero.com",
    // Agregar más emails según sea necesario
  ];
  
  return adminEmails.includes(email);
}

/**
 * Valida formato de rating
 * @param {Object} rating - Objeto rating { stars, comment }
 * @returns {Object} - { valid: boolean, errors: Array }
 */
function validateRating(rating) {
  const errors = [];
  
  if (!rating) {
    errors.push("rating es requerido");
    return { valid: false, errors };
  }
  
  if (typeof rating.stars !== "number") {
    errors.push("rating.stars debe ser un número");
  } else if (rating.stars < 1 || rating.stars > 5) {
    errors.push("rating.stars debe estar entre 1 y 5");
  }
  
  if (rating.comment && typeof rating.comment !== "string") {
    errors.push("rating.comment debe ser una cadena de texto");
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  isValidPlate,
  normalizePlate,
  getActiveOrder,
  isServiceActive,
  isWorkerActive,
  userExists,
  getAppSettings,
  hasFreeWashesAvailable,
  orderBelongsToUser,
  validateOrderData,
  isAdminEmail,
  validateRating,
};