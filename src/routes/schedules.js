import express from 'express';
import { Employee, Schedule } from '../models/index.js';

const router = express.Router();

// Get schedules for an employee
router.get('/employee/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    const schedules = await Schedule.findAll({
      where: { employeeId },
      order: [['day_of_week', 'ASC']]
    });
    
    res.json(schedules);
  } catch (error) {
    console.error('Get schedules error:', error);
    res.status(500).json({ error: 'Server error fetching schedules' });
  }
});

// Create or update schedule for an employee
router.post('/employee/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { schedules } = req.body; // Array of schedules for each day
    
    // Verify employee exists
    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    // Delete existing schedules for this employee
    await Schedule.destroy({ where: { employeeId } });
    
    // Create new schedules
    const createdSchedules = [];
    for (const schedule of schedules) {
      if (schedule.isWorkingDay) {
        const newSchedule = await Schedule.create({
          employeeId,
          dayOfWeek: schedule.dayOfWeek,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          breakStartTime: schedule.breakStartTime || null,
          breakEndTime: schedule.breakEndTime || null,
          isWorkingDay: schedule.isWorkingDay,
          notes: schedule.notes || null
        });
        createdSchedules.push(newSchedule);
      }
    }
    
    res.status(201).json({
      message: 'Schedules updated successfully',
      schedules: createdSchedules
    });
  } catch (error) {
    console.error('Create schedules error:', error);
    res.status(500).json({ error: 'Server error creating schedules' });
  }
});

// Get all employees with their schedules
router.get('/all', async (req, res) => {
  try {
    const employees = await Employee.findAll({
      include: [{
        model: Schedule,
        as: 'schedules',
        required: false
      }],
      where: { isActive: true },
      order: [['name', 'ASC']]
    });
    
    res.json(employees);
  } catch (error) {
    console.error('Get all schedules error:', error);
    res.status(500).json({ error: 'Server error fetching all schedules' });
  }
});

export default router;
