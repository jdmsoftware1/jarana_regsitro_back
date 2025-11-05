import express from 'express';
import { Op } from 'sequelize';
import { Employee, WeeklySchedule, ScheduleTemplate, ScheduleTemplateDay, DailyScheduleException } from '../models/index.js';

const router = express.Router();

// Get all weekly schedules for an employee (all years)
router.get('/employee/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    // Verify employee exists
    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const weeklySchedules = await WeeklySchedule.findAll({
      where: { employeeId },
      include: [
        {
          model: ScheduleTemplate,
          as: 'template',
          include: [{
            model: ScheduleTemplateDay,
            as: 'templateDays',
            order: [['dayOfWeek', 'ASC']]
          }]
        },
        {
          model: Employee,
          as: 'creator',
          attributes: ['id', 'name', 'employeeCode']
        }
      ],
      order: [['year', 'DESC'], ['weekNumber', 'DESC']]
    });
    
    res.json({ data: weeklySchedules });
  } catch (error) {
    console.error('Get weekly schedules error:', error);
    res.status(500).json({ error: 'Server error fetching weekly schedules' });
  }
});

// Get weekly schedules for an employee in a specific year
router.get('/employee/:employeeId/year/:year', async (req, res) => {
  try {
    const { employeeId, year } = req.params;
    
    // Verify employee exists
    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const weeklySchedules = await WeeklySchedule.findAll({
      where: { 
        employeeId,
        year: parseInt(year)
      },
      include: [
        {
          model: ScheduleTemplate,
          as: 'template',
          include: [{
            model: ScheduleTemplateDay,
            as: 'templateDays',
            order: [['day_of_week', 'ASC']]
          }]
        },
        {
          model: Employee,
          as: 'creator',
          attributes: ['id', 'name', 'employeeCode']
        }
      ],
      order: [['week_number', 'ASC']]
    });
    
    res.json({ data: weeklySchedules });
  } catch (error) {
    console.error('Get weekly schedules error:', error);
    res.status(500).json({ error: 'Server error fetching weekly schedules' });
  }
});

// Get weekly schedules for a specific week
router.get('/employee/:employeeId/week/:year/:weekNumber', async (req, res) => {
  try {
    const { employeeId, year, weekNumber } = req.params;
    
    const weeklySchedule = await WeeklySchedule.findOne({
      where: { 
        employeeId,
        year: parseInt(year),
        weekNumber: parseInt(weekNumber)
      },
      include: [
        {
          model: ScheduleTemplate,
          as: 'template',
          include: [{
            model: ScheduleTemplateDay,
            as: 'templateDays',
            order: [['day_of_week', 'ASC']]
          }]
        },
        {
          model: Employee,
          as: 'creator',
          attributes: ['id', 'name', 'employeeCode']
        }
      ]
    });
    
    if (!weeklySchedule) {
      return res.status(404).json({ error: 'Weekly schedule not found' });
    }
    
    // Get daily exceptions for this week
    const { startDate, endDate } = WeeklySchedule.getWeekDates(parseInt(year), parseInt(weekNumber));
    const dailyExceptions = await DailyScheduleException.findAll({
      where: {
        employeeId,
        date: {
          [Op.between]: [startDate, endDate]
        },
        isActive: true
      },
      include: [{
        model: Employee,
        as: 'approver',
        attributes: ['id', 'name', 'employeeCode']
      }],
      order: [['date', 'ASC']]
    });
    
    res.json({ 
      data: {
        weeklySchedule,
        dailyExceptions,
        weekDates: { startDate, endDate }
      }
    });
  } catch (error) {
    console.error('Get weekly schedule error:', error);
    res.status(500).json({ error: 'Server error fetching weekly schedule' });
  }
});

// Create weekly schedule (simple endpoint)
router.post('/', async (req, res) => {
  try {
    console.log('📅 Creating weekly schedule with data:', req.body);
    const { employeeId, templateId, weekStart, weekEnd, year, weekNumber, notes, createdBy } = req.body;
    
    // Validate required fields
    if (!employeeId || !year || !weekNumber) {
      console.error('❌ Missing required fields:', { employeeId, year, weekNumber });
      return res.status(400).json({ 
        error: 'employeeId, year, and weekNumber are required' 
      });
    }
    
    // Verify employee exists
    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    // Verify template exists if provided
    if (templateId) {
      const template = await ScheduleTemplate.findOne({
        where: { id: templateId, isActive: true }
      });
      if (!template) {
        return res.status(404).json({ error: 'Template not found or inactive' });
      }
    }
    
    // Calculate week dates if not provided
    let startDate = weekStart;
    let endDate = weekEnd;
    
    // If dates not provided, calculate them
    if (!startDate || !endDate) {
      try {
        const dates = WeeklySchedule.getWeekDates(year, weekNumber);
        startDate = dates.startDate;
        endDate = dates.endDate;
      } catch (error) {
        console.error('Error calculating week dates:', error);
        return res.status(400).json({ 
          error: 'Invalid year or week number',
          details: error.message 
        });
      }
    }
    
    // Check if weekly schedule already exists
    let weeklySchedule = await WeeklySchedule.findOne({
      where: { employeeId, year, weekNumber }
    });
    
    if (weeklySchedule) {
      // Update existing
      console.log('📝 Updating existing weekly schedule:', weeklySchedule.id);
      await weeklySchedule.update({
        templateId,
        startDate,
        endDate,
        notes
      });
    } else {
      // Create new
      console.log('✨ Creating new weekly schedule');
      weeklySchedule = await WeeklySchedule.create({
        employeeId,
        year,
        weekNumber,
        templateId,
        startDate,
        endDate,
        notes,
        createdBy: createdBy || employeeId
      });
      console.log('✅ Weekly schedule created:', weeklySchedule.id);
    }
    
    // Fetch complete weekly schedule with relations
    const completeWeeklySchedule = await WeeklySchedule.findByPk(weeklySchedule.id, {
      include: [
        {
          model: ScheduleTemplate,
          as: 'template',
          include: [{
            model: ScheduleTemplateDay,
            as: 'templateDays',
            order: [['dayOfWeek', 'ASC']]
          }]
        },
        {
          model: Employee,
          as: 'creator',
          attributes: ['id', 'name', 'employeeCode']
        }
      ]
    });
    
    res.status(201).json({ data: completeWeeklySchedule });
  } catch (error) {
    console.error('❌ Create weekly schedule error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Server error creating weekly schedule',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Create or update weekly schedule
router.post('/employee/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { year, weekNumber, templateId, notes, createdBy } = req.body;
    
    // Validate required fields
    if (!year || !weekNumber || !createdBy) {
      return res.status(400).json({ 
        error: 'Year, weekNumber, and createdBy are required' 
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
    
    // Verify template exists if provided
    if (templateId) {
      const template = await ScheduleTemplate.findOne({
        where: { id: templateId, isActive: true }
      });
      if (!template) {
        return res.status(404).json({ error: 'Template not found or inactive' });
      }
    }
    
    // Calculate week dates
    const { startDate, endDate } = WeeklySchedule.getWeekDates(year, weekNumber);
    
    // Check if weekly schedule already exists
    let weeklySchedule = await WeeklySchedule.findOne({
      where: { employeeId, year, weekNumber }
    });
    
    if (weeklySchedule) {
      // Update existing
      await weeklySchedule.update({
        templateId,
        startDate,
        endDate,
        notes
      });
    } else {
      // Create new
      weeklySchedule = await WeeklySchedule.create({
        employeeId,
        year,
        weekNumber,
        templateId,
        startDate,
        endDate,
        notes,
        createdBy
      });
    }
    
    // Fetch complete weekly schedule with relations
    const completeWeeklySchedule = await WeeklySchedule.findByPk(weeklySchedule.id, {
      include: [
        {
          model: ScheduleTemplate,
          as: 'template',
          include: [{
            model: ScheduleTemplateDay,
            as: 'templateDays',
            order: [['day_of_week', 'ASC']]
          }]
        },
        {
          model: Employee,
          as: 'creator',
          attributes: ['id', 'name', 'employeeCode']
        }
      ]
    });
    
    res.status(201).json({
      message: `Weekly schedule for week ${weekNumber}/${year} ${weeklySchedule.createdAt === weeklySchedule.updatedAt ? 'created' : 'updated'} successfully`,
      data: completeWeeklySchedule
    });
  } catch (error) {
    console.error('Create/update weekly schedule error:', error);
    res.status(500).json({ error: 'Server error managing weekly schedule' });
  }
});

// Bulk create weekly schedules for multiple weeks
router.post('/employee/:employeeId/bulk', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { year, weeks, createdBy } = req.body;
    
    // Validate required fields
    if (!year || !weeks || !Array.isArray(weeks) || !createdBy) {
      return res.status(400).json({ 
        error: 'Year, weeks array, and createdBy are required' 
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
    
    const results = [];
    const errors = [];
    
    for (const weekData of weeks) {
      try {
        const { weekNumber, templateId, notes } = weekData;
        
        if (!weekNumber) {
          errors.push({ weekNumber: 'unknown', error: 'Week number is required' });
          continue;
        }
        
        // Verify template if provided
        if (templateId) {
          const template = await ScheduleTemplate.findOne({
            where: { id: templateId, isActive: true }
          });
          if (!template) {
            errors.push({ weekNumber, error: 'Template not found or inactive' });
            continue;
          }
        }
        
        // Calculate week dates
        const { startDate, endDate } = WeeklySchedule.getWeekDates(year, weekNumber);
        
        // Check if weekly schedule already exists
        let weeklySchedule = await WeeklySchedule.findOne({
          where: { employeeId, year, weekNumber }
        });
        
        if (weeklySchedule) {
          // Update existing
          await weeklySchedule.update({
            templateId,
            startDate,
            endDate,
            notes
          });
          results.push({
            weekNumber,
            action: 'updated',
            id: weeklySchedule.id
          });
        } else {
          // Create new
          weeklySchedule = await WeeklySchedule.create({
            employeeId,
            year,
            weekNumber,
            templateId,
            startDate,
            endDate,
            notes,
            createdBy
          });
          results.push({
            weekNumber,
            action: 'created',
            id: weeklySchedule.id
          });
        }
      } catch (error) {
        errors.push({
          weekNumber: weekData.weekNumber || 'unknown',
          error: error.message
        });
      }
    }
    
    res.status(201).json({
      message: `Bulk operation completed. ${results.length} weeks processed successfully, ${errors.length} errors`,
      summary: {
        total: weeks.length,
        successful: results.length,
        failed: errors.length
      },
      results,
      errors
    });
  } catch (error) {
    console.error('Bulk weekly schedule error:', error);
    res.status(500).json({ error: 'Server error in bulk weekly schedule operation' });
  }
});

// Copy template to multiple weeks
router.post('/employee/:employeeId/copy-template', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { templateId, year, weekNumbers, createdBy } = req.body;
    
    // Validate required fields
    if (!templateId || !year || !weekNumbers || !Array.isArray(weekNumbers) || !createdBy) {
      return res.status(400).json({ 
        error: 'templateId, year, weekNumbers array, and createdBy are required' 
      });
    }
    
    // Verify employee exists
    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    // Verify template exists and is active
    const template = await ScheduleTemplate.findOne({
      where: { id: templateId, isActive: true }
    });
    if (!template) {
      return res.status(404).json({ error: 'Template not found or inactive' });
    }
    
    const results = [];
    
    for (const weekNumber of weekNumbers) {
      try {
        // Calculate week dates
        const { startDate, endDate } = WeeklySchedule.getWeekDates(year, weekNumber);
        
        // Create or update weekly schedule
        const [weeklySchedule, created] = await WeeklySchedule.upsert({
          employeeId,
          year,
          weekNumber,
          templateId,
          startDate,
          endDate,
          createdBy,
          notes: `Applied template: ${template.name}`
        });
        
        results.push({
          weekNumber,
          action: created ? 'created' : 'updated',
          templateName: template.name
        });
      } catch (error) {
        console.error(`Error processing week ${weekNumber}:`, error);
        results.push({
          weekNumber,
          action: 'failed',
          error: error.message
        });
      }
    }
    
    const successCount = results.filter(r => r.action !== 'failed').length;
    
    res.status(201).json({
      message: `Template "${template.name}" applied to ${successCount} weeks successfully`,
      summary: {
        total: weekNumbers.length,
        successful: successCount,
        failed: results.length - successCount
      },
      results,
      template: {
        id: template.id,
        name: template.name
      }
    });
  } catch (error) {
    console.error('Copy template error:', error);
    res.status(500).json({ error: 'Server error copying template to weeks' });
  }
});

// Delete weekly schedule by ID
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const weeklySchedule = await WeeklySchedule.findByPk(id);
    
    if (!weeklySchedule) {
      return res.status(404).json({ error: 'Weekly schedule not found' });
    }
    
    await weeklySchedule.destroy();
    
    res.json({ 
      message: `Weekly schedule deleted successfully` 
    });
  } catch (error) {
    console.error('Delete weekly schedule error:', error);
    res.status(500).json({ error: 'Server error deleting weekly schedule' });
  }
});

// Delete weekly schedule
router.delete('/employee/:employeeId/week/:year/:weekNumber', async (req, res) => {
  try {
    const { employeeId, year, weekNumber } = req.params;
    
    const weeklySchedule = await WeeklySchedule.findOne({
      where: { 
        employeeId,
        year: parseInt(year),
        weekNumber: parseInt(weekNumber)
      }
    });
    
    if (!weeklySchedule) {
      return res.status(404).json({ error: 'Weekly schedule not found' });
    }
    
    await weeklySchedule.destroy();
    
    res.json({ 
      message: `Weekly schedule for week ${weekNumber}/${year} deleted successfully` 
    });
  } catch (error) {
    console.error('Delete weekly schedule error:', error);
    res.status(500).json({ error: 'Server error deleting weekly schedule' });
  }
});

// Get calendar overview for employee
router.get('/employee/:employeeId/calendar/:year', async (req, res) => {
  try {
    const { employeeId, year } = req.params;
    
    // Verify employee exists
    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    // Get all weekly schedules for the year
    const weeklySchedules = await WeeklySchedule.findAll({
      where: { 
        employeeId,
        year: parseInt(year)
      },
      include: [{
        model: ScheduleTemplate,
        as: 'template',
        attributes: ['id', 'name', 'description']
      }],
      order: [['week_number', 'ASC']]
    });
    
    // Get all daily exceptions for the year
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const dailyExceptions = await DailyScheduleException.findAll({
      where: {
        employeeId,
        date: {
          [Op.between]: [yearStart, yearEnd]
        },
        isActive: true
      },
      order: [['date', 'ASC']]
    });
    
    // Calculate statistics
    const stats = {
      totalWeeks: WeeklySchedule.getWeeksInYear(parseInt(year)),
      scheduledWeeks: weeklySchedules.length,
      unscheduledWeeks: 0,
      dailyExceptions: dailyExceptions.length,
      templatesUsed: [...new Set(weeklySchedules.filter(ws => ws.templateId).map(ws => ws.templateId))].length
    };
    stats.unscheduledWeeks = stats.totalWeeks - stats.scheduledWeeks;
    
    res.json({
      data: {
        employee: {
          id: employee.id,
          name: employee.name,
          employeeCode: employee.employeeCode
        },
        year: parseInt(year),
        weeklySchedules,
        dailyExceptions,
        stats
      }
    });
  } catch (error) {
    console.error('Get calendar overview error:', error);
    res.status(500).json({ error: 'Server error fetching calendar overview' });
  }
});

// Get week utilities (helper endpoint)
router.get('/utils/week-info/:year/:weekNumber', async (req, res) => {
  try {
    const { year, weekNumber } = req.params;
    
    const weekDates = WeeklySchedule.getWeekDates(parseInt(year), parseInt(weekNumber));
    const currentWeek = WeeklySchedule.getCurrentWeek();
    const totalWeeks = WeeklySchedule.getWeeksInYear(parseInt(year));
    
    res.json({
      data: {
        year: parseInt(year),
        weekNumber: parseInt(weekNumber),
        ...weekDates,
        isCurrentWeek: currentWeek.year === parseInt(year) && currentWeek.weekNumber === parseInt(weekNumber),
        totalWeeksInYear: totalWeeks
      }
    });
  } catch (error) {
    console.error('Get week info error:', error);
    res.status(500).json({ error: 'Server error getting week information' });
  }
});

export default router;
