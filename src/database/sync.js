import sequelize, { testConnection } from '../config/database.js';
import { Employee, Record, Schedule } from '../models/index.js';
import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

async function syncDatabase() {
  try {
    console.log('🔄 Synchronizing database...');
    
    // Test connection first
    await testConnection();
    
    // Sync all models
    await sequelize.sync({ force: false, alter: true });
    console.log('✅ Database synchronized successfully');

    // Create default admin user if it doesn't exist
    const adminExists = await Employee.findOne({ 
      where: { role: 'admin' } 
    });

    if (!adminExists) {
      console.log('👤 Creating default admin user...');
      
      const totpSecret = speakeasy.generateSecret({
        name: 'Admin (ADM001)',
        issuer: 'Registro Horario'
      });

      const qrCodeUrl = await QRCode.toDataURL(totpSecret.otpauth_url);

      await Employee.create({
        name: 'Administrator',
        email: 'admin@registrohorario.com',
        employeeCode: 'ADM001',
        pinHash: '1234', // Will be hashed by model hook
        role: 'admin',
        totpSecret: totpSecret.base32,
        qrCodeUrl
      });

      console.log('✅ Default admin created:');
      console.log('   Employee Code: ADM001');
      console.log('   PIN: 1234');
      console.log('   Email: admin@registrohorario.com');
      console.log('   TOTP Secret:', totpSecret.base32);
    }

    console.log('🎉 Database setup completed!');
  } catch (error) {
    console.error('❌ Database sync error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  syncDatabase().then(() => process.exit(0));
}

export { syncDatabase };
