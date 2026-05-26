import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import connectDB from './config/db.js'
import authRoutes from './routes/Auth.route.js'
import eventRoutes from './routes/Event.route.js'
import ticketRoutes from './routes/Ticket.route.js'
import awardRoutes from './routes/Award.route.js'

const app = express()

const parseOriginList = (value) =>
  (value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

const allowedOrigins = new Set([
  ...parseOriginList(process.env.FRONTEND_URLS),
  ...parseOriginList(process.env.FRONTEND_URL),
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3333',
])

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true)
      }
      return callback(new Error('Not allowed by CORS'))
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)
app.use(express.json({ limit: '10mb' }))

// health check — hit this first in Thunder Client to confirm server is up
app.get('/', (req, res) => res.json({ success: true, message: 'EventsNest API is running ✅', data: null }))

// routes
app.use('/api/auth', authRoutes)
app.use('/api/events', eventRoutes)
app.use('/api/tickets', ticketRoutes)
app.use('/api/awards', awardRoutes)

// fallback — shows all registered routes if a path isn't found
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Cannot ${req.method} ${req.path}`, data: null })
})

// use PORT from .env, or 3333 as fallback if PORT is missing
const PORT = process.env.PORT || 3333

const startApp = async () => {
  try {
    await connectDB()
    app.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`)
      console.log(`✅ Test: http://localhost:${PORT}/api/auth/send-otp`)
    })
  } catch (error) {
    console.error('❌ Failed to start server:', error.message)
    process.exit(1)
  }
}

startApp()