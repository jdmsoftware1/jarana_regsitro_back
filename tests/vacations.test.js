import request from 'supertest';
import app from '../src/index.js';
import { Employee, Vacation } from '../src/models/index.js';

describe('Vacations Tests', () => {
  let testEmployee;
  let testSupervisor;
  
  beforeAll(async () => {
    // Create test employee
    testEmployee = await Employee.create({
      name: 'Test Employee Vacation',
      email: 'testvacation@example.com',
      employeeCode: 'TESTVAC001',
      isActive: true
    });

    // Create test supervisor
    testSupervisor = await Employee.create({
      name: 'Test Supervisor',
      email: 'testsupervisor@example.com',
      employeeCode: 'TESTSUP001',
      isActive: true,
      role: 'supervisor'
    });
  });

  afterAll(async () => {
    // Cleanup
    await Vacation.destroy({ where: { employeeId: testEmployee.id } });
    if (testEmployee) await testEmployee.destroy();
    if (testSupervisor) await testSupervisor.destroy();
  });

  describe('POST /api/vacations', () => {
    test('should create vacation request', async () => {
      const vacationData = {
        employeeId: testEmployee.id,
        startDate: '2024-12-01',
        endDate: '2024-12-05',
        type: 'vacation',
        reason: 'Test vacation request'
      };

      const response = await request(app)
        .post('/api/vacations')
        .send(vacationData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.employeeId).toBe(testEmployee.id);
      expect(response.body.status).toBe('pending');
    });

    test('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/vacations')
        .send({
          employeeId: testEmployee.id
          // Missing required fields
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    test('should validate date range', async () => {
      const response = await request(app)
        .post('/api/vacations')
        .send({
          employeeId: testEmployee.id,
          startDate: '2024-12-05',
          endDate: '2024-12-01', // End before start
          type: 'vacation'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/vacations/employee/:employeeId', () => {
    test('should get employee vacations', async () => {
      const response = await request(app)
        .get(`/api/vacations/employee/${testEmployee.id}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });
  });

  describe('PUT /api/vacations/:id/approve', () => {
    let vacationId;

    beforeAll(async () => {
      // Create a vacation to approve
      const vacation = await Vacation.create({
        employeeId: testEmployee.id,
        startDate: '2024-12-10',
        endDate: '2024-12-15',
        type: 'vacation',
        reason: 'Test approval',
        status: 'pending'
      });
      vacationId = vacation.id;
    });

    test('should approve vacation request', async () => {
      const response = await request(app)
        .put(`/api/vacations/${vacationId}/approve`)
        .send({
          approverId: testSupervisor.id,
          notes: 'Approved for testing'
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('approved');
      expect(response.body.approverId).toBe(testSupervisor.id);
    });
  });
});
