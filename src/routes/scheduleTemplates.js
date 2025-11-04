import express from 'express';
import { Op } from 'sequelize';
import { Employee, ScheduleTemplate, ScheduleTemplateDay } from '../models/index.js';

const router = express.Router();

// Get all schedule templates
router.get('/', async (req, res) => {
  try {
    const templates = await ScheduleTemplate.findAll({
      include: [
        {
          model: ScheduleTemplateDay,
          as: 'templateDays',
          order: [['day_of_week', 'ASC']]
        },
        {
          model: Employee,
          as: 'creator',
          attributes: ['id', 'name', 'employeeCode']
        }
      ],
      order: [['name', 'ASC']]
    });
    
    res.json({ data: templates });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'Server error fetching templates' });
  }
});

// Get active schedule templates only
router.get('/active', async (req, res) => {
  try {
    const templates = await ScheduleTemplate.findAll({
      where: { isActive: true },
      include: [
        {
          model: ScheduleTemplateDay,
          as: 'templateDays',
          order: [['day_of_week', 'ASC']]
        },
        {
          model: Employee,
          as: 'creator',
          attributes: ['id', 'name', 'employeeCode']
        }
      ],
      order: [['name', 'ASC']]
    });
    
    res.json({ data: templates });
  } catch (error) {
    console.error('Get active templates error:', error);
    res.status(500).json({ error: 'Server error fetching active templates' });
  }
});

// Get specific template by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const template = await ScheduleTemplate.findByPk(id, {
      include: [
        {
          model: ScheduleTemplateDay,
          as: 'templateDays',
          order: [['day_of_week', 'ASC']]
        },
        {
          model: Employee,
          as: 'creator',
          attributes: ['id', 'name', 'employeeCode']
        }
      ]
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json({ data: template });
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({ error: 'Server error fetching template' });
  }
});

// Create new schedule template
router.post('/', async (req, res) => {
  try {
    const { name, description, createdBy, templateDays } = req.body;
    
    // Validate required fields
    if (!name || !createdBy || !templateDays || !Array.isArray(templateDays)) {
      return res.status(400).json({ 
        error: 'Name, createdBy, and templateDays are required' 
      });
    }
    
    // Verify creator exists
    const creator = await Employee.findByPk(createdBy);
    if (!creator) {
      return res.status(404).json({ error: 'Creator employee not found' });
    }
    
    // Check if template name already exists
    const existingTemplate = await ScheduleTemplate.findOne({ where: { name } });
    if (existingTemplate) {
      return res.status(400).json({ error: 'Template name already exists' });
    }
    
    // Create template
    const template = await ScheduleTemplate.create({
      name,
      description,
      createdBy
    });
    
    // Create template days
    const createdDays = [];
    for (const day of templateDays) {
      if (day.isWorkingDay) {
        const templateDay = await ScheduleTemplateDay.create({
          templateId: template.id,
          dayOfWeek: day.dayOfWeek,
          startTime: day.startTime,
          endTime: day.endTime,
          breakStartTime: day.breakStartTime || null,
          breakEndTime: day.breakEndTime || null,
          isWorkingDay: day.isWorkingDay,
          notes: day.notes || null
        });
        createdDays.push(templateDay);
      }
    }
    
    // Fetch complete template with relations
    const completeTemplate = await ScheduleTemplate.findByPk(template.id, {
      include: [
        {
          model: ScheduleTemplateDay,
          as: 'templateDays',
          order: [['day_of_week', 'ASC']]
        },
        {
          model: Employee,
          as: 'creator',
          attributes: ['id', 'name', 'employeeCode']
        }
      ]
    });
    
    res.status(201).json({
      message: 'Schedule template created successfully',
      data: completeTemplate
    });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ error: 'Server error creating template' });
  }
});

// Update schedule template
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, templateDays } = req.body;
    
    // Find template
    const template = await ScheduleTemplate.findByPk(id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    // Check if new name conflicts with existing templates (excluding current)
    if (name && name !== template.name) {
      const existingTemplate = await ScheduleTemplate.findOne({ 
        where: { 
          name,
          id: { [Op.ne]: id }
        }
      });
      if (existingTemplate) {
        return res.status(400).json({ error: 'Template name already exists' });
      }
    }
    
    // Update template
    await template.update({
      name: name || template.name,
      description: description !== undefined ? description : template.description
    });
    
    // Update template days if provided
    if (templateDays && Array.isArray(templateDays)) {
      // Delete existing template days
      await ScheduleTemplateDay.destroy({ where: { templateId: id } });
      
      // Create new template days
      for (const day of templateDays) {
        if (day.isWorkingDay) {
          await ScheduleTemplateDay.create({
            templateId: id,
            dayOfWeek: day.dayOfWeek,
            startTime: day.startTime,
            endTime: day.endTime,
            breakStartTime: day.breakStartTime || null,
            breakEndTime: day.breakEndTime || null,
            isWorkingDay: day.isWorkingDay,
            notes: day.notes || null
          });
        }
      }
    }
    
    // Fetch updated template
    const updatedTemplate = await ScheduleTemplate.findByPk(id, {
      include: [
        {
          model: ScheduleTemplateDay,
          as: 'templateDays',
          order: [['day_of_week', 'ASC']]
        },
        {
          model: Employee,
          as: 'creator',
          attributes: ['id', 'name', 'employeeCode']
        }
      ]
    });
    
    res.json({
      message: 'Template updated successfully',
      data: updatedTemplate
    });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ error: 'Server error updating template' });
  }
});

// Toggle template active status
router.patch('/:id/toggle-active', async (req, res) => {
  try {
    const { id } = req.params;
    
    const template = await ScheduleTemplate.findByPk(id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    await template.update({ isActive: !template.isActive });
    
    res.json({
      message: `Template ${template.isActive ? 'activated' : 'deactivated'} successfully`,
      data: template
    });
  } catch (error) {
    console.error('Toggle template error:', error);
    res.status(500).json({ error: 'Server error toggling template status' });
  }
});

// Delete schedule template
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const template = await ScheduleTemplate.findByPk(id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    // Check if template is being used by any schedules
    const { Schedule } = await import('../models/index.js');
    const schedulesUsingTemplate = await Schedule.count({ where: { templateId: id } });
    
    if (schedulesUsingTemplate > 0) {
      return res.status(400).json({ 
        error: `Cannot delete template. It is being used by ${schedulesUsingTemplate} schedule(s)` 
      });
    }
    
    // Delete template days first (cascade should handle this, but being explicit)
    await ScheduleTemplateDay.destroy({ where: { templateId: id } });
    
    // Delete template
    await template.destroy();
    
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'Server error deleting template' });
  }
});

export default router;
