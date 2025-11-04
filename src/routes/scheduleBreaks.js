import express from 'express';
import { Op } from 'sequelize';
import { Employee, ScheduleBreak, Schedule, ScheduleTemplate, ScheduleTemplateDay, DailyScheduleException } from '../models/index.js';
import sequelize from '../config/database.js';

const router = express.Router();

// Get breaks for a specific parent (schedule, template day, or daily exception)
router.get('/:parentType/:parentId', async (req, res) => {
  try {
    const { parentType, parentId } = req.params;
    
    // Validate parent type
    const validParentTypes = ['schedule', 'template_day', 'daily_exception'];
    if (!validParentTypes.includes(parentType)) {
      return res.status(400).json({ 
        error: `Invalid parent type. Valid types: ${validParentTypes.join(', ')}` 
      });
    }
    
    const breaks = await ScheduleBreak.findAll({
      where: {
        parentType,
        parentId,
        isActive: true
      },
      include: [{
        model: Employee,
        as: 'creator',
        attributes: ['id', 'name', 'employeeCode']
      }],
      order: [['sort_order', 'ASC'], ['start_time', 'ASC']]
    });
    
    // Calculate total break time
    const breakStats = ScheduleBreak.calculateTotalBreakTime(breaks);
    
    res.json({ 
      data: breaks,
      stats: breakStats,
      count: breaks.length
    });
  } catch (error) {
    console.error('Get breaks error:', error);
    res.status(500).json({ error: 'Server error fetching breaks' });
  }
});

// Get specific break
router.get('/break/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const breakItem = await ScheduleBreak.findByPk(id, {
      include: [{
        model: Employee,
        as: 'creator',
        attributes: ['id', 'name', 'employeeCode']
      }]
    });
    
    if (!breakItem) {
      return res.status(404).json({ error: 'Break not found' });
    }
    
    // Add flexible time range if applicable
    const response = {
      ...breakItem.toJSON(),
      flexibleTimeRange: breakItem.getFlexibleTimeRange()
    };
    
    res.json({ data: response });
  } catch (error) {
    console.error('Get break error:', error);
    res.status(500).json({ error: 'Server error fetching break' });
  }
});

// Create break
router.post('/', async (req, res) => {
  try {
    const {
      parentType,
      parentId,
      name,
      startTime,
      endTime,
      breakType,
      isPaid,
      isRequired,
      description,
      isFlexible,
      flexibilityMinutes,
      sortOrder,
      createdBy
    } = req.body;
    
    // Validate required fields
    if (!parentType || !parentId || !name || !startTime || !endTime || !createdBy) {
      return res.status(400).json({ 
        error: 'parentType, parentId, name, startTime, endTime, and createdBy are required' 
      });
    }
    
    // Validate parent type
    const validParentTypes = ['schedule', 'template_day', 'daily_exception'];
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
    
    // Validate break type
    const validBreakTypes = ScheduleBreak.getBreakTypes().map(t => t.value);
    if (breakType && !validBreakTypes.includes(breakType)) {
      return res.status(400).json({ 
        error: `Invalid break type. Valid types: ${validBreakTypes.join(', ')}` 
      });
    }
    
    // Validate time range
    const start = new Date(`1970-01-01T${startTime}`);
    const end = new Date(`1970-01-01T${endTime}`);
    if (start >= end) {
      return res.status(400).json({ 
        error: 'Start time must be before end time' 
      });
    }
    
    // Get existing breaks to validate conflicts
    const existingBreaks = await ScheduleBreak.findAll({
      where: {
        parentType,
        parentId,
        isActive: true
      }
    });
    
    // Check for overlaps with existing breaks
    for (const existingBreak of existingBreaks) {
      const existingStart = new Date(`1970-01-01T${existingBreak.startTime}`);
      const existingEnd = new Date(`1970-01-01T${existingBreak.endTime}`);
      
      if (start < existingEnd && end > existingStart) {
        return res.status(400).json({ 
          error: `Break overlaps with existing break "${existingBreak.name}"` 
        });
      }
    }
    
    // Create break
    const breakItem = await ScheduleBreak.create({
      parentType,
      parentId,
      name,
      startTime,
      endTime,
      breakType: breakType || 'rest',
      isPaid: isPaid !== undefined ? isPaid : true,
      isRequired: isRequired !== undefined ? isRequired : false,
      description,
      isFlexible: isFlexible !== undefined ? isFlexible : false,
      flexibilityMinutes: flexibilityMinutes || 0,
      sortOrder: sortOrder || 0,
      createdBy
    });
    
    // Fetch complete break with relations
    const completeBreak = await ScheduleBreak.findByPk(breakItem.id, {
      include: [{
        model: Employee,
        as: 'creator',
        attributes: ['id', 'name', 'employeeCode']
      }]
    });
    
    res.status(201).json({
      message: 'Break created successfully',
      data: completeBreak
    });
  } catch (error) {
    console.error('Create break error:', error);
    res.status(500).json({ error: 'Server error creating break' });
  }
});

// Update break
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      startTime,
      endTime,
      breakType,
      isPaid,
      isRequired,
      description,
      isFlexible,
      flexibilityMinutes,
      sortOrder
    } = req.body;
    
    const breakItem = await ScheduleBreak.findByPk(id);
    if (!breakItem) {
      return res.status(404).json({ error: 'Break not found' });
    }
    
    // Validate time range if provided
    if (startTime && endTime) {
      const start = new Date(`1970-01-01T${startTime}`);
      const end = new Date(`1970-01-01T${endTime}`);
      if (start >= end) {
        return res.status(400).json({ 
          error: 'Start time must be before end time' 
        });
      }
      
      // Check for overlaps with other breaks
      const otherBreaks = await ScheduleBreak.findAll({
        where: {
          parentType: breakItem.parentType,
          parentId: breakItem.parentId,
          id: { [Op.ne]: id },
          isActive: true
        }
      });
      
      for (const otherBreak of otherBreaks) {
        const otherStart = new Date(`1970-01-01T${otherBreak.startTime}`);
        const otherEnd = new Date(`1970-01-01T${otherBreak.endTime}`);
        
        if (start < otherEnd && end > otherStart) {
          return res.status(400).json({ 
            error: `Break overlaps with existing break "${otherBreak.name}"` 
          });
        }
      }
    }
    
    // Validate break type if provided
    if (breakType) {
      const validBreakTypes = ScheduleBreak.getBreakTypes().map(t => t.value);
      if (!validBreakTypes.includes(breakType)) {
        return res.status(400).json({ 
          error: `Invalid break type. Valid types: ${validBreakTypes.join(', ')}` 
        });
      }
    }
    
    // Update break
    await breakItem.update({
      name: name !== undefined ? name : breakItem.name,
      startTime: startTime !== undefined ? startTime : breakItem.startTime,
      endTime: endTime !== undefined ? endTime : breakItem.endTime,
      breakType: breakType !== undefined ? breakType : breakItem.breakType,
      isPaid: isPaid !== undefined ? isPaid : breakItem.isPaid,
      isRequired: isRequired !== undefined ? isRequired : breakItem.isRequired,
      description: description !== undefined ? description : breakItem.description,
      isFlexible: isFlexible !== undefined ? isFlexible : breakItem.isFlexible,
      flexibilityMinutes: flexibilityMinutes !== undefined ? flexibilityMinutes : breakItem.flexibilityMinutes,
      sortOrder: sortOrder !== undefined ? sortOrder : breakItem.sortOrder
    });
    
    // Fetch updated break
    const updatedBreak = await ScheduleBreak.findByPk(id, {
      include: [{
        model: Employee,
        as: 'creator',
        attributes: ['id', 'name', 'employeeCode']
      }]
    });
    
    res.json({
      message: 'Break updated successfully',
      data: updatedBreak
    });
  } catch (error) {
    console.error('Update break error:', error);
    res.status(500).json({ error: 'Server error updating break' });
  }
});

// Delete break
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const breakItem = await ScheduleBreak.findByPk(id);
    if (!breakItem) {
      return res.status(404).json({ error: 'Break not found' });
    }
    
    await breakItem.destroy();
    
    res.json({ message: 'Break deleted successfully' });
  } catch (error) {
    console.error('Delete break error:', error);
    res.status(500).json({ error: 'Server error deleting break' });
  }
});

// Bulk create/update breaks for a parent
router.post('/bulk/:parentType/:parentId', async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { parentType, parentId } = req.params;
    const { breaks, createdBy, workStartTime, workEndTime } = req.body;
    
    // Validate required fields
    if (!breaks || !Array.isArray(breaks) || !createdBy) {
      await transaction.rollback();
      return res.status(400).json({ 
        error: 'breaks array and createdBy are required' 
      });
    }
    
    // Validate parent type
    const validParentTypes = ['schedule', 'template_day', 'daily_exception'];
    if (!validParentTypes.includes(parentType)) {
      await transaction.rollback();
      return res.status(400).json({ 
        error: `Invalid parent type. Valid types: ${validParentTypes.join(', ')}` 
      });
    }
    
    // Verify creator exists
    const creator = await Employee.findByPk(createdBy);
    if (!creator) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Creator employee not found' });
    }
    
    // Validate breaks if work hours are provided
    if (workStartTime && workEndTime) {
      const validation = await ScheduleBreak.validateBreaksForParent(
        parentType, 
        parentId, 
        breaks, 
        workStartTime, 
        workEndTime
      );
      
      if (!validation.isValid) {
        await transaction.rollback();
        return res.status(400).json({ 
          error: 'Break validation failed',
          validationErrors: validation.errors
        });
      }
    }
    
    // Update breaks for parent
    const createdBreaks = await ScheduleBreak.updateBreaksForParent(
      parentType,
      parentId,
      breaks,
      createdBy,
      transaction
    );
    
    await transaction.commit();
    
    // Fetch complete breaks with relations
    const completeBreaks = await ScheduleBreak.findAll({
      where: {
        parentType,
        parentId,
        isActive: true
      },
      include: [{
        model: Employee,
        as: 'creator',
        attributes: ['id', 'name', 'employeeCode']
      }],
      order: [['sort_order', 'ASC'], ['start_time', 'ASC']]
    });
    
    // Calculate stats
    const breakStats = ScheduleBreak.calculateTotalBreakTime(completeBreaks);
    
    res.status(201).json({
      message: `${createdBreaks.length} breaks updated successfully`,
      data: completeBreaks,
      stats: breakStats,
      summary: {
        total: createdBreaks.length,
        created: createdBreaks.length
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Bulk breaks error:', error);
    res.status(500).json({ error: 'Server error managing breaks' });
  }
});

// Reorder breaks for a parent
router.patch('/reorder/:parentType/:parentId', async (req, res) => {
  try {
    const { parentType, parentId } = req.params;
    const { breakIds } = req.body; // Array of break IDs in desired order
    
    if (!breakIds || !Array.isArray(breakIds)) {
      return res.status(400).json({ error: 'breakIds array is required' });
    }
    
    // Update sort order for each break
    for (let i = 0; i < breakIds.length; i++) {
      await ScheduleBreak.update(
        { sortOrder: i + 1 },
        { where: { id: breakIds[i], parentType, parentId } }
      );
    }
    
    // Fetch reordered breaks
    const reorderedBreaks = await ScheduleBreak.findAll({
      where: {
        parentType,
        parentId,
        isActive: true
      },
      include: [{
        model: Employee,
        as: 'creator',
        attributes: ['id', 'name', 'employeeCode']
      }],
      order: [['sort_order', 'ASC']]
    });
    
    res.json({
      message: 'Breaks reordered successfully',
      data: reorderedBreaks
    });
  } catch (error) {
    console.error('Reorder breaks error:', error);
    res.status(500).json({ error: 'Server error reordering breaks' });
  }
});

// Get break types (utility endpoint)
router.get('/utils/break-types', async (req, res) => {
  try {
    const breakTypes = ScheduleBreak.getBreakTypes();
    res.json({ data: breakTypes });
  } catch (error) {
    console.error('Get break types error:', error);
    res.status(500).json({ error: 'Server error fetching break types' });
  }
});

// Get default breaks template
router.get('/utils/default-breaks', async (req, res) => {
  try {
    const defaultBreaks = ScheduleBreak.getDefaultBreaks();
    res.json({ data: defaultBreaks });
  } catch (error) {
    console.error('Get default breaks error:', error);
    res.status(500).json({ error: 'Server error fetching default breaks' });
  }
});

// Validate breaks for work hours
router.post('/utils/validate', async (req, res) => {
  try {
    const { breaks, workStartTime, workEndTime } = req.body;
    
    if (!breaks || !Array.isArray(breaks) || !workStartTime || !workEndTime) {
      return res.status(400).json({ 
        error: 'breaks array, workStartTime, and workEndTime are required' 
      });
    }
    
    const validation = await ScheduleBreak.validateBreaksForParent(
      'validation', // Dummy parent type for validation
      'validation', // Dummy parent ID for validation
      breaks,
      workStartTime,
      workEndTime
    );
    
    const breakStats = ScheduleBreak.calculateTotalBreakTime(breaks);
    
    res.json({
      data: {
        validation,
        stats: breakStats,
        breaksCount: breaks.length
      }
    });
  } catch (error) {
    console.error('Validate breaks error:', error);
    res.status(500).json({ error: 'Server error validating breaks' });
  }
});

export default router;
