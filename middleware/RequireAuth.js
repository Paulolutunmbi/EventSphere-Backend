import jwt from 'jsonwebtoken'
 
export default function requireAuth(req, res, next) {
  const auth = req.headers.authorization
 
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized — no token provided', success: false })
  }
 
  const token = auth.slice(7) // strip "Bearer "
 
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded // { userId, email, iat, exp }
    next()
  } catch (err) {
    return res.status(401).json({ message: 'Token invalid or expired', success: false })
  }
}
 
