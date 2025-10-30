import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

export const Vacation = sequelize.define('Vacation', {
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
  type: {
    type: DataTypes.ENUM('vacation', 'sick_leave', 'personal', 'maternity', 'paternity', 'other'),
    allowNull: false,
    defaultValue: 'vacation'
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    allowNull: false,
    defaultValue: 'pending'
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true
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
  }
}, {
  tableName: 'vacations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['employee_id', 'start_date', 'end_date']
    },
    {
      fields: ['status']
    },
    {
      fields: ['type']
    }
  ]
});

// Instance methods
Vacation.prototype.getDurationInDays = function() {
  const start = new Date(this.startDate);
  const end = new Date(this.endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end dates
  return diffDays;
};

Vacation.prototype.isActive = function(date = new Date()) {
  const checkDate = new Date(date);
  const start = new Date(this.startDate);
  const end = new Date(this.endDate);
  
  return checkDate >= start && checkDate <= end && this.status === 'approved';
};

// Static methods
Vacation.getTypeLabel = function(type) {
  const types = {
    vacation: 'Vacaciones',
    sick_leave: 'Baja médica',
    personal: 'Asunto personal',
    maternity: 'Baja maternal',
    paternity: 'Baja paternal',
    other: 'Otro'
  };
  return types[type] || 'Desconocido';
};

Vacation.getStatusLabel = function(status) {
  const statuses = {
    pending: 'Pendiente',
    approved: 'Aprobado',
    rejected: 'Rechazado'
  };
  return statuses[status] || 'Desconocido';
};
