import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

export const ScheduleBreak = sequelize.define('ScheduleBreak', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  // Referencia al horario padre (puede ser Schedule, ScheduleTemplateDay, o DailyScheduleException)
  parentType: {
    type: DataTypes.ENUM('schedule', 'template_day', 'daily_exception'),
    allowNull: false,
    field: 'parent_type'
  },
  parentId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'parent_id'
  },
  // Información de la pausa
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 100]
    }
  },
  startTime: {
    type: DataTypes.TIME,
    allowNull: false,
    field: 'start_time'
  },
  endTime: {
    type: DataTypes.TIME,
    allowNull: false,
    field: 'end_time'
  },
  breakType: {
    type: DataTypes.ENUM('paid', 'unpaid', 'meal', 'rest', 'personal', 'other'),
    allowNull: false,
    defaultValue: 'rest',
    field: 'break_type'
  },
  isPaid: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_paid'
  },
  isRequired: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_required'
  },
  duration: {
    type: DataTypes.INTEGER, // Duración en minutos
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Configuración de flexibilidad
  isFlexible: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_flexible'
  },
  flexibilityMinutes: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'flexibility_minutes',
    validate: {
      min: 0,
      max: 120
    }
  },
  // Orden de las pausas
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'sort_order'
  },
  // Estado
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by',
    references: {
      model: 'employees',
      key: 'id'
    }
  }
}, {
  tableName: 'schedule_breaks',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['parent_type', 'parent_id']
    },
    {
      fields: ['parent_id', 'sort_order']
    },
    {
      fields: ['break_type']
    },
    {
      fields: ['is_active']
    },
    {
      fields: ['start_time', 'end_time']
    }
  ]
});

// Instance methods
ScheduleBreak.prototype.toJSON = function() {
  const values = Object.assign({}, this.get());
  
  // Calcular duración si no está establecida
  if (!values.duration && values.startTime && values.endTime) {
    const start = new Date(`1970-01-01T${values.startTime}`);
    const end = new Date(`1970-01-01T${values.endTime}`);
    values.duration = Math.round((end - start) / (1000 * 60));
  }
  
  return values;
};

ScheduleBreak.prototype.getDurationMinutes = function() {
  if (this.duration) return this.duration;
  
  const start = new Date(`1970-01-01T${this.startTime}`);
  const end = new Date(`1970-01-01T${this.endTime}`);
  return Math.round((end - start) / (1000 * 60));
};

ScheduleBreak.prototype.isWithinTimeRange = function(checkTime) {
  const check = new Date(`1970-01-01T${checkTime}`);
  const start = new Date(`1970-01-01T${this.startTime}`);
  const end = new Date(`1970-01-01T${this.endTime}`);
  
  return check >= start && check <= end;
};

ScheduleBreak.prototype.hasFlexibilityConflict = function(otherBreak) {
  if (!this.isFlexible && !otherBreak.isFlexible) return false;
  
  const thisStart = new Date(`1970-01-01T${this.startTime}`);
  const thisEnd = new Date(`1970-01-01T${this.endTime}`);
  const otherStart = new Date(`1970-01-01T${otherBreak.startTime}`);
  const otherEnd = new Date(`1970-01-01T${otherBreak.endTime}`);
  
  // Añadir flexibilidad
  if (this.isFlexible) {
    thisStart.setMinutes(thisStart.getMinutes() - this.flexibilityMinutes);
    thisEnd.setMinutes(thisEnd.getMinutes() + this.flexibilityMinutes);
  }
  
  if (otherBreak.isFlexible) {
    otherStart.setMinutes(otherStart.getMinutes() - otherBreak.flexibilityMinutes);
    otherEnd.setMinutes(otherEnd.getMinutes() + otherBreak.flexibilityMinutes);
  }
  
  // Verificar solapamiento
  return (thisStart < otherEnd && thisEnd > otherStart);
};

ScheduleBreak.prototype.getFlexibleTimeRange = function() {
  if (!this.isFlexible) {
    return {
      earliestStart: this.startTime,
      latestStart: this.startTime,
      earliestEnd: this.endTime,
      latestEnd: this.endTime
    };
  }
  
  const start = new Date(`1970-01-01T${this.startTime}`);
  const end = new Date(`1970-01-01T${this.endTime}`);
  
  const earliestStart = new Date(start);
  earliestStart.setMinutes(start.getMinutes() - this.flexibilityMinutes);
  
  const latestStart = new Date(start);
  latestStart.setMinutes(start.getMinutes() + this.flexibilityMinutes);
  
  const earliestEnd = new Date(end);
  earliestEnd.setMinutes(end.getMinutes() - this.flexibilityMinutes);
  
  const latestEnd = new Date(end);
  latestEnd.setMinutes(end.getMinutes() + this.flexibilityMinutes);
  
  return {
    earliestStart: earliestStart.toTimeString().slice(0, 5),
    latestStart: latestStart.toTimeString().slice(0, 5),
    earliestEnd: earliestEnd.toTimeString().slice(0, 5),
    latestEnd: latestEnd.toTimeString().slice(0, 5)
  };
};

// Static methods
ScheduleBreak.getBreakTypes = function() {
  return [
    { value: 'paid', label: 'Pausa Pagada', isPaid: true },
    { value: 'unpaid', label: 'Pausa No Pagada', isPaid: false },
    { value: 'meal', label: 'Comida', isPaid: false },
    { value: 'rest', label: 'Descanso', isPaid: true },
    { value: 'personal', label: 'Personal', isPaid: false },
    { value: 'other', label: 'Otro', isPaid: true }
  ];
};

ScheduleBreak.findByParent = async function(parentType, parentId) {
  return await this.findAll({
    where: {
      parentType,
      parentId,
      isActive: true
    },
    order: [['sort_order', 'ASC'], ['start_time', 'ASC']]
  });
};

ScheduleBreak.validateBreaksForParent = async function(parentType, parentId, breaks, workStartTime, workEndTime) {
  const errors = [];
  const workStart = new Date(`1970-01-01T${workStartTime}`);
  const workEnd = new Date(`1970-01-01T${workEndTime}`);
  
  // Validar cada pausa individualmente
  for (let i = 0; i < breaks.length; i++) {
    const breakItem = breaks[i];
    const breakStart = new Date(`1970-01-01T${breakItem.startTime}`);
    const breakEnd = new Date(`1970-01-01T${breakItem.endTime}`);
    
    // Validar que la pausa esté dentro del horario laboral
    if (breakStart < workStart || breakEnd > workEnd) {
      errors.push({
        breakIndex: i,
        type: 'outside_work_hours',
        message: `Break "${breakItem.name}" is outside work hours (${workStartTime} - ${workEndTime})`,
        breakName: breakItem.name
      });
    }
    
    // Validar que hora inicio < hora fin
    if (breakStart >= breakEnd) {
      errors.push({
        breakIndex: i,
        type: 'invalid_time_range',
        message: `Break "${breakItem.name}" start time must be before end time`,
        breakName: breakItem.name
      });
    }
    
    // Validar solapamientos con otras pausas
    for (let j = i + 1; j < breaks.length; j++) {
      const otherBreak = breaks[j];
      const otherStart = new Date(`1970-01-01T${otherBreak.startTime}`);
      const otherEnd = new Date(`1970-01-01T${otherBreak.endTime}`);
      
      // Verificar solapamiento básico
      if (breakStart < otherEnd && breakEnd > otherStart) {
        errors.push({
          breakIndex: i,
          conflictIndex: j,
          type: 'break_overlap',
          message: `Break "${breakItem.name}" overlaps with "${otherBreak.name}"`,
          breakName: breakItem.name,
          conflictName: otherBreak.name
        });
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

ScheduleBreak.calculateTotalBreakTime = function(breaks, includeUnpaid = true) {
  let totalMinutes = 0;
  let paidMinutes = 0;
  let unpaidMinutes = 0;
  
  breaks.forEach(breakItem => {
    const duration = breakItem.getDurationMinutes ? breakItem.getDurationMinutes() : breakItem.duration || 0;
    
    totalMinutes += duration;
    
    if (breakItem.isPaid) {
      paidMinutes += duration;
    } else {
      unpaidMinutes += duration;
    }
  });
  
  return {
    total: totalMinutes,
    paid: paidMinutes,
    unpaid: unpaidMinutes,
    totalHours: Math.round((totalMinutes / 60) * 100) / 100,
    paidHours: Math.round((paidMinutes / 60) * 100) / 100,
    unpaidHours: Math.round((unpaidMinutes / 60) * 100) / 100
  };
};

ScheduleBreak.getDefaultBreaks = function() {
  return [
    {
      name: 'Desayuno',
      startTime: '10:00',
      endTime: '10:15',
      breakType: 'rest',
      isPaid: true,
      isRequired: false,
      sortOrder: 1
    },
    {
      name: 'Almuerzo',
      startTime: '13:00',
      endTime: '14:00',
      breakType: 'meal',
      isPaid: false,
      isRequired: true,
      sortOrder: 2
    },
    {
      name: 'Merienda',
      startTime: '16:00',
      endTime: '16:15',
      breakType: 'rest',
      isPaid: true,
      isRequired: false,
      sortOrder: 3
    }
  ];
};

ScheduleBreak.bulkCreateForParent = async function(parentType, parentId, breaks, createdBy, transaction = null) {
  const createdBreaks = [];
  
  for (let i = 0; i < breaks.length; i++) {
    const breakData = {
      ...breaks[i],
      parentType,
      parentId,
      createdBy,
      sortOrder: breaks[i].sortOrder || i + 1
    };
    
    const createdBreak = await this.create(breakData, { transaction });
    createdBreaks.push(createdBreak);
  }
  
  return createdBreaks;
};

ScheduleBreak.updateBreaksForParent = async function(parentType, parentId, breaks, createdBy, transaction = null) {
  // Eliminar pausas existentes
  await this.destroy({
    where: { parentType, parentId },
    transaction
  });
  
  // Crear nuevas pausas
  return await this.bulkCreateForParent(parentType, parentId, breaks, createdBy, transaction);
};
