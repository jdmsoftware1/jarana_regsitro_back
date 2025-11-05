import express from 'express';
import multer from 'multer';
import AIService from '../services/aiService.js';
import enhancedAIService from '../services/enhancedAIService.js';
import embeddingService from '../services/embeddingService.js';

const router = express.Router();

// Configurar multer para upload de archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, embeddingService.documentsPath);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos .txt'));
    }
  }
});

// Analyze work patterns and detect anomalies
router.get('/analyze-patterns', async (req, res) => {
  try {
    const { employeeId, days = 30 } = req.query;
    
    const analysis = await AIService.analyzeWorkPatterns(
      employeeId || null, 
      parseInt(days)
    );
    
    res.json(analysis);
  } catch (error) {
    console.error('Error in pattern analysis:', error);
    res.status(500).json({ 
      error: 'Error analyzing work patterns',
      message: error.message 
    });
  }
});

// Get anomalies summary for dashboard
router.get('/anomalies-summary', async (req, res) => {
  try {
    const { days = 7 } = req.query;
    
    const analysis = await AIService.analyzeWorkPatterns(null, parseInt(days));
    
    // Summarize anomalies for dashboard
    const summary = {
      totalAnomalies: analysis.anomalies.length,
      highSeverity: analysis.anomalies.filter(a => a.severity === 'high').length,
      mediumSeverity: analysis.anomalies.filter(a => a.severity === 'medium').length,
      lowSeverity: analysis.anomalies.filter(a => a.severity === 'low').length,
      byType: analysis.anomalies.reduce((acc, anomaly) => {
        acc[anomaly.type] = (acc[anomaly.type] || 0) + 1;
        return acc;
      }, {}),
      topEmployeesWithAnomalies: analysis.anomalies
        .reduce((acc, anomaly) => {
          const key = `${anomaly.employeeId}-${anomaly.employee}`;
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {}),
      recommendations: analysis.recommendations.slice(0, 5),
      aiInsights: analysis.aiInsights,
      period: analysis.period
    };
    
    res.json(summary);
  } catch (error) {
    console.error('Error getting anomalies summary:', error);
    res.status(500).json({ 
      error: 'Error getting anomalies summary',
      message: error.message 
    });
  }
});

// Enhanced chat endpoint with embeddings and database access
router.post('/chat', async (req, res) => {
  try {
    const { message, userId } = req.body;
    
    if (!message) {
      return res.status(400).json({ 
        error: 'Message is required' 
      });
    }
    
    // Usar el servicio mejorado de IA
    const response = await enhancedAIService.chat(message, userId);
    
    res.json(response);
  } catch (error) {
    console.error('Error in enhanced chat:', error);
    
    // Si es un error de base de datos, usar mensaje amigable
    if (error.name && error.name.includes('Sequelize')) {
      return res.status(500).json({ 
        error: 'Error en el servidor: No se puede procesar la consulta. Por favor, reinicie el sistema o póngase en contacto con el administrador.',
        type: 'database_error',
        ...(process.env.NODE_ENV === 'development' && { details: error.message })
      });
    }
    
    res.status(500).json({ 
      error: 'Error en el servidor: No se puede procesar el mensaje. Por favor, reinicie el sistema o póngase en contacto con el administrador.',
      type: 'chat_error',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
});

// Reload knowledge base
router.post('/reload-knowledge', async (req, res) => {
  try {
    await embeddingService.reloadDocuments();
    const stats = embeddingService.getStats();
    
    res.json({
      message: 'Knowledge base reloaded successfully',
      stats
    });
  } catch (error) {
    console.error('Error reloading knowledge:', error);
    res.status(500).json({ 
      error: 'Error reloading knowledge base',
      details: error.message 
    });
  }
});

// Get knowledge base stats
router.get('/knowledge-stats', async (req, res) => {
  try {
    const stats = embeddingService.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ 
      error: 'Error getting knowledge base stats',
      details: error.message 
    });
  }
});

// Upload document
router.post('/upload-document', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó ningún archivo' });
    }

    res.json({ 
      message: 'Documento subido correctamente',
      filename: req.file.originalname 
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ 
      error: 'Error al subir el documento',
      details: error.message 
    });
  }
});

// View document
router.get('/view-document/:filename', async (req, res) => {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const { filename } = req.params;

    const filePath = path.join(embeddingService.documentsPath, filename);
    const content = await fs.readFile(filePath, 'utf-8');

    res.json({ content });
  } catch (error) {
    console.error('Error viewing document:', error);
    res.status(500).json({ 
      error: 'Error viewing document',
      details: error.message 
    });
  }
});

// Delete document
router.delete('/delete-document/:filename', async (req, res) => {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const { filename } = req.params;

    // Prevenir borrar archivos del sistema
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ 
        error: 'Nombre de archivo inválido' 
      });
    }

    const filePath = path.join(embeddingService.documentsPath, filename);
    await fs.unlink(filePath);

    res.json({ 
      message: 'Documento eliminado correctamente',
      filename 
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ 
      error: 'Error deleting document',
      details: error.message 
    });
  }
});

// Get custom instructions
router.get('/custom-instructions', async (req, res) => {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const instructionsPath = path.join(embeddingService.documentsPath, 'custom_instructions.txt');
    
    try {
      const instructions = await fs.readFile(instructionsPath, 'utf-8');
      res.json({ instructions });
    } catch (error) {
      // File doesn't exist yet
      res.json({ instructions: '' });
    }
  } catch (error) {
    console.error('Error getting custom instructions:', error);
    res.status(500).json({ 
      error: 'Error getting custom instructions',
      details: error.message 
    });
  }
});

// Save custom instructions
router.post('/custom-instructions', async (req, res) => {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const { instructions } = req.body;

    const instructionsPath = path.join(embeddingService.documentsPath, 'custom_instructions.txt');
    await fs.writeFile(instructionsPath, instructions, 'utf-8');

    res.json({ message: 'Instrucciones guardadas correctamente' });
  } catch (error) {
    console.error('Error saving custom instructions:', error);
    res.status(500).json({ 
      error: 'Error saving custom instructions',
      details: error.message 
    });
  }
});

// Get AI insights for specific employee
router.get('/employee-insights/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { days = 30 } = req.query;
    
    const analysis = await AIService.analyzeWorkPatterns(employeeId, parseInt(days));
    
    // Filter results for specific employee
    const employeeAnalysis = {
      anomalies: analysis.anomalies.filter(a => a.employeeId === employeeId),
      patterns: analysis.patterns.filter(p => p.employeeId === employeeId),
      recommendations: analysis.recommendations.filter(r => r.employeeId === employeeId),
      aiInsights: analysis.aiInsights,
      period: analysis.period,
      generatedAt: analysis.generatedAt
    };
    
    res.json(employeeAnalysis);
  } catch (error) {
    console.error('Error getting employee insights:', error);
    res.status(500).json({ 
      error: 'Error getting employee insights',
      message: error.message 
    });
  }
});

// Predict workload (simplified prediction)
router.get('/predict-workload', async (req, res) => {
  try {
    const { weeks = 4 } = req.query;
    
    // This is a simplified prediction - in a real scenario you'd use more sophisticated ML
    const analysis = await AIService.analyzeWorkPatterns(null, parseInt(weeks) * 7);
    
    const prediction = {
      nextWeek: {
        expectedRecords: Math.round(analysis.anomalies.length * 0.8), // Simplified
        riskLevel: analysis.anomalies.length > 10 ? 'high' : analysis.anomalies.length > 5 ? 'medium' : 'low',
        recommendations: analysis.recommendations.slice(0, 3)
      },
      nextMonth: {
        expectedAnomalies: Math.round(analysis.anomalies.length * 1.2), // Simplified trend
        suggestedActions: [
          'Revisar horarios de empleados con más anomalías',
          'Implementar recordatorios automáticos de fichaje',
          'Considerar ajustes en los horarios de trabajo'
        ]
      },
      trends: {
        lateArrivals: analysis.anomalies.filter(a => a.type === 'late_arrival').length,
        earlyDepartures: analysis.anomalies.filter(a => a.type === 'early_departure').length,
        missingRecords: analysis.anomalies.filter(a => a.type.includes('missing')).length
      },
      generatedAt: new Date()
    };
    
    res.json(prediction);
  } catch (error) {
    console.error('Error predicting workload:', error);
    res.status(500).json({ 
      error: 'Error predicting workload',
      message: error.message 
    });
  }
});

// Generate smart alerts
router.get('/smart-alerts', async (req, res) => {
  try {
    const analysis = await AIService.analyzeWorkPatterns(null, 7); // Last week
    
    const alerts = [];
    
    // High severity anomalies
    const highSeverityAnomalies = analysis.anomalies.filter(a => a.severity === 'high');
    if (highSeverityAnomalies.length > 0) {
      alerts.push({
        type: 'critical',
        title: 'Anomalías Críticas Detectadas',
        message: `${highSeverityAnomalies.length} anomalías de alta severidad en la última semana`,
        count: highSeverityAnomalies.length,
        priority: 'high',
        action: 'review_immediately'
      });
    }
    
    // Repeated patterns
    const employeeAnomalyCounts = analysis.anomalies.reduce((acc, anomaly) => {
      acc[anomaly.employeeId] = (acc[anomaly.employeeId] || 0) + 1;
      return acc;
    }, {});
    
    const problematicEmployees = Object.entries(employeeAnomalyCounts)
      .filter(([_, count]) => count >= 3)
      .map(([employeeId, count]) => ({ employeeId, count }));
    
    if (problematicEmployees.length > 0) {
      alerts.push({
        type: 'pattern',
        title: 'Patrones Problemáticos',
        message: `${problematicEmployees.length} empleados con múltiples anomalías`,
        employees: problematicEmployees,
        priority: 'medium',
        action: 'schedule_meeting'
      });
    }
    
    // Missing records
    const missingRecords = analysis.anomalies.filter(a => a.type.includes('missing'));
    if (missingRecords.length > 5) {
      alerts.push({
        type: 'system',
        title: 'Registros Faltantes',
        message: `${missingRecords.length} registros faltantes detectados`,
        count: missingRecords.length,
        priority: 'medium',
        action: 'check_system'
      });
    }
    
    // Positive trends
    if (analysis.anomalies.length < 5) {
      alerts.push({
        type: 'positive',
        title: 'Buen Rendimiento',
        message: 'Pocas anomalías detectadas - el equipo está funcionando bien',
        priority: 'low',
        action: 'maintain_current'
      });
    }
    
    res.json({
      alerts,
      totalAlerts: alerts.length,
      generatedAt: new Date(),
      period: '7 días'
    });
    
  } catch (error) {
    console.error('Error generating smart alerts:', error);
    res.status(500).json({ 
      error: 'Error generating smart alerts',
      message: error.message 
    });
  }
});

// Specific employee data queries
router.post('/employee-query/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const response = await AIService.getEmployeeInsights(employeeId, query);
    res.json(response);
  } catch (error) {
    console.error('Error processing employee query:', error);
    res.status(500).json({ error: 'Error al procesar la consulta' });
  }
});

export default router;
