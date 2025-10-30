import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { 
  kioskRateLimit, 
  kioskOriginOnly, 
  securityLogger,
  validateLogin,
  validateCheckin,
  handleValidationErrors,
  deviceDetection,
  timingAttackProtection
} from '../middleware/securityMiddleware.js';
import { Employee, Record } from '../models/index.js';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import { Op } from 'sequelize';

const router = express.Router();

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ message: 'Kiosk routes working!', timestamp: new Date() });
});

// Aplicar middlewares de seguridad a todas las rutas kiosk (temporalmente deshabilitados)
// router.use(kioskRateLimit);
// router.use(kioskOriginOnly);
// router.use(deviceDetection);
// router.use(securityLogger);
// router.use(timingAttackProtection);

// POST /api/kiosk/auth - Autenticación simplificada para empleados (solo TOTP)
router.post('/auth', async (req, res) => {
  try {
    const { employeeCode, totpCode } = req.body;

    if (!employeeCode || !totpCode) {
      return res.status(400).json({ error: 'Código de empleado y TOTP requeridos' });
    }

    // Buscar empleado
    const employee = await Employee.findOne({ 
      where: { 
        employeeCode,
        isActive: true 
      } 
    });

    if (!employee) {
      console.warn(`🚨 Invalid employee code attempt: ${employeeCode} from IP: ${req.ip}`);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Verificar TOTP
    const isValid = speakeasy.totp.verify({
      secret: employee.totpSecret,
      encoding: 'base32',
      token: totpCode,
      window: 2
    });

    if (!isValid) {
      console.warn(`🚨 Failed TOTP attempt for ${employeeCode} from IP: ${req.ip}`);
      return res.status(401).json({ error: 'Código de autenticación inválido' });
    }

    // Verificar estado actual (si está fichado o no)
    const lastRecord = await Record.findOne({
      where: { employeeId: employee.id },
      order: [['timestamp', 'DESC']]
    });

    const isCheckedIn = lastRecord && lastRecord.type === 'checkin';

    console.log(`✅ Successful kiosk auth: ${employeeCode} from ${req.ip}`);

    res.json({
      success: true,
      employee: {
        id: employee.id,
        name: employee.name,
        employeeCode: employee.employeeCode,
        isCheckedIn
      },
      lastRecord: lastRecord ? {
        type: lastRecord.type,
        timestamp: lastRecord.timestamp
      } : null
    });

  } catch (error) {
    console.error('Kiosk auth error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/kiosk/checkin - Registrar entrada (sin auth token)
router.post('/checkin', async (req, res) => {
  try {
    const { employeeId } = req.body;

    if (!employeeId) {
      return res.status(400).json({ error: 'ID de empleado requerido' });
    }

    // Verificar empleado existe
    const employee = await Employee.findByPk(employeeId);
    if (!employee || !employee.isActive) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    // Verificar si ya está fichado
    const lastRecord = await Record.findOne({
      where: { employeeId },
      order: [['timestamp', 'DESC']]
    });

    if (lastRecord && lastRecord.type === 'checkin') {
      return res.status(400).json({ 
        error: 'Ya tienes una entrada registrada' 
      });
    }

    // Crear registro de entrada
    const record = await Record.create({
      employeeId,
      type: 'checkin',
      timestamp: new Date(),
      device: 'kiosk',
      notes: 'Entrada desde kiosk'
    });

    console.log(`📥 Kiosk Checkin: ${employee.employeeCode} at ${record.timestamp}`);

    res.status(201).json({
      success: true,
      message: 'Entrada registrada correctamente',
      record: {
        id: record.id,
        type: record.type,
        timestamp: record.timestamp
      }
    });

  } catch (error) {
    console.error('Kiosk checkin error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/kiosk/checkout - Registrar salida (sin auth token)
router.post('/checkout', async (req, res) => {
  try {
    const { employeeId } = req.body;

    if (!employeeId) {
      return res.status(400).json({ error: 'ID de empleado requerido' });
    }

    // Verificar empleado existe
    const employee = await Employee.findByPk(employeeId);
    if (!employee || !employee.isActive) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    // Verificar si tiene entrada sin salida
    const lastRecord = await Record.findOne({
      where: { employeeId },
      order: [['timestamp', 'DESC']]
    });

    if (!lastRecord || lastRecord.type === 'checkout') {
      return res.status(400).json({ 
        error: 'No tienes una entrada registrada' 
      });
    }

    // Crear registro de salida
    const record = await Record.create({
      employeeId,
      type: 'checkout',
      timestamp: new Date(),
      device: 'kiosk',
      notes: 'Salida desde kiosk'
    });

    // Calcular tiempo trabajado
    const workedTime = new Date(record.timestamp) - new Date(lastRecord.timestamp);
    const hours = Math.floor(workedTime / (1000 * 60 * 60));
    const minutes = Math.floor((workedTime % (1000 * 60 * 60)) / (1000 * 60));

    console.log(`📤 Kiosk Checkout: ${employee.employeeCode} at ${record.timestamp} (Worked: ${hours}h ${minutes}m)`);

    res.status(201).json({
      success: true,
      message: 'Salida registrada correctamente',
      record: {
        id: record.id,
        type: record.type,
        timestamp: record.timestamp
      },
      workedTime: {
        hours,
        minutes,
        total: `${hours}h ${minutes}m`
      }
    });

  } catch (error) {
    console.error('Kiosk checkout error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/kiosk/checkin - Registrar entrada
router.post('/checkin',
  authMiddleware,
  validateCheckin,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { notes } = req.body;
      const employeeId = req.user.id;

      // Verificar si ya está fichado
      const lastRecord = await Record.findOne({
        where: { employeeId },
        order: [['timestamp', 'DESC']]
      });

      if (lastRecord && lastRecord.type === 'checkin') {
        return res.status(400).json({ 
          error: 'Ya tienes una entrada registrada. Debes fichar salida primero.' 
        });
      }

      // Crear registro de entrada
      const record = await Record.create({
        employeeId,
        type: 'checkin',
        timestamp: new Date(),
        device: `${req.deviceInfo.isTablet ? 'Tablet' : req.deviceInfo.isMobile ? 'Mobile' : 'Desktop'} - ${req.ip}`,
        notes: notes || null
      });

      // Log de auditoría
      console.log(`📥 Checkin: ${req.user.employeeCode} at ${record.timestamp}`);

      res.status(201).json({
        message: 'Entrada registrada correctamente',
        record: {
          id: record.id,
          type: record.type,
          timestamp: record.timestamp,
          notes: record.notes
        }
      });

    } catch (error) {
      console.error('Checkin error:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
);

// POST /api/kiosk/checkout - Registrar salida
router.post('/checkout',
  authMiddleware,
  validateCheckin,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { notes } = req.body;
      const employeeId = req.user.id;

      // Verificar si tiene entrada sin salida
      const lastRecord = await Record.findOne({
        where: { employeeId },
        order: [['timestamp', 'DESC']]
      });

      if (!lastRecord || lastRecord.type === 'checkout') {
        return res.status(400).json({ 
          error: 'No tienes una entrada registrada. Debes fichar entrada primero.' 
        });
      }

      // Crear registro de salida
      const record = await Record.create({
        employeeId,
        type: 'checkout',
        timestamp: new Date(),
        device: `${req.deviceInfo.isTablet ? 'Tablet' : req.deviceInfo.isMobile ? 'Mobile' : 'Desktop'} - ${req.ip}`,
        notes: notes || null
      });

      // Calcular tiempo trabajado
      const workedTime = new Date(record.timestamp) - new Date(lastRecord.timestamp);
      const hours = Math.floor(workedTime / (1000 * 60 * 60));
      const minutes = Math.floor((workedTime % (1000 * 60 * 60)) / (1000 * 60));

      // Log de auditoría
      console.log(`📤 Checkout: ${req.user.employeeCode} at ${record.timestamp} (Worked: ${hours}h ${minutes}m)`);

      res.status(201).json({
        message: 'Salida registrada correctamente',
        record: {
          id: record.id,
          type: record.type,
          timestamp: record.timestamp,
          notes: record.notes
        },
        workedTime: {
          hours,
          minutes,
          total: `${hours}h ${minutes}m`
        }
      });

    } catch (error) {
      console.error('Checkout error:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
);

// GET /api/kiosk/status - Obtener estado actual del empleado
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const employeeId = req.user.id;

    const lastRecord = await Record.findOne({
      where: { employeeId },
      order: [['timestamp', 'DESC']]
    });

    const isCheckedIn = lastRecord && lastRecord.type === 'checkin';

    res.json({
      isCheckedIn,
      lastRecord: lastRecord ? {
        id: lastRecord.id,
        type: lastRecord.type,
        timestamp: lastRecord.timestamp,
        device: lastRecord.device,
        notes: lastRecord.notes
      } : null
    });

  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/kiosk/records - Obtener registros del empleado (limitado)
router.get('/records', authMiddleware, async (req, res) => {
  try {
    const employeeId = req.user.id;
    const { limit = 10 } = req.query;

    const records = await Record.findAll({
      where: { employeeId },
      order: [['timestamp', 'DESC']],
      limit: Math.min(parseInt(limit), 20) // Máximo 20 registros para kiosk
    });

    res.json({ records });

  } catch (error) {
    console.error('Records error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/kiosk/verify-token - Verificar token
router.get('/verify-token', authMiddleware, (req, res) => {
  res.json({
    valid: true,
    user: {
      id: req.user.id,
      name: req.user.name,
      employeeCode: req.user.employeeCode,
      role: req.user.role
    }
  });
});

// POST /api/kiosk/logout - Logout (invalidar token del lado cliente)
router.post('/logout', authMiddleware, (req, res) => {
  // Log logout
  console.log(`👋 Logout: ${req.user.employeeCode} from ${req.ip}`);
  
  res.json({ message: 'Logout exitoso' });
});

export default router;
