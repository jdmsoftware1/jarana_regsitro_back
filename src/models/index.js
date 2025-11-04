import { Employee } from './Employee.js';
import { Record } from './Record.js';
import { Schedule } from './Schedule.js';
import { ScheduleTemplate } from './ScheduleTemplate.js';
import { ScheduleTemplateDay } from './ScheduleTemplateDay.js';
import { WeeklySchedule } from './WeeklySchedule.js';
import { DailyScheduleException } from './DailyScheduleException.js';
import { ScheduleBreak } from './ScheduleBreak.js';
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

// Weekly Schedule associations
Employee.hasMany(WeeklySchedule, {
  foreignKey: 'employeeId',
  as: 'weeklySchedules'
});

WeeklySchedule.belongsTo(Employee, {
  foreignKey: 'employeeId',
  as: 'employee'
});

WeeklySchedule.belongsTo(ScheduleTemplate, {
  foreignKey: 'templateId',
  as: 'template'
});

ScheduleTemplate.hasMany(WeeklySchedule, {
  foreignKey: 'templateId',
  as: 'weeklySchedules'
});

WeeklySchedule.belongsTo(Employee, {
  foreignKey: 'createdBy',
  as: 'creator'
});

Employee.hasMany(WeeklySchedule, {
  foreignKey: 'createdBy',
  as: 'createdWeeklySchedules'
});

// Daily Schedule Exception associations
Employee.hasMany(DailyScheduleException, {
  foreignKey: 'employeeId',
  as: 'scheduleExceptions'
});

DailyScheduleException.belongsTo(Employee, {
  foreignKey: 'employeeId',
  as: 'employee'
});

DailyScheduleException.belongsTo(Employee, {
  foreignKey: 'createdBy',
  as: 'creator'
});

Employee.hasMany(DailyScheduleException, {
  foreignKey: 'createdBy',
  as: 'createdExceptions'
});

DailyScheduleException.belongsTo(Employee, {
  foreignKey: 'approvedBy',
  as: 'approver'
});

Employee.hasMany(DailyScheduleException, {
  foreignKey: 'approvedBy',
  as: 'approvedExceptions'
});

// Schedule Break associations
Employee.hasMany(ScheduleBreak, {
  foreignKey: 'createdBy',
  as: 'createdBreaks'
});

ScheduleBreak.belongsTo(Employee, {
  foreignKey: 'createdBy',
  as: 'creator'
});

// Note: ScheduleBreak uses polymorphic associations via parentType/parentId
// The actual relationships are handled in the service layer

export { Employee, Record, Schedule, ScheduleTemplate, ScheduleTemplateDay, WeeklySchedule, DailyScheduleException, ScheduleBreak, Vacation };
