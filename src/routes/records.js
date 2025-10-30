import express from 'express';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import { Record, Employee } from '../models/index.js';
import { authMiddleware, adminMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Check in
router.post('/checkin', authMiddleware, async (req, res) => {
  try {
    const { device = 'web', location, notes } = req.body;

    // Check if employee already has an active checkin (no checkout)
    const lastRecord = await Record.findOne({
      where: { employeeId: req.employee.id },
      order: [['timestamp', 'DESC']]
    });

    if (lastRecord && lastRecord.type === 'checkin') {
      return res.status(400).json({ 
        error: 'You are already checked in. Please check out first.' 
      });
    }

    const record = await Record.create({
      employeeId: req.employee.id,
      type: 'checkin',
      device,
      location,
      notes
    });

    res.status(201).json({
      record,
      message: 'Checked in successfully'
    });
  } catch (error) {
    console.error('Check in error:', error);
    res.status(500).json({ error: 'Server error during check in' });
  }
});

// Check out
router.post('/checkout', authMiddleware, async (req, res) => {
  try {
    const { device = 'web', location, notes } = req.body;

    // Check if employee has an active checkin
    const lastRecord = await Record.findOne({
      where: { employeeId: req.employee.id },
      order: [['timestamp', 'DESC']]
    });

    if (!lastRecord || lastRecord.type === 'checkout') {
      return res.status(400).json({ 
        error: 'You must check in first before checking out.' 
      });
    }

    const record = await Record.create({
      employeeId: req.employee.id,
      type: 'checkout',
      device,
      location,
      notes
    });

    res.status(201).json({
      record,
      message: 'Checked out successfully'
    });
  } catch (error) {
    console.error('Check out error:', error);
    res.status(500).json({ error: 'Server error during check out' });
  }
});

// Get records for authenticated employee
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, limit = 50, offset = 0 } = req.query;

    const whereClause = { employeeId: req.employee.id };

    if (startDate || endDate) {
      whereClause.timestamp = {};
      if (startDate) whereClause.timestamp[Op.gte] = new Date(startDate);
      if (endDate) whereClause.timestamp[Op.lte] = new Date(endDate);
    }

    const records = await Record.findAndCountAll({
      where: whereClause,
      order: [['timestamp', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      records: records.rows,
      total: records.count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get records error:', error);
    res.status(500).json({ error: 'Server error fetching records' });
  }
});

// Get all records (temporarily without auth for testing)
router.get('/all', async (req, res) => {
  try {
    const { 
      employeeId, 
      startDate, 
      endDate, 
      type, 
      limit = 100, 
      offset = 0 
    } = req.query;

    const whereClause = {};

    if (employeeId) whereClause.employeeId = employeeId;
    if (type) whereClause.type = type;

    if (startDate || endDate) {
      whereClause.timestamp = {};
      if (startDate) whereClause.timestamp[Op.gte] = new Date(startDate);
      if (endDate) whereClause.timestamp[Op.lte] = new Date(endDate);
    }

    const records = await Record.findAndCountAll({
      where: whereClause,
      include: [{
        model: Employee,
        as: 'employee',
        attributes: ['id', 'name', 'employeeCode']
      }],
      order: [['timestamp', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      records: records.rows,
      total: records.count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get all records error:', error);
    res.status(500).json({ error: 'Server error fetching records' });
  }
});

// Get records by employee ID (for employee portal)
router.get('/employee/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    console.log('Fetching records for employee:', employeeId);

    // First, check if employee exists
    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      console.log('Employee not found:', employeeId);
      return res.status(404).json({ error: 'Employee not found' });
    }

    console.log('Employee found:', employee.name, employee.employeeCode);

    // Get all records for this employee
    const allRecords = await Record.findAll({
      where: { employeeId },
      order: [['timestamp', 'DESC']]
    });

    console.log(`Total records in DB for employee ${employeeId}:`, allRecords.length);

    // Get records with pagination and include employee data
    const records = await Record.findAll({
      where: { employeeId },
      include: [{
        model: Employee,
        as: 'employee',
        attributes: ['id', 'name', 'employeeCode']
      }],
      order: [['timestamp', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    console.log(`Returning ${records.length} records for employee ${employeeId}`);
    console.log('Sample records:', records.slice(0, 3).map(r => ({
      id: r.id,
      type: r.type,
      timestamp: r.timestamp,
      employeeId: r.employeeId
    })));

    res.json(records);
  } catch (error) {
    console.error('Get employee records error:', error);
    res.status(500).json({ error: 'Server error fetching employee records', details: error.message });
  }
});

// Get current status (checked in/out)
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const lastRecord = await Record.findOne({
      where: { employeeId: req.employee.id },
      order: [['timestamp', 'DESC']]
    });

    const status = {
      isCheckedIn: lastRecord ? lastRecord.type === 'checkin' : false,
      lastRecord: lastRecord || null
    };

    res.json(status);
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ error: 'Server error fetching status' });
  }
});

// Get analytics (admin only)
router.get('/analytics', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, employeeId } = req.query;

    const whereClause = {};
    if (employeeId) whereClause.employeeId = employeeId;

    if (startDate || endDate) {
      whereClause.timestamp = {};
      if (startDate) whereClause.timestamp[Op.gte] = new Date(startDate);
      if (endDate) whereClause.timestamp[Op.lte] = new Date(endDate);
    }

    // Get total records by type
    const recordsByType = await Record.findAll({
      where: whereClause,
      attributes: [
        'type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['type']
    });

    // Get records by employee
    const recordsByEmployee = await Record.findAll({
      where: whereClause,
      include: [{
        model: Employee,
        as: 'employee',
        attributes: ['id', 'name', 'employeeCode']
      }],
      attributes: [
        'employeeId',
        [sequelize.fn('COUNT', sequelize.col('Record.id')), 'count']
      ],
      group: ['employeeId', 'employee.id', 'employee.name', 'employee.employeeCode']
    });

    // Get daily activity
    const dailyActivity = await Record.findAll({
      where: whereClause,
      attributes: [
        [sequelize.fn('DATE', sequelize.col('timestamp')), 'date'],
        'type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: [
        sequelize.fn('DATE', sequelize.col('timestamp')),
        'type'
      ],
      order: [[sequelize.fn('DATE', sequelize.col('timestamp')), 'DESC']]
    });

    res.json({
      recordsByType,
      recordsByEmployee,
      dailyActivity
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Server error fetching analytics' });
  }
});

// Update record (admin only)
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { timestamp, notes, device } = req.body;

    const record = await Record.findByPk(id);
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    const updateData = {};
    if (timestamp) updateData.timestamp = new Date(timestamp);
    if (notes !== undefined) updateData.notes = notes;
    if (device) updateData.device = device;

    await record.update(updateData);
    res.json(record);
  } catch (error) {
    console.error('Update record error:', error);
    res.status(500).json({ error: 'Server error updating record' });
  }
});

// Delete record (admin only)
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const record = await Record.findByPk(id);
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    await record.destroy();
    res.json({ message: 'Record deleted successfully' });
  } catch (error) {
    console.error('Delete record error:', error);
    res.status(500).json({ error: 'Server error deleting record' });
  }
});

// Debug route to check all records in database
router.get('/debug/all', async (req, res) => {
  try {
    const allRecords = await Record.findAll({
      include: [{
        model: Employee,
        as: 'employee',
        attributes: ['id', 'name', 'employeeCode']
      }],
      order: [['timestamp', 'DESC']],
      limit: 20
    });

    const allEmployees = await Employee.findAll({
      attributes: ['id', 'name', 'employeeCode']
    });

    res.json({
      totalRecords: allRecords.length,
      totalEmployees: allEmployees.length,
      records: allRecords.map(r => ({
        id: r.id,
        employeeId: r.employeeId,
        employeeName: r.employee?.name || 'Unknown',
        type: r.type,
        timestamp: r.timestamp,
        device: r.device
      })),
      employees: allEmployees
    });
  } catch (error) {
    console.error('Debug route error:', error);
    res.status(500).json({ error: 'Debug route error', details: error.message });
  }
});

export default router;
