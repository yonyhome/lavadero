/**
 * Utilidades para cálculos relacionados con promociones y métricas
 */

/**
 * Determina si un usuario debe recibir un lavado gratis
 * @param {number} completedOrders - Número de órdenes completadas
 * @param {number} washesRequired - Lavados requeridos para premio
 * @returns {boolean}
 */
function shouldGetFreeWash(completedOrders, washesRequired) {
  if (!washesRequired || washesRequired <= 0) return false;
  return completedOrders > 0 && completedOrders % washesRequired === 0;
}

/**
 * Calcula cuántos lavados faltan para el próximo gratis
 * @param {number} completedOrders - Número de órdenes completadas
 * @param {number} washesRequired - Lavados requeridos para premio
 * @returns {number}
 */
function washesUntilFree(completedOrders, washesRequired) {
  if (!washesRequired || washesRequired <= 0) return 0;
  
  const remainder = completedOrders % washesRequired;
  return washesRequired - remainder;
}

/**
 * Calcula el número de lavados gratis disponibles basado en órdenes completadas
 * @param {number} completedOrders - Número de órdenes completadas
 * @param {number} washesRequired - Lavados requeridos para premio
 * @param {number} currentFreeWashes - Lavados gratis actuales disponibles
 * @returns {number}
 */
function calculateFreeWashesAvailable(completedOrders, washesRequired, currentFreeWashes = 0) {
  if (!washesRequired || washesRequired <= 0) return currentFreeWashes;
  
  // Calcular cuántos premios ha ganado en total
  const totalEarned = Math.floor(completedOrders / washesRequired);
  
  // Si acaba de ganar uno nuevo, incrementar
  if (shouldGetFreeWash(completedOrders, washesRequired)) {
    return currentFreeWashes + 1;
  }
  
  return currentFreeWashes;
}

/**
 * Calcula ingresos totales de un conjunto de órdenes
 * @param {Array} orders - Array de órdenes
 * @returns {number}
 */
function calculateRevenue(orders) {
  if (!orders || !Array.isArray(orders)) return 0;
  
  return orders.reduce((total, order) => {
    // Solo contar órdenes completadas que no fueron gratis
    if (order.status === "completed" && order.paymentMethod !== "redeemed") {
      return total + (order.service?.price || 0);
    }
    return total;
  }, 0);
}

/**
 * Calcula el promedio de rating de un conjunto de valoraciones
 * @param {Array} ratings - Array de objetos con propiedad 'stars'
 * @returns {number}
 */
function calculateAverageRating(ratings) {
  if (!ratings || !Array.isArray(ratings) || ratings.length === 0) {
    return 0;
  }
  
  const validRatings = ratings.filter(r => r.stars && r.stars > 0);
  if (validRatings.length === 0) return 0;
  
  const sum = validRatings.reduce((total, r) => total + r.stars, 0);
  const average = sum / validRatings.length;
  
  // Redondear a 1 decimal
  return Math.round(average * 10) / 10;
}

/**
 * Calcula el tiempo promedio de servicio en minutos
 * @param {Array} orders - Array de órdenes completadas
 * @returns {number}
 */
function calculateAverageServiceTime(orders) {
  if (!orders || !Array.isArray(orders) || orders.length === 0) {
    return 0;
  }
  
  const ordersWithTime = orders.filter(order => {
    return order.status === "completed" && 
           order.createdAt && 
           order.completedAt;
  });
  
  if (ordersWithTime.length === 0) return 0;
  
  const totalMinutes = ordersWithTime.reduce((total, order) => {
    const duration = order.completedAt.toMillis() - order.createdAt.toMillis();
    return total + (duration / 1000 / 60); // Convertir a minutos
  }, 0);
  
  return Math.round(totalMinutes / ordersWithTime.length);
}

/**
 * Encuentra el servicio más popular en un conjunto de órdenes
 * @param {Array} orders - Array de órdenes
 * @returns {Object|null} - { id, name, count }
 */
function findMostPopularService(orders) {
  if (!orders || !Array.isArray(orders) || orders.length === 0) {
    return null;
  }
  
  const serviceCounts = {};
  
  orders.forEach(order => {
    if (order.service && order.service.id) {
      const serviceId = order.service.id;
      
      if (!serviceCounts[serviceId]) {
        serviceCounts[serviceId] = {
          id: serviceId,
          name: order.service.name || "Sin nombre",
          count: 0,
        };
      }
      
      serviceCounts[serviceId].count++;
    }
  });
  
  const services = Object.values(serviceCounts);
  if (services.length === 0) return null;
  
  // Encontrar el servicio con más órdenes
  return services.reduce((max, service) => {
    return service.count > max.count ? service : max;
  });
}

/**
 * Encuentra el trabajador más activo en un conjunto de órdenes
 * @param {Array} orders - Array de órdenes
 * @returns {Object|null} - { id, name, ordersCompleted }
 */
function findTopWorker(orders) {
  if (!orders || !Array.isArray(orders) || orders.length === 0) {
    return null;
  }
  
  const workerCounts = {};
  
  orders.forEach(order => {
    if (order.worker && order.worker.id && order.status === "completed") {
      const workerId = order.worker.id;
      
      if (!workerCounts[workerId]) {
        workerCounts[workerId] = {
          id: workerId,
          name: order.worker.name || "Sin nombre",
          ordersCompleted: 0,
        };
      }
      
      workerCounts[workerId].ordersCompleted++;
    }
  });
  
  const workers = Object.values(workerCounts);
  if (workers.length === 0) return null;
  
  // Encontrar el trabajador con más órdenes
  return workers.reduce((max, worker) => {
    return worker.ordersCompleted > max.ordersCompleted ? worker : max;
  });
}

/**
 * Calcula el porcentaje de progreso hacia el siguiente lavado gratis
 * @param {number} completedOrders - Órdenes completadas
 * @param {number} washesRequired - Lavados requeridos
 * @returns {number} - Porcentaje (0-100)
 */
function calculateProgressPercentage(completedOrders, washesRequired) {
  if (!washesRequired || washesRequired <= 0) return 0;
  
  const remainder = completedOrders % washesRequired;
  return Math.round((remainder / washesRequired) * 100);
}

module.exports = {
  shouldGetFreeWash,
  washesUntilFree,
  calculateFreeWashesAvailable,
  calculateRevenue,
  calculateAverageRating,
  calculateAverageServiceTime,
  findMostPopularService,
  findTopWorker,
  calculateProgressPercentage,
};