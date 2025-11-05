export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Database connection errors
  if (err.name === 'SequelizeConnectionError' || err.name === 'SequelizeConnectionRefusedError') {
    console.error('❌ Error de conexión a la base de datos:', err.message);
    return res.status(503).json({ 
      error: 'Error en el servidor: No se puede conectar con la base de datos. Por favor, reinicie el sistema o póngase en contacto con el administrador.',
      type: 'database_connection',
      ...(process.env.NODE_ENV === 'development' && { details: err.message })
    });
  }

  // Database errors (queries, syntax, etc.)
  if (err.name === 'SequelizeDatabaseError') {
    console.error('❌ Error en la base de datos:', err.message);
    return res.status(500).json({ 
      error: 'Error en el servidor: Ha ocurrido un error en la base de datos. Por favor, reinicie el sistema o póngase en contacto con el administrador.',
      type: 'database_error',
      ...(process.env.NODE_ENV === 'development' && { details: err.message, sql: err.sql })
    });
  }

  // Timeout errors
  if (err.name === 'SequelizeTimeoutError') {
    console.error('❌ Timeout en la base de datos:', err.message);
    return res.status(504).json({ 
      error: 'Error en el servidor: La base de datos no responde. Por favor, reinicie el sistema o póngase en contacto con el administrador.',
      type: 'database_timeout',
      ...(process.env.NODE_ENV === 'development' && { details: err.message })
    });
  }

  // Sequelize validation errors
  if (err.name === 'SequelizeValidationError') {
    const errors = err.errors.map(error => ({
      field: error.path,
      message: error.message
    }));
    return res.status(400).json({ 
      error: 'Error de validación', 
      details: errors 
    });
  }

  // Sequelize unique constraint errors
  if (err.name === 'SequelizeUniqueConstraintError') {
    const field = err.errors[0]?.path || 'field';
    return res.status(409).json({ 
      error: `El campo ${field} ya existe` 
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Token inválido' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expirado' });
  }

  // Network/Connection errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
    console.error('❌ Error de conexión de red:', err.message);
    return res.status(503).json({ 
      error: 'Error en el servidor: No se puede establecer conexión. Por favor, reinicie el sistema o póngase en contacto con el administrador.',
      type: 'network_error',
      ...(process.env.NODE_ENV === 'development' && { details: err.message })
    });
  }

  // Default server error
  console.error('❌ Error interno del servidor:', err.message);
  res.status(err.status || 500).json({
    error: 'Error en el servidor: Ha ocurrido un error interno. Por favor, reinicie el sistema o póngase en contacto con el administrador.',
    type: 'internal_error',
    ...(process.env.NODE_ENV === 'development' && { details: err.message, stack: err.stack })
  });
};
