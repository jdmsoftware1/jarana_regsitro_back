// Tests unitarios para el sistema de horarios semanales
// Ejecutar con: npm test weeklySchedules.test.js

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { WeeklySchedule, DailyScheduleException, Employee, ScheduleTemplate, ScheduleTemplateDay } from '../src/models/index.js';
import { WeeklyScheduleService } from '../src/services/weeklyScheduleService.js';
import sequelize from '../src/config/database.js';

// Mock de la aplicación Express
import app from '../src/index.js';

describe('Weekly Schedules System', () => {
  let testEmployee;
  let testTemplate;
  let testWeeklySchedule;
  let testException;
  
  const currentYear = new Date().getFullYear();
  const testWeek = 10;
  const testDate = `${currentYear}-03-15`;
  
  beforeAll(async () => {
    await sequelize.authenticate();
    await sequelize.sync({ force: true });
  });
  
  afterAll(async () => {
    await sequelize.close();
  });
  
  beforeEach(async () => {
    // Crear empleado de prueba
    testEmployee = await Employee.create({
      name: 'Test Employee Weekly',
      email: 'weekly@test.com',
      employeeCode: 'WEEK001',
      pinHash: 'hashedpin123',
      role: 'admin'
    });
    
    // Crear plantilla de prueba
    testTemplate = await ScheduleTemplate.create({
      name: 'Weekly Test Template',
      description: 'Template for weekly testing',
      createdBy: testEmployee.id
    });
    
    // Crear días de plantilla
    await ScheduleTemplateDay.create({
      templateId: testTemplate.id,
      dayOfWeek: 1, // Lunes
      startTime: '09:00',
      endTime: '17:00',
      breakStartTime: '13:00',
      breakEndTime: '14:00',
      isWorkingDay: true
    });
  });
  
  afterEach(async () => {
    await DailyScheduleException.destroy({ where: {}, force: true });
    await WeeklySchedule.destroy({ where: {}, force: true });
    await ScheduleTemplateDay.destroy({ where: {}, force: true });
    await ScheduleTemplate.destroy({ where: {}, force: true });
    await Employee.destroy({ where: {}, force: true });
  });
  
  describe('WeeklySchedule Model', () => {
    test('should create weekly schedule with valid data', async () => {
      const { startDate, endDate } = WeeklySchedule.getWeekDates(currentYear, testWeek);
      
      const weeklySchedule = await WeeklySchedule.create({
        employeeId: testEmployee.id,
        year: currentYear,
        weekNumber: testWeek,
        templateId: testTemplate.id,
        startDate,
        endDate,
        notes: 'Test weekly schedule',
        createdBy: testEmployee.id
      });
      
      expect(weeklySchedule.id).toBeDefined();
      expect(weeklySchedule.weekNumber).toBe(testWeek);
      expect(weeklySchedule.year).toBe(currentYear);
      expect(weeklySchedule.templateId).toBe(testTemplate.id);
    });
    
    test('should enforce unique constraint on employee, year, week', async () => {
      const { startDate, endDate } = WeeklySchedule.getWeekDates(currentYear, testWeek);
      
      await WeeklySchedule.create({
        employeeId: testEmployee.id,
        year: currentYear,
        weekNumber: testWeek,
        startDate,
        endDate,
        createdBy: testEmployee.id
      });
      
      await expect(
        WeeklySchedule.create({
          employeeId: testEmployee.id,
          year: currentYear,
          weekNumber: testWeek,
          startDate,
          endDate,
          createdBy: testEmployee.id
        })
      ).rejects.toThrow();
    });
    
    test('should calculate week dates correctly', () => {
      const weekDates = WeeklySchedule.getWeekDates(2024, 10);
      expect(weekDates.startDate).toBeDefined();
      expect(weekDates.endDate).toBeDefined();
      
      const start = new Date(weekDates.startDate);
      const end = new Date(weekDates.endDate);
      const diffDays = (end - start) / (1000 * 60 * 60 * 24);
      
      expect(diffDays).toBe(6); // Una semana tiene 6 días de diferencia
    });
    
    test('should get current week correctly', () => {
      const currentWeek = WeeklySchedule.getCurrentWeek();
      expect(currentWeek.year).toBeDefined();
      expect(currentWeek.weekNumber).toBeGreaterThan(0);
      expect(currentWeek.weekNumber).toBeLessThanOrEqual(53);
    });
  });
  
  describe('DailyScheduleException Model', () => {
    test('should create daily exception with valid data', async () => {
      const exception = await DailyScheduleException.create({
        employeeId: testEmployee.id,
        date: testDate,
        exceptionType: 'custom_hours',
        startTime: '10:00',
        endTime: '18:00',
        isWorkingDay: true,
        reason: 'Test exception',
        createdBy: testEmployee.id
      });
      
      expect(exception.id).toBeDefined();
      expect(exception.date).toBe(testDate);
      expect(exception.exceptionType).toBe('custom_hours');
      expect(exception.isWorkingDay).toBe(true);
    });
    
    test('should enforce unique constraint on employee and date', async () => {
      await DailyScheduleException.create({
        employeeId: testEmployee.id,
        date: testDate,
        exceptionType: 'day_off',
        isWorkingDay: false,
        createdBy: testEmployee.id
      });
      
      await expect(
        DailyScheduleException.create({
          employeeId: testEmployee.id,
          date: testDate,
          exceptionType: 'holiday',
          isWorkingDay: false,
          createdBy: testEmployee.id
        })
      ).rejects.toThrow();
    });
    
    test('should approve exception correctly', async () => {
      const exception = await DailyScheduleException.create({
        employeeId: testEmployee.id,
        date: testDate,
        exceptionType: 'sick_leave',
        isWorkingDay: false,
        createdBy: testEmployee.id
      });
      
      expect(exception.isApproved()).toBe(false);
      
      await exception.approve(testEmployee.id);
      
      expect(exception.isApproved()).toBe(true);
      expect(exception.approvedBy).toBe(testEmployee.id);
      expect(exception.approvedAt).toBeDefined();
    });
    
    test('should validate working hours correctly', async () => {
      const exception = await DailyScheduleException.create({
        employeeId: testEmployee.id,
        date: testDate,
        exceptionType: 'custom_hours',
        startTime: '09:00',
        endTime: '17:00',
        breakStartTime: '13:00',
        breakEndTime: '14:00',
        isWorkingDay: true,
        createdBy: testEmployee.id
      });
      
      expect(exception.isWithinWorkingHours('10:00')).toBe(true);
      expect(exception.isWithinWorkingHours('08:00')).toBe(false);
      expect(exception.isWithinWorkingHours('18:00')).toBe(false);
      
      expect(exception.isWithinBreakTime('13:30')).toBe(true);
      expect(exception.isWithinBreakTime('10:00')).toBe(false);
    });
    
    test('should get exception types correctly', () => {
      const types = DailyScheduleException.getExceptionTypes();
      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);
      
      const customHours = types.find(t => t.value === 'custom_hours');
      expect(customHours).toBeDefined();
      expect(customHours.requiresHours).toBe(true);
      
      const dayOff = types.find(t => t.value === 'day_off');
      expect(dayOff).toBeDefined();
      expect(dayOff.requiresHours).toBe(false);
    });
  });
  
  describe('WeeklySchedule API Endpoints', () => {
    test('should create weekly schedule via API', async () => {
      const { startDate, endDate } = WeeklySchedule.getWeekDates(currentYear, testWeek);
      
      const response = await request(app)
        .post(`/api/weekly-schedules/employee/${testEmployee.id}`)
        .send({
          year: currentYear,
          weekNumber: testWeek,
          templateId: testTemplate.id,
          notes: 'API test schedule',
          createdBy: testEmployee.id
        })
        .expect(201);
      
      expect(response.body.message).toContain('created successfully');
      expect(response.body.data.weekNumber).toBe(testWeek);
      expect(response.body.data.template.id).toBe(testTemplate.id);
      
      testWeeklySchedule = response.body.data;
    });
    
    test('should get weekly schedule by week via API', async () => {
      // Crear horario primero
      const { startDate, endDate } = WeeklySchedule.getWeekDates(currentYear, testWeek);
      await WeeklySchedule.create({
        employeeId: testEmployee.id,
        year: currentYear,
        weekNumber: testWeek,
        templateId: testTemplate.id,
        startDate,
        endDate,
        createdBy: testEmployee.id
      });
      
      const response = await request(app)
        .get(`/api/weekly-schedules/employee/${testEmployee.id}/week/${currentYear}/${testWeek}`)
        .expect(200);
      
      expect(response.body.data.weeklySchedule).toBeDefined();
      expect(response.body.data.weeklySchedule.weekNumber).toBe(testWeek);
      expect(response.body.data.weekDates).toBeDefined();
      expect(response.body.data.dailyExceptions).toBeDefined();
    });
    
    test('should get employee calendar via API', async () => {
      const response = await request(app)
        .get(`/api/weekly-schedules/employee/${testEmployee.id}/calendar/${currentYear}`)
        .expect(200);
      
      expect(response.body.data.employee).toBeDefined();
      expect(response.body.data.year).toBe(currentYear);
      expect(response.body.data.stats).toBeDefined();
      expect(response.body.data.stats.totalWeeks).toBeGreaterThan(0);
    });
    
    test('should create bulk weekly schedules via API', async () => {
      const response = await request(app)
        .post(`/api/weekly-schedules/employee/${testEmployee.id}/bulk`)
        .send({
          year: currentYear,
          weeks: [
            { weekNumber: 11, templateId: testTemplate.id, notes: 'Week 11' },
            { weekNumber: 12, templateId: testTemplate.id, notes: 'Week 12' }
          ],
          createdBy: testEmployee.id
        })
        .expect(201);
      
      expect(response.body.summary.total).toBe(2);
      expect(response.body.summary.successful).toBe(2);
      expect(response.body.results).toHaveLength(2);
    });
  });
  
  describe('DailyException API Endpoints', () => {
    test('should create daily exception via API', async () => {
      const response = await request(app)
        .post('/api/daily-exceptions')
        .send({
          employeeId: testEmployee.id,
          date: testDate,
          exceptionType: 'custom_hours',
          startTime: '10:00',
          endTime: '18:00',
          isWorkingDay: true,
          reason: 'API test exception',
          createdBy: testEmployee.id
        })
        .expect(201);
      
      expect(response.body.message).toBe('Daily exception created successfully');
      expect(response.body.data.date).toBe(testDate);
      expect(response.body.data.exceptionType).toBe('custom_hours');
      
      testException = response.body.data;
    });
    
    test('should get employee exceptions via API', async () => {
      // Crear excepción primero
      await DailyScheduleException.create({
        employeeId: testEmployee.id,
        date: testDate,
        exceptionType: 'day_off',
        isWorkingDay: false,
        createdBy: testEmployee.id
      });
      
      const response = await request(app)
        .get(`/api/daily-exceptions/employee/${testEmployee.id}`)
        .expect(200);
      
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });
    
    test('should approve exception via API', async () => {
      const exception = await DailyScheduleException.create({
        employeeId: testEmployee.id,
        date: testDate,
        exceptionType: 'sick_leave',
        isWorkingDay: false,
        createdBy: testEmployee.id
      });
      
      const response = await request(app)
        .patch(`/api/daily-exceptions/${exception.id}/approve`)
        .send({ approvedBy: testEmployee.id })
        .expect(200);
      
      expect(response.body.message).toContain('approved');
      expect(response.body.data.approvedBy).toBe(testEmployee.id);
    });
    
    test('should get exception types via API', async () => {
      const response = await request(app)
        .get('/api/daily-exceptions/utils/exception-types')
        .expect(200);
      
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });
  });
  
  describe('WeeklyScheduleService', () => {
    beforeEach(async () => {
      // Crear horario semanal
      const { startDate, endDate } = WeeklySchedule.getWeekDates(currentYear, testWeek);
      testWeeklySchedule = await WeeklySchedule.create({
        employeeId: testEmployee.id,
        year: currentYear,
        weekNumber: testWeek,
        templateId: testTemplate.id,
        startDate,
        endDate,
        createdBy: testEmployee.id
      });
    });
    
    test('should get effective schedule for date with weekly template', async () => {
      const mondayDate = `${currentYear}-03-11`; // Lunes de la semana de prueba
      
      const effectiveSchedule = await WeeklyScheduleService.getEffectiveScheduleForDate(
        testEmployee.id, 
        mondayDate
      );
      
      expect(effectiveSchedule.type).toBe('weekly_template');
      expect(effectiveSchedule.source).toBe('weekly_schedule');
      expect(effectiveSchedule.isWorkingDay).toBe(true);
      expect(effectiveSchedule.startTime).toBe('09:00');
      expect(effectiveSchedule.endTime).toBe('17:00');
    });
    
    test('should prioritize daily exception over weekly schedule', async () => {
      const mondayDate = `${currentYear}-03-11`;
      
      // Crear excepción diaria
      await DailyScheduleException.create({
        employeeId: testEmployee.id,
        date: mondayDate,
        exceptionType: 'custom_hours',
        startTime: '10:00',
        endTime: '18:00',
        isWorkingDay: true,
        createdBy: testEmployee.id
      });
      
      const effectiveSchedule = await WeeklyScheduleService.getEffectiveScheduleForDate(
        testEmployee.id, 
        mondayDate
      );
      
      expect(effectiveSchedule.type).toBe('daily_exception');
      expect(effectiveSchedule.source).toBe('daily_exception');
      expect(effectiveSchedule.startTime).toBe('10:00');
      expect(effectiveSchedule.endTime).toBe('18:00');
    });
    
    test('should get effective schedule for date range', async () => {
      const startDate = `${currentYear}-03-11`;
      const endDate = `${currentYear}-03-13`;
      
      const schedules = await WeeklyScheduleService.getEffectiveScheduleForDateRange(
        testEmployee.id,
        startDate,
        endDate
      );
      
      expect(Array.isArray(schedules)).toBe(true);
      expect(schedules.length).toBe(3); // 3 días
      expect(schedules[0].date).toBe(startDate);
      expect(schedules[0].type).toBe('weekly_template');
    });
    
    test('should planify year with template', async () => {
      const result = await WeeklyScheduleService.planifyYearWithTemplate(
        testEmployee.id,
        currentYear,
        testTemplate.id,
        testEmployee.id,
        { specificWeeks: [15, 16, 17] }
      );
      
      expect(result.success).toBe(true);
      expect(result.summary.totalWeeksProcessed).toBe(3);
      expect(result.summary.successful).toBe(3);
      expect(result.template.id).toBe(testTemplate.id);
    });
    
    test('should validate schedule conflicts', async () => {
      // Crear excepción con horarios inválidos
      await DailyScheduleException.create({
        employeeId: testEmployee.id,
        date: `${currentYear}-03-12`,
        exceptionType: 'custom_hours',
        startTime: '18:00', // Hora de inicio después de fin
        endTime: '17:00',
        isWorkingDay: true,
        createdBy: testEmployee.id
      });
      
      const validation = await WeeklyScheduleService.validateScheduleConflicts(
        testEmployee.id,
        `${currentYear}-03-11`,
        `${currentYear}-03-13`
      );
      
      expect(validation.hasConflicts).toBe(true);
      expect(validation.conflictCount).toBeGreaterThan(0);
      expect(validation.conflicts[0].type).toBe('invalid_time_range');
    });
    
    test('should get scheduling stats', async () => {
      const stats = await WeeklyScheduleService.getSchedulingStats(
        testEmployee.id,
        currentYear
      );
      
      expect(stats.year).toBe(currentYear);
      expect(stats.totalWeeks).toBeGreaterThan(0);
      expect(stats.scheduledWeeks).toBeGreaterThanOrEqual(0);
      expect(stats.scheduledWeeksPercentage).toBeGreaterThanOrEqual(0);
    });
  });
  
  describe('Advanced Scheduling API', () => {
    test('should get effective schedule via API', async () => {
      // Crear horario semanal
      const { startDate, endDate } = WeeklySchedule.getWeekDates(currentYear, testWeek);
      await WeeklySchedule.create({
        employeeId: testEmployee.id,
        year: currentYear,
        weekNumber: testWeek,
        templateId: testTemplate.id,
        startDate,
        endDate,
        createdBy: testEmployee.id
      });
      
      const mondayDate = `${currentYear}-03-11`;
      
      const response = await request(app)
        .get(`/api/advanced-scheduling/employee/${testEmployee.id}/effective-schedule/${mondayDate}`)
        .expect(200);
      
      expect(response.body.data.effectiveSchedule).toBeDefined();
      expect(response.body.data.effectiveSchedule.type).toBe('weekly_template');
    });
    
    test('should get scheduling stats via API', async () => {
      const response = await request(app)
        .get(`/api/advanced-scheduling/employee/${testEmployee.id}/stats/${currentYear}`)
        .expect(200);
      
      expect(response.body.data.stats).toBeDefined();
      expect(response.body.data.stats.year).toBe(currentYear);
    });
    
    test('should validate conflicts via API', async () => {
      const response = await request(app)
        .post(`/api/advanced-scheduling/employee/${testEmployee.id}/validate-conflicts`)
        .send({
          startDate: `${currentYear}-03-01`,
          endDate: `${currentYear}-03-31`
        })
        .expect(200);
      
      expect(response.body.data.validation).toBeDefined();
      expect(response.body.data.validation.hasConflicts).toBeDefined();
    });
    
    test('should get current week info via API', async () => {
      const response = await request(app)
        .get('/api/advanced-scheduling/utils/current-week')
        .expect(200);
      
      expect(response.body.data.year).toBeDefined();
      expect(response.body.data.weekNumber).toBeDefined();
      expect(response.body.data.startDate).toBeDefined();
      expect(response.body.data.endDate).toBeDefined();
    });
  });
});
