import sequelize, { testConnection } from './src/config/database.js';
import { Employee, Record, Schedule } from './src/models/index.js';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

async function setupDatabase() {
  try {
    console.log('🔄 Setting up database...');
    
    // Test connection
    await testConnection();
    
    // Force sync to recreate tables
    await sequelize.sync({ force: true });
    console.log('✅ Database tables created successfully');

    // Create default admin user
    console.log('👤 Creating default admin user...');
    
    const totpSecret = speakeasy.generateSecret({
      name: 'Admin (ADM001)',
      issuer: 'Jarana Sistema Horario'
    });

    const qrCodeUrl = await QRCode.toDataURL(totpSecret.otpauth_url);

    const admin = await Employee.create({
      name: 'Administrator',
      email: 'admin@jarana.com',
      employeeCode: 'ADM001',
      pinHash: '1234', // Will be hashed by model hook
      role: 'admin',
      totpSecret: totpSecret.base32,
      qrCodeUrl
    });

    console.log('✅ Default admin created:');
    console.log('   Employee Code: ADM001');
    console.log('   PIN: 1234');
    console.log('   Email: admin@jarana.com');
    console.log('   TOTP Secret:', totpSecret.base32);
    
    // Create a test employee
    console.log('👤 Creating test employee...');
    
    const testTotpSecret = speakeasy.generateSecret({
      name: 'Juan Pérez (EMP001)',
      issuer: 'Jarana Sistema Horario'
    });

    const testQrCodeUrl = await QRCode.toDataURL(testTotpSecret.otpauth_url);

    const testEmployee = await Employee.create({
      name: 'Juan Pérez',
      email: 'juan@jarana.com',
      employeeCode: 'EMP001',
      pinHash: '5678',
      role: 'employee',
      totpSecret: testTotpSecret.base32,
      qrCodeUrl: testQrCodeUrl
    });

    console.log('✅ Test employee created:');
    console.log('   Employee Code: EMP001');
    console.log('   PIN: 5678');
    console.log('   Email: juan@jarana.com');

    console.log('🎉 Database setup completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database setup error:', error);
    process.exit(1);
  }
}

setupDatabase();
