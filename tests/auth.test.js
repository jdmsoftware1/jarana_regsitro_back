import request from 'supertest';
import app from '../src/index.js';
import { Employee } from '../src/models/index.js';

describe('Authentication Tests', () => {
  let testEmployee;
  
  beforeAll(async () => {
    // Create test employee
    testEmployee = await Employee.create({
      name: 'Test Employee',
      email: 'test@example.com',
      employeeCode: 'TEST001',
      isActive: true
    });
  });

  afterAll(async () => {
    // Cleanup
    if (testEmployee) {
      await testEmployee.destroy();
    }
  });

  describe('POST /api/kiosk/auth', () => {
    test('should authenticate employee with valid credentials', async () => {
      const response = await request(app)
        .post('/api/kiosk/auth')
        .send({
          employeeCode: 'TEST001',
          totpCode: '123456' // Mock TOTP
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('employee');
      expect(response.body.employee.employeeCode).toBe('TEST001');
    });

    test('should reject invalid employee code', async () => {
      const response = await request(app)
        .post('/api/kiosk/auth')
        .send({
          employeeCode: 'INVALID',
          totpCode: '123456'
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    test('should reject inactive employee', async () => {
      // Create inactive employee
      const inactiveEmployee = await Employee.create({
        name: 'Inactive Employee',
        email: 'inactive@example.com',
        employeeCode: 'INACTIVE001',
        isActive: false
      });

      const response = await request(app)
        .post('/api/kiosk/auth')
        .send({
          employeeCode: 'INACTIVE001',
          totpCode: '123456'
        });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');

      await inactiveEmployee.destroy();
    });
  });
});
