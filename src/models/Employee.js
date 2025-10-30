import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import bcrypt from 'bcryptjs';

export const Employee = sequelize.define('Employee', {
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
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  employeeCode: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    field: 'employee_code'
  },
  pinHash: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'pin_hash'
  },
  role: {
    type: DataTypes.ENUM('admin', 'employee'),
    defaultValue: 'employee',
    allowNull: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  totpSecret: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'totp_secret'
  },
  qrCodeUrl: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'qr_code_url'
  }
}, {
  tableName: 'employees',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  hooks: {
    beforeCreate: async (employee) => {
      if (employee.pinHash) {
        employee.pinHash = await bcrypt.hash(employee.pinHash, 12);
      }
    },
    beforeUpdate: async (employee) => {
      if (employee.changed('pinHash')) {
        employee.pinHash = await bcrypt.hash(employee.pinHash, 12);
      }
    }
  }
});

// Instance methods
Employee.prototype.validatePin = async function(pin) {
  return await bcrypt.compare(pin, this.pinHash);
};

Employee.prototype.toJSON = function() {
  const values = { ...this.get() };
  delete values.pinHash;
  delete values.totpSecret;
  return values;
};
