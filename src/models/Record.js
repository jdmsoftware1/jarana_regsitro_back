import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

export const Record = sequelize.define('Record', {
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
  type: {
    type: DataTypes.ENUM('checkin', 'checkout'),
    allowNull: false
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  device: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'web'
  },
  location: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'records',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['employee_id', 'timestamp']
    },
    {
      fields: ['type']
    },
    {
      fields: ['timestamp']
    }
  ]
});
