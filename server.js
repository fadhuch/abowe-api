import express from 'express'
import cors from 'cors'
import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

console.log('🔗 Initializing server...s')
// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 5001

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://www.abowe.ae'] // Replace with your actual domain
    : ['http://localhost:5173', 'http://localhost:3000']
}))
app.use(express.json({ limit: '10mb' }))

// MongoDB connection
let db
const MONGODB_URI = process.env.MONGODB_URI
const DB_NAME = 'abowe-whitelist'
const COLLECTION_NAME = 'waitlist'

async function connectToDatabase() {
  try {
    const client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    })
    await client.connect()
    db = client.db(DB_NAME)
    console.log('✅ Connected to MongoDB Atlas')
    
    // Create indexes for better performance
    await db.collection(COLLECTION_NAME).createIndex({ email: 1 }, { unique: true })
    console.log('✅ Database indexes created')
  } catch (error) {
    console.error('❌ MongoDB connection error:', error)
    process.exit(1)
  }
}

// Validation helpers
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: db ? 'Connected' : 'Disconnected'
  })
})

// Get waitlist statistics
app.get('/api/waitlist/stats', async (req, res) => {
  try {
    const collection = db.collection(COLLECTION_NAME)
    const count = await collection.countDocuments()
    
    res.json({
      success: true,
      data: {
        totalCount: count,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('Error getting stats:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get waitlist statistics'
    })
  }
})

// Add to waitlist
app.post('/api/waitlist', async (req, res) => {
  try {
    const { email } = req.body

    // Validation
    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      })
    }

    const sanitizedEmail = email.trim().toLowerCase()

    // Check if email already exists
    const collection = db.collection(COLLECTION_NAME)
    const existingUser = await collection.findOne({ email: sanitizedEmail })

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'This email is already on our waitlist!'
      })
    }

    // Create new waitlist entry
    const newEntry = {
      email: sanitizedEmail,
      createdAt: new Date(),
      source: 'landing-page',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    }

    const result = await collection.insertOne(newEntry)

    console.log(`✅ New waitlist entry: ${sanitizedEmail}`)

    res.status(201).json({
      success: true,
      message: 'Successfully added to waitlist',
      data: {
        id: result.insertedId,
        email: sanitizedEmail
      }
    })

  } catch (error) {
    console.error('Error adding to waitlist:', error)
    
    // Handle duplicate key error (race condition)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'This email is already on our waitlist!'
      })
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    })
  }
})

// Check if email exists (for frontend validation)
app.post('/api/waitlist/check', async (req, res) => {
  try {
    const { email } = req.body

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      })
    }

    const collection = db.collection(COLLECTION_NAME)
    const exists = await collection.findOne({ email: email.trim().toLowerCase() })

    res.json({
      success: true,
      exists: !!exists
    })

  } catch (error) {
    console.error('Error checking email:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to check email'
    })
  }
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  })
})

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  })
})

// Start server
async function startServer() {
  console.log('🔗 Starting server...')
  await connectToDatabase()
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`)
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`)
    console.log(`🔗 API endpoints:`)
    console.log(`   POST /api/waitlist - Add to waitlist`)
    console.log(`   POST /api/waitlist/check - Check if email exists`)
    console.log(`   GET  /api/waitlist/stats - Get statistics`)
  })
}

startServer().catch(console.error)

export default app
