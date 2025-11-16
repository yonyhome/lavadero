/**
 * Scheduled Function: Generar métricas diarias
 * Se ejecuta todos los días a las 00:00 (medianoche) hora de Colombia (UTC-5)
 * 
 * Calcula y guarda:
 * - Total de órdenes del día anterior
 * - Ingresos totales
 * - Tiempo promedio de servicio
 * - Servicio más popular
 * - Trabajador más activo
 * - Promedio de rating
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {
  calculateRevenue,
  calculateAverageRating,
  calculateAverageServiceTime,
  findMostPopularService,
  findTopWorker,
} = require("../utils/calculations");

const db = admin.firestore();

exports.dailyMetrics = functions.pubsub
    .schedule("0 0 * * *") // Todos los días a medianoche
    .timeZone("America/Bogota") // Zona horaria de Colombia
    .onRun(async (context) => {
      console.log("📊 Generando métricas diarias...");
      
      try {
        // 1. Definir rango del día anterior
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const dateString = yesterday.toISOString().split("T")[0]; // YYYY-MM-DD
        
        console.log(`📅 Calculando métricas para: ${dateString}`);
        
        // 2. Obtener todas las órdenes del día anterior
        const ordersSnapshot = await db.collection("orders")
            .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(yesterday))
            .where("createdAt", "<", admin.firestore.Timestamp.fromDate(today))
            .get();
        
        console.log(`📦 Total de órdenes del día: ${ordersSnapshot.size}`);
        
        if (ordersSnapshot.empty) {
          console.log("ℹ️ No hay órdenes para procesar");
          
          // Guardar reporte vacío
          await db.collection("dailyReports").doc(dateString).set({
            date: admin.firestore.Timestamp.fromDate(yesterday),
            metrics: {
              totalOrders: 0,
              completedOrders: 0,
              cancelledOrders: 0,
              inProgressOrders: 0,
              revenue: 0,
              freeWashesRedeemed: 0,
              averageServiceTime: 0,
              mostPopularService: null,
              topWorker: null,
              averageRating: 0,
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          
          return null;
        }
        
        // 3. Procesar órdenes
        const orders = [];
        const completedOrders = [];
        const ratingsArray = [];
        let cancelledCount = 0;
        let inProgressCount = 0;
        let freeWashesRedeemed = 0;
        
        ordersSnapshot.forEach((doc) => {
          const order = {
            id: doc.id,
            ...doc.data(),
          };
          
          orders.push(order);
          
          // Clasificar por estado
          if (order.status === "completed") {
            completedOrders.push(order);
            
            // Contar ratings
            if (order.rating && order.rating.stars) {
              ratingsArray.push(order.rating);
            }
            
            // Contar lavados gratis redimidos
            if (order.paymentMethod === "redeemed") {
              freeWashesRedeemed++;
            }
          } else if (order.status === "cancelled") {
            cancelledCount++;
          } else if (order.status === "in_progress") {
            inProgressCount++;
          }
        });
        
        // 4. Calcular métricas
        const metrics = {
          totalOrders: orders.length,
          completedOrders: completedOrders.length,
          cancelledOrders: cancelledCount,
          inProgressOrders: inProgressCount,
          revenue: calculateRevenue(completedOrders),
          freeWashesRedeemed,
          averageServiceTime: calculateAverageServiceTime(completedOrders),
          mostPopularService: findMostPopularService(orders),
          topWorker: findTopWorker(completedOrders),
          averageRating: calculateAverageRating(ratingsArray),
          totalRatings: ratingsArray.length,
        };
        
        console.log("📈 Métricas calculadas:", metrics);
        
        // 5. Guardar en Firestore
        await db.collection("dailyReports").doc(dateString).set({
          date: admin.firestore.Timestamp.fromDate(yesterday),
          metrics,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        console.log(`✅ Reporte diario guardado: ${dateString}`);
        
        // 6. Opcional: Calcular métricas mensuales si es fin de mes
        const isLastDayOfMonth = yesterday.getDate() === 
          new Date(yesterday.getFullYear(), yesterday.getMonth() + 1, 0).getDate();
        
        if (isLastDayOfMonth) {
          console.log("📊 Es fin de mes, calculando métricas mensuales...");
          await calculateMonthlyMetrics(yesterday);
        }
        
        return null;
      } catch (error) {
        console.error("❌ Error generando métricas diarias:", error);
        throw error;
      }
    });

/**
 * Función auxiliar para calcular métricas mensuales
 * @param {Date} date - Fecha del mes a calcular
 */
async function calculateMonthlyMetrics(date) {
  try {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    // Primer y último día del mes
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0, 23, 59, 59);
    
    const monthString = `${year}-${String(month + 1).padStart(2, "0")}`; // YYYY-MM
    
    console.log(`📅 Calculando métricas mensuales para: ${monthString}`);
    
    // Obtener todas las órdenes del mes
    const ordersSnapshot = await db.collection("orders")
        .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(firstDay))
        .where("createdAt", "<=", admin.firestore.Timestamp.fromDate(lastDay))
        .get();
    
    const orders = [];
    const completedOrders = [];
    const ratingsArray = [];
    
    ordersSnapshot.forEach((doc) => {
      const order = {id: doc.id, ...doc.data()};
      orders.push(order);
      
      if (order.status === "completed") {
        completedOrders.push(order);
        if (order.rating) ratingsArray.push(order.rating);
      }
    });
    
    const monthlyMetrics = {
      totalOrders: orders.length,
      completedOrders: completedOrders.length,
      cancelledOrders: orders.filter((o) => o.status === "cancelled").length,
      revenue: calculateRevenue(completedOrders),
      averageRating: calculateAverageRating(ratingsArray),
      mostPopularService: findMostPopularService(orders),
      topWorker: findTopWorker(completedOrders),
    };
    
    await db.collection("monthlyReports").doc(monthString).set({
      year,
      month: month + 1,
      metrics: monthlyMetrics,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log(`✅ Reporte mensual guardado: ${monthString}`);
  } catch (error) {
    console.error("❌ Error calculando métricas mensuales:", error);
  }
}