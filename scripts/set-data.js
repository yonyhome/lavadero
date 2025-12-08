// Script para poblar datos iniciales en Firestore
const admin = require('firebase-admin');
const serviceAccount = require('../service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function seedData() {
  console.log('🌱 Iniciando seed de datos...');
  
  // // 1. Configuración inicial
  // await db.collection('settings').doc('app_config').set({
  //   promotions: {
  //     washesRequiredForFree: 6,
  //     freeWashExpirationDays: null // No expira
  //   },
  //   businessInfo: {
  //     name: 'Lavadero XYZ',
  //     phone: '3001234567',
  //     address: 'Calle 123 #45-67, Barranquilla',
  //     openingHours: {
  //       monday: { open: '08:00', close: '18:00', closed: false },
  //       tuesday: { open: '08:00', close: '18:00', closed: false },
  //       wednesday: { open: '08:00', close: '18:00', closed: false },
  //       thursday: { open: '08:00', close: '18:00', closed: false },
  //       friday: { open: '08:00', close: '18:00', closed: false },
  //       saturday: { open: '09:00', close: '17:00', closed: false },
  //       sunday: { open: '00:00', close: '00:00', closed: true }
  //     }
  //   },
  //   notifications: {
  //     orderCompleted: true,
  //     freeWashAvailable: true,
  //     reminderAfterDays: 30
  //   },
  //   createdAt: admin.firestore.FieldValue.serverTimestamp(),
  //   updatedAt: admin.firestore.FieldValue.serverTimestamp()
  // });
  
  // console.log('✅ Settings creado');
  
  // // 2. Servicios iniciales
  // const services = [
  //   {
  //     name: 'Lavado Básico',
  //     description: 'Lavado exterior con jabón especializado y secado',
  //     price: 15000,
  //     estimatedTime: 20,
  //     photoUrl: null,
  //     isActive: true,
  //     order: 1
  //   },
  //   {
  //     name: 'Lavado Premium',
  //     description: 'Lavado completo + encerado + limpieza de rines',
  //     price: 25000,
  //     estimatedTime: 30,
  //     photoUrl: null,
  //     isActive: true,
  //     order: 2
  //   }
  // ];
  
  // for (const service of services) {
  //   await db.collection('services').add({
  //     ...service,
  //     createdAt: admin.firestore.FieldValue.serverTimestamp(),
  //     updatedAt: admin.firestore.FieldValue.serverTimestamp()
  //   });
  // }
  
  // console.log('✅ Servicios creados');
  
  // 3. Cargar modelos de motos desde JSON
  const motorcyclesData = require('../frontend/public/motorcycles.json');
  
  for (const model of motorcyclesData.models) {
    await db.collection('motorcycleModels').doc(model.id).set({
      ...model,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  
  console.log(`✅ ${motorcyclesData.models.length} modelos de motos cargados`);
  
  console.log('🎉 Seed completado exitosamente!');
  process.exit(0);
}

seedData().catch((error) => {
  console.error('❌ Error en seed:', error);
  process.exit(1);
});