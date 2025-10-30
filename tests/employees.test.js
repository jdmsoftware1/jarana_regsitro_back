import request from 'supertest';
import app from '../src/index.js';
import { Employee } from '../src/models/index.js';

describe('Employees Tests', () => {
  let testEmployee;
  
  afterEach(async () => {
    // Cleanup after each test
    if (testEmployee) {
      await testEmployee.destroy();
      testEmployee = null;
    }
  });

  describe('POST /api/employees', () => {
    test('should create new employee', async () => {
      const employeeData = {
        name: 'New Test Employee',
        email: 'newtest@example.com',
        employeeCode: 'NEWTEST001'
      };

      const response = await request(app)
        .post('/api/employees')
        .send(employeeData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(employeeData.name);
      expect(response.body.email).toBe(employeeData.email);
      expect(response.body.employeeCode).toBe(employeeData.employeeCode);
      expect(response.body).toHaveProperty('qrCodeUrl');
      
      testEmployee = await Employee.findByPk(response.body.id);
    });

    test('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/employees')
        .send({
          name: 'Incomplete Employee'
          // Missing email and employeeCode
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    test('should prevent duplicate employee codes', async () => {
      // Create first employee
      testEmployee = await Employee.create({
        name: 'First Employee',
        email: 'first@example.com',
        employeeCode: 'DUPLICATE001',
        isActive: true
      });

      // Try to create second employee with same code
      const response = await request(app)
        .post('/api/employees')
        .send({
          name: 'Second Employee',
          email: 'second@example.com',
          employeeCode: 'DUPLICATE001'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    test('should prevent duplicate emails', async () => {
      // Create first employee
      testEmployee = await Employee.create({
        name: 'First Employee',
        email: 'duplicate@example.com',
        employeeCode: 'FIRST001',
        isActive: true
      });

      // Try to create second employee with same email
      const response = await request(app)
        .post('/api/employees')
        .send({
          name: 'Second Employee',
          email: 'duplicate@example.com',
          employeeCode: 'SECOND001'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/employees', () => {
    beforeEach(async () => {
      // Create test employee for GET tests
      testEmployee = await Employee.create({
        name: 'Get Test Employee',
        email: 'gettest@example.com',
        employeeCode: 'GETTEST001',
        isActive: true
      });
    });

    test('should get all employees', async () => {
      const response = await request(app)
        .get('/api/employees');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      
      const employee = response.body.find(emp => emp.id === testEmployee.id);
      expect(employee).toBeDefined();
      expect(employee.name).toBe('Get Test Employee');
    });
  });

  describe('GET /api/employees/:id', () => {
    beforeEach(async () => {
      testEmployee = await Employee.create({
        name: 'Single Test Employee',
        email: 'singletest@example.com',
        employeeCode: 'SINGLE001',
        isActive: true
      });
    });

    test('should get employee by id', async () => {
      const response = await request(app)
        .get(`/api/employees/${testEmployee.id}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testEmployee.id);
      expect(response.body.name).toBe('Single Test Employee');
    });

    test('should return 404 for non-existent employee', async () => {
      const response = await request(app)
        .get('/api/employees/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/employees/:id', () => {
    beforeEach(async () => {
      testEmployee = await Employee.create({
        name: 'Update Test Employee',
        email: 'updatetest@example.com',
        employeeCode: 'UPDATE001',
        isActive: true
      });
    });

    test('should update employee', async () => {
      const updateData = {
        name: 'Updated Test Employee',
        email: 'updated@example.com'
      };

      const response = await request(app)
        .put(`/api/employees/${testEmployee.id}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe(updateData.name);
      expect(response.body.email).toBe(updateData.email);
      expect(response.body.employeeCode).toBe('UPDATE001'); // Should remain unchanged
    });

    test('should return 404 for non-existent employee', async () => {
      const response = await request(app)
        .put('/api/employees/non-existent-id')
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/employees/:id/regenerate-totp', () => {
    beforeEach(async () => {
      testEmployee = await Employee.create({
        name: 'TOTP Test Employee',
        email: 'totptest@example.com',
        employeeCode: 'TOTP001',
        isActive: true
      });
    });

    test('should regenerate TOTP secret', async () => {
      const oldSecret = testEmployee.totpSecret;
      
      const response = await request(app)
        .post(`/api/employees/${testEmployee.id}/regenerate-totp`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('qrCode');
      expect(response.body).toHaveProperty('secret');
      expect(response.body.secret).not.toBe(oldSecret);
    });
  });
});
