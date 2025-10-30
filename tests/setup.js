import { jest } from '@jest/globals';
import sequelize from '../src/config/database.js';

// Setup test database
beforeAll(async () => {
  // Sync database models for testing
  await sequelize.sync({ force: true });
  
  // Mock OpenAI for AI tests
  jest.mock('openai', () => {
    return {
      default: jest.fn().mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: JSON.stringify({
                    startDate: '2024-12-01',
                    endDate: '2024-12-05',
                    reason: 'Test vacation'
                  })
                }
              }]
            })
          }
        }
      }))
    };
  });
});

// Cleanup after all tests
afterAll(async () => {
  await sequelize.close();
});

// Mock TOTP verification for tests
jest.mock('speakeasy', () => ({
  generateSecret: jest.fn(() => ({
    base32: 'MOCK_SECRET_BASE32',
    otpauth_url: 'otpauth://totp/TestApp:test@example.com?secret=MOCK_SECRET_BASE32&issuer=TestApp'
  })),
  verify: jest.fn(() => ({ delta: 0 })) // Always return valid
}));

// Mock QR code generation
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mock_qr_code')
}));

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test_db';
