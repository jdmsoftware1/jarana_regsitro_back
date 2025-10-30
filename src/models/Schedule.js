import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

export const Schedule = sequelize.define('Schedule', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  employeeId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'employee_id',
    references: {
      model: 'employees',
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
  tableName: 'schedules',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['employee_id', 'day_of_week'],
      unique: true
    },
    {
      fields: ['day_of_week']
    }
  ]
});

// Instance methods
Schedule.prototype.isWithinWorkingHours = function(time) {
  if (!this.isWorkingDay) return false;
  
  const checkTime = new Date(`1970-01-01T${time}`);
  const startTime = new Date(`1970-01-01T${this.startTime}`);
  const endTime = new Date(`1970-01-01T${this.endTime}`);
  
  return checkTime >= startTime && checkTime <= endTime;
};

Schedule.prototype.isWithinBreakTime = function(time) {
  if (!this.breakStartTime || !this.breakEndTime) return false;
  
  const checkTime = new Date(`1970-01-01T${time}`);
  const breakStart = new Date(`1970-01-01T${this.breakStartTime}`);
  const breakEnd = new Date(`1970-01-01T${this.breakEndTime}`);
  
  return checkTime >= breakStart && checkTime <= breakEnd;
};

// Static method to get day name
Schedule.getDayName = function(dayOfWeek) {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return days[dayOfWeek] || 'Desconocido';
};
