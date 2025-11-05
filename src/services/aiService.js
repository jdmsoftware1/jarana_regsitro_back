import OpenAI from 'openai';
import { Employee, Record, Schedule, Vacation } from '../models/index.js';
import { Op } from 'sequelize';

// Initialize OpenAI client
let openai = null;
try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
} catch (error) {
  console.warn('OpenAI not initialized - API key missing');
}

class AIService {
  
  // Analyze work patterns and detect anomalies
  static async analyzeWorkPatterns(employeeId = null, days = 30) {
    try {
      // Get records for analysis
      const whereClause = employeeId ? { employeeId } : {};
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const records = await Record.findAll({
        where: {
          ...whereClause,
          timestamp: {
            [Op.gte]: startDate
          }
        },
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: ['id', 'name', 'employeeCode']
          }
        ],
        order: [['timestamp', 'DESC']]
      });

      // Get employee schedules
      const employees = employeeId 
        ? [await Employee.findByPk(employeeId)]
        : await Employee.findAll();

      const analysis = {
        anomalies: [],
        patterns: [],
        recommendations: [],
        summary: {}
      };

      for (const employee of employees) {
        if (!employee) continue;

        const employeeRecords = records.filter(r => r.employeeId === employee.id);
        const schedules = await Schedule.findAll({
          where: { employeeId: employee.id }
        });

        // Analyze patterns for this employee
        const employeeAnalysis = await this.analyzeEmployeePatterns(
          employee, 
          employeeRecords, 
          schedules
        );

        analysis.anomalies.push(...employeeAnalysis.anomalies);
        analysis.patterns.push(...employeeAnalysis.patterns);
        analysis.recommendations.push(...employeeAnalysis.recommendations);
      }

      // Generate AI insights
      const aiInsights = await this.generateAIInsights(analysis, records);
      
      return {
        ...analysis,
        aiInsights,
        generatedAt: new Date(),
        period: `${days} días`
      };

    } catch (error) {
      console.error('Error analyzing work patterns:', error);
      throw new Error('Error en análisis de patrones de trabajo');
    }
  }

  // Analyze individual employee patterns
  static async analyzeEmployeePatterns(employee, records, schedules) {
    const anomalies = [];
    const patterns = [];
    const recommendations = [];

    // Group records by day
    const recordsByDay = {};
    records.forEach(record => {
      const day = new Date(record.timestamp).toDateString();
      if (!recordsByDay[day]) recordsByDay[day] = [];
      recordsByDay[day].push(record);
    });

    // Analyze each day
    Object.entries(recordsByDay).forEach(([day, dayRecords]) => {
      const date = new Date(day);
      const dayOfWeek = date.getDay();
      
      // Find expected schedule for this day
      const expectedSchedule = schedules.find(s => s.dayOfWeek === dayOfWeek);
      
      if (expectedSchedule && expectedSchedule.isWorkingDay) {
        const checkins = dayRecords.filter(r => r.type === 'checkin');
        const checkouts = dayRecords.filter(r => r.type === 'checkout');

        // Check for late arrivals
        if (checkins.length > 0) {
          const firstCheckin = new Date(checkins[0].timestamp);
          const expectedStart = new Date(date);
          const [hours, minutes] = expectedSchedule.startTime.split(':');
          expectedStart.setHours(parseInt(hours), parseInt(minutes), 0, 0);

          const lateness = (firstCheckin - expectedStart) / (1000 * 60); // minutes

          if (lateness > 15) {
            anomalies.push({
              type: 'late_arrival',
              employee: employee.name,
              employeeId: employee.id,
              date: day,
              severity: lateness > 60 ? 'high' : lateness > 30 ? 'medium' : 'low',
              details: `Llegada ${Math.round(lateness)} minutos tarde`,
              expectedTime: expectedSchedule.startTime,
              actualTime: firstCheckin.toTimeString().substring(0, 5)
            });
          }
        }

        // Check for early departures
        if (checkouts.length > 0) {
          const lastCheckout = new Date(checkouts[checkouts.length - 1].timestamp);
          const expectedEnd = new Date(date);
          const [hours, minutes] = expectedSchedule.endTime.split(':');
          expectedEnd.setHours(parseInt(hours), parseInt(minutes), 0, 0);

          const earlyLeave = (expectedEnd - lastCheckout) / (1000 * 60); // minutes

          if (earlyLeave > 15) {
            anomalies.push({
              type: 'early_departure',
              employee: employee.name,
              employeeId: employee.id,
              date: day,
              severity: earlyLeave > 60 ? 'high' : earlyLeave > 30 ? 'medium' : 'low',
              details: `Salida ${Math.round(earlyLeave)} minutos antes`,
              expectedTime: expectedSchedule.endTime,
              actualTime: lastCheckout.toTimeString().substring(0, 5)
            });
          }
        }

        // Check for missing records
        if (checkins.length === 0) {
          anomalies.push({
            type: 'missing_checkin',
            employee: employee.name,
            employeeId: employee.id,
            date: day,
            severity: 'high',
            details: 'No se registró entrada',
            expectedTime: expectedSchedule.startTime,
            actualTime: null
          });
        }

        if (checkouts.length === 0 && checkins.length > 0) {
          anomalies.push({
            type: 'missing_checkout',
            employee: employee.name,
            employeeId: employee.id,
            date: day,
            severity: 'medium',
            details: 'No se registró salida',
            expectedTime: expectedSchedule.endTime,
            actualTime: null
          });
        }
      }
    });

    // Generate patterns
    const avgLateness = anomalies
      .filter(a => a.type === 'late_arrival')
      .reduce((sum, a) => sum + parseInt(a.details.match(/\d+/)[0]), 0) / 
      Math.max(1, anomalies.filter(a => a.type === 'late_arrival').length);

    if (avgLateness > 0) {
      patterns.push({
        type: 'lateness_pattern',
        employee: employee.name,
        employeeId: employee.id,
        description: `Promedio de retraso: ${Math.round(avgLateness)} minutos`,
        frequency: anomalies.filter(a => a.type === 'late_arrival').length,
        severity: avgLateness > 30 ? 'high' : 'medium'
      });
    }

    // Generate recommendations
    if (anomalies.length > 5) {
      recommendations.push({
        type: 'schedule_review',
        employee: employee.name,
        employeeId: employee.id,
        priority: 'high',
        description: 'Revisar horario de trabajo - múltiples anomalías detectadas',
        suggestedAction: 'Reunión con empleado para ajustar horarios'
      });
    }

    return { anomalies, patterns, recommendations };
  }

  // Generate AI insights using OpenAI
  static async generateAIInsights(analysis, records) {
    if (!openai) {
      return {
        summary: "Análisis básico: Se detectaron " + analysis.anomalies.length + " anomalías en el período analizado. Configure OPENAI_API_KEY para obtener insights más detallados.",
        model: "fallback",
        generatedAt: new Date()
      };
    }
    
    try {
      const prompt = `
        Analiza los siguientes datos de un sistema de registro horario y proporciona insights inteligentes:
        
        Anomalías detectadas: ${analysis.anomalies.length}
        Patrones identificados: ${analysis.patterns.length}
        Total de registros: ${records.length}
        
        Anomalías por tipo:
        ${analysis.anomalies.reduce((acc, anomaly) => {
          acc[anomaly.type] = (acc[anomaly.type] || 0) + 1;
          return acc;
        }, {})}
        
        Como experto en recursos humanos y análisis de datos, proporciona:
        1. Un resumen ejecutivo de la situación
        2. Las 3 principales preocupaciones
        3. Recomendaciones específicas para mejorar
        4. Predicciones sobre tendencias futuras
        
        Responde en español y sé conciso pero informativo.
      `;

      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "Eres un experto analista de recursos humanos especializado en análisis de patrones de trabajo y optimización de horarios."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 800,
        temperature: 0.7
      });

      return {
        summary: completion.choices[0].message.content,
        model: "gpt-4",
        generatedAt: new Date()
      };

    } catch (error) {
      console.error('Error generating AI insights:', error);
      return {
        summary: "No se pudieron generar insights de IA en este momento.",
        error: error.message,
        generatedAt: new Date()
      };
    }
  }

  // Chatbot assistant
  static async chatAssistant(message, userId, userRole = 'employee') {
    if (!openai) {
      return {
        response: "Lo siento, el chat de IA no está disponible en este momento. Configure OPENAI_API_KEY para habilitar esta funcionalidad. Mientras tanto, puedes usar el panel de administración para gestionar horarios y vacaciones.",
        type: 'error',
        timestamp: new Date(),
        userId,
        userRole
      };
    }
    
    try {
      // Get user context - userId should be numeric employee ID or UUID
      let employee = null;
      
      // Try to find by numeric ID first
      if (!isNaN(userId)) {
        employee = await Employee.findByPk(parseInt(userId));
      }
      
      // If not found, try as UUID
      if (!employee && typeof userId === 'string') {
        employee = await Employee.findByPk(userId);
      }
      
      if (!employee && userRole === 'employee') {
        throw new Error('Empleado no encontrado. Por favor, use el ID numérico del empleado.');
      }

      // Prepare context based on user role
      let context = '';
      
      if (userRole === 'employee' && employee) {
        // Get comprehensive employee data for AI context using numeric employee ID
        const employeeId = employee.id;
        const [recentRecords, allRecords, schedules, vacations, todayRecords] = await Promise.all([
          // Recent records for general context
          Record.findAll({
            where: { employeeId },
            order: [['timestamp', 'DESC']],
            limit: 20,
            include: [{ model: Employee, as: 'employee', attributes: ['name', 'employeeCode'] }]
          }),
          
          // All records for comprehensive analysis
          Record.findAll({
            where: { employeeId },
            order: [['timestamp', 'DESC']],
            limit: 100
          }),
          
          // Employee schedules
          Schedule.findAll({
            where: { employeeId },
            order: [['dayOfWeek', 'ASC']]
          }),
          
          // All vacations
          Vacation.findAll({
            where: { employeeId },
            order: [['startDate', 'DESC']],
            include: [{ 
              model: Employee, 
              as: 'approver', 
              attributes: ['name', 'employeeCode'],
              required: false 
            }]
          }),
          
          // Today's records specifically
          Record.findAll({
            where: { 
              employeeId,
              timestamp: {
                [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0)),
                [Op.lt]: new Date(new Date().setHours(23, 59, 59, 999))
              }
            },
            order: [['timestamp', 'DESC']]
          })
        ]);

        // Calculate detailed statistics
        const workDays = Math.floor(allRecords.length / 2); // Simplified: assuming pairs of checkin/checkout
        const thisWeekRecords = allRecords.filter(r => {
          const recordDate = new Date(r.timestamp);
          const weekStart = new Date();
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          return recordDate >= weekStart;
        });
        
        const thisMonthRecords = allRecords.filter(r => {
          const recordDate = new Date(r.timestamp);
          const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
          return recordDate >= monthStart;
        });

        const pendingVacations = vacations.filter(v => v.status === 'pending');
        const approvedVacations = vacations.filter(v => v.status === 'approved');
        
        // Analyze today's status
        const todayCheckins = todayRecords.filter(r => r.type === 'checkin');
        const todayCheckouts = todayRecords.filter(r => r.type === 'checkout');
        const isCurrentlyCheckedIn = todayCheckins.length > todayCheckouts.length;
        
        // Calculate late arrivals this month
        const lateArrivals = thisMonthRecords.filter(r => {
          if (r.type !== 'checkin') return false;
          const time = new Date(r.timestamp);
          return time.getHours() > 9 || (time.getHours() === 9 && time.getMinutes() > 15);
        }).length;

        context = `
INFORMACIÓN DEL EMPLEADO:
- Nombre: ${employee.name}
- Código: ${employee.employeeCode}
- Estado actual: ${isCurrentlyCheckedIn ? 'Fichado (dentro)' : 'Fichado (fuera) o sin fichar hoy'}

REGISTROS DE FICHAJES:
- Total registros: ${allRecords.length}
- Días trabajados estimados: ${workDays}
- Registros esta semana: ${thisWeekRecords.length}
- Registros este mes: ${thisMonthRecords.length}
- Llegadas tarde este mes: ${lateArrivals}
- Último registro: ${recentRecords.length > 0 ? new Date(recentRecords[0].timestamp).toLocaleString('es-ES') + ' (' + recentRecords[0].type + ')' : 'Sin registros'}

HORARIOS CONFIGURADOS:
${schedules.map(s => `- ${['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][s.dayOfWeek]}: ${s.isWorkingDay ? s.startTime + ' - ' + s.endTime : 'No laboral'}`).join('\n')}

VACACIONES:
- Total solicitudes: ${vacations.length}
- Pendientes de aprobación: ${pendingVacations.length}
- Aprobadas: ${approvedVacations.length}
- Última solicitud: ${vacations.length > 0 ? new Date(vacations[0].startDate).toLocaleDateString('es-ES') + ' - ' + new Date(vacations[0].endDate).toLocaleDateString('es-ES') + ' (' + vacations[0].status + ')' : 'Sin solicitudes'}

REGISTROS DE HOY:
${todayRecords.length > 0 ? todayRecords.map(r => `- ${new Date(r.timestamp).toLocaleTimeString('es-ES')}: ${r.type === 'checkin' ? 'Entrada' : 'Salida'}`).join('\n') : '- Sin registros hoy'}
        `;
      } else {
        // Admin/supervisor context
        const totalEmployees = await Employee.count();
        const totalRecords = await Record.count();
        const pendingVacations = await Vacation.count({
          where: { status: 'pending' }
        });

        context = `
          Rol: Supervisor/Admin
          Total empleados: ${totalEmployees}
          Total registros: ${totalRecords}
          Vacaciones pendientes: ${pendingVacations}
        `;
      }

      // Check if message is a vacation request
      const isVacationRequest = this.detectVacationRequest(message);
      if (isVacationRequest && userRole === 'employee') {
        return await this.handleVacationRequest(message, userId, employee);
      }

      // Check if this is a specific data query that can be answered directly
      if (userRole === 'employee') {
        const lowerMessage = message.toLowerCase();
        const specificQueries = [
          'horas', 'fichado', 'entrada', 'salida', 'horario', 'tarde', 'puntualidad', 
          'vacaciones pendientes', 'mañana', 'hoy', 'semana', 'mes'
        ];
        
        const isSpecificQuery = specificQueries.some(keyword => lowerMessage.includes(keyword));
        if (isSpecificQuery) {
          const directResponse = await this.getEmployeeInsights(userId, message);
          if (directResponse.type !== 'error') {
            return directResponse;
          }
        }
      }

      // Generate AI response
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `Eres JARANA AI, un asistente inteligente especializado en gestión de recursos humanos y control horario.

CAPACIDADES PRINCIPALES:
- Análisis detallado de fichajes y patrones de trabajo
- Gestión y creación automática de solicitudes de vacaciones
- Consultas específicas sobre horarios, registros y estadísticas
- Recomendaciones personalizadas para mejorar productividad y puntualidad
- Análisis de tendencias y anomalías en el comportamiento laboral

DATOS DISPONIBLES DEL USUARIO:
${context}

INSTRUCCIONES DE COMPORTAMIENTO:
1. Responde SIEMPRE en español con un tono profesional pero amigable
2. Usa los datos reales del usuario para dar respuestas específicas y precisas
3. Si detectas palabras clave de vacaciones (vacaciones, días libres, ausencia, permiso, baja), procesa automáticamente la solicitud
4. Proporciona análisis detallados cuando se soliciten estadísticas o reportes
5. Ofrece recomendaciones constructivas basadas en los patrones observados
6. Si falta información para responder completamente, pregunta específicamente qué necesitas

EJEMPLOS DE CONSULTAS QUE PUEDES RESOLVER:
- "¿Cuántas horas trabajé esta semana?"
- "¿He llegado tarde este mes?"
- "Quiero vacaciones del 15 al 20 de enero"
- "¿Cuál es mi horario de mañana?"
- "¿Cómo está mi puntualidad comparada con el mes pasado?"
- "¿He fichado entrada hoy?"
- "¿Cuántos días de vacaciones tengo pendientes?"

Responde de forma directa y útil, usando los datos reales disponibles.`
          },
          {
            role: "user",
            content: message
          }
        ],
        max_tokens: 800,
        temperature: 0.3
      });

      return {
        response: completion.choices[0].message.content,
        type: 'chat_response',
        timestamp: new Date(),
        userId,
        userRole
      };

    } catch (error) {
      console.error('Error in chat assistant:', error);
      return {
        response: "Lo siento, no puedo procesar tu solicitud en este momento. Por favor, intenta de nuevo más tarde.",
        type: 'error',
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  // Detect if message is a vacation request
  static detectVacationRequest(message) {
    const vacationKeywords = [
      'vacaciones', 'solicitar vacaciones', 'pedir vacaciones',
      'días libres', 'ausencia', 'permiso', 'baja',
      'del', 'al', 'desde', 'hasta'
    ];
    
    const lowerMessage = message.toLowerCase();
    return vacationKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  // Handle vacation request automatically
  static async handleVacationRequest(message, employeeId, employee) {
    if (!openai) {
      return {
        response: "La creación automática de vacaciones requiere IA. Por favor, crea tu solicitud manualmente desde el panel de vacaciones o contacta con tu supervisor.",
        type: 'manual_required',
        timestamp: new Date()
      };
    }
    
    try {
      // Extract dates from message using AI
      const dateExtractionPrompt = `
        Extrae las fechas de inicio y fin de esta solicitud de vacaciones:
        "${message}"
        
        Responde SOLO en formato JSON:
        {
          "startDate": "YYYY-MM-DD",
          "endDate": "YYYY-MM-DD",
          "reason": "motivo extraído del mensaje"
        }
        
        Si no puedes extraer fechas claras, responde:
        {
          "error": "No se pudieron extraer fechas válidas"
        }
      `;

      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "Eres un experto en procesamiento de lenguaje natural para extraer fechas de solicitudes de vacaciones."
          },
          {
            role: "user",
            content: dateExtractionPrompt
          }
        ],
        max_tokens: 200,
        temperature: 0.1
      });

      const extractedData = JSON.parse(completion.choices[0].message.content);
      
      if (extractedData.error) {
        return {
          response: "No pude entender las fechas de tu solicitud. Por favor, especifica las fechas de inicio y fin claramente. Ejemplo: 'Quiero solicitar vacaciones del 15 de enero al 20 de enero'",
          type: 'clarification_needed',
          timestamp: new Date()
        };
      }

      // Create vacation request
      const vacation = await Vacation.create({
        employeeId,
        startDate: extractedData.startDate,
        endDate: extractedData.endDate,
        type: 'vacation',
        reason: extractedData.reason || 'Solicitud por chat',
        notes: `Solicitud automática via chatbot: "${message}"`,
        status: 'pending'
      });

      return {
        response: `✅ He creado tu solicitud de vacaciones del ${new Date(extractedData.startDate).toLocaleDateString('es-ES')} al ${new Date(extractedData.endDate).toLocaleDateString('es-ES')}. 
        
        La solicitud está pendiente de aprobación por parte de tu supervisor. Recibirás una notificación cuando sea revisada.
        
        Número de solicitud: ${vacation.id.substring(0, 8)}`,
        type: 'vacation_created',
        vacationId: vacation.id,
        timestamp: new Date()
      };

    } catch (error) {
      console.error('Error handling vacation request:', error);
      return {
        response: "Hubo un error al procesar tu solicitud de vacaciones. Por favor, intenta crear la solicitud manualmente desde el panel de vacaciones.",
        type: 'error',
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  // Advanced database queries for specific employee insights
  static async getEmployeeInsights(employeeId, query) {
    try {
      const employee = await Employee.findByPk(employeeId);
      if (!employee) throw new Error('Empleado no encontrado');

      // Determine what type of insight is requested
      const lowerQuery = query.toLowerCase();
      
      if (lowerQuery.includes('horas') && (lowerQuery.includes('semana') || lowerQuery.includes('semanal'))) {
        return await this.getWeeklyHours(employeeId);
      }
      
      if (lowerQuery.includes('horas') && (lowerQuery.includes('mes') || lowerQuery.includes('mensual'))) {
        return await this.getMonthlyHours(employeeId);
      }
      
      if (lowerQuery.includes('tarde') || lowerQuery.includes('puntualidad') || lowerQuery.includes('retraso')) {
        return await this.getLateArrivals(employeeId);
      }
      
      if (lowerQuery.includes('horario') && (lowerQuery.includes('mañana') || lowerQuery.includes('siguiente'))) {
        return await this.getTomorrowSchedule(employeeId);
      }
      
      if (lowerQuery.includes('fichado') || lowerQuery.includes('entrada') || lowerQuery.includes('hoy')) {
        return await this.getTodayStatus(employeeId);
      }
      
      if (lowerQuery.includes('vacaciones') && (lowerQuery.includes('pendiente') || lowerQuery.includes('quedan'))) {
        return await this.getPendingVacations(employeeId);
      }

      // Default: return general summary
      return await this.getGeneralSummary(employeeId);
      
    } catch (error) {
      console.error('Error getting employee insights:', error);
      return {
        response: "No pude obtener la información solicitada. Por favor, intenta reformular tu pregunta.",
        type: 'error'
      };
    }
  }

  // Get weekly hours worked
  static async getWeeklyHours(employeeId) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const records = await Record.findAll({
      where: {
        employeeId,
        timestamp: { [Op.gte]: weekStart }
      },
      order: [['timestamp', 'ASC']]
    });

    const checkins = records.filter(r => r.type === 'checkin');
    const checkouts = records.filter(r => r.type === 'checkout');
    const workDays = Math.min(checkins.length, checkouts.length);
    const estimatedHours = workDays * 8; // Simplified calculation

    return {
      response: `Esta semana has trabajado aproximadamente ${estimatedHours} horas en ${workDays} días.
      
      Detalles:
      - Entradas registradas: ${checkins.length}
      - Salidas registradas: ${checkouts.length}
      - Días trabajados: ${workDays}
      
      ${checkins.length > checkouts.length ? '⚠️ Tienes una entrada sin salida registrada.' : ''}`,
      type: 'hours_summary',
      data: { hours: estimatedHours, days: workDays }
    };
  }

  // Get monthly hours worked
  static async getMonthlyHours(employeeId) {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const records = await Record.findAll({
      where: {
        employeeId,
        timestamp: { [Op.gte]: monthStart }
      },
      order: [['timestamp', 'ASC']]
    });

    const checkins = records.filter(r => r.type === 'checkin');
    const checkouts = records.filter(r => r.type === 'checkout');
    const workDays = Math.min(checkins.length, checkouts.length);
    const estimatedHours = workDays * 8;

    return {
      response: `Este mes has trabajado aproximadamente ${estimatedHours} horas en ${workDays} días.
      
      Estadísticas del mes:
      - Total de fichajes: ${records.length}
      - Días trabajados: ${workDays}
      - Promedio horas/día: ${workDays > 0 ? (estimatedHours / workDays).toFixed(1) : 0}h`,
      type: 'monthly_summary',
      data: { hours: estimatedHours, days: workDays }
    };
  }

  // Get late arrivals analysis
  static async getLateArrivals(employeeId) {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const checkins = await Record.findAll({
      where: {
        employeeId,
        type: 'checkin',
        timestamp: { [Op.gte]: monthStart }
      },
      order: [['timestamp', 'DESC']]
    });

    const lateArrivals = checkins.filter(r => {
      const time = new Date(r.timestamp);
      return time.getHours() > 9 || (time.getHours() === 9 && time.getMinutes() > 15);
    });

    const punctualityScore = checkins.length > 0 ? 
      Math.max(0, 100 - (lateArrivals.length / checkins.length * 100)).toFixed(1) : 100;

    return {
      response: `Análisis de puntualidad este mes:
      
      📊 Estadísticas:
      - Total entradas: ${checkins.length}
      - Llegadas tarde: ${lateArrivals.length}
      - Puntuación de puntualidad: ${punctualityScore}%
      
      ${lateArrivals.length > 0 ? 
        `⏰ Últimas llegadas tarde:\n${lateArrivals.slice(0, 3).map(r => 
          `- ${new Date(r.timestamp).toLocaleDateString('es-ES')} a las ${new Date(r.timestamp).toLocaleTimeString('es-ES')}`
        ).join('\n')}` : 
        '🎉 ¡Excelente! No has llegado tarde este mes.'
      }`,
      type: 'punctuality_analysis',
      data: { lateCount: lateArrivals.length, score: punctualityScore }
    };
  }

  // Get tomorrow's schedule
  static async getTomorrowSchedule(employeeId) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDay = tomorrow.getDay();

    const schedule = await Schedule.findOne({
      where: {
        employeeId,
        dayOfWeek: tomorrowDay
      }
    });

    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    if (!schedule || !schedule.isWorkingDay) {
      return {
        response: `Mañana ${dayNames[tomorrowDay]} (${tomorrow.toLocaleDateString('es-ES')}) no tienes horario laboral configurado. ¡Disfruta tu día libre! 🎉`,
        type: 'schedule_info',
        data: { isWorkingDay: false }
      };
    }

    return {
      response: `Tu horario para mañana ${dayNames[tomorrowDay]} (${tomorrow.toLocaleDateString('es-ES')}):
      
      🕘 Entrada: ${schedule.startTime}
      🕔 Salida: ${schedule.endTime}
      ${schedule.breakStartTime ? `🍽️ Descanso: ${schedule.breakStartTime} - ${schedule.breakEndTime}` : ''}
      
      ${schedule.notes ? `📝 Notas: ${schedule.notes}` : ''}`,
      type: 'schedule_info',
      data: { 
        isWorkingDay: true, 
        startTime: schedule.startTime, 
        endTime: schedule.endTime 
      }
    };
  }

  // Get today's status
  static async getTodayStatus(employeeId) {
    const today = new Date();
    const todayStart = new Date(today.setHours(0, 0, 0, 0));
    const todayEnd = new Date(today.setHours(23, 59, 59, 999));

    const todayRecords = await Record.findAll({
      where: {
        employeeId,
        timestamp: {
          [Op.gte]: todayStart,
          [Op.lte]: todayEnd
        }
      },
      order: [['timestamp', 'ASC']]
    });

    const checkins = todayRecords.filter(r => r.type === 'checkin');
    const checkouts = todayRecords.filter(r => r.type === 'checkout');
    const isCheckedIn = checkins.length > checkouts.length;

    let statusMessage = '';
    if (todayRecords.length === 0) {
      statusMessage = 'No has fichado entrada hoy. 🚪';
    } else if (isCheckedIn) {
      const lastCheckin = checkins[checkins.length - 1];
      statusMessage = `Estás fichado DENTRO desde las ${new Date(lastCheckin.timestamp).toLocaleTimeString('es-ES')} ✅`;
    } else {
      const lastCheckout = checkouts[checkouts.length - 1];
      statusMessage = `Estás fichado FUERA desde las ${new Date(lastCheckout.timestamp).toLocaleTimeString('es-ES')} 🚪`;
    }

    return {
      response: `Estado de hoy (${new Date().toLocaleDateString('es-ES')}):
      
      ${statusMessage}
      
      📋 Registros de hoy:
      ${todayRecords.length > 0 ? 
        todayRecords.map(r => 
          `- ${new Date(r.timestamp).toLocaleTimeString('es-ES')}: ${r.type === 'checkin' ? 'Entrada' : 'Salida'}`
        ).join('\n') : 
        '- Sin registros'
      }`,
      type: 'today_status',
      data: { isCheckedIn, recordsCount: todayRecords.length }
    };
  }

  // Get pending vacations
  static async getPendingVacations(employeeId) {
    const vacations = await Vacation.findAll({
      where: { employeeId },
      order: [['startDate', 'DESC']]
    });

    const pending = vacations.filter(v => v.status === 'pending');
    const approved = vacations.filter(v => v.status === 'approved');
    const rejected = vacations.filter(v => v.status === 'rejected');

    return {
      response: `Estado de tus vacaciones:
      
      📋 Resumen:
      - Solicitudes pendientes: ${pending.length}
      - Solicitudes aprobadas: ${approved.length}
      - Solicitudes rechazadas: ${rejected.length}
      
      ${pending.length > 0 ? 
        `⏳ Pendientes de aprobación:\n${pending.map(v => 
          `- ${new Date(v.startDate).toLocaleDateString('es-ES')} al ${new Date(v.endDate).toLocaleDateString('es-ES')}`
        ).join('\n')}` : 
        '✅ No tienes solicitudes pendientes.'
      }`,
      type: 'vacation_status',
      data: { pending: pending.length, approved: approved.length }
    };
  }

  // Get general summary
  static async getGeneralSummary(employeeId) {
    const employee = await Employee.findByPk(employeeId);
    const totalRecords = await Record.count({ where: { employeeId } });
    const totalVacations = await Vacation.count({ where: { employeeId } });

    return {
      response: `Resumen general de ${employee.name}:
      
      👤 Información básica:
      - Código de empleado: ${employee.employeeCode}
      - Total de fichajes: ${totalRecords}
      - Solicitudes de vacaciones: ${totalVacations}
      
      💡 Puedes preguntarme sobre:
      - Horas trabajadas esta semana/mes
      - Tu puntualidad y llegadas tarde
      - Estado de fichaje de hoy
      - Horario de mañana
      - Estado de vacaciones
      - Solicitar nuevas vacaciones`,
      type: 'general_summary'
    };
  }
}

export default AIService;
