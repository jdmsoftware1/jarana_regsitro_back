import sequelize from './src/config/database.js';
import { Employee, Record, Schedule, Vacation } from './src/models/index.js';

async function fixDatabase() {
  try {
    console.log('🔄 Conectando a la base de datos...');
    await sequelize.authenticate();
    console.log('✅ Conexión establecida');

    console.log('🗑️ Eliminando tablas existentes...');
    // Drop tables in correct order (respecting foreign keys)
    await Vacation.drop({ cascade: true }).catch(() => {});
    await Schedule.drop({ cascade: true }).catch(() => {});
    await Record.drop({ cascade: true }).catch(() => {});
    await Employee.drop({ cascade: true }).catch(() => {});
    console.log('✅ Tablas eliminadas');

    console.log('🔄 Recreando tablas...');
    await sequelize.sync({ force: true });
    console.log('✅ Tablas recreadas');

    console.log('👤 Creando empleados de prueba...');
    const employees = await Employee.bulkCreate([
      {
        name: 'Juan Pérez',
        employeeCode: 'EMP001',
        email: 'juan@jarana.com',
        totpSecret: 'JBSWY3DPEHPK3PXP',
        qrCodeUrl: 'data:image/png;base64,test1',
        isActive: true
      },
      {
        name: 'María García',
        employeeCode: 'EMP002', 
        email: 'maria@jarana.com',
        totpSecret: 'JBSWY3DPEHPK3PXQ',
        qrCodeUrl: 'data:image/png;base64,test2',
        isActive: true
      },
      {
        name: 'Carlos López',
        employeeCode: 'EMP003',
        email: 'carlos@jarana.com', 
        totpSecret: 'JBSWY3DPEHPK3PXR',
        qrCodeUrl: 'data:image/png;base64,test3',
        isActive: true
      }
    ]);
    console.log('✅ Empleados creados');

    console.log('📅 Creando horarios de ejemplo...');
    for (const employee of employees) {
      // Horario de lunes a viernes 9:00-17:00
      for (let day = 1; day <= 5; day++) {
        await Schedule.create({
          employeeId: employee.id,
          dayOfWeek: day,
          isWorkingDay: true,
          startTime: '09:00',
          endTime: '17:00',
          breakStartTime: '13:00',
          breakEndTime: '14:00'
        });
      }
      
      // Fin de semana no laboral
      for (let day = 0; day <= 0; day++) { // Solo domingo
        await Schedule.create({
          employeeId: employee.id,
          dayOfWeek: day,
          isWorkingDay: false,
          startTime: null,
          endTime: null,
          breakStartTime: null,
          breakEndTime: null
        });
      }
      
      await Schedule.create({
        employeeId: employee.id,
        dayOfWeek: 6, // Sábado
        isWorkingDay: false,
        startTime: null,
        endTime: null,
        breakStartTime: null,
        breakEndTime: null
      });
    }
    console.log('✅ Horarios creados');

    console.log('📊 Creando registros de ejemplo...');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Registros de hoy
    await Record.create({
      employeeId: employees[0].id,
      type: 'checkin',
      timestamp: new Date(today.setHours(9, 15, 0, 0)) // 9:15 AM
    });
    
    await Record.create({
      employeeId: employees[1].id,
      type: 'checkin', 
      timestamp: new Date(today.setHours(8, 45, 0, 0)) // 8:45 AM
    });

    // Registros de ayer
    await Record.create({
      employeeId: employees[0].id,
      type: 'checkin',
      timestamp: new Date(yesterday.setHours(9, 0, 0, 0))
    });
    
    await Record.create({
      employeeId: employees[0].id,
      type: 'checkout',
      timestamp: new Date(yesterday.setHours(17, 30, 0, 0))
    });
    
    console.log('✅ Registros creados');

    console.log('🏖️ Creando vacaciones de ejemplo...');
    await Vacation.create({
      employeeId: employees[0].id,
      startDate: '2025-02-15',
      endDate: '2025-02-20',
      type: 'vacation',
      reason: 'Vacaciones familiares',
      status: 'pending'
    });
    console.log('✅ Vacaciones creadas');

    console.log('🎉 Base de datos reparada exitosamente!');
    
  } catch (error) {
    console.error('❌ Error reparando la base de datos:', error);
  } finally {
    await sequelize.close();
  }
}

fixDatabase();
