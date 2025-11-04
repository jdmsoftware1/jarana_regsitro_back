import express from 'express';
import { Employee, Schedule, ScheduleTemplate, ScheduleTemplateDay } from '../models/index.js';

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

// Apply schedule template to employee (simplified endpoint)
router.post('/apply-template', async (req, res) => {
  try {
    const { employeeId, templateId } = req.body;
    
    if (!employeeId || !templateId) {
      return res.status(400).json({ error: 'employeeId and templateId are required' });
    }
    
    // Verify employee exists
    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    // Verify template exists and is active
    const template = await ScheduleTemplate.findOne({
      where: { id: templateId, isActive: true },
      include: [{
        model: ScheduleTemplateDay,
        as: 'templateDays'
      }]
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found or inactive' });
    }
    
    // Delete existing schedules for this employee
    await Schedule.destroy({ where: { employeeId } });
    
    // Create new schedules based on template
    const createdSchedules = [];
    for (const templateDay of template.templateDays) {
      const newSchedule = await Schedule.create({
        employeeId,
        templateId: template.id,
        dayOfWeek: templateDay.dayOfWeek,
        startTime: templateDay.startTime,
        endTime: templateDay.endTime,
        breakStartTime: templateDay.breakStartTime,
        breakEndTime: templateDay.breakEndTime,
        isWorkingDay: templateDay.isWorkingDay,
        notes: templateDay.notes
      });
      createdSchedules.push(newSchedule);
    }
    
    res.status(201).json({
      message: `Template "${template.name}" applied successfully to ${employee.name}`,
      schedules: createdSchedules,
      template: {
        id: template.id,
        name: template.name
      }
    });
  } catch (error) {
    console.error('Apply template error:', error);
    res.status(500).json({ error: 'Server error applying template' });
  }
});

// Apply schedule template to employee (legacy endpoint)
router.post('/employee/:employeeId/apply-template', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { templateId } = req.body;
    
    // Verify employee exists
    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    // Verify template exists and is active
    const template = await ScheduleTemplate.findOne({
      where: { id: templateId, isActive: true },
      include: [{
        model: ScheduleTemplateDay,
        as: 'templateDays'
      }]
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found or inactive' });
    }
    
    // Delete existing schedules for this employee
    await Schedule.destroy({ where: { employeeId } });
    
    // Create new schedules based on template
    const createdSchedules = [];
    for (const templateDay of template.templateDays) {
      const newSchedule = await Schedule.create({
        employeeId,
        templateId: template.id,
        dayOfWeek: templateDay.dayOfWeek,
        startTime: templateDay.startTime,
        endTime: templateDay.endTime,
        breakStartTime: templateDay.breakStartTime,
        breakEndTime: templateDay.breakEndTime,
        isWorkingDay: templateDay.isWorkingDay,
        notes: templateDay.notes
      });
      createdSchedules.push(newSchedule);
    }
    
    res.status(201).json({
      message: `Template "${template.name}" applied successfully to ${employee.name}`,
      schedules: createdSchedules,
      template: {
        id: template.id,
        name: template.name
      }
    });
  } catch (error) {
    console.error('Apply template error:', error);
    res.status(500).json({ error: 'Server error applying template' });
  }
});

// Apply schedule template to multiple employees
router.post('/apply-template-bulk', async (req, res) => {
  try {
    const { templateId, employeeIds } = req.body;
    
    if (!templateId || !employeeIds || !Array.isArray(employeeIds)) {
      return res.status(400).json({ 
        error: 'templateId and employeeIds array are required' 
      });
    }
    
    // Verify template exists and is active
    const template = await ScheduleTemplate.findOne({
      where: { id: templateId, isActive: true },
      include: [{
        model: ScheduleTemplateDay,
        as: 'templateDays'
      }]
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found or inactive' });
    }
    
    // Verify all employees exist
    const employees = await Employee.findAll({
      where: { id: employeeIds }
    });
    
    if (employees.length !== employeeIds.length) {
      return res.status(404).json({ error: 'One or more employees not found' });
    }
    
    const results = [];
    
    // Apply template to each employee
    for (const employee of employees) {
      try {
        // Delete existing schedules for this employee
        await Schedule.destroy({ where: { employeeId: employee.id } });
        
        // Create new schedules based on template
        const createdSchedules = [];
        for (const templateDay of template.templateDays) {
          const newSchedule = await Schedule.create({
            employeeId: employee.id,
            templateId: template.id,
            dayOfWeek: templateDay.dayOfWeek,
            startTime: templateDay.startTime,
            endTime: templateDay.endTime,
            breakStartTime: templateDay.breakStartTime,
            breakEndTime: templateDay.breakEndTime,
            isWorkingDay: templateDay.isWorkingDay,
            notes: templateDay.notes
          });
          createdSchedules.push(newSchedule);
        }
        
        results.push({
          employeeId: employee.id,
          employeeName: employee.name,
          success: true,
          schedulesCreated: createdSchedules.length
        });
      } catch (error) {
        console.error(`Error applying template to employee ${employee.id}:`, error);
        results.push({
          employeeId: employee.id,
          employeeName: employee.name,
          success: false,
          error: error.message
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    res.status(201).json({
      message: `Template "${template.name}" applied to ${successCount} employees successfully`,
      summary: {
        total: employeeIds.length,
        successful: successCount,
        failed: failureCount
      },
      results,
      template: {
        id: template.id,
        name: template.name
      }
    });
  } catch (error) {
    console.error('Bulk apply template error:', error);
    res.status(500).json({ error: 'Server error applying template to employees' });
  }
});

export default router;
