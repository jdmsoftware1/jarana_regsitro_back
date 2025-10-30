import request from 'supertest';
import app from '../src/index.js';
import { Employee, Record, Vacation } from '../src/models/index.js';
import AIService from '../src/services/aiService.js';

describe('AI Service Tests', () => {
  let testEmployee;
  
  beforeAll(async () => {
    // Create test employee
    testEmployee = await Employee.create({
      name: 'Test Employee AI',
      email: 'testai@example.com',
      employeeCode: 'TESTAI001',
      isActive: true
    });

    // Create some test records
    await Record.bulkCreate([
      {
        employeeId: testEmployee.id,
        type: 'checkin',
        timestamp: new Date('2024-10-29T08:00:00'),
        device: 'test'
      },
      {
        employeeId: testEmployee.id,
        type: 'checkout',
        timestamp: new Date('2024-10-29T17:00:00'),
        device: 'test'
      },
      {
        employeeId: testEmployee.id,
        type: 'checkin',
        timestamp: new Date('2024-10-28T09:30:00'), // Late arrival
        device: 'test'
      }
    ]);
  });

  afterAll(async () => {
    // Cleanup
    await Record.destroy({ where: { employeeId: testEmployee.id } });
    await Vacation.destroy({ where: { employeeId: testEmployee.id } });
    if (testEmployee) await testEmployee.destroy();
  });

  describe('POST /api/ai/chat', () => {
    test('should respond to general queries', async () => {
      const response = await request(app)
        .post('/api/ai/chat')
        .send({
          message: 'Hola, ¿cómo estás?',
          userId: testEmployee.id,
          userRole: 'employee'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('response');
      expect(response.body.type).toBe('chat_response');
    });

    test('should detect vacation requests', async () => {
      const response = await request(app)
        .post('/api/ai/chat')
        .send({
          message: 'Quiero solicitar vacaciones del 1 al 5 de diciembre',
          userId: testEmployee.id,
          userRole: 'employee'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('response');
      expect(response.body.type).toBe('vacation_created');
      expect(response.body).toHaveProperty('vacationId');
    });

    test('should handle specific data queries', async () => {
      const response = await request(app)
        .post('/api/ai/chat')
        .send({
          message: '¿Cuántas horas trabajé esta semana?',
          userId: testEmployee.id,
          userRole: 'employee'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('response');
      expect(response.body.type).toBe('hours_summary');
    });
  });

  describe('POST /api/ai/employee-query/:employeeId', () => {
    test('should get weekly hours', async () => {
      const response = await request(app)
        .post(`/api/ai/employee-query/${testEmployee.id}`)
        .send({
          query: 'horas esta semana'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('response');
      expect(response.body.type).toBe('hours_summary');
      expect(response.body).toHaveProperty('data');
    });

    test('should get punctuality analysis', async () => {
      const response = await request(app)
        .post(`/api/ai/employee-query/${testEmployee.id}`)
        .send({
          query: 'mi puntualidad'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('response');
      expect(response.body.type).toBe('punctuality_analysis');
      expect(response.body.data).toHaveProperty('lateCount');
      expect(response.body.data).toHaveProperty('score');
    });

    test('should get today status', async () => {
      const response = await request(app)
        .post(`/api/ai/employee-query/${testEmployee.id}`)
        .send({
          query: '¿he fichado hoy?'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('response');
      expect(response.body.type).toBe('today_status');
    });
  });

  describe('AIService methods', () => {
    test('should detect vacation requests', () => {
      expect(AIService.detectVacationRequest('Quiero vacaciones del 1 al 5')).toBe(true);
      expect(AIService.detectVacationRequest('Solicitar días libres')).toBe(true);
      expect(AIService.detectVacationRequest('Hola, ¿cómo estás?')).toBe(false);
    });

    test('should get employee insights', async () => {
      const insights = await AIService.getEmployeeInsights(testEmployee.id, 'horas esta semana');
      
      expect(insights).toHaveProperty('response');
      expect(insights).toHaveProperty('type');
      expect(insights.type).toBe('hours_summary');
    });

    test('should analyze work patterns', async () => {
      const analysis = await AIService.analyzeWorkPatterns(testEmployee.id, 30);
      
      expect(analysis).toHaveProperty('totalRecords');
      expect(analysis).toHaveProperty('workDays');
      expect(analysis).toHaveProperty('averageHoursPerDay');
      expect(analysis).toHaveProperty('punctualityScore');
    });
  });
});
