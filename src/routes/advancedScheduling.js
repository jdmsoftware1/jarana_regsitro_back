import express from 'express';
import { WeeklyScheduleService } from '../services/weeklyScheduleService.js';
import { Employee } from '../models/index.js';

const router = express.Router();

// Get effective schedule for a specific date
router.get('/employee/:employeeId/effective-schedule/:date', async (req, res) => {
  try {
    const { employeeId, date } = req.params;
    
    // Verify employee exists
    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const effectiveSchedule = await WeeklyScheduleService.getEffectiveScheduleForDate(employeeId, date);
    
    res.json({
      data: {
        employee: {
          id: employee.id,
          name: employee.name,
          employeeCode: employee.employeeCode
        },
        date,
        effectiveSchedule
      }
    });
  } catch (error) {
    console.error('Get effective schedule error:', error);
    res.status(500).json({ error: 'Server error getting effective schedule' });
  }
});

// Get effective schedule for a date range
router.get('/employee/:employeeId/effective-schedule-range', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }
    
    // Verify employee exists
    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const schedules = await WeeklyScheduleService.getEffectiveScheduleForDateRange(employeeId, startDate, endDate);
    
    res.json({
      data: {
        employee: {
          id: employee.id,
          name: employee.name,
          employeeCode: employee.employeeCode
        },
        dateRange: { startDate, endDate },
        schedules
      }
    });
  } catch (error) {
    console.error('Get effective schedule range error:', error);
    res.status(500).json({ error: 'Server error getting effective schedule range' });
  }
});

// Planify entire year with template
router.post('/employee/:employeeId/planify-year', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { year, templateId, createdBy, options = {} } = req.body;
    
    // Validate required fields
    if (!year || !templateId || !createdBy) {
      return res.status(400).json({ 
        error: 'year, templateId, and createdBy are required' 
      });
    }
    
    // Verify employee exists
    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const result = await WeeklyScheduleService.planifyYearWithTemplate(
      employeeId, 
      year, 
      templateId, 
      createdBy, 
      options
    );
    
    res.status(201).json({
      message: `Year ${year} planified successfully for ${employee.name}`,
      data: {
        employee: {
          id: employee.id,
          name: employee.name,
          employeeCode: employee.employeeCode
        },
        year,
        ...result
      }
    });
  } catch (error) {
    console.error('Planify year error:', error);
    res.status(500).json({ error: error.message || 'Server error planifying year' });
  }
});

// Create holiday exceptions for multiple employees
router.post('/holidays/bulk-create', async (req, res) => {
  try {
    const { employeeIds, holidays, createdBy } = req.body;
    
    // Validate required fields
    if (!employeeIds || !Array.isArray(employeeIds) || !holidays || !Array.isArray(holidays) || !createdBy) {
      return res.status(400).json({ 
        error: 'employeeIds array, holidays array, and createdBy are required' 
      });
    }
    
    // Verify creator exists
    const creator = await Employee.findByPk(createdBy);
    if (!creator) {
      return res.status(404).json({ error: 'Creator employee not found' });
    }
    
    const result = await WeeklyScheduleService.createHolidayExceptions(employeeIds, holidays, createdBy);
    
    res.status(201).json({
      message: `Holiday exceptions created for ${employeeIds.length} employees`,
      data: {
        creator: {
          id: creator.id,
          name: creator.name,
          employeeCode: creator.employeeCode
        },
        holidays: holidays.map(h => ({ date: h.date, reason: h.reason })),
        ...result
      }
    });
  } catch (error) {
    console.error('Create holiday exceptions error:', error);
    res.status(500).json({ error: error.message || 'Server error creating holiday exceptions' });
  }
});

// Get scheduling statistics for employee
router.get('/employee/:employeeId/stats/:year', async (req, res) => {
  try {
    const { employeeId, year } = req.params;
    
    // Verify employee exists
    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const stats = await WeeklyScheduleService.getSchedulingStats(employeeId, parseInt(year));
    
    res.json({
      data: {
        employee: {
          id: employee.id,
          name: employee.name,
          employeeCode: employee.employeeCode
        },
        stats
      }
    });
  } catch (error) {
    console.error('Get scheduling stats error:', error);
    res.status(500).json({ error: 'Server error getting scheduling statistics' });
  }
});

// Validate schedule conflicts
router.post('/employee/:employeeId/validate-conflicts', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }
    
    // Verify employee exists
    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const validation = await WeeklyScheduleService.validateScheduleConflicts(employeeId, startDate, endDate);
    
    res.json({
      data: {
        employee: {
          id: employee.id,
          name: employee.name,
          employeeCode: employee.employeeCode
        },
        dateRange: { startDate, endDate },
        validation
      }
    });
  } catch (error) {
    console.error('Validate conflicts error:', error);
    res.status(500).json({ error: 'Server error validating schedule conflicts' });
  }
});

// Get current week info
router.get('/utils/current-week', async (req, res) => {
  try {
    const { WeeklySchedule } = await import('../models/index.js');
    const currentWeek = WeeklySchedule.getCurrentWeek();
    const weekDates = WeeklySchedule.getWeekDates(currentWeek.year, currentWeek.weekNumber);
    
    res.json({
      data: {
        ...currentWeek,
        ...weekDates,
        totalWeeksInYear: WeeklySchedule.getWeeksInYear(currentWeek.year)
      }
    });
  } catch (error) {
    console.error('Get current week error:', error);
    res.status(500).json({ error: 'Server error getting current week info' });
  }
});

// Get year overview (all weeks)
router.get('/utils/year-overview/:year', async (req, res) => {
  try {
    const { year } = req.params;
    const { WeeklySchedule } = await import('../models/index.js');
    
    const totalWeeks = WeeklySchedule.getWeeksInYear(parseInt(year));
    const weeks = [];
    
    for (let weekNumber = 1; weekNumber <= totalWeeks; weekNumber++) {
      const weekDates = WeeklySchedule.getWeekDates(parseInt(year), weekNumber);
      weeks.push({
        weekNumber,
        ...weekDates
      });
    }
    
    const currentWeek = WeeklySchedule.getCurrentWeek();
    
    res.json({
      data: {
        year: parseInt(year),
        totalWeeks,
        weeks,
        currentWeek: currentWeek.year === parseInt(year) ? currentWeek.weekNumber : null
      }
    });
  } catch (error) {
    console.error('Get year overview error:', error);
    res.status(500).json({ error: 'Server error getting year overview' });
  }
});

export default router;
