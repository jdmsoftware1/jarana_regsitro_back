// Servicio para gestión avanzada de horarios semanales
import { Op } from 'sequelize';
import { WeeklySchedule, DailyScheduleException, ScheduleTemplate, ScheduleTemplateDay, Employee } from '../models/index.js';

export class WeeklyScheduleService {
  
  /**
   * Obtiene el horario efectivo de un empleado para una fecha específica
   * Considera plantillas semanales y excepciones diarias
   */
  static async getEffectiveScheduleForDate(employeeId, date) {
    try {
      const targetDate = new Date(date);
      const year = targetDate.getFullYear();
      const weekNumber = WeeklySchedule.getWeekNumber(targetDate);
      const dayOfWeek = targetDate.getDay();
      
      // 1. Verificar si hay excepción diaria para esta fecha
      const dailyException = await DailyScheduleException.findOne({
        where: {
          employeeId,
          date: date,
          isActive: true
        }
      });
      
      if (dailyException) {
        return {
          type: 'daily_exception',
          source: 'daily_exception',
          data: dailyException,
          isWorkingDay: dailyException.isWorkingDay,
          startTime: dailyException.startTime,
          endTime: dailyException.endTime,
          breakStartTime: dailyException.breakStartTime,
          breakEndTime: dailyException.breakEndTime,
          notes: dailyException.notes,
          reason: dailyException.reason
        };
      }
      
      // 2. Buscar horario semanal para esta semana
      const weeklySchedule = await WeeklySchedule.findOne({
        where: {
          employeeId,
          year,
          weekNumber
        },
        include: [{
          model: ScheduleTemplate,
          as: 'template',
          include: [{
            model: ScheduleTemplateDay,
            as: 'templateDays',
            where: { dayOfWeek },
            required: false
          }]
        }]
      });
      
      if (weeklySchedule && weeklySchedule.template && weeklySchedule.template.templateDays.length > 0) {
        const templateDay = weeklySchedule.template.templateDays[0];
        return {
          type: 'weekly_template',
          source: 'weekly_schedule',
          data: {
            weeklySchedule,
            templateDay
          },
          isWorkingDay: templateDay.isWorkingDay,
          startTime: templateDay.startTime,
          endTime: templateDay.endTime,
          breakStartTime: templateDay.breakStartTime,
          breakEndTime: templateDay.breakEndTime,
          notes: templateDay.notes,
          weekNotes: weeklySchedule.notes
        };
      }
      
      // 3. Buscar horario regular (Schedule) como fallback
      const { Schedule } = await import('../models/index.js');
      const regularSchedule = await Schedule.findOne({
        where: {
          employeeId,
          dayOfWeek
        }
      });
      
      if (regularSchedule) {
        return {
          type: 'regular_schedule',
          source: 'regular_schedule',
          data: regularSchedule,
          isWorkingDay: regularSchedule.isWorkingDay,
          startTime: regularSchedule.startTime,
          endTime: regularSchedule.endTime,
          breakStartTime: regularSchedule.breakStartTime,
          breakEndTime: regularSchedule.breakEndTime,
          notes: regularSchedule.notes
        };
      }
      
      // 4. No hay horario definido
      return {
        type: 'no_schedule',
        source: 'none',
        data: null,
        isWorkingDay: false,
        startTime: null,
        endTime: null,
        breakStartTime: null,
        breakEndTime: null,
        notes: 'No hay horario definido para esta fecha'
      };
      
    } catch (error) {
      console.error('Error getting effective schedule:', error);
      throw error;
    }
  }
  
  /**
   * Obtiene el horario efectivo para un rango de fechas
   */
  static async getEffectiveScheduleForDateRange(employeeId, startDate, endDate) {
    try {
      const schedules = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
        const dateStr = date.toISOString().split('T')[0];
        const schedule = await this.getEffectiveScheduleForDate(employeeId, dateStr);
        schedules.push({
          date: dateStr,
          dayOfWeek: date.getDay(),
          ...schedule
        });
      }
      
      return schedules;
    } catch (error) {
      console.error('Error getting effective schedule for date range:', error);
      throw error;
    }
  }
  
  /**
   * Planifica horarios para todo un año usando plantillas
   */
  static async planifyYearWithTemplate(employeeId, year, templateId, createdBy, options = {}) {
    try {
      const {
        skipExistingWeeks = false,
        specificWeeks = null, // Array de números de semana específicos
        excludeWeeks = [], // Array de números de semana a excluir
        notes = null
      } = options;
      
      // Verificar que la plantilla existe
      const template = await ScheduleTemplate.findOne({
        where: { id: templateId, isActive: true }
      });
      
      if (!template) {
        throw new Error('Template not found or inactive');
      }
      
      const totalWeeks = WeeklySchedule.getWeeksInYear(year);
      const weeksToProcess = specificWeeks || Array.from({ length: totalWeeks }, (_, i) => i + 1);
      const results = [];
      const errors = [];
      
      for (const weekNumber of weeksToProcess) {
        try {
          // Saltar semanas excluidas
          if (excludeWeeks.includes(weekNumber)) {
            continue;
          }
          
          // Verificar si ya existe horario para esta semana
          if (skipExistingWeeks) {
            const existing = await WeeklySchedule.findOne({
              where: { employeeId, year, weekNumber }
            });
            if (existing) {
              continue;
            }
          }
          
          // Calcular fechas de la semana
          const { startDate, endDate } = WeeklySchedule.getWeekDates(year, weekNumber);
          
          // Crear o actualizar horario semanal
          const [weeklySchedule, created] = await WeeklySchedule.upsert({
            employeeId,
            year,
            weekNumber,
            templateId,
            startDate,
            endDate,
            notes: notes || `Planificación anual con plantilla: ${template.name}`,
            createdBy
          });
          
          results.push({
            weekNumber,
            action: created ? 'created' : 'updated',
            startDate,
            endDate
          });
          
        } catch (error) {
          errors.push({
            weekNumber,
            error: error.message
          });
        }
      }
      
      return {
        success: true,
        template: {
          id: template.id,
          name: template.name
        },
        summary: {
          totalWeeksProcessed: weeksToProcess.length,
          successful: results.length,
          failed: errors.length,
          skipped: weeksToProcess.length - results.length - errors.length
        },
        results,
        errors
      };
      
    } catch (error) {
      console.error('Error planifying year with template:', error);
      throw error;
    }
  }
  
  /**
   * Crea excepciones masivas para días festivos
   */
  static async createHolidayExceptions(employeeIds, holidays, createdBy) {
    try {
      const results = [];
      const errors = [];
      
      for (const employeeId of employeeIds) {
        // Verificar que el empleado existe
        const employee = await Employee.findByPk(employeeId);
        if (!employee) {
          errors.push({
            employeeId,
            error: 'Employee not found'
          });
          continue;
        }
        
        for (const holiday of holidays) {
          try {
            const { date, reason, notes } = holiday;
            
            // Verificar si ya existe excepción para esta fecha
            const existing = await DailyScheduleException.findOne({
              where: { employeeId, date, isActive: true }
            });
            
            if (existing) {
              errors.push({
                employeeId,
                date,
                error: 'Exception already exists'
              });
              continue;
            }
            
            // Crear excepción
            const exception = await DailyScheduleException.create({
              employeeId,
              date,
              exceptionType: 'holiday',
              isWorkingDay: false,
              reason,
              notes,
              createdBy
            });
            
            results.push({
              employeeId,
              employeeName: employee.name,
              date,
              reason,
              exceptionId: exception.id
            });
            
          } catch (error) {
            errors.push({
              employeeId,
              date: holiday.date,
              error: error.message
            });
          }
        }
      }
      
      return {
        success: true,
        summary: {
          totalOperations: employeeIds.length * holidays.length,
          successful: results.length,
          failed: errors.length
        },
        results,
        errors
      };
      
    } catch (error) {
      console.error('Error creating holiday exceptions:', error);
      throw error;
    }
  }
  
  /**
   * Obtiene estadísticas de planificación para un empleado
   */
  static async getSchedulingStats(employeeId, year) {
    try {
      const totalWeeks = WeeklySchedule.getWeeksInYear(year);
      
      // Contar horarios semanales
      const weeklySchedulesCount = await WeeklySchedule.count({
        where: { employeeId, year }
      });
      
      // Contar excepciones diarias
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;
      const dailyExceptionsCount = await DailyScheduleException.count({
        where: {
          employeeId,
          date: {
            [Op.between]: [yearStart, yearEnd]
          },
          isActive: true
        }
      });
      
      // Obtener plantillas más usadas
      const templateUsage = await WeeklySchedule.findAll({
        where: { employeeId, year },
        attributes: ['templateId'],
        include: [{
          model: ScheduleTemplate,
          as: 'template',
          attributes: ['id', 'name']
        }],
        group: ['templateId', 'template.id', 'template.name'],
        raw: false
      });
      
      // Calcular porcentajes
      const scheduledWeeksPercentage = ((weeklySchedulesCount / totalWeeks) * 100).toFixed(1);
      const unscheduledWeeks = totalWeeks - weeklySchedulesCount;
      
      return {
        year,
        totalWeeks,
        scheduledWeeks: weeklySchedulesCount,
        unscheduledWeeks,
        scheduledWeeksPercentage: parseFloat(scheduledWeeksPercentage),
        dailyExceptions: dailyExceptionsCount,
        templatesUsed: templateUsage.length,
        templateUsageDetails: templateUsage.map(wu => ({
          templateId: wu.templateId,
          templateName: wu.template?.name || 'Unknown',
          weeksUsed: 1 // Esto necesitaría una consulta más compleja para contar exactamente
        }))
      };
      
    } catch (error) {
      console.error('Error getting scheduling stats:', error);
      throw error;
    }
  }
  
  /**
   * Valida conflictos de horarios
   */
  static async validateScheduleConflicts(employeeId, startDate, endDate) {
    try {
      const conflicts = [];
      
      // Obtener todos los horarios efectivos para el rango
      const schedules = await this.getEffectiveScheduleForDateRange(employeeId, startDate, endDate);
      
      for (const schedule of schedules) {
        // Verificar solapamientos de horarios
        if (schedule.isWorkingDay && schedule.startTime && schedule.endTime) {
          const start = new Date(`1970-01-01T${schedule.startTime}`);
          const end = new Date(`1970-01-01T${schedule.endTime}`);
          
          if (start >= end) {
            conflicts.push({
              date: schedule.date,
              type: 'invalid_time_range',
              message: 'Start time must be before end time',
              startTime: schedule.startTime,
              endTime: schedule.endTime
            });
          }
          
          // Verificar que el descanso esté dentro del horario laboral
          if (schedule.breakStartTime && schedule.breakEndTime) {
            const breakStart = new Date(`1970-01-01T${schedule.breakStartTime}`);
            const breakEnd = new Date(`1970-01-01T${schedule.breakEndTime}`);
            
            if (breakStart < start || breakEnd > end) {
              conflicts.push({
                date: schedule.date,
                type: 'break_outside_work_hours',
                message: 'Break time must be within work hours',
                workHours: `${schedule.startTime} - ${schedule.endTime}`,
                breakHours: `${schedule.breakStartTime} - ${schedule.breakEndTime}`
              });
            }
            
            if (breakStart >= breakEnd) {
              conflicts.push({
                date: schedule.date,
                type: 'invalid_break_range',
                message: 'Break start time must be before break end time',
                breakStartTime: schedule.breakStartTime,
                breakEndTime: schedule.breakEndTime
              });
            }
          }
        }
      }
      
      return {
        hasConflicts: conflicts.length > 0,
        conflictCount: conflicts.length,
        conflicts
      };
      
    } catch (error) {
      console.error('Error validating schedule conflicts:', error);
      throw error;
    }
  }
}
