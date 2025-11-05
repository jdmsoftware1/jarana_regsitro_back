import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

export const DailyScheduleException = sequelize.define('DailyScheduleException', {
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
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    validate: {
      isDate: true
    }
  },
  exceptionType: {
    type: DataTypes.ENUM('custom_hours', 'day_off', 'holiday', 'vacation', 'sick_leave', 'special_event'),
    allowNull: false,
    field: 'exception_type'
  },
  startTime: {
    type: DataTypes.TIME,
    allowNull: true,
    field: 'start_time'
  },
  endTime: {
    type: DataTypes.TIME,
    allowNull: true,
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
  reason: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [0, 255]
    }
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  approvedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'approved_by',
    references: {
      model: 'employees',
      key: 'id'
    }
  },
  approvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'approved_at'
  },
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
  tableName: 'daily_schedule_exceptions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['employee_id', 'date'],
      unique: true
    },
    {
      fields: ['date']
    },
    {
      fields: ['exception_type']
    },
    {
      fields: ['employee_id', 'date', 'is_active']
    },
    {
      fields: ['approved_by']
    },
    {
      fields: ['created_by']
    }
  ]
});

// Instance methods
DailyScheduleException.prototype.toJSON = function() {
  const values = Object.assign({}, this.get());
  return values;
};

DailyScheduleException.prototype.approve = async function(approverId) {
  this.approvedBy = approverId;
  this.approvedAt = new Date();
  return await this.save();
};

DailyScheduleException.prototype.isApproved = function() {
  return this.approvedBy !== null && this.approvedAt !== null;
};

DailyScheduleException.prototype.isWithinWorkingHours = function(time) {
  if (!this.isWorkingDay || !this.startTime || !this.endTime) return false;
  
  const checkTime = new Date(`1970-01-01T${time}`);
  const startTime = new Date(`1970-01-01T${this.startTime}`);
  const endTime = new Date(`1970-01-01T${this.endTime}`);
  
  return checkTime >= startTime && checkTime <= endTime;
};

DailyScheduleException.prototype.isWithinBreakTime = function(time) {
  if (!this.breakStartTime || !this.breakEndTime) return false;
  
  const checkTime = new Date(`1970-01-01T${time}`);
  const breakStart = new Date(`1970-01-01T${this.breakStartTime}`);
  const breakEnd = new Date(`1970-01-01T${this.breakEndTime}`);
  
  return checkTime >= breakStart && checkTime <= breakEnd;
};

// Static methods
DailyScheduleException.getExceptionTypes = function() {
  return [
    { value: 'custom_hours', label: 'Horario Personalizado', requiresHours: true },
    { value: 'day_off', label: 'Día Libre', requiresHours: false },
    { value: 'holiday', label: 'Día Festivo', requiresHours: false },
    { value: 'vacation', label: 'Vacaciones', requiresHours: false },
    { value: 'sick_leave', label: 'Baja Médica', requiresHours: false },
    { value: 'special_event', label: 'Evento Especial', requiresHours: true }
  ];
};

DailyScheduleException.findByDateRange = async function(employeeId, startDate, endDate) {
  const { Op } = await import('sequelize');
  return await this.findAll({
    where: {
      employeeId,
      date: {
        [Op.between]: [startDate, endDate]
      },
      isActive: true
    },
    order: [['date', 'ASC']]
  });
};

DailyScheduleException.findByMonth = async function(employeeId, year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  
  return await DailyScheduleException.findByDateRange(
    employeeId,
    startDate.toISOString().split('T')[0],
    endDate.toISOString().split('T')[0]
  );
};
