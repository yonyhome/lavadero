// functions/onOrderCancel.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { sendToUser } = require("./notifications");

exports.onOrderCancel = functions.firestore
  .document("orders/{orderId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const orderId = context.params.orderId;

    // Detectar cambio a cancelado
    if (before.status === "cancelled" || after.status !== "cancelled") {
      return null;
    }

    console.log(`🚫 Orden cancelada: ${orderId}`);

    try {
      const order = after;

      // Restaurar lavado gratis si aplicaba
      if (order.isFreeWash === true) {
        const userRef = admin.firestore().collection("users").doc(order.userId);

        await userRef.update({
          "stats.freeWashesAvailable": admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`♻️ Lavado gratis restaurado a ${order.userId}`);
      }

      // AUDITORÍA (si la deseas)
      await change.after.ref.update({
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // NOTIFICACIÓN PUSH
      await sendToUser(
        order.userId,
        "Orden cancelada",
        "Tu orden ha sido cancelada. Si fue un error, puedes crear una nueva en cualquier momento.",
        { path: "/services" }
      );

      console.log(`📨 Notificación enviada a ${order.userId}`);

      return null;
    } catch (error) {
      console.error("❌ Error en onOrderCancel:", error);
      return null;
    }
  });
