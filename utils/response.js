export function sendSuccess(res, message, data = null, status = 200) {
  return res.status(status).json({ success: true, message, data })
}

export function sendError(res, status, message, data = null) {
  return res.status(status).json({ success: false, message, data })
}
