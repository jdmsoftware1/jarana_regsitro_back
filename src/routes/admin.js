import express from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/authMiddleware.js';
import { 
  adminRateLimit, 
  adminOriginOnly, 
  securityLogger,
  validateEmployeeCreation,
  handleValidationErrors,
  adminIPWhitelist
} from '../middleware/securityMiddleware.js';
import { Employee, Record } from '../models/index.js';
import { sequelize } from '../database/connection.js';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { Op } from 'sequelize';

const router = express.Router();

// Aplicar middlewares de seguridad a todas las rutas admin
router.use(adminRateLimit);
router.use(adminOriginOnly);
router.use(securityLogger);
router.use(authMiddleware);
router.use(adminMiddleware);

// Opcional: IP whitelist para admin (descomenta si quieres restricción por IP)
// router.use(adminIPWhitelist);

// GET /api/admin/employees - Listar todos los empleados
router.get('/employees', async (req, res) => {
  try {
    const employees = await Employee.findAll({
      attributes: { exclude: ['pinHash', 'totpSecret'] },
      order: [['createdAt', 'DESC']]
    });
    
    res.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/admin/employees - Crear nuevo empleado
router.post('/employees', 
  validateEmployeeCreation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { name, email, pin, role = 'employee' } = req.body;

      // Verificar si el email ya existe
      const existingEmployee = await Employee.findOne({ where: { email } });
      if (existingEmployee) {
        return res.status(400).json({ error: 'El email ya está registrado' });
      }

      // Generar código de empleado único
      const lastEmployee = await Employee.findOne({
        order: [['createdAt', 'DESC']]
      });
      
      let employeeCode;
      if (role === 'admin') {
        const adminCount = await Employee.count({ where: { role: 'admin' } });
        employeeCode = `ADM${String(adminCount + 1).padStart(3, '0')}`;
      } else {
        const empCount = await Employee.count({ where: { role: 'employee' } });
        employeeCode = `EMP${String(empCount + 1).padStart(3, '0')}`;
      }

      // Generar secreto TOTP
      const totpSecret = speakeasy.generateSecret({
        name: `Jarana - ${name}`,
        issuer: 'Jarana Registro Horario'
      });

      // Crear empleado
      const employee = await Employee.create({
        name,
        email,
        employeeCode,
        pin, // Se hashea automáticamente en el hook
        role,
        totpSecret: totpSecret.base32,
        isActive: true
      });

      // Generar QR code
      const qrCodeUrl = await QRCode.toDataURL(totpSecret.otpauth_url);

      // Actualizar empleado con QR URL
      await employee.update({ qrCodeUrl });

      // Log de auditoría
      console.log(`👤 Admin ${req.user.employeeCode} created employee: ${employeeCode}`);

      res.status(201).json({
        employee: {
          id: employee.id,
          name: employee.name,
          email: employee.email,
          employeeCode: employee.employeeCode,
          role: employee.role,
          isActive: employee.isActive
        },
        qrCode: qrCodeUrl,
        manualEntryKey: totpSecret.base32
      });

    } catch (error) {
      console.error('Error creating employee:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
);

// POST /api/admin/employees/:id/regenerate-totp - Regenerar TOTP
router.post('/employees/:id/regenerate-totp', async (req, res) => {
  try {
    const { id } = req.params;
    
    const employee = await Employee.findByPk(id);
    if (!employee) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    // Generar nuevo secreto TOTP
    const totpSecret = speakeasy.generateSecret({
      name: `Jarana - ${employee.name}`,
      issuer: 'Jarana Registro Horario'
    });

    // Generar QR code
    const qrCodeUrl = await QRCode.toDataURL(totpSecret.otpauth_url);

    // Actualizar empleado
    await employee.update({
      totpSecret: totpSecret.base32,
      qrCodeUrl
    });

    // Log de auditoría
    console.log(`🔄 Admin ${req.user.employeeCode} regenerated TOTP for: ${employee.employeeCode}`);

    res.json({
      qrCode: qrCodeUrl,
      manualEntryKey: totpSecret.base32
    });

  } catch (error) {
    console.error('Error regenerating TOTP:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /api/admin/employees/:id - Actualizar empleado
router.put('/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, isActive } = req.body;
    
    const employee = await Employee.findByPk(id);
    if (!employee) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    await employee.update({
      name: name || employee.name,
      email: email || employee.email,
      role: role || employee.role,
      isActive: isActive !== undefined ? isActive : employee.isActive
    });

    // Log de auditoría
    console.log(`✏️ Admin ${req.user.employeeCode} updated employee: ${employee.employeeCode}`);

    res.json({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      employeeCode: employee.employeeCode,
      role: employee.role,
      isActive: employee.isActive
    });

  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/admin/records - Obtener todos los registros con filtros
router.get('/records', async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      employeeId, 
      type, 
      page = 1, 
      limit = 50 
    } = req.query;

    const where = {};
    
    if (startDate && endDate) {
      where.timestamp = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }
    
    if (employeeId) {
      where.employeeId = employeeId;
    }
    
    if (type) {
      where.type = type;
    }

    const offset = (page - 1) * limit;

    const { count, rows: records } = await Record.findAndCountAll({
      where,
      include: [{
        model: Employee,
        attributes: ['name', 'employeeCode']
      }],
      order: [['timestamp', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      records,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching records:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/admin/analytics - Obtener estadísticas y analytics
router.get('/analytics', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.timestamp = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    // Registros por tipo
    const recordsByType = await Record.findAll({
      where: dateFilter,
      attributes: [
        'type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['type']
    });

    // Actividad diaria
    const dailyActivity = await Record.findAll({
      where: dateFilter,
      attributes: [
        [sequelize.fn('DATE', sequelize.col('timestamp')), 'date'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: [sequelize.fn('DATE', sequelize.col('timestamp'))],
      order: [[sequelize.fn('DATE', sequelize.col('timestamp')), 'ASC']]
    });

    // Registros por empleado
    const recordsByEmployee = await Record.findAll({
      where: dateFilter,
      attributes: [
        'employeeId',
        [sequelize.fn('COUNT', sequelize.col('Record.id')), 'count']
      ],
      include: [{
        model: Employee,
        attributes: ['name', 'employeeCode']
      }],
      group: ['employeeId', 'employee.id']
    });

    res.json({
      recordsByType,
      dailyActivity,
      recordsByEmployee
    });

  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/admin/system-info - Información del sistema (solo super admin)
router.get('/system-info', async (req, res) => {
  try {
    // Solo permitir a ciertos admins
    if (req.user.employeeCode !== 'ADM001') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const totalEmployees = await Employee.count();
    const activeEmployees = await Employee.count({ where: { isActive: true } });
    const totalRecords = await Record.count();
    
    const recentActivity = await Record.findAll({
      limit: 10,
      order: [['timestamp', 'DESC']],
      include: [{
        model: Employee,
        attributes: ['name', 'employeeCode']
      }]
    });

    res.json({
      system: {
        totalEmployees,
        activeEmployees,
        totalRecords,
        uptime: process.uptime(),
        nodeVersion: process.version,
        environment: process.env.NODE_ENV
      },
      recentActivity
    });

  } catch (error) {
    console.error('Error fetching system info:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
