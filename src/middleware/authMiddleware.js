import jwt from 'jsonwebtoken';
import { Employee } from '../models/index.js';

export const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const employee = await Employee.findByPk(decoded.employeeId);
    if (!employee || !employee.isActive) {
      return res.status(401).json({ error: 'Invalid token or inactive employee.' });
    }

    req.employee = employee;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired.' });
    }
    res.status(500).json({ error: 'Server error during authentication.' });
  }
};

export const adminMiddleware = (req, res, next) => {
  if (req.employee.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
  }
  next();
};
