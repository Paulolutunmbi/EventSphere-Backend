import jwt from 'jsonwebtoken'
import { sendError } from '../utils/response.js'
 
export default function requireAuth(req, res, next) {
  const auth = req.headers.authorization
 
  if (!auth || !auth.startsWith('Bearer ')) {
    return sendError(res, 401, 'Unauthorized — no token provided')
  }
 
  const token = auth.slice(7) // strip "Bearer "
 
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded // { userId, email, iat, exp }
    next()
  } catch (err) {
    return sendError(res, 401, 'Token invalid or expired')
  }
}
 
