import express from 'express';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import { Employee } from '../models/index.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Login with employee code and PIN
router.post('/login', async (req, res) => {
  try {
    const { employeeCode, pin } = req.body;

    if (!employeeCode || !pin) {
      return res.status(400).json({ error: 'Employee code and PIN are required' });
    }

    const employee = await Employee.findOne({ 
      where: { employeeCode, isActive: true } 
    });

    if (!employee) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPin = await employee.validatePin(pin);
    if (!isValidPin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { 
        employeeId: employee.id,
        role: employee.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      employee: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        employeeCode: employee.employeeCode,
        role: employee.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Login with TOTP (Google Authenticator)
router.post('/login/totp', async (req, res) => {
  try {
    const { employeeCode, totpCode } = req.body;

    if (!employeeCode || !totpCode) {
      return res.status(400).json({ error: 'Employee code and TOTP code are required' });
    }

    const employee = await Employee.findOne({ 
      where: { employeeCode, isActive: true } 
    });

    if (!employee || !employee.totpSecret) {
      return res.status(401).json({ error: 'Invalid credentials or TOTP not configured' });
    }

    const verified = speakeasy.totp.verify({
      secret: employee.totpSecret,
      encoding: 'base32',
      token: totpCode,
      window: 2
    });

    if (!verified) {
      return res.status(401).json({ error: 'Invalid TOTP code' });
    }

    const token = jwt.sign(
      { 
        employeeId: employee.id,
        role: employee.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      employee: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        employeeCode: employee.employeeCode,
        role: employee.role
      }
    });
  } catch (error) {
    console.error('TOTP login error:', error);
    res.status(500).json({ error: 'Server error during TOTP login' });
  }
});

// Verify token
router.get('/verify', authMiddleware, (req, res) => {
  res.json({
    valid: true,
    employee: {
      id: req.employee.id,
      name: req.employee.name,
      email: req.employee.email,
      employeeCode: req.employee.employeeCode,
      role: req.employee.role
    }
  });
});

// Refresh token
router.post('/refresh', authMiddleware, (req, res) => {
  const token = jwt.sign(
    { 
      employeeId: req.employee.id,
      role: req.employee.role 
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ token });
});

export default router;
