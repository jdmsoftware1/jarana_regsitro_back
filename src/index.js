import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import sequelize, { testConnection } from './config/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import employeeRoutes from './routes/employees.js';
import recordRoutes from './routes/records.js';
import adminRoutes from './routes/admin.js';
import kioskRoutes from './routes/kiosk.js';
import scheduleRoutes from './routes/schedules.js';
import scheduleTemplateRoutes from './routes/scheduleTemplates.js';
import vacationRoutes from './routes/vacations.js';
import aiRoutes from './routes/ai.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// Middleware
app.use(helmet());
app.use(limiter);

// CORS configuration - Multiple origins for admin and kiosk
const corsOptions = {
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173', // Original frontend
    process.env.ADMIN_URL || 'http://localhost:5174',   // Admin panel
    process.env.KIOSK_URL || 'http://localhost:5175',   // Kiosk interface
    /^https:\/\/admin\.jarana\./,                        // Production admin
    /^https:\/\/kiosk\.jarana\./,                        // Production kiosk
    /^https:\/\/.*-admin\.netlify\.app$/,                // Netlify admin
    /^https:\/\/.*-kiosk\.netlify\.app$/                 // Netlify kiosk
  ],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/kiosk', kioskRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/schedule-templates', scheduleTemplateRoutes);
app.use('/api/vacations', vacationRoutes);
app.use('/api/ai', aiRoutes);

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Database connection and server start
async function startServer() {
  try {
    // Test database connection
    await testConnection();
    
    // Import models to ensure associations are loaded
    await import('./models/index.js');
    
    // Sync database models
    await sequelize.sync({ alter: true });
    console.log('✅ Database models synchronized.');
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV}`);
      console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('❌ Unable to start server:', error);
    process.exit(1);
  }
}

startServer();
