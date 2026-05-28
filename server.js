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

// 1. Clean up your Set definitions (remove trailing slashes)
const allowedOrigins = new Set([
  ...parseOriginList(process.env.FRONTEND_URLS),
  ...parseOriginList(process.env.FRONTEND_URL),
  'https://eventsnest.xyz',
  'https://www.eventsnest.xyz',
  'https://events-nest-frontend.vercel.app', // Removed trailing slash

  // 👇 ADD THESE LOCALHOST URLS HERE 👇
  'http://localhost:5173', 
  'http://127.0.0.1:5173'
])

// 2. Corrected CORS implementation
app.use(cors({
  origin(origin, callback) {
    // Allow server-to-server or tools like Postman/Thunder Client (where origin is undefined)
    if (!origin) return callback(null, true)
    
    // Correct method for Sets is .has()
    if (allowedOrigins.has(origin)) return callback(null, true)
    
    // Fallback regex logic for subdomains
    try {
      const host = origin.replace(/^https?:\/\//, '').split(':')[0]
      if (host.endsWith('eventsnest.xyz')) return callback(null, true)
    } catch (e) {
      // Clean fail-through
    }
    
    // If it doesn't match anything, deny it safely
    return callback(new Error('Not allowed by CORS'), false)
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true // Optional: Add this if you ever plan to pass cookies/sessions
}))


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