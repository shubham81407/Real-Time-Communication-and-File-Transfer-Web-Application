const jwt = require('jsonwebtoken');
const { get } = require('../db');

async function verifyTokenString(token) {
  if (!token || typeof token !== 'string' || token.trim() === '') {
    return { valid: false, error: 'Missing session token.' };
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    if (!decoded || typeof decoded !== 'object') {
      return { valid: false, error: 'Malformed token payload.' };
    }

    const userId = Number(decoded.userId);
    const tokenVersion = Number(decoded.tokenVersion);

    if (!Number.isInteger(userId) || userId <= 0) {
      return { valid: false, error: 'Token userId is invalid.' };
    }

    if (!Number.isInteger(tokenVersion) || tokenVersion < 1) {
      return { valid: false, error: 'Token version is invalid.' };
    }

    const user = await get(
      'SELECT id, username, email, token_version FROM users WHERE id = ?',
      [userId]
    );

    if (!user) {
      return { valid: false, error: 'User not found.' };
    }

    // JWT me stored tokenVersion aur DB ke current token_version same hona chahiye.
    // Agar mismatch hua, matlab session revoke ho chuka hai; token ko reject karna hi safe hai.
    if (Number(user.token_version) !== tokenVersion) {
      return { valid: false, error: 'Session revoked.' };
    }

    return {
      valid: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    };
  } catch (error) {
    return {
      valid: false,
      error: error && error.name === 'TokenExpiredError'
        ? 'Token expired.'
        : 'Invalid session token.',
    };
  }
}

async function authenticateToken(req, res, next) {
  const token = req.cookies && req.cookies.token ? req.cookies.token : null;
  const verification = await verifyTokenString(token);

  if (!verification.valid) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }

  req.user = verification.user;
  return next();
}

module.exports = {
  verifyTokenString,
  authenticateToken,
};
