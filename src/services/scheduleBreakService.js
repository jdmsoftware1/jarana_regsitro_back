// Servicio para gestión avanzada de pausas de horarios
import { Op } from 'sequelize';
import { ScheduleBreak, Schedule, ScheduleTemplate, ScheduleTemplateDay, DailyScheduleException, Employee } from '../models/index.js';
import sequelize from '../config/database.js';

export class ScheduleBreakService {
  
  /**
   * Obtiene todas las pausas efectivas para un horario específico
   * Considera la jerarquía: DailyException > WeeklySchedule > Schedule
   */
  static async getEffectiveBreaksForSchedule(employeeId, date) {
    try {
      // 1. Buscar excepción diaria primero
      const dailyException = await DailyScheduleException.findOne({
        where: {
          employeeId,
          date,
          isActive: true
        }
      });
      
      if (dailyException) {
        const breaks = await ScheduleBreak.findByParent('daily_exception', dailyException.id);
        return {
          source: 'daily_exception',
          sourceId: dailyException.id,
          breaks,
          workStartTime: dailyException.startTime,
          workEndTime: dailyException.endTime,
          isWorkingDay: dailyException.isWorkingDay
        };
      }
      
      // 2. Buscar horario semanal
      const { WeeklySchedule } = await import('../models/index.js');
      const targetDate = new Date(date);
      const year = targetDate.getFullYear();
      const weekNumber = WeeklySchedule.getWeekNumber(targetDate);
      const dayOfWeek = targetDate.getDay();
      
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
        const breaks = await ScheduleBreak.findByParent('template_day', templateDay.id);
        return {
          source: 'weekly_template',
          sourceId: templateDay.id,
          breaks,
          workStartTime: templateDay.startTime,
          workEndTime: templateDay.endTime,
          isWorkingDay: templateDay.isWorkingDay
        };
      }
      
      // 3. Buscar horario regular
      const regularSchedule = await Schedule.findOne({
        where: {
          employeeId,
          dayOfWeek
        }
      });
      
      if (regularSchedule) {
        const breaks = await ScheduleBreak.findByParent('schedule', regularSchedule.id);
        return {
          source: 'regular_schedule',
          sourceId: regularSchedule.id,
          breaks,
          workStartTime: regularSchedule.startTime,
          workEndTime: regularSchedule.endTime,
          isWorkingDay: regularSchedule.isWorkingDay
        };
      }
      
      // 4. No hay horario definido
      return {
        source: 'none',
        sourceId: null,
        breaks: [],
        workStartTime: null,
        workEndTime: null,
        isWorkingDay: false
      };
      
    } catch (error) {
      console.error('Error getting effective breaks:', error);
      throw error;
    }
  }
  
  /**
   * Calcula el tiempo de trabajo efectivo considerando las pausas
   */
  static calculateEffectiveWorkTime(workStartTime, workEndTime, breaks) {
    if (!workStartTime || !workEndTime) return null;
    
    const workStart = new Date(`1970-01-01T${workStartTime}`);
    const workEnd = new Date(`1970-01-01T${workEndTime}`);
    const totalWorkMinutes = (workEnd - workStart) / (1000 * 60);
    
    const breakStats = ScheduleBreak.calculateTotalBreakTime(breaks);
    
    return {
      totalWorkMinutes,
      totalBreakMinutes: breakStats.total,
      paidBreakMinutes: breakStats.paid,
      unpaidBreakMinutes: breakStats.unpaid,
      effectiveWorkMinutes: totalWorkMinutes - breakStats.unpaid,
      effectivePaidMinutes: totalWorkMinutes - breakStats.unpaid,
      totalHours: Math.round((totalWorkMinutes / 60) * 100) / 100,
      effectiveHours: Math.round(((totalWorkMinutes - breakStats.unpaid) / 60) * 100) / 100,
      breakHours: breakStats.totalHours,
      paidBreakHours: breakStats.paidHours,
      unpaidBreakHours: breakStats.unpaidHours
    };
  }
  
  /**
   * Aplica pausas de una plantilla a múltiples horarios
   */
  static async applyTemplateBreaksToSchedules(templateDayId, scheduleIds, createdBy) {
    const transaction = await sequelize.transaction();
    
    try {
      // Obtener pausas de la plantilla
      const templateBreaks = await ScheduleBreak.findByParent('template_day', templateDayId);
      
      if (templateBreaks.length === 0) {
        await transaction.rollback();
        return {
          success: true,
          message: 'No breaks found in template',
          results: []
        };
      }
      
      const results = [];
      
      for (const scheduleId of scheduleIds) {
        try {
          // Verificar que el horario existe
          const schedule = await Schedule.findByPk(scheduleId);
          if (!schedule) {
            results.push({
              scheduleId,
              success: false,
              error: 'Schedule not found'
            });
            continue;
          }
          
          // Preparar pausas para el horario
          const breaksToCreate = templateBreaks.map(templateBreak => ({
            name: templateBreak.name,
            startTime: templateBreak.startTime,
            endTime: templateBreak.endTime,
            breakType: templateBreak.breakType,
            isPaid: templateBreak.isPaid,
            isRequired: templateBreak.isRequired,
            description: templateBreak.description,
            isFlexible: templateBreak.isFlexible,
            flexibilityMinutes: templateBreak.flexibilityMinutes,
            sortOrder: templateBreak.sortOrder
          }));
          
          // Aplicar pausas al horario
          await ScheduleBreak.updateBreaksForParent(
            'schedule',
            scheduleId,
            breaksToCreate,
            createdBy,
            transaction
          );
          
          results.push({
            scheduleId,
            success: true,
            breaksApplied: breaksToCreate.length
          });
          
        } catch (error) {
          results.push({
            scheduleId,
            success: false,
            error: error.message
          });
        }
      }
      
      await transaction.commit();
      
      const successCount = results.filter(r => r.success).length;
      
      return {
        success: true,
        message: `Template breaks applied to ${successCount}/${scheduleIds.length} schedules`,
        results,
        summary: {
          total: scheduleIds.length,
          successful: successCount,
          failed: scheduleIds.length - successCount
        }
      };
      
    } catch (error) {
      await transaction.rollback();
      console.error('Error applying template breaks:', error);
      throw error;
    }
  }
  
  /**
   * Crea pausas estándar para múltiples empleados
   */
  static async createStandardBreaksForEmployees(employeeIds, parentType, createdBy, options = {}) {
    try {
      const {
        useDefaultBreaks = true,
        customBreaks = null,
        workStartTime = '09:00',
        workEndTime = '17:00'
      } = options;
      
      const breaksTemplate = customBreaks || (useDefaultBreaks ? ScheduleBreak.getDefaultBreaks() : []);
      
      if (breaksTemplate.length === 0) {
        return {
          success: false,
          message: 'No breaks template provided',
          results: []
        };
      }
      
      const results = [];
      
      for (const employeeId of employeeIds) {
        try {
          // Verificar que el empleado existe
          const employee = await Employee.findByPk(employeeId);
          if (!employee) {
            results.push({
              employeeId,
              success: false,
              error: 'Employee not found'
            });
            continue;
          }
          
          // Obtener horarios del empleado según el tipo
          let schedules = [];
          
          if (parentType === 'schedule') {
            schedules = await Schedule.findAll({
              where: { employeeId }
            });
          } else if (parentType === 'template_day') {
            // Para template days, necesitaríamos más lógica específica
            results.push({
              employeeId,
              success: false,
              error: 'Template day application not implemented in this method'
            });
            continue;
          }
          
          let appliedCount = 0;
          
          for (const schedule of schedules) {
            try {
              // Validar pausas contra horario de trabajo
              const validation = await ScheduleBreak.validateBreaksForParent(
                'schedule',
                schedule.id,
                breaksTemplate,
                schedule.startTime || workStartTime,
                schedule.endTime || workEndTime
              );
              
              if (validation.isValid) {
                await ScheduleBreak.updateBreaksForParent(
                  'schedule',
                  schedule.id,
                  breaksTemplate,
                  createdBy
                );
                appliedCount++;
              }
            } catch (error) {
              console.error(`Error applying breaks to schedule ${schedule.id}:`, error);
            }
          }
          
          results.push({
            employeeId,
            employeeName: employee.name,
            success: true,
            schedulesProcessed: schedules.length,
            breaksApplied: appliedCount
          });
          
        } catch (error) {
          results.push({
            employeeId,
            success: false,
            error: error.message
          });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      
      return {
        success: true,
        message: `Standard breaks applied to ${successCount}/${employeeIds.length} employees`,
        results,
        summary: {
          total: employeeIds.length,
          successful: successCount,
          failed: employeeIds.length - successCount
        }
      };
      
    } catch (error) {
      console.error('Error creating standard breaks:', error);
      throw error;
    }
  }
  
  /**
   * Analiza conflictos de pausas en un rango de fechas
   */
  static async analyzeBreakConflicts(employeeId, startDate, endDate) {
    try {
      const conflicts = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
        const dateStr = date.toISOString().split('T')[0];
        
        try {
          const effectiveBreaks = await this.getEffectiveBreaksForSchedule(employeeId, dateStr);
          
          if (!effectiveBreaks.isWorkingDay || effectiveBreaks.breaks.length === 0) {
            continue;
          }
          
          // Validar pausas para este día
          const validation = await ScheduleBreak.validateBreaksForParent(
            'analysis',
            'analysis',
            effectiveBreaks.breaks,
            effectiveBreaks.workStartTime,
            effectiveBreaks.workEndTime
          );
          
          if (!validation.isValid) {
            conflicts.push({
              date: dateStr,
              source: effectiveBreaks.source,
              sourceId: effectiveBreaks.sourceId,
              workHours: `${effectiveBreaks.workStartTime} - ${effectiveBreaks.workEndTime}`,
              breaksCount: effectiveBreaks.breaks.length,
              errors: validation.errors
            });
          }
          
        } catch (error) {
          conflicts.push({
            date: dateStr,
            source: 'error',
            error: error.message
          });
        }
      }
      
      return {
        hasConflicts: conflicts.length > 0,
        conflictCount: conflicts.length,
        conflicts,
        dateRange: { startDate, endDate }
      };
      
    } catch (error) {
      console.error('Error analyzing break conflicts:', error);
      throw error;
    }
  }
  
  /**
   * Genera reporte de pausas para un empleado
   */
  static async generateBreakReport(employeeId, startDate, endDate) {
    try {
      const employee = await Employee.findByPk(employeeId);
      if (!employee) {
        throw new Error('Employee not found');
      }
      
      const report = {
        employee: {
          id: employee.id,
          name: employee.name,
          employeeCode: employee.employeeCode
        },
        period: { startDate, endDate },
        days: [],
        summary: {
          totalDays: 0,
          workingDays: 0,
          totalBreaks: 0,
          totalBreakMinutes: 0,
          totalPaidBreakMinutes: 0,
          totalUnpaidBreakMinutes: 0,
          averageBreaksPerDay: 0,
          averageBreakMinutesPerDay: 0
        }
      };
      
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
        const dateStr = date.toISOString().split('T')[0];
        report.summary.totalDays++;
        
        try {
          const effectiveBreaks = await this.getEffectiveBreaksForSchedule(employeeId, dateStr);
          
          const dayReport = {
            date: dateStr,
            dayOfWeek: date.getDay(),
            isWorkingDay: effectiveBreaks.isWorkingDay,
            source: effectiveBreaks.source,
            workHours: effectiveBreaks.isWorkingDay ? 
              `${effectiveBreaks.workStartTime} - ${effectiveBreaks.workEndTime}` : null,
            breaks: effectiveBreaks.breaks.map(b => ({
              name: b.name,
              time: `${b.startTime} - ${b.endTime}`,
              duration: b.getDurationMinutes(),
              type: b.breakType,
              isPaid: b.isPaid,
              isRequired: b.isRequired
            })),
            breakStats: null,
            workTimeStats: null
          };
          
          if (effectiveBreaks.isWorkingDay) {
            report.summary.workingDays++;
            
            dayReport.breakStats = ScheduleBreak.calculateTotalBreakTime(effectiveBreaks.breaks);
            dayReport.workTimeStats = this.calculateEffectiveWorkTime(
              effectiveBreaks.workStartTime,
              effectiveBreaks.workEndTime,
              effectiveBreaks.breaks
            );
            
            // Acumular estadísticas
            report.summary.totalBreaks += effectiveBreaks.breaks.length;
            report.summary.totalBreakMinutes += dayReport.breakStats.total;
            report.summary.totalPaidBreakMinutes += dayReport.breakStats.paid;
            report.summary.totalUnpaidBreakMinutes += dayReport.breakStats.unpaid;
          }
          
          report.days.push(dayReport);
          
        } catch (error) {
          report.days.push({
            date: dateStr,
            dayOfWeek: date.getDay(),
            error: error.message
          });
        }
      }
      
      // Calcular promedios
      if (report.summary.workingDays > 0) {
        report.summary.averageBreaksPerDay = Math.round(
          (report.summary.totalBreaks / report.summary.workingDays) * 100
        ) / 100;
        report.summary.averageBreakMinutesPerDay = Math.round(
          (report.summary.totalBreakMinutes / report.summary.workingDays) * 100
        ) / 100;
      }
      
      // Convertir minutos a horas
      report.summary.totalBreakHours = Math.round((report.summary.totalBreakMinutes / 60) * 100) / 100;
      report.summary.totalPaidBreakHours = Math.round((report.summary.totalPaidBreakMinutes / 60) * 100) / 100;
      report.summary.totalUnpaidBreakHours = Math.round((report.summary.totalUnpaidBreakMinutes / 60) * 100) / 100;
      
      return report;
      
    } catch (error) {
      console.error('Error generating break report:', error);
      throw error;
    }
  }
  
  /**
   * Optimiza pausas para minimizar conflictos
   */
  static optimizeBreaksForSchedule(breaks, workStartTime, workEndTime) {
    try {
      const workStart = new Date(`1970-01-01T${workStartTime}`);
      const workEnd = new Date(`1970-01-01T${workEndTime}`);
      const workMinutes = (workEnd - workStart) / (1000 * 60);
      
      // Ordenar pausas por hora de inicio
      const sortedBreaks = [...breaks].sort((a, b) => {
        const aTime = new Date(`1970-01-01T${a.startTime}`);
        const bTime = new Date(`1970-01-01T${b.startTime}`);
        return aTime - bTime;
      });
      
      const optimizedBreaks = [];
      const suggestions = [];
      
      for (let i = 0; i < sortedBreaks.length; i++) {
        const breakItem = sortedBreaks[i];
        const breakStart = new Date(`1970-01-01T${breakItem.startTime}`);
        const breakEnd = new Date(`1970-01-01T${breakItem.endTime}`);
        const duration = (breakEnd - breakStart) / (1000 * 60);
        
        let optimizedStart = new Date(breakStart);
        let optimizedEnd = new Date(breakEnd);
        
        // Verificar si está fuera del horario laboral
        if (breakStart < workStart) {
          optimizedStart = new Date(workStart);
          optimizedEnd = new Date(optimizedStart.getTime() + duration * 60000);
          suggestions.push({
            original: breakItem.name,
            issue: 'Break starts before work hours',
            suggestion: `Move to ${optimizedStart.toTimeString().slice(0, 5)} - ${optimizedEnd.toTimeString().slice(0, 5)}`
          });
        }
        
        if (breakEnd > workEnd) {
          optimizedEnd = new Date(workEnd);
          optimizedStart = new Date(optimizedEnd.getTime() - duration * 60000);
          suggestions.push({
            original: breakItem.name,
            issue: 'Break ends after work hours',
            suggestion: `Move to ${optimizedStart.toTimeString().slice(0, 5)} - ${optimizedEnd.toTimeString().slice(0, 5)}`
          });
        }
        
        // Verificar solapamientos con pausas anteriores
        for (const prevBreak of optimizedBreaks) {
          const prevEnd = new Date(`1970-01-01T${prevBreak.endTime}`);
          if (optimizedStart < prevEnd) {
            optimizedStart = new Date(prevEnd);
            optimizedEnd = new Date(optimizedStart.getTime() + duration * 60000);
            suggestions.push({
              original: breakItem.name,
              issue: `Overlaps with ${prevBreak.name}`,
              suggestion: `Move to ${optimizedStart.toTimeString().slice(0, 5)} - ${optimizedEnd.toTimeString().slice(0, 5)}`
            });
          }
        }
        
        optimizedBreaks.push({
          ...breakItem,
          startTime: optimizedStart.toTimeString().slice(0, 5),
          endTime: optimizedEnd.toTimeString().slice(0, 5),
          wasOptimized: optimizedStart.getTime() !== breakStart.getTime() || optimizedEnd.getTime() !== breakEnd.getTime()
        });
      }
      
      return {
        originalBreaks: breaks,
        optimizedBreaks,
        suggestions,
        hasOptimizations: suggestions.length > 0
      };
      
    } catch (error) {
      console.error('Error optimizing breaks:', error);
      throw error;
    }
  }
}
