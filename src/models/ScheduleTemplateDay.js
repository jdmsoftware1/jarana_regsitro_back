import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

export const ScheduleTemplateDay = sequelize.define('ScheduleTemplateDay', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  templateId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'template_id',
    references: {
      model: 'schedule_templates',
      key: 'id'
    }
  },
  dayOfWeek: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'day_of_week',
    validate: {
      min: 0, // 0 = Domingo
      max: 6  // 6 = Sábado
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
  breakStartTime: {
    type: DataTypes.TIME,
    allowNull: true,
    field: 'break_start_time'
  },
  breakEndTime: {
    type: DataTypes.TIME,
    allowNull: true,
    field: 'break_end_time'
  },
  isWorkingDay: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_working_day'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'schedule_template_days',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['template_id', 'day_of_week'],
      unique: true
    },
    {
      fields: ['day_of_week']
    },
    {
      fields: ['template_id']
    }
  ]
});

// Instance methods
ScheduleTemplateDay.prototype.isWithinWorkingHours = function(time) {
  if (!this.isWorkingDay) return false;
  
  const checkTime = new Date(`1970-01-01T${time}`);
  const startTime = new Date(`1970-01-01T${this.startTime}`);
  const endTime = new Date(`1970-01-01T${this.endTime}`);
  
  return checkTime >= startTime && checkTime <= endTime;
};

ScheduleTemplateDay.prototype.isWithinBreakTime = function(time) {
  if (!this.breakStartTime || !this.breakEndTime) return false;
  
  const checkTime = new Date(`1970-01-01T${time}`);
  const breakStart = new Date(`1970-01-01T${this.breakStartTime}`);
  const breakEnd = new Date(`1970-01-01T${this.breakEndTime}`);
  
  return checkTime >= breakStart && checkTime <= breakEnd;
};

// Static method to get day name
ScheduleTemplateDay.getDayName = function(dayOfWeek) {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return days[dayOfWeek] || 'Desconocido';
};
