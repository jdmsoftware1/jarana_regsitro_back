import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

export const ScheduleTemplate = sequelize.define('ScheduleTemplate', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 100]
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
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
  tableName: 'schedule_templates',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['name'],
      unique: true
    },
    {
      fields: ['is_active']
    },
    {
      fields: ['created_by']
    }
  ]
});

// Instance methods
ScheduleTemplate.prototype.toJSON = function() {
  const values = Object.assign({}, this.get());
  return values;
};

// Static method to get active templates
ScheduleTemplate.getActiveTemplates = async function() {
  return await this.findAll({
    where: { isActive: true },
    order: [['name', 'ASC']]
  });
};
