// Configuración específica para tests de plantillas de horarios
import { beforeAll, afterAll } from '@jest/globals';
import sequelize from '../src/config/database.js';

// Configurar base de datos de pruebas
beforeAll(async () => {
  // Usar base de datos en memoria para pruebas
  process.env.NODE_ENV = 'test';
  
  try {
    await sequelize.authenticate();
    console.log('✅ Conexión a base de datos de pruebas establecida');
    
    // Sincronizar modelos (recrear tablas)
    await sequelize.sync({ force: true });
    console.log('✅ Modelos sincronizados para pruebas');
  } catch (error) {
    console.error('❌ Error configurando base de datos de pruebas:', error);
    throw error;
  }
});

afterAll(async () => {
  try {
    await sequelize.close();
    console.log('✅ Conexión a base de datos cerrada');
  } catch (error) {
    console.error('❌ Error cerrando conexión:', error);
  }
});

// Configuraciones globales para pruebas
global.testTimeout = 30000; // 30 segundos timeout para pruebas

// Mock de console.log para pruebas más limpias
const originalConsoleLog = console.log;
global.mockConsoleLog = () => {
  console.log = jest.fn();
};

global.restoreConsoleLog = () => {
  console.log = originalConsoleLog;
};

// Utilidades de prueba
global.createTestEmployee = async (Employee, overrides = {}) => {
  const defaultData = {
    name: 'Test Employee',
    email: `test-${Date.now()}@example.com`,
    employeeCode: `TEST${Date.now()}`,
    pinHash: 'hashedpin123',
    role: 'employee'
  };
  
  return await Employee.create({ ...defaultData, ...overrides });
};

global.createTestTemplate = async (ScheduleTemplate, createdBy, overrides = {}) => {
  const defaultData = {
    name: `Test Template ${Date.now()}`,
    description: 'Template created for testing',
    createdBy
  };
  
  return await ScheduleTemplate.create({ ...defaultData, ...overrides });
};

global.createTestTemplateDay = async (ScheduleTemplateDay, templateId, overrides = {}) => {
  const defaultData = {
    templateId,
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '17:00',
    breakStartTime: '13:00',
    breakEndTime: '14:00',
    isWorkingDay: true,
    notes: 'Test day'
  };
  
  return await ScheduleTemplateDay.create({ ...defaultData, ...overrides });
};
