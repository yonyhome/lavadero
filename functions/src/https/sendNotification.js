/**
 * HTTPS Callable Function: Enviar notificaciones push
 * Solo accesible por administradores
 * 
 * Parámetros:
 * - type: "broadcast" | "specific" | "conditional"
 * - title: string
 * - body: string
 * - users: Array<string> (solo si type === "specific")
 * - condition: string (solo si type === "conditional")
 * - data: Object (opcional)
 * - imageUrl: string (opcional)
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {
  sendBroadcast,
  sendToMultipleUsers,
  sendConditional,
} = require("../utils/notifications");

const db = admin.firestore();

exports.sendNotification = functions.https.onCall(async (data, context) => {
  // 1. Validar autenticación
  if (!context.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "Debes estar autenticado para enviar notificaciones"
    );
  }
  
  // 2. Validar que sea administrador
  if (!context.auth.token.admin) {
    throw new functions.https.HttpsError(
        "permission-denied",
        "Solo los administradores pueden enviar notificaciones"
    );
  }
  
  console.log(`📤 Solicitud de notificación de admin ${context.auth.uid}`);
  console.log("Datos:", data);
  
  // 3. Validar parámetros requeridos
  if (!data.type) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "El campo 'type' es requerido"
    );
  }
  
  if (!data.title || !data.body) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "Los campos 'title' y 'body' son requeridos"
    );
  }
  
  const validTypes = ["broadcast", "specific", "conditional"];
  if (!validTypes.includes(data.type)) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        `El tipo debe ser uno de: ${validTypes.join(", ")}`
    );
  }
  
  // 4. Validaciones específicas por tipo
  if (data.type === "specific" && (!data.users || !Array.isArray(data.users))) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "Para notificaciones específicas, 'users' debe ser un array"
    );
  }
  
  if (data.type === "conditional" && !data.condition) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "Para notificaciones condicionales, 'condition' es requerido"
    );
  }
  
  try {
    let result;
    
    // 5. Enviar notificación según el tipo
    switch (data.type) {
      case "broadcast":
        console.log("📢 Enviando notificación broadcast");
        result = await sendBroadcast(
            data.title,
            data.body,
            data.data || {}
        );
        break;
      
      case "specific":
        console.log(`📬 Enviando notificación a ${data.users.length} usuarios específicos`);
        result = await sendToMultipleUsers(
            data.users,
            data.title,
            data.body,
            data.data || {}
        );
        break;
      
      case "conditional":
        console.log(`🔍 Enviando notificación condicional: ${data.condition}`);
        
        // Definir condiciones predefinidas
        let conditionFunction;
        
        switch (data.condition) {
          case "has_free_washes":
            conditionFunction = (user) => {
              return (user.stats?.freeWashesAvailable || 0) > 0;
            };
            break;
          
          case "inactive_30_days":
            conditionFunction = (user) => {
              if (!user.stats?.lastVisit) return false;
              const lastVisit = user.stats.lastVisit.toMillis();
              const daysSince = (Date.now() - lastVisit) / (1000 * 60 * 60 * 24);
              return daysSince >= 30;
            };
            break;
          
          case "completed_5_plus":
            conditionFunction = (user) => {
              return (user.stats?.completedOrders || 0) >= 5;
            };
            break;
          
          case "has_unredeemed_washes":
            conditionFunction = (user) => {
              const freeWashes = user.stats?.freeWashesAvailable || 0;
              const completedOrders = user.stats?.completedOrders || 0;
              return freeWashes > 0 && completedOrders >= 6;
            };
            break;
          
          default:
            throw new functions.https.HttpsError(
                "invalid-argument",
                `Condición no reconocida: ${data.condition}`
            );
        }
        
        result = await sendConditional(
            conditionFunction,
            data.title,
            data.body,
            data.data || {}
        );
        break;
      
      default:
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Tipo de notificación no válido"
        );
    }
    
    // 6. Guardar log de la notificación
    await db.collection("notifications").add({
      type: data.type,
      title: data.title,
      body: data.body,
      sentTo: data.type === "broadcast" ? "all" : 
              data.type === "specific" ? data.users : 
              data.condition,
      sentBy: context.auth.uid,
      sentByEmail: context.auth.token.email || null,
      result: {
        total: result.total,
        successful: result.successful,
        failed: result.failed,
      },
      metadata: data.data || null,
      imageUrl: data.imageUrl || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log("✅ Notificación enviada y registrada");
    console.log("Resultado:", result);
    
    // 7. Retornar resultado
    return {
      success: true,
      ...result,
      message: `Notificación enviada exitosamente: ${result.successful}/${result.total}`,
    };
  } catch (error) {
    console.error("❌ Error enviando notificación:", error);
    
    throw new functions.https.HttpsError(
        "internal",
        "Error al enviar la notificación",
        error.message
    );
  }
});