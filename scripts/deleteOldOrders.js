// scripts/deleteOldOrders.js
const admin = require('firebase-admin');
const serviceAccount = require('../service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function deleteOldOrders() {
  console.log('🗑️ Iniciando eliminación de órdenes...');
  
  const userId = 'NCZ49G';
  const cutoffDate = new Date('2025-12-05T00:00:00'); // 5 de diciembre de 2025
  
  console.log(`Usuario: ${userId}`);
  console.log(`Eliminando órdenes creadas antes de: ${cutoffDate.toISOString()}`);
  
  try {
    // Query para obtener órdenes del usuario antes de la fecha
    const ordersQuery = db.collection('orders')
      .where('userId', '==', userId)
      .where('createdAt', '<', admin.firestore.Timestamp.fromDate(cutoffDate));
    
    const snapshot = await ordersQuery.get();
    
    if (snapshot.empty) {
      console.log('✅ No se encontraron órdenes para eliminar');
      process.exit(0);
    }
    
    console.log(`📋 Encontradas ${snapshot.size} órdenes para eliminar`);
    
    // Confirmar antes de eliminar
    console.log('\n⚠️  Órdenes a eliminar:');
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`  - ID: ${doc.id}`);
      console.log(`    Servicio: ${data.service?.name || 'N/A'}`);
      console.log(`    Creada: ${data.createdAt?.toDate().toLocaleString() || 'N/A'}`);
      console.log(`    Estado: ${data.status}`);
      console.log('');
    });
    
    // Eliminar en lotes (batch delete)
    const batch = db.batch();
    let deleteCount = 0;
    
    snapshot.forEach(doc => {
      batch.delete(doc.ref);
      deleteCount++;
    });
    
    // Ejecutar el batch
    await batch.commit();
    
    console.log(`✅ ${deleteCount} órdenes eliminadas exitosamente`);
    console.log('🎉 Proceso completado!');
    
  } catch (error) {
    console.error('❌ Error al eliminar órdenes:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Ejecutar
deleteOldOrders().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});