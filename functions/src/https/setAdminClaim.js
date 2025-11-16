const functions = require("firebase-functions");
const admin = require("firebase-admin");

/**
 * Cloud Function para asignar rol de admin a un usuario
 * Uso: Llamar desde Firebase Console o CLI
 * 
 * Ejemplo CLI:
 * firebase functions:call setAdminClaim --data '{"uid":"USER_UID_HERE"}'
 */
exports.setAdminClaim = functions.https.onCall(async (data, context) => {
  // Validación básica
  if (!data.uid) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "El UID del usuario es requerido"
    );
  }

  try {
    // Asignar custom claim
    await admin.auth().setCustomUserClaims(data.uid, {admin: true});

    console.log(`✅ Admin claim asignado a usuario: ${data.uid}`);

    return {
      success: true,
      message: `Usuario ${data.uid} ahora es administrador`,
    };
  } catch (error) {
    console.error("Error asignando admin claim:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Error al asignar permisos de admin",
      error
    );
  }
});