import express from 'express';
import { ScheduleBreakService } from '../services/scheduleBreakService.js';
import { Employee } from '../models/index.js';

const router = express.Router();

// Get effective breaks for employee on specific date
router.get('/employee/:employeeId/effective-breaks/:date', async (req, res) => {
  try {
    const { employeeId, date } = req.params;
    
    // Verify employee exists
    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const effectiveBreaks = await ScheduleBreakService.getEffectiveBreaksForSchedule(employeeId, date);
    
    // Calculate work time stats if it's a working day
    let workTimeStats = null;
    if (effectiveBreaks.isWorkingDay && effectiveBreaks.workStartTime && effectiveBreaks.workEndTime) {
      workTimeStats = ScheduleBreakService.calculateEffectiveWorkTime(
        effectiveBreaks.workStartTime,
        effectiveBreaks.workEndTime,
        effectiveBreaks.breaks
      );
    }
    
    res.json({
      data: {
        employee: {
          id: employee.id,
          name: employee.name,
          employeeCode: employee.employeeCode
        },
        date,
        effectiveBreaks,
        workTimeStats
      }
    });
  } catch (error) {
    console.error('Get effective breaks error:', error);
    res.status(500).json({ error: 'Server error getting effective breaks' });
  }
});

// Apply template breaks to multiple schedules
router.post('/apply-template-breaks', async (req, res) => {
  try {
    const { templateDayId, scheduleIds, createdBy } = req.body;
    
    // Validate required fields
    if (!templateDayId || !scheduleIds || !Array.isArray(scheduleIds) || !createdBy) {
      return res.status(400).json({ 
        error: 'templateDayId, scheduleIds array, and createdBy are required' 
      });
    }
    
    // Verify creator exists
    const creator = await Employee.findByPk(createdBy);
    if (!creator) {
      return res.status(404).json({ error: 'Creator employee not found' });
    }
    
    const result = await ScheduleBreakService.applyTemplateBreaksToSchedules(
      templateDayId,
      scheduleIds,
      createdBy
    );
    
    res.status(201).json({
      message: result.message,
      data: {
        creator: {
          id: creator.id,
          name: creator.name,
          employeeCode: creator.employeeCode
        },
        templateDayId,
        ...result
      }
    });
  } catch (error) {
    console.error('Apply template breaks error:', error);
    res.status(500).json({ error: error.message || 'Server error applying template breaks' });
  }
});

// Create standard breaks for multiple employees
router.post('/create-standard-breaks', async (req, res) => {
  try {
    const { employeeIds, parentType, createdBy, options = {} } = req.body;
    
    // Validate required fields
    if (!employeeIds || !Array.isArray(employeeIds) || !parentType || !createdBy) {
      return res.status(400).json({ 
        error: 'employeeIds array, parentType, and createdBy are required' 
      });
    }
    
    // Validate parent type
    const validParentTypes = ['schedule', 'template_day'];
    if (!validParentTypes.includes(parentType)) {
      return res.status(400).json({ 
        error: `Invalid parent type. Valid types: ${validParentTypes.join(', ')}` 
      });
    }
    
    // Verify creator exists
    const creator = await Employee.findByPk(createdBy);
    if (!creator) {
      return res.status(404).json({ error: 'Creator employee not found' });
    }
    
    const result = await ScheduleBreakService.createStandardBreaksForEmployees(
      employeeIds,
      parentType,
      createdBy,
      options
    );
    
    res.status(201).json({
      message: result.message,
      data: {
        creator: {
          id: creator.id,
          name: creator.name,
          employeeCode: creator.employeeCode
        },
        parentType,
        options,
        ...result
      }
    });
  } catch (error) {
    console.error('Create standard breaks error:', error);
    res.status(500).json({ error: error.message || 'Server error creating standard breaks' });
  }
});

// Analyze break conflicts for employee in date range
router.post('/employee/:employeeId/analyze-conflicts', async (req, res) => {
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
    
    const analysis = await ScheduleBreakService.analyzeBreakConflicts(employeeId, startDate, endDate);
    
    res.json({
      data: {
        employee: {
          id: employee.id,
          name: employee.name,
          employeeCode: employee.employeeCode
        },
        analysis
      }
    });
  } catch (error) {
    console.error('Analyze conflicts error:', error);
    res.status(500).json({ error: 'Server error analyzing break conflicts' });
  }
});

// Generate break report for employee
router.get('/employee/:employeeId/report', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate query parameters are required' });
    }
    
    const report = await ScheduleBreakService.generateBreakReport(employeeId, startDate, endDate);
    
    res.json({ data: report });
  } catch (error) {
    console.error('Generate break report error:', error);
    res.status(500).json({ error: error.message || 'Server error generating break report' });
  }
});

// Optimize breaks for better scheduling
router.post('/optimize-breaks', async (req, res) => {
  try {
    const { breaks, workStartTime, workEndTime } = req.body;
    
    if (!breaks || !Array.isArray(breaks) || !workStartTime || !workEndTime) {
      return res.status(400).json({ 
        error: 'breaks array, workStartTime, and workEndTime are required' 
      });
    }
    
    const optimization = ScheduleBreakService.optimizeBreaksForSchedule(breaks, workStartTime, workEndTime);
    
    res.json({ data: optimization });
  } catch (error) {
    console.error('Optimize breaks error:', error);
    res.status(500).json({ error: 'Server error optimizing breaks' });
  }
});

// Calculate work time with breaks
router.post('/calculate-work-time', async (req, res) => {
  try {
    const { workStartTime, workEndTime, breaks } = req.body;
    
    if (!workStartTime || !workEndTime || !breaks || !Array.isArray(breaks)) {
      return res.status(400).json({ 
        error: 'workStartTime, workEndTime, and breaks array are required' 
      });
    }
    
    const workTimeStats = ScheduleBreakService.calculateEffectiveWorkTime(
      workStartTime,
      workEndTime,
      breaks
    );
    
    res.json({ data: workTimeStats });
  } catch (error) {
    console.error('Calculate work time error:', error);
    res.status(500).json({ error: 'Server error calculating work time' });
  }
});

// Get break statistics for multiple employees
router.post('/employees/break-stats', async (req, res) => {
  try {
    const { employeeIds, date } = req.body;
    
    if (!employeeIds || !Array.isArray(employeeIds) || !date) {
      return res.status(400).json({ 
        error: 'employeeIds array and date are required' 
      });
    }
    
    const stats = [];
    
    for (const employeeId of employeeIds) {
      try {
        const employee = await Employee.findByPk(employeeId);
        if (!employee) {
          stats.push({
            employeeId,
            error: 'Employee not found'
          });
          continue;
        }
        
        const effectiveBreaks = await ScheduleBreakService.getEffectiveBreaksForSchedule(employeeId, date);
        
        let workTimeStats = null;
        if (effectiveBreaks.isWorkingDay && effectiveBreaks.workStartTime && effectiveBreaks.workEndTime) {
          workTimeStats = ScheduleBreakService.calculateEffectiveWorkTime(
            effectiveBreaks.workStartTime,
            effectiveBreaks.workEndTime,
            effectiveBreaks.breaks
          );
        }
        
        stats.push({
          employeeId,
          employeeName: employee.name,
          employeeCode: employee.employeeCode,
          isWorkingDay: effectiveBreaks.isWorkingDay,
          source: effectiveBreaks.source,
          breaksCount: effectiveBreaks.breaks.length,
          workTimeStats
        });
        
      } catch (error) {
        stats.push({
          employeeId,
          error: error.message
        });
      }
    }
    
    // Calculate summary statistics
    const workingEmployees = stats.filter(s => s.isWorkingDay && !s.error);
    const summary = {
      totalEmployees: employeeIds.length,
      workingEmployees: workingEmployees.length,
      averageBreaksPerEmployee: workingEmployees.length > 0 ? 
        Math.round((workingEmployees.reduce((sum, emp) => sum + emp.breaksCount, 0) / workingEmployees.length) * 100) / 100 : 0,
      totalBreaks: workingEmployees.reduce((sum, emp) => sum + emp.breaksCount, 0),
      averageEffectiveHours: workingEmployees.length > 0 ?
        Math.round((workingEmployees.reduce((sum, emp) => sum + (emp.workTimeStats?.effectiveHours || 0), 0) / workingEmployees.length) * 100) / 100 : 0
    };
    
    res.json({
      data: {
        date,
        stats,
        summary
      }
    });
  } catch (error) {
    console.error('Get employees break stats error:', error);
    res.status(500).json({ error: 'Server error getting break statistics' });
  }
});

export default router;
