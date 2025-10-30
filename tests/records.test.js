import request from 'supertest';
import app from '../src/index.js';
import { Employee, Record } from '../src/models/index.js';

describe('Records Tests', () => {
  let testEmployee;
  let authToken;
  
  beforeAll(async () => {
    // Create test employee
    testEmployee = await Employee.create({
      name: 'Test Employee Records',
      email: 'testrecords@example.com',
      employeeCode: 'TESTREC001',
      isActive: true
    });
  });

  afterAll(async () => {
    // Cleanup
    await Record.destroy({ where: { employeeId: testEmployee.id } });
    if (testEmployee) {
      await testEmployee.destroy();
    }
  });

  describe('POST /api/kiosk/checkin', () => {
    test('should create checkin record', async () => {
      // First authenticate
      const authResponse = await request(app)
        .post('/api/kiosk/auth')
        .send({
          employeeCode: 'TESTREC001',
          totpCode: '123456'
        });

      const response = await request(app)
        .post('/api/kiosk/checkin')
        .send({
          employeeId: testEmployee.id,
          device: 'test'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('record');
      expect(response.body.record.type).toBe('checkin');
      expect(response.body.record.employeeId).toBe(testEmployee.id);
    });

    test('should prevent double checkin', async () => {
      // Try to checkin again
      const response = await request(app)
        .post('/api/kiosk/checkin')
        .send({
          employeeId: testEmployee.id,
          device: 'test'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/kiosk/checkout', () => {
    test('should create checkout record', async () => {
      const response = await request(app)
        .post('/api/kiosk/checkout')
        .send({
          employeeId: testEmployee.id,
          device: 'test'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('record');
      expect(response.body.record.type).toBe('checkout');
    });

    test('should prevent checkout without checkin', async () => {
      // Try to checkout again
      const response = await request(app)
        .post('/api/kiosk/checkout')
        .send({
          employeeId: testEmployee.id,
          device: 'test'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/records/employee/:employeeId', () => {
    test('should get employee records', async () => {
      const response = await request(app)
        .get(`/api/records/employee/${testEmployee.id}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should return empty array for non-existent employee', async () => {
      const response = await request(app)
        .get('/api/records/employee/non-existent-id');

      expect(response.status).toBe(404);
    });
  });
});
