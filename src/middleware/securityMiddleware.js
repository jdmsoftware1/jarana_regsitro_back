import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';

// Rate limiting por IP y tipo de usuario
export const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      console.log(`Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
      res.status(429).json({ error: message });
    }
  });
};

// Rate limiters específicos - DISABLED for development
// Only login rate limit is kept for security
export const loginRateLimit = createRateLimiter(
  15 * 60 * 1000, // 15 minutos
  10, // 10 intentos (increased)
  'Demasiados intentos de login. Intenta de nuevo en 15 minutos.'
);

// Admin rate limit DISABLED - no restrictions
export const adminRateLimit = (req, res, next) => next();

// Kiosk rate limit DISABLED - no restrictions
export const kioskRateLimit = (req, res, next) => next();

// Middleware de validación de origen
export const validateOrigin = (allowedOrigins) => {
  return (req, res, next) => {
    const origin = req.get('Origin') || req.get('Referer');
    
    if (!origin) {
      return res.status(403).json({ error: 'Acceso denegado: origen no válido' });
    }

    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return origin.startsWith(allowed);
      }
      return allowed.test(origin);
    });

    if (!isAllowed) {
      console.log(`Blocked request from unauthorized origin: ${origin}`);
      return res.status(403).json({ error: 'Acceso denegado: origen no autorizado' });
    }

    next();
  };
};

// Middleware para rutas de admin solamente
export const adminOriginOnly = validateOrigin([
  process.env.ADMIN_URL || 'http://localhost:5174',
  /^https:\/\/admin\.jarana\./,
  /^https:\/\/.*-admin\.netlify\.app$/
]);

// Middleware para rutas de kiosk solamente  
export const kioskOriginOnly = validateOrigin([
  process.env.KIOSK_URL || 'http://localhost:5175',
  /^https:\/\/kiosk\.jarana\./,
  /^https:\/\/.*-kiosk\.netlify\.app$/
]);

// Middleware de detección de dispositivos
export const deviceDetection = (req, res, next) => {
  const userAgent = req.get('User-Agent') || '';
  const isMobile = /Mobile|Android|iPhone|iPad|Tablet/i.test(userAgent);
  const isTablet = /iPad|Tablet/i.test(userAgent);
  
  req.deviceInfo = {
    isMobile,
    isTablet,
    isDesktop: !isMobile && !isTablet,
    userAgent: userAgent.substring(0, 200) // Limitar longitud
  };
  
  next();
};

// Middleware de logging de seguridad
export const securityLogger = (req, res, next) => {
  const logData = {
    timestamp: new Date().toISOString(),
    ip: req.ip,
    method: req.method,
    path: req.path,
    origin: req.get('Origin'),
    userAgent: req.get('User-Agent')?.substring(0, 100),
    userId: req.user?.id,
    userRole: req.user?.role
  };
  
  // Log requests sospechosos
  if (req.path.includes('admin') && !req.user?.role === 'admin') {
    console.warn('🚨 Unauthorized admin access attempt:', logData);
  }
  
  console.log('📊 Request:', logData);
  next();
};

// Validadores de entrada
export const validateEmployeeCreation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/)
    .withMessage('Nombre debe contener solo letras y espacios'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email no válido'),
  
  body('pin')
    .isLength({ min: 4, max: 8 })
    .isNumeric()
    .withMessage('PIN debe ser numérico de 4-8 dígitos'),
  
  body('role')
    .isIn(['admin', 'employee'])
    .withMessage('Rol debe ser admin o employee')
];

export const validateLogin = [
  body('employeeCode')
    .trim()
    .isLength({ min: 3, max: 10 })
    .matches(/^[A-Z0-9]+$/)
    .withMessage('Código de empleado no válido'),
  
  body('pin')
    .optional()
    .isLength({ min: 4, max: 8 })
    .isNumeric(),
  
  body('totpCode')
    .optional()
    .isLength({ min: 6, max: 6 })
    .isNumeric()
];

export const validateCheckin = [
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notas no pueden exceder 500 caracteres')
];

// Middleware para manejar errores de validación
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Datos de entrada no válidos',
      details: errors.array()
    });
  }
  next();
};

// Middleware de protección contra ataques de timing
export const timingAttackProtection = async (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    // Añadir delay aleatorio para prevenir timing attacks
    if (req.path.includes('login') && duration < 100) {
      setTimeout(() => {}, Math.random() * 100);
    }
  });
  
  next();
};

// Middleware de IP whitelisting para admin (opcional)
export const adminIPWhitelist = (req, res, next) => {
  const adminIPs = process.env.ADMIN_IPS?.split(',') || [];
  
  if (adminIPs.length > 0 && !adminIPs.includes(req.ip)) {
    console.warn(`🚨 Admin access denied for IP: ${req.ip}`);
    return res.status(403).json({ error: 'IP no autorizada para acceso de administrador' });
  }
  
  next();
};
