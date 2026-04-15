const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  try {
    // Check if Authorization header exists
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authentication token, authorization denied.' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No authentication token, authorization denied.' });
    }

    // Verify token
    const verified = jwt.verify(token, process.env.JWT_SECRET || 'jwt_secret_redacted');
    
    // Add user from payload to request object
    req.user = verified;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token is invalid or expired.' });
  }
};

module.exports = auth;
