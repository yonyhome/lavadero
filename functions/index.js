/**
 * Cloud Functions for Lavadero de Motos
 * 
 * Triggers:
 * - onOrderCreate: Validaciones al crear una orden
 * - onOrderComplete: Lógica al completar una orden
 * - onOrderCancel: Lógica al cancelar una orden
 * - onRatingAdded: Actualización de ratings de trabajadores
 * 
 * HTTPS Callable:
 * - setAdminClaim: Asignar rol de admin a un usuario
 * - sendNotification: Enviar notificaciones push
 * 
 * Scheduled:
 * - dailyMetrics: Generar métricas diarias (00:00 cada día)
 * - inactiveUsersReminder: Recordatorios a usuarios inactivos (Domingos 10:00 AM)
 */

const admin = require("firebase-admin");
admin.initializeApp();

// ========== TRIGGERS ==========
exports.onOrderCreate = require("./src/triggers/onOrderCreate").onOrderCreate;
exports.onOrderComplete = require("./src/triggers/onOrderComplete").onOrderComplete;
exports.onOrderCancel = require("./src/triggers/onOrderCancel").onOrderCancel;
exports.onRatingAdded = require("./src/triggers/onRatingAdded").onRatingAdded;

// ========== HTTPS CALLABLE ==========
exports.setAdminClaim = require("./src/https/setAdminClaim").setAdminClaim;
exports.sendNotification = require("./src/https/sendNotification").sendNotification;

// ========== SCHEDULED ==========
exports.dailyMetrics = require("./src/scheduled/dailyMetrics").dailyMetrics;
exports.inactiveUsersReminder = require("./src/scheduled/inactiveUsersReminder").inactiveUsersReminder;