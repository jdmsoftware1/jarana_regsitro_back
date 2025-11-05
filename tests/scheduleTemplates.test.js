// Tests unitarios para el sistema de plantillas de horarios
// Ejecutar con: npm test scheduleTemplates.test.js

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { ScheduleTemplate, ScheduleTemplateDay, Employee, Schedule } from '../src/models/index.js';
import sequelize from '../src/config/database.js';

// Mock de la aplicación Express (necesitarás ajustar la ruta según tu estructura)
import app from '../src/index.js';

describe('Schedule Templates API', () => {
  let testEmployee;
  let testTemplate;
  
  beforeAll(async () => {
    // Conectar a la base de datos de pruebas
    await sequelize.authenticate();
    await sequelize.sync({ force: true }); // Recrear tablas para pruebas
  });
  
  afterAll(async () => {
    // Limpiar y cerrar conexión
    await sequelize.close();
  });
  
  beforeEach(async () => {
    // Crear empleado de prueba
    testEmployee = await Employee.create({
      name: 'Test Admin',
      email: 'test@example.com',
      employeeCode: 'TEST001',
      pinHash: 'hashedpin123',
      role: 'admin'
    });
  });
  
  afterEach(async () => {
    // Limpiar datos de prueba
    await Schedule.destroy({ where: {}, force: true });
    await ScheduleTemplateDay.destroy({ where: {}, force: true });
    await ScheduleTemplate.destroy({ where: {}, force: true });
    await Employee.destroy({ where: {}, force: true });
  });
  
  describe('POST /api/schedule-templates', () => {
    test('should create a new schedule template successfully', async () => {
      const templateData = {
        name: 'Test Office Hours',
        description: 'Standard office hours for testing',
        createdBy: testEmployee.id,
        templateDays: [
          {
            dayOfWeek: 1,
            startTime: '09:00',
            endTime: '17:00',
            breakStartTime: '13:00',
            breakEndTime: '14:00',
            isWorkingDay: true,
            notes: 'Monday'
          },
          {
            dayOfWeek: 2,
            startTime: '09:00',
            endTime: '17:00',
            breakStartTime: '13:00',
            breakEndTime: '14:00',
            isWorkingDay: true,
            notes: 'Tuesday'
          }
        ]
      };
      
      const response = await request(app)
        .post('/api/schedule-templates')
        .send(templateData)
        .expect(201);
      
      expect(response.body.message).toBe('Schedule template created successfully');
      expect(response.body.data.name).toBe(templateData.name);
      expect(response.body.data.templateDays).toHaveLength(2);
      expect(response.body.data.creator.id).toBe(testEmployee.id);
      
      testTemplate = response.body.data;
    });
    
    test('should fail to create template with duplicate name', async () => {
      // Crear primera plantilla
      await ScheduleTemplate.create({
        name: 'Duplicate Name',
        description: 'First template',
        createdBy: testEmployee.id
      });
      
      // Intentar crear segunda con el mismo nombre
      const templateData = {
        name: 'Duplicate Name',
        description: 'Second template',
        createdBy: testEmployee.id,
        templateDays: []
      };
      
      const response = await request(app)
        .post('/api/schedule-templates')
        .send(templateData)
        .expect(400);
      
      expect(response.body.error).toBe('Template name already exists');
    });
    
    test('should fail to create template without required fields', async () => {
      const response = await request(app)
        .post('/api/schedule-templates')
        .send({})
        .expect(400);
      
      expect(response.body.error).toBe('Name, createdBy, and templateDays are required');
    });
    
    test('should fail to create template with non-existent creator', async () => {
      const templateData = {
        name: 'Test Template',
        createdBy: '00000000-0000-0000-0000-000000000000',
        templateDays: []
      };
      
      const response = await request(app)
        .post('/api/schedule-templates')
        .send(templateData)
        .expect(404);
      
      expect(response.body.error).toBe('Creator employee not found');
    });
  });
  
  describe('GET /api/schedule-templates', () => {
    beforeEach(async () => {
      // Crear plantillas de prueba
      testTemplate = await ScheduleTemplate.create({
        name: 'Test Template 1',
        description: 'First test template',
        createdBy: testEmployee.id
      });
      
      await ScheduleTemplateDay.create({
        templateId: testTemplate.id,
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '17:00',
        isWorkingDay: true
      });
    });
    
    test('should get all templates', async () => {
      const response = await request(app)
        .get('/api/schedule-templates')
        .expect(200);
      
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Test Template 1');
      expect(response.body.data[0].templateDays).toHaveLength(1);
      expect(response.body.data[0].creator.name).toBe(testEmployee.name);
    });
    
    test('should get only active templates', async () => {
      // Crear plantilla inactiva
      await ScheduleTemplate.create({
        name: 'Inactive Template',
        description: 'This is inactive',
        createdBy: testEmployee.id,
        isActive: false
      });
      
      const response = await request(app)
        .get('/api/schedule-templates/active')
        .expect(200);
      
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Test Template 1');
      expect(response.body.data[0].isActive).toBe(true);
    });
  });
  
  describe('GET /api/schedule-templates/:id', () => {
    beforeEach(async () => {
      testTemplate = await ScheduleTemplate.create({
        name: 'Specific Template',
        description: 'Template for specific test',
        createdBy: testEmployee.id
      });
    });
    
    test('should get specific template by ID', async () => {
      const response = await request(app)
        .get(`/api/schedule-templates/${testTemplate.id}`)
        .expect(200);
      
      expect(response.body.data.id).toBe(testTemplate.id);
      expect(response.body.data.name).toBe('Specific Template');
    });
    
    test('should return 404 for non-existent template', async () => {
      const response = await request(app)
        .get('/api/schedule-templates/00000000-0000-0000-0000-000000000000')
        .expect(404);
      
      expect(response.body.error).toBe('Template not found');
    });
  });
  
  describe('PUT /api/schedule-templates/:id', () => {
    beforeEach(async () => {
      testTemplate = await ScheduleTemplate.create({
        name: 'Original Name',
        description: 'Original description',
        createdBy: testEmployee.id
      });
    });
    
    test('should update template successfully', async () => {
      const updateData = {
        name: 'Updated Name',
        description: 'Updated description'
      };
      
      const response = await request(app)
        .put(`/api/schedule-templates/${testTemplate.id}`)
        .send(updateData)
        .expect(200);
      
      expect(response.body.message).toBe('Template updated successfully');
      expect(response.body.data.name).toBe('Updated Name');
      expect(response.body.data.description).toBe('Updated description');
    });
    
    test('should return 404 for non-existent template', async () => {
      const response = await request(app)
        .put('/api/schedule-templates/00000000-0000-0000-0000-000000000000')
        .send({ name: 'New Name' })
        .expect(404);
      
      expect(response.body.error).toBe('Template not found');
    });
  });
  
  describe('PATCH /api/schedule-templates/:id/toggle-active', () => {
    beforeEach(async () => {
      testTemplate = await ScheduleTemplate.create({
        name: 'Toggle Test Template',
        createdBy: testEmployee.id,
        isActive: true
      });
    });
    
    test('should toggle template active status', async () => {
      const response = await request(app)
        .patch(`/api/schedule-templates/${testTemplate.id}/toggle-active`)
        .expect(200);
      
      expect(response.body.message).toBe('Template deactivated successfully');
      expect(response.body.data.isActive).toBe(false);
    });
  });
  
  describe('DELETE /api/schedule-templates/:id', () => {
    beforeEach(async () => {
      testTemplate = await ScheduleTemplate.create({
        name: 'Delete Test Template',
        createdBy: testEmployee.id
      });
    });
    
    test('should delete template when not in use', async () => {
      const response = await request(app)
        .delete(`/api/schedule-templates/${testTemplate.id}`)
        .expect(200);
      
      expect(response.body.message).toBe('Template deleted successfully');
    });
    
    test('should prevent deletion when template is in use', async () => {
      // Crear un horario que use la plantilla
      await Schedule.create({
        employeeId: testEmployee.id,
        templateId: testTemplate.id,
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '17:00',
        isWorkingDay: true
      });
      
      const response = await request(app)
        .delete(`/api/schedule-templates/${testTemplate.id}`)
        .expect(400);
      
      expect(response.body.error).toContain('Cannot delete template. It is being used by');
    });
  });
  
  describe('POST /api/schedules/employee/:employeeId/apply-template', () => {
    beforeEach(async () => {
      testTemplate = await ScheduleTemplate.create({
        name: 'Apply Test Template',
        createdBy: testEmployee.id
      });
      
      await ScheduleTemplateDay.create({
        templateId: testTemplate.id,
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '17:00',
        isWorkingDay: true
      });
      
      await ScheduleTemplateDay.create({
        templateId: testTemplate.id,
        dayOfWeek: 2,
        startTime: '09:00',
        endTime: '17:00',
        isWorkingDay: true
      });
    });
    
    test('should apply template to employee successfully', async () => {
      const response = await request(app)
        .post(`/api/schedules/employee/${testEmployee.id}/apply-template`)
        .send({ templateId: testTemplate.id })
        .expect(201);
      
      expect(response.body.message).toContain('applied successfully');
      expect(response.body.schedules).toHaveLength(2);
      expect(response.body.template.id).toBe(testTemplate.id);
      
      // Verificar que los horarios se crearon en la base de datos
      const schedules = await Schedule.findAll({ where: { employeeId: testEmployee.id } });
      expect(schedules).toHaveLength(2);
      expect(schedules[0].templateId).toBe(testTemplate.id);
    });
    
    test('should fail to apply non-existent template', async () => {
      const response = await request(app)
        .post(`/api/schedules/employee/${testEmployee.id}/apply-template`)
        .send({ templateId: '00000000-0000-0000-0000-000000000000' })
        .expect(404);
      
      expect(response.body.error).toBe('Template not found or inactive');
    });
    
    test('should fail to apply template to non-existent employee', async () => {
      const response = await request(app)
        .post('/api/schedules/employee/00000000-0000-0000-0000-000000000000/apply-template')
        .send({ templateId: testTemplate.id })
        .expect(404);
      
      expect(response.body.error).toBe('Employee not found');
    });
  });
  
  describe('POST /api/schedules/apply-template-bulk', () => {
    let secondEmployee;
    
    beforeEach(async () => {
      // Crear segundo empleado
      secondEmployee = await Employee.create({
        name: 'Second Employee',
        email: 'second@example.com',
        employeeCode: 'TEST002',
        pinHash: 'hashedpin456',
        role: 'employee'
      });
      
      testTemplate = await ScheduleTemplate.create({
        name: 'Bulk Apply Template',
        createdBy: testEmployee.id
      });
      
      await ScheduleTemplateDay.create({
        templateId: testTemplate.id,
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '16:00',
        isWorkingDay: true
      });
    });
    
    test('should apply template to multiple employees successfully', async () => {
      const response = await request(app)
        .post('/api/schedules/apply-template-bulk')
        .send({
          templateId: testTemplate.id,
          employeeIds: [testEmployee.id, secondEmployee.id]
        })
        .expect(201);
      
      expect(response.body.message).toContain('applied to 2 employees successfully');
      expect(response.body.summary.total).toBe(2);
      expect(response.body.summary.successful).toBe(2);
      expect(response.body.summary.failed).toBe(0);
      expect(response.body.results).toHaveLength(2);
      
      // Verificar que los horarios se crearon para ambos empleados
      const employee1Schedules = await Schedule.findAll({ where: { employeeId: testEmployee.id } });
      const employee2Schedules = await Schedule.findAll({ where: { employeeId: secondEmployee.id } });
      
      expect(employee1Schedules).toHaveLength(1);
      expect(employee2Schedules).toHaveLength(1);
    });
    
    test('should handle partial failures gracefully', async () => {
      const response = await request(app)
        .post('/api/schedules/apply-template-bulk')
        .send({
          templateId: testTemplate.id,
          employeeIds: [testEmployee.id, '00000000-0000-0000-0000-000000000000']
        })
        .expect(404);
      
      expect(response.body.error).toBe('One or more employees not found');
    });
    
    test('should fail with invalid input', async () => {
      const response = await request(app)
        .post('/api/schedules/apply-template-bulk')
        .send({
          templateId: testTemplate.id
          // Missing employeeIds
        })
        .expect(400);
      
      expect(response.body.error).toBe('templateId and employeeIds array are required');
    });
  });
});

// Tests de modelos
describe('Schedule Template Models', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
    await sequelize.sync({ force: true });
  });
  
  afterAll(async () => {
    await sequelize.close();
  });
  
  afterEach(async () => {
    await ScheduleTemplateDay.destroy({ where: {}, force: true });
    await ScheduleTemplate.destroy({ where: {}, force: true });
    await Employee.destroy({ where: {}, force: true });
  });
  
  describe('ScheduleTemplate Model', () => {
    test('should create template with valid data', async () => {
      const employee = await Employee.create({
        name: 'Test Creator',
        email: 'creator@test.com',
        employeeCode: 'CRT001',
        pinHash: 'hash123',
        role: 'admin'
      });
      
      const template = await ScheduleTemplate.create({
        name: 'Model Test Template',
        description: 'Testing the model',
        createdBy: employee.id
      });
      
      expect(template.id).toBeDefined();
      expect(template.name).toBe('Model Test Template');
      expect(template.isActive).toBe(true);
      expect(template.createdBy).toBe(employee.id);
    });
    
    test('should enforce unique name constraint', async () => {
      const employee = await Employee.create({
        name: 'Test Creator',
        email: 'creator@test.com',
        employeeCode: 'CRT001',
        pinHash: 'hash123',
        role: 'admin'
      });
      
      await ScheduleTemplate.create({
        name: 'Unique Name',
        createdBy: employee.id
      });
      
      await expect(
        ScheduleTemplate.create({
          name: 'Unique Name',
          createdBy: employee.id
        })
      ).rejects.toThrow();
    });
  });
  
  describe('ScheduleTemplateDay Model', () => {
    test('should create template day with valid data', async () => {
      const employee = await Employee.create({
        name: 'Test Creator',
        email: 'creator@test.com',
        employeeCode: 'CRT001',
        pinHash: 'hash123',
        role: 'admin'
      });
      
      const template = await ScheduleTemplate.create({
        name: 'Day Test Template',
        createdBy: employee.id
      });
      
      const templateDay = await ScheduleTemplateDay.create({
        templateId: template.id,
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '17:00',
        isWorkingDay: true
      });
      
      expect(templateDay.id).toBeDefined();
      expect(templateDay.templateId).toBe(template.id);
      expect(templateDay.dayOfWeek).toBe(1);
      expect(templateDay.isWorkingDay).toBe(true);
    });
    
    test('should validate dayOfWeek range', async () => {
      const employee = await Employee.create({
        name: 'Test Creator',
        email: 'creator@test.com',
        employeeCode: 'CRT001',
        pinHash: 'hash123',
        role: 'admin'
      });
      
      const template = await ScheduleTemplate.create({
        name: 'Validation Test Template',
        createdBy: employee.id
      });
      
      // dayOfWeek fuera del rango válido (0-6)
      await expect(
        ScheduleTemplateDay.create({
          templateId: template.id,
          dayOfWeek: 7, // Inválido
          startTime: '09:00',
          endTime: '17:00',
          isWorkingDay: true
        })
      ).rejects.toThrow();
    });
    
    test('should test instance methods', async () => {
      const employee = await Employee.create({
        name: 'Test Creator',
        email: 'creator@test.com',
        employeeCode: 'CRT001',
        pinHash: 'hash123',
        role: 'admin'
      });
      
      const template = await ScheduleTemplate.create({
        name: 'Methods Test Template',
        createdBy: employee.id
      });
      
      const templateDay = await ScheduleTemplateDay.create({
        templateId: template.id,
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '17:00',
        breakStartTime: '13:00',
        breakEndTime: '14:00',
        isWorkingDay: true
      });
      
      // Test isWithinWorkingHours
      expect(templateDay.isWithinWorkingHours('10:00')).toBe(true);
      expect(templateDay.isWithinWorkingHours('08:00')).toBe(false);
      expect(templateDay.isWithinWorkingHours('18:00')).toBe(false);
      
      // Test isWithinBreakTime
      expect(templateDay.isWithinBreakTime('13:30')).toBe(true);
      expect(templateDay.isWithinBreakTime('10:00')).toBe(false);
      
      // Test static method
      expect(ScheduleTemplateDay.getDayName(1)).toBe('Lunes');
      expect(ScheduleTemplateDay.getDayName(0)).toBe('Domingo');
    });
  });
});
