import express from 'express';
import { Op } from 'sequelize';
import { Employee, Vacation } from '../models/index.js';

const router = express.Router();

// Get all vacations (temporarily without auth for testing)
router.get('/', async (req, res) => {
  try {
    const { employeeId, status, type, year } = req.query;
    
    const whereClause = {};
    
    if (employeeId) whereClause.employeeId = employeeId;
    if (status) whereClause.status = status;
    if (type) whereClause.type = type;
    
    if (year) {
      const startOfYear = new Date(`${year}-01-01`);
      const endOfYear = new Date(`${year}-12-31`);
      whereClause[Op.or] = [
        {
          startDate: {
            [Op.between]: [startOfYear, endOfYear]
          }
        },
        {
          endDate: {
            [Op.between]: [startOfYear, endOfYear]
          }
        }
      ];
    }
    
    const vacations = await Vacation.findAll({
      where: whereClause,
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'name', 'employeeCode']
        },
        {
          model: Employee,
          as: 'approver',
          attributes: ['id', 'name', 'employeeCode'],
          required: false
        }
      ],
      order: [['startDate', 'DESC']]
    });
    
    res.json(vacations);
  } catch (error) {
    console.error('Get vacations error:', error);
    res.status(500).json({ error: 'Server error fetching vacations' });
  }
});

// Get vacations for a specific employee
router.get('/employee/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { year } = req.query;
    
    const whereClause = { employeeId };
    
    if (year) {
      const startOfYear = new Date(`${year}-01-01`);
      const endOfYear = new Date(`${year}-12-31`);
      whereClause[Op.or] = [
        {
          startDate: {
            [Op.between]: [startOfYear, endOfYear]
          }
        },
        {
          endDate: {
            [Op.between]: [startOfYear, endOfYear]
          }
        }
      ];
    }
    
    const vacations = await Vacation.findAll({
      where: whereClause,
      include: [
        {
          model: Employee,
          as: 'approver',
          attributes: ['id', 'name', 'employeeCode'],
          required: false
        }
      ],
      order: [['startDate', 'DESC']]
    });
    
    res.json(vacations);
  } catch (error) {
    console.error('Get employee vacations error:', error);
    res.status(500).json({ error: 'Server error fetching employee vacations' });
  }
});

// Create new vacation request
router.post('/', async (req, res) => {
  try {
    const { employeeId, startDate, endDate, type, reason, notes } = req.body;
    
    if (!employeeId || !startDate || !endDate) {
      return res.status(400).json({ error: 'Employee ID, start date, and end date are required' });
    }
    
    // Verify employee exists
    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    // Check for overlapping vacations
    const overlapping = await Vacation.findOne({
      where: {
        employeeId,
        status: { [Op.in]: ['pending', 'approved'] },
        [Op.or]: [
          {
            startDate: { [Op.between]: [startDate, endDate] }
          },
          {
            endDate: { [Op.between]: [startDate, endDate] }
          },
          {
            [Op.and]: [
              { startDate: { [Op.lte]: startDate } },
              { endDate: { [Op.gte]: endDate } }
            ]
          }
        ]
      }
    });
    
    if (overlapping) {
      return res.status(409).json({ error: 'Ya existe una solicitud de vacaciones para estas fechas' });
    }
    
    const vacation = await Vacation.create({
      employeeId,
      startDate,
      endDate,
      type: type || 'vacation',
      reason,
      notes,
      status: 'pending'
    });
    
    // Include employee data in response
    const vacationWithEmployee = await Vacation.findByPk(vacation.id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'name', 'employeeCode']
        }
      ]
    });
    
    res.status(201).json(vacationWithEmployee);
  } catch (error) {
    console.error('Create vacation error:', error);
    res.status(500).json({ error: 'Server error creating vacation' });
  }
});

// Update vacation status (approve/reject)
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be approved or rejected' });
    }
    
    const vacation = await Vacation.findByPk(id);
    if (!vacation) {
      return res.status(404).json({ error: 'Vacation not found' });
    }
    
    await vacation.update({
      status,
      notes: notes || vacation.notes,
      approvedAt: new Date(),
      // TODO: Set approvedBy to current admin user ID
      approvedBy: null
    });
    
    const updatedVacation = await Vacation.findByPk(id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'name', 'employeeCode']
        },
        {
          model: Employee,
          as: 'approver',
          attributes: ['id', 'name', 'employeeCode'],
          required: false
        }
      ]
    });
    
    res.json(updatedVacation);
  } catch (error) {
    console.error('Update vacation status error:', error);
    res.status(500).json({ error: 'Server error updating vacation status' });
  }
});

// Delete vacation
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const vacation = await Vacation.findByPk(id);
    if (!vacation) {
      return res.status(404).json({ error: 'Vacation not found' });
    }
    
    // Only allow deletion if status is pending
    if (vacation.status !== 'pending') {
      return res.status(400).json({ error: 'Solo se pueden eliminar solicitudes pendientes' });
    }
    
    await vacation.destroy();
    res.json({ message: 'Vacation deleted successfully' });
  } catch (error) {
    console.error('Delete vacation error:', error);
    res.status(500).json({ error: 'Server error deleting vacation' });
  }
});

// Check if employee is on vacation for a specific date
router.get('/check/:employeeId/:date', async (req, res) => {
  try {
    const { employeeId, date } = req.params;
    
    const vacation = await Vacation.findOne({
      where: {
        employeeId,
        status: 'approved',
        startDate: { [Op.lte]: date },
        endDate: { [Op.gte]: date }
      },
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'name', 'employeeCode']
        }
      ]
    });
    
    res.json({
      isOnVacation: !!vacation,
      vacation: vacation || null
    });
  } catch (error) {
    console.error('Check vacation error:', error);
    res.status(500).json({ error: 'Server error checking vacation' });
  }
});

export default router;
