import express from 'express';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { Employee } from '../models/index.js';
import { authMiddleware, adminMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Get all employees (temporarily without auth for testing)
router.get('/', async (req, res) => {
  try {
    const employees = await Employee.findAll({
      order: [['created_at', 'DESC']]
    });
    res.json(employees);
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ error: 'Server error fetching employees' });
  }
});

// Get employee by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Employees can only view their own profile, admins can view any
    if (req.employee.role !== 'admin' && req.employee.id !== id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const employee = await Employee.findByPk(id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(employee);
  } catch (error) {
    console.error('Get employee error:', error);
    res.status(500).json({ error: 'Server error fetching employee' });
  }
});

// Create new employee (temporarily without auth for testing)
router.post('/', async (req, res) => {
  try {
    const { name, email, pin, role = 'employee' } = req.body;

    if (!name || !email || !pin) {
      return res.status(400).json({ error: 'Name, email, and PIN are required' });
    }

    if (pin.length < 4 || pin.length > 8) {
      return res.status(400).json({ error: 'PIN must be between 4 and 8 digits' });
    }

    // Generate unique employee code
    const employeeCode = `EMP${Date.now().toString().slice(-6)}`;

    // Generate TOTP secret for Google Authenticator
    const totpSecret = speakeasy.generateSecret({
      name: `${name} (${employeeCode})`,
      issuer: 'Registro Horario'
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(totpSecret.otpauth_url);

    const employee = await Employee.create({
      name,
      email,
      employeeCode,
      pinHash: pin, // Will be hashed by the model hook
      role,
      totpSecret: totpSecret.base32,
      qrCodeUrl
    });

    res.status(201).json({
      employee,
      qrCode: qrCodeUrl,
      totpSecret: totpSecret.base32,
      manualEntryKey: totpSecret.base32
    });
  } catch (error) {
    console.error('Create employee error:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Server error creating employee' });
  }
});

// Update employee (admin only or self)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, pin, role, isActive } = req.body;

    // Employees can only update their own profile (limited fields)
    if (req.employee.role !== 'admin' && req.employee.id !== id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const employee = await Employee.findByPk(id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const updateData = {};
    
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (pin) {
      if (pin.length < 4 || pin.length > 8) {
        return res.status(400).json({ error: 'PIN must be between 4 and 8 digits' });
      }
      updateData.pinHash = pin;
    }

    // Only admins can update role and isActive
    if (req.employee.role === 'admin') {
      if (role !== undefined) updateData.role = role;
      if (isActive !== undefined) updateData.isActive = isActive;
    }

    await employee.update(updateData);
    res.json(employee);
  } catch (error) {
    console.error('Update employee error:', error);
    res.status(500).json({ error: 'Server error updating employee' });
  }
});

// Delete employee (admin only)
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const employee = await Employee.findByPk(id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Soft delete by setting isActive to false
    await employee.update({ isActive: false });
    res.json({ message: 'Employee deactivated successfully' });
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({ error: 'Server error deleting employee' });
  }
});

// Regenerate TOTP secret (temporarily without auth for testing)
router.post('/:id/regenerate-totp', async (req, res) => {
  try {
    const { id } = req.params;

    const employee = await Employee.findByPk(id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Generate new TOTP secret
    const totpSecret = speakeasy.generateSecret({
      name: `${employee.name} (${employee.employeeCode})`,
      issuer: 'Registro Horario'
    });

    // Generate new QR code
    const qrCodeUrl = await QRCode.toDataURL(totpSecret.otpauth_url);

    await employee.update({
      totpSecret: totpSecret.base32,
      qrCodeUrl
    });

    res.json({
      qrCode: qrCodeUrl,
      totpSecret: totpSecret.base32,
      manualEntryKey: totpSecret.base32
    });
  } catch (error) {
    console.error('Regenerate TOTP error:', error);
    res.status(500).json({ error: 'Server error regenerating TOTP' });
  }
});

// Get all records (temporarily without auth for testing)
router.get('/records', async (req, res) => {
  try {
    const records = await Record.findAll({
      include: [{
        model: Employee,
        as: 'employee',
        attributes: ['name', 'employeeCode']
      }],
      order: [['timestamp', 'DESC']],
      limit: 100
    });
    res.json(records);
  } catch (error) {
    console.error('Get records error:', error);
    res.status(500).json({ error: 'Server error fetching records' });
  }
});

// Get all records (temporarily without auth for testing)
router.get('/records', async (req, res) => {
  try {
    const { Record } = await import('../models/index.js');
    const records = await Record.findAll({
      include: [{
        model: Employee,
        as: 'employee',
        attributes: ['name', 'employeeCode']
      }],
      order: [['timestamp', 'DESC']],
      limit: 100
    });
    res.json(records);
  } catch (error) {
    console.error('Get records error:', error);
    res.status(500).json({ error: 'Server error fetching records' });
  }
});

export default router;
