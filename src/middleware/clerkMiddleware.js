import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';

// Middleware para verificar autenticación con Clerk
export const requireAuth = ClerkExpressRequireAuth({
  // Configuración opcional
  onError: (error, req, res, next) => {
    console.error('Clerk auth error:', error);
    res.status(401).json({ 
      error: 'No autorizado. Debes iniciar sesión.' 
    });
  }
});

// Middleware para verificar rol de administrador
export const requireAdmin = (req, res, next) => {
  try {
    const { userId, sessionClaims } = req.auth;
    
    if (!userId) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Verificar si el usuario tiene rol de admin
    const userRole = sessionClaims?.metadata?.role || 'employee';
    
    if (userRole !== 'admin') {
      console.warn(`🚨 Non-admin user ${userId} attempted admin access`);
      return res.status(403).json({ 
        error: 'Acceso denegado. Se requieren permisos de administrador.' 
      });
    }

    // Añadir información del usuario al request
    req.user = {
      id: userId,
      role: userRole,
      email: sessionClaims?.email,
      name: sessionClaims?.firstName + ' ' + sessionClaims?.lastName
    };

    next();
  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Middleware para verificar que el usuario es empleado
export const requireEmployee = (req, res, next) => {
  try {
    const { userId, sessionClaims } = req.auth;
    
    if (!userId) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Obtener información del empleado desde Clerk metadata
    const employeeCode = sessionClaims?.metadata?.employeeCode;
    const userRole = sessionClaims?.metadata?.role || 'employee';
    
    if (!employeeCode) {
      return res.status(403).json({ 
        error: 'Usuario no asociado a un empleado válido' 
      });
    }

    // Añadir información del usuario al request
    req.user = {
      id: userId,
      employeeCode,
      role: userRole,
      email: sessionClaims?.email,
      name: sessionClaims?.firstName + ' ' + sessionClaims?.lastName
    };

    next();
  } catch (error) {
    console.error('Employee verification error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Middleware para logging de actividad con Clerk
export const clerkActivityLogger = (req, res, next) => {
  const { userId, sessionClaims } = req.auth || {};
  
  if (userId) {
    console.log(`📊 Clerk Activity: ${req.method} ${req.path} - User: ${userId} (${sessionClaims?.email})`);
  }
  
  next();
};
