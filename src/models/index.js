import { Employee } from './Employee.js';
import { Record } from './Record.js';
import { Schedule } from './Schedule.js';
import { ScheduleTemplate } from './ScheduleTemplate.js';
import { ScheduleTemplateDay } from './ScheduleTemplateDay.js';
import { TimeRecord } from './TimeRecord.js';
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

// Schedule Template associations
Employee.hasMany(ScheduleTemplate, {
  foreignKey: 'createdBy',
  as: 'createdTemplates'
});

ScheduleTemplate.belongsTo(Employee, {
  foreignKey: 'createdBy',
  as: 'creator'
});

ScheduleTemplate.hasMany(ScheduleTemplateDay, {
  foreignKey: 'templateId',
  as: 'templateDays'
});

ScheduleTemplateDay.belongsTo(ScheduleTemplate, {
  foreignKey: 'templateId',
  as: 'template'
});

// Schedule to Template association
Schedule.belongsTo(ScheduleTemplate, {
  foreignKey: 'templateId',
  as: 'template'
});

ScheduleTemplate.hasMany(Schedule, {
  foreignKey: 'templateId',
  as: 'schedules'
});

export { Employee, Record, Schedule, ScheduleTemplate, ScheduleTemplateDay, Vacation };
