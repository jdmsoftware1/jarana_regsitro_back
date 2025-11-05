import express from 'express';
import { Op } from 'sequelize';
import { Employee, DailyScheduleException } from '../models/index.js';

const router = express.Router();

// Get daily exceptions for an employee in a date range
router.get('/employee/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate, month, year } = req.query;
    
    // Verify employee exists
    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    let whereClause = { employeeId, isActive: true };
    
    // Handle different date filtering options
    if (month && year) {
      // Get exceptions for specific month
      const monthStart = new Date(parseInt(year), parseInt(month) - 1, 1);
      const monthEnd = new Date(parseInt(year), parseInt(month), 0);
      whereClause.date = {
        [Op.between]: [
          monthStart.toISOString().split('T')[0],
          monthEnd.toISOString().split('T')[0]
        ]
      };
    } else if (startDate && endDate) {
      // Get exceptions for date range
      whereClause.date = {
        [Op.between]: [startDate, endDate]
      };
    } else if (startDate) {
      // Get exceptions from start date onwards
      whereClause.date = {
        [Op.gte]: startDate
      };
    }
    
    const exceptions = await DailyScheduleException.findAll({
      where: whereClause,
      include: [
        {
          model: Employee,
          as: 'creator',
          attributes: ['id', 'name', 'employeeCode']
        },
        {
          model: Employee,
          as: 'approver',
          attributes: ['id', 'name', 'employeeCode'],
          required: false
        }
      ],
      order: [['date', 'ASC']]
    });
    
    res.json({ data: exceptions });
  } catch (error) {
    console.error('Get daily exceptions error:', error);
    res.status(500).json({ error: 'Server error fetching daily exceptions' });
  }
});

// Get specific daily exception
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const exception = await DailyScheduleException.findByPk(id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'name', 'employeeCode']
        },
        {
          model: Employee,
          as: 'creator',
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
    
    if (!exception) {
      return res.status(404).json({ error: 'Daily exception not found' });
    }
    
    res.json({ data: exception });
  } catch (error) {
    console.error('Get daily exception error:', error);
    res.status(500).json({ error: 'Server error fetching daily exception' });
  }
});

// Create daily exception
router.post('/', async (req, res) => {
  try {
    const {
      employeeId,
      date,
      exceptionType,
      startTime,
      endTime,
      breakStartTime,
      breakEndTime,
      isWorkingDay,
      reason,
      notes,
      createdBy
    } = req.body;
    
    // Validate required fields
    if (!employeeId || !date || !exceptionType || !createdBy) {
      return res.status(400).json({ 
        error: 'employeeId, date, exceptionType, and createdBy are required' 
      });
    }
    
    // Verify employee exists
    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    // Verify creator exists
    const creator = await Employee.findByPk(createdBy);
    if (!creator) {
      return res.status(404).json({ error: 'Creator employee not found' });
    }
    
    // Validate exception type
    const validTypes = DailyScheduleException.getExceptionTypes().map(t => t.value);
    if (!validTypes.includes(exceptionType)) {
      return res.status(400).json({ 
        error: `Invalid exception type. Valid types: ${validTypes.join(', ')}` 
      });
    }
    
    // Check if exception already exists for this date
    const existingException = await DailyScheduleException.findOne({
      where: { employeeId, date, isActive: true }
    });
    
    if (existingException) {
      return res.status(400).json({ 
        error: 'An active exception already exists for this date' 
      });
    }
    
    // Validate working hours if it's a working day
    const typeInfo = DailyScheduleException.getExceptionTypes().find(t => t.value === exceptionType);
    if (typeInfo.requiresHours && isWorkingDay) {
      if (!startTime || !endTime) {
        return res.status(400).json({ 
          error: 'Start time and end time are required for working day exceptions' 
        });
      }
    }
    
    // Create exception
    const exception = await DailyScheduleException.create({
      employeeId,
      date,
      exceptionType,
      startTime: isWorkingDay ? startTime : null,
      endTime: isWorkingDay ? endTime : null,
      breakStartTime: (isWorkingDay && breakStartTime) ? breakStartTime : null,
      breakEndTime: (isWorkingDay && breakEndTime) ? breakEndTime : null,
      isWorkingDay: isWorkingDay !== undefined ? isWorkingDay : true,
      reason,
      notes,
      createdBy
    });
    
    // Fetch complete exception with relations
    const completeException = await DailyScheduleException.findByPk(exception.id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'name', 'employeeCode']
        },
        {
          model: Employee,
          as: 'creator',
          attributes: ['id', 'name', 'employeeCode']
        }
      ]
    });
    
    res.status(201).json({
      message: 'Daily exception created successfully',
      data: completeException
    });
  } catch (error) {
    console.error('Create daily exception error:', error);
    res.status(500).json({ error: 'Server error creating daily exception' });
  }
});

// Update daily exception
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      exceptionType,
      startTime,
      endTime,
      breakStartTime,
      breakEndTime,
      isWorkingDay,
      reason,
      notes
    } = req.body;
    
    const exception = await DailyScheduleException.findByPk(id);
    if (!exception) {
      return res.status(404).json({ error: 'Daily exception not found' });
    }
    
    // Validate exception type if provided
    if (exceptionType) {
      const validTypes = DailyScheduleException.getExceptionTypes().map(t => t.value);
      if (!validTypes.includes(exceptionType)) {
        return res.status(400).json({ 
          error: `Invalid exception type. Valid types: ${validTypes.join(', ')}` 
        });
      }
    }
    
    // Update exception
    await exception.update({
      exceptionType: exceptionType || exception.exceptionType,
      startTime: isWorkingDay !== false ? (startTime !== undefined ? startTime : exception.startTime) : null,
      endTime: isWorkingDay !== false ? (endTime !== undefined ? endTime : exception.endTime) : null,
      breakStartTime: isWorkingDay !== false ? (breakStartTime !== undefined ? breakStartTime : exception.breakStartTime) : null,
      breakEndTime: isWorkingDay !== false ? (breakEndTime !== undefined ? breakEndTime : exception.breakEndTime) : null,
      isWorkingDay: isWorkingDay !== undefined ? isWorkingDay : exception.isWorkingDay,
      reason: reason !== undefined ? reason : exception.reason,
      notes: notes !== undefined ? notes : exception.notes
    });
    
    // Fetch updated exception
    const updatedException = await DailyScheduleException.findByPk(id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'name', 'employeeCode']
        },
        {
          model: Employee,
          as: 'creator',
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
    
    res.json({
      message: 'Daily exception updated successfully',
      data: updatedException
    });
  } catch (error) {
    console.error('Update daily exception error:', error);
    res.status(500).json({ error: 'Server error updating daily exception' });
  }
});

// Approve daily exception
router.patch('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { approvedBy } = req.body;
    
    if (!approvedBy) {
      return res.status(400).json({ error: 'approvedBy is required' });
    }
    
    const exception = await DailyScheduleException.findByPk(id);
    if (!exception) {
      return res.status(404).json({ error: 'Daily exception not found' });
    }
    
    // Verify approver exists
    const approver = await Employee.findByPk(approvedBy);
    if (!approver) {
      return res.status(404).json({ error: 'Approver employee not found' });
    }
    
    // Approve exception
    await exception.approve(approvedBy);
    
    // Fetch updated exception
    const updatedException = await DailyScheduleException.findByPk(id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'name', 'employeeCode']
        },
        {
          model: Employee,
          as: 'approver',
          attributes: ['id', 'name', 'employeeCode']
        }
      ]
    });
    
    res.json({
      message: `Daily exception approved by ${approver.name}`,
      data: updatedException
    });
  } catch (error) {
    console.error('Approve daily exception error:', error);
    res.status(500).json({ error: 'Server error approving daily exception' });
  }
});

// Deactivate daily exception
router.patch('/:id/deactivate', async (req, res) => {
  try {
    const { id } = req.params;
    
    const exception = await DailyScheduleException.findByPk(id);
    if (!exception) {
      return res.status(404).json({ error: 'Daily exception not found' });
    }
    
    await exception.update({ isActive: false });
    
    res.json({
      message: 'Daily exception deactivated successfully',
      data: exception
    });
  } catch (error) {
    console.error('Deactivate daily exception error:', error);
    res.status(500).json({ error: 'Server error deactivating daily exception' });
  }
});

// Delete daily exception
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const exception = await DailyScheduleException.findByPk(id);
    if (!exception) {
      return res.status(404).json({ error: 'Daily exception not found' });
    }
    
    await exception.destroy();
    
    res.json({ message: 'Daily exception deleted successfully' });
  } catch (error) {
    console.error('Delete daily exception error:', error);
    res.status(500).json({ error: 'Server error deleting daily exception' });
  }
});

// Get exception types (utility endpoint)
router.get('/utils/exception-types', async (req, res) => {
  try {
    const exceptionTypes = DailyScheduleException.getExceptionTypes();
    res.json({ data: exceptionTypes });
  } catch (error) {
    console.error('Get exception types error:', error);
    res.status(500).json({ error: 'Server error fetching exception types' });
  }
});

// Bulk create exceptions (for holidays, etc.)
router.post('/bulk', async (req, res) => {
  try {
    const { exceptions, createdBy } = req.body;
    
    if (!exceptions || !Array.isArray(exceptions) || !createdBy) {
      return res.status(400).json({ 
        error: 'exceptions array and createdBy are required' 
      });
    }
    
    // Verify creator exists
    const creator = await Employee.findByPk(createdBy);
    if (!creator) {
      return res.status(404).json({ error: 'Creator employee not found' });
    }
    
    const results = [];
    const errors = [];
    
    for (const exceptionData of exceptions) {
      try {
        const { employeeId, date, exceptionType, reason, notes } = exceptionData;
        
        if (!employeeId || !date || !exceptionType) {
          errors.push({
            employeeId: employeeId || 'unknown',
            date: date || 'unknown',
            error: 'employeeId, date, and exceptionType are required'
          });
          continue;
        }
        
        // Verify employee exists
        const employee = await Employee.findByPk(employeeId);
        if (!employee) {
          errors.push({
            employeeId,
            date,
            error: 'Employee not found'
          });
          continue;
        }
        
        // Check if exception already exists
        const existingException = await DailyScheduleException.findOne({
          where: { employeeId, date, isActive: true }
        });
        
        if (existingException) {
          errors.push({
            employeeId,
            date,
            error: 'Exception already exists for this date'
          });
          continue;
        }
        
        // Create exception
        const exception = await DailyScheduleException.create({
          employeeId,
          date,
          exceptionType,
          isWorkingDay: false, // Bulk exceptions are typically non-working days
          reason,
          notes,
          createdBy
        });
        
        results.push({
          employeeId,
          date,
          exceptionType,
          id: exception.id,
          success: true
        });
      } catch (error) {
        errors.push({
          employeeId: exceptionData.employeeId || 'unknown',
          date: exceptionData.date || 'unknown',
          error: error.message
        });
      }
    }
    
    res.status(201).json({
      message: `Bulk operation completed. ${results.length} exceptions created, ${errors.length} errors`,
      summary: {
        total: exceptions.length,
        successful: results.length,
        failed: errors.length
      },
      results,
      errors
    });
  } catch (error) {
    console.error('Bulk create exceptions error:', error);
    res.status(500).json({ error: 'Server error in bulk exception creation' });
  }
});

export default router;
