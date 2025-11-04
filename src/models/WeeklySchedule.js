import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

export const WeeklySchedule = sequelize.define('WeeklySchedule', {
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
  year: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 2024,
      max: 2030
    }
  },
  weekNumber: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'week_number',
    validate: {
      min: 1,
      max: 53
    }
  },
  templateId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'template_id',
    references: {
      model: 'schedule_templates',
      key: 'id'
    }
  },
  startDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'start_date'
  },
  endDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'end_date'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
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
  tableName: 'weekly_schedules',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['employee_id', 'year', 'week_number'],
      unique: true
    },
    {
      fields: ['year', 'week_number']
    },
    {
      fields: ['employee_id', 'start_date', 'end_date']
    },
    {
      fields: ['template_id']
    },
    {
      fields: ['is_active']
    }
  ]
});

// Instance methods
WeeklySchedule.prototype.toJSON = function() {
  const values = Object.assign({}, this.get());
  return values;
};

// Static methods
WeeklySchedule.getWeekNumber = function(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
};

WeeklySchedule.getWeekDates = function(year, weekNumber) {
  const simple = new Date(year, 0, 1 + (weekNumber - 1) * 7);
  const dow = simple.getDay();
  const ISOweekStart = simple;
  if (dow <= 4) {
    ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  } else {
    ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
  }
  
  const startDate = new Date(ISOweekStart);
  const endDate = new Date(ISOweekStart);
  endDate.setDate(startDate.getDate() + 6);
  
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  };
};

WeeklySchedule.getCurrentWeek = function() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    weekNumber: WeeklySchedule.getWeekNumber(now)
  };
};

WeeklySchedule.getWeeksInYear = function(year) {
  const dec31 = new Date(year, 11, 31);
  const weekNumber = WeeklySchedule.getWeekNumber(dec31);
  return weekNumber === 1 ? 52 : weekNumber;
};
