const admin = require('firebase-admin');
const serviceAccount = require('../service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// ⚠️ PRIMERO: Obtener el UID del usuario admin
async function listUsers() {
  try {
    const listUsersResult = await admin.auth().listUsers(10);
    
    console.log('\n📋 Usuarios registrados:\n');
    listUsersResult.users.forEach((user, index) => {
      console.log(`${index + 1}. Email: ${user.email}`);
      console.log(`   UID: ${user.uid}`);
      console.log(`   Custom Claims: ${JSON.stringify(user.customClaims || {})}\n`);
    });
    
    // Si solo hay un usuario, asignar admin automáticamente
    if (listUsersResult.users.length === 1) {
      const adminUser = listUsersResult.users[0];
      console.log(`🔑 Asignando permisos de admin a: ${adminUser.email}`);
      
      await admin.auth().setCustomUserClaims(adminUser.uid, { admin: true });
      
      console.log('✅ Permisos de admin asignados exitosamente!');
      
      // Verificar
      const updatedUser = await admin.auth().getUser(adminUser.uid);
      console.log('✅ Custom claims actualizados:', updatedUser.customClaims);
    } else {
      console.log('⚠️  Hay múltiples usuarios. Edita el script y especifica el UID manualmente.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

listUsers();