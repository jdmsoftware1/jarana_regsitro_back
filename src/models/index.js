import { Employee } from './Employee.js';
import { Record } from './Record.js';
import { Schedule } from './Schedule.js';
import { Vacation } from './Vacation.js';

// Define associations
Employee.hasMany(Record, {
  foreignKey: 'employeeId',
  as: 'records'
});

Record.belongsTo(Employee, {
  foreignKey: 'employeeId',
  as: 'employee'
});

Employee.hasMany(Schedule, {
  foreignKey: 'employeeId',
  as: 'schedules'
});

Schedule.belongsTo(Employee, {
  foreignKey: 'employeeId',
  as: 'employee'
});

Employee.hasMany(Vacation, {
  foreignKey: 'employeeId',
  as: 'vacations'
});

Vacation.belongsTo(Employee, {
  foreignKey: 'employeeId',
  as: 'employee'
});

Vacation.belongsTo(Employee, {
  foreignKey: 'approvedBy',
  as: 'approver'
});

export { Employee, Record, Schedule, Vacation };
