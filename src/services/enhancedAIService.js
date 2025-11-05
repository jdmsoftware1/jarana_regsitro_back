import OpenAI from 'openai';
import embeddingService from './embeddingService.js';
import sequelize from '../config/database.js';
import { Employee, Record, Schedule, Vacation, WeeklySchedule, ScheduleTemplate } from '../models/index.js';
import { Op } from 'sequelize';

class EnhancedAIService {
  constructor() {
    this.openai = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn('⚠️ OPENAI_API_KEY no configurada');
      return;
    }

    this.openai = new OpenAI({ apiKey });
    await embeddingService.initialize();
    this.initialized = true;
    console.log('✅ Enhanced AI Service inicializado');
  }

  async chat(message, userId = null) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.openai) {
      return {
        response: "⚠️ Error en el servidor: El servicio de IA no está disponible. Configure OPENAI_API_KEY o póngase en contacto con el administrador.",
        type: 'error'
      };
    }

    try {
      // 1. Buscar documentos relevantes usando embeddings
      const relevantDocs = await embeddingService.searchSimilarDocuments(message, 3);
      
      // 2. Obtener datos de la base de datos si es necesario
      const dbContext = await this.getDatabaseContext(message);
      
      // 3. Construir contexto enriquecido
      let context = this.buildContext(relevantDocs, dbContext);
      
      // 4. Generar respuesta con GPT
      const response = await this.generateResponse(message, context);
      
      return {
        response: response,
        type: 'success',
        sources: relevantDocs.map(d => d.source),
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error en chat:', error);
      return {
        response: "⚠️ Error en el servidor: No se pudo procesar tu mensaje. Por favor, reinicie el sistema o póngase en contacto con el administrador.",
        type: 'error',
        error: error.message
      };
    }
  }

  buildContext(relevantDocs, dbContext) {
    let context = '';

    // Añadir documentos relevantes
    if (relevantDocs.length > 0) {
      context += '=== DOCUMENTACIÓN RELEVANTE ===\n\n';
      relevantDocs.forEach((doc, i) => {
        context += `Documento ${i + 1} (${doc.source}, similitud: ${(doc.similarity * 100).toFixed(1)}%):\n`;
        context += doc.content + '\n\n';
      });
    }

    // Añadir datos de la base de datos
    if (dbContext) {
      context += '=== DATOS DE LA BASE DE DATOS ===\n\n';
      context += dbContext + '\n\n';
    }

    return context;
  }

  async getDatabaseContext(message) {
    const messageLower = message.toLowerCase();
    let context = '';

    try {
      // Detectar qué tipo de información se solicita
      if (messageLower.includes('empleado') || messageLower.includes('trabajador')) {
        const employees = await Employee.findAll({
          where: { isActive: true },
          attributes: ['id', 'name', 'employeeCode', 'email', 'role'],
          limit: 50
        });
        context += `Total de empleados activos: ${employees.length}\n`;
        context += `Empleados: ${employees.map(e => `${e.name} (${e.employeeCode})`).join(', ')}\n\n`;
      }

      if (messageLower.includes('tarde') || messageLower.includes('retraso') || messageLower.includes('puntualidad')) {
        // Obtener registros de la última semana
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const records = await Record.findAll({
          where: {
            timestamp: { [Op.gte]: oneWeekAgo },
            type: 'checkin'
          },
          include: [{
            model: Employee,
            as: 'employee',
            attributes: ['id', 'name', 'employeeCode']
          }],
          order: [['timestamp', 'DESC']],
          limit: 100
        });

        // Obtener horarios para comparar
        const schedules = await Schedule.findAll({
          attributes: ['employeeId', 'dayOfWeek', 'startTime']
        });

        const scheduleMap = {};
        schedules.forEach(s => {
          if (!scheduleMap[s.employeeId]) scheduleMap[s.employeeId] = {};
          scheduleMap[s.employeeId][s.dayOfWeek] = s.startTime;
        });

        // Analizar retrasos
        const lateArrivals = [];
        records.forEach(record => {
          const dayOfWeek = new Date(record.timestamp).getDay();
          const employeeSchedule = scheduleMap[record.employeeId];
          
          if (employeeSchedule && employeeSchedule[dayOfWeek]) {
            const scheduledTime = employeeSchedule[dayOfWeek];
            const actualTime = new Date(record.timestamp).toTimeString().slice(0, 5);
            
            if (actualTime > scheduledTime) {
              lateArrivals.push({
                employee: record.employee.name,
                date: new Date(record.timestamp).toLocaleDateString('es-ES'),
                scheduled: scheduledTime,
                actual: actualTime
              });
            }
          }
        });

        if (lateArrivals.length > 0) {
          context += `Llegadas tarde esta semana: ${lateArrivals.length}\n`;
          lateArrivals.slice(0, 10).forEach(late => {
            context += `- ${late.employee}: ${late.date}, esperado ${late.scheduled}, llegó ${late.actual}\n`;
          });
          context += '\n';
        } else {
          context += 'No se detectaron llegadas tarde esta semana.\n\n';
        }
      }

      if (messageLower.includes('vacacion') || messageLower.includes('ausencia')) {
        const vacations = await Vacation.findAll({
          where: {
            startDate: { [Op.gte]: new Date() }
          },
          include: [{
            model: Employee,
            as: 'employee',
            attributes: ['name', 'employeeCode']
          }],
          order: [['startDate', 'ASC']],
          limit: 20
        });

        context += `Próximas vacaciones: ${vacations.length}\n`;
        vacations.forEach(v => {
          context += `- ${v.employee.name}: ${new Date(v.startDate).toLocaleDateString('es-ES')} a ${new Date(v.endDate).toLocaleDateString('es-ES')} (${v.status})\n`;
        });
        context += '\n';
      }

      if (messageLower.includes('horario') || messageLower.includes('plantilla') || messageLower.includes('turno')) {
        const templates = await ScheduleTemplate.findAll({
          where: { isActive: true },
          attributes: ['id', 'name', 'description'],
          limit: 20
        });

        context += `Plantillas de horario disponibles: ${templates.length}\n`;
        templates.forEach(t => {
          context += `- ${t.name}: ${t.description || 'Sin descripción'}\n`;
        });
        context += '\n';
      }

      // Estadísticas generales si no se detectó nada específico
      if (!context) {
        const [employeeCount, recordCount, vacationCount] = await Promise.all([
          Employee.count({ where: { isActive: true } }),
          Record.count(),
          Vacation.count()
        ]);

        context += `Estadísticas del sistema:\n`;
        context += `- Empleados activos: ${employeeCount}\n`;
        context += `- Total de registros: ${recordCount}\n`;
        context += `- Total de vacaciones: ${vacationCount}\n\n`;
      }

    } catch (error) {
      console.error('Error obteniendo contexto de BD:', error);
      context += 'Error al obtener datos de la base de datos.\n';
    }

    return context;
  }

  async generateResponse(message, context) {
    const systemPrompt = `Eres un asistente de IA para el sistema de gestión de empleados JARANA.

Tu trabajo es ayudar a responder preguntas sobre:
- Empleados y su información
- Registros de entrada/salida
- Horarios y plantillas
- Vacaciones y ausencias
- Estadísticas y reportes

IMPORTANTE:
- Usa la información del contexto proporcionado para dar respuestas precisas
- Si no tienes información suficiente, dilo claramente
- Sé conciso y directo
- Usa formato claro con listas cuando sea apropiado
- Responde siempre en español

Contexto disponible:
${context}`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 1000
    });

    return completion.choices[0].message.content;
  }

  async executeSQL(query) {
    try {
      const [results] = await sequelize.query(query);
      return results;
    } catch (error) {
      console.error('Error ejecutando SQL:', error);
      throw error;
    }
  }
}

const enhancedAIService = new EnhancedAIService();

export default enhancedAIService;
