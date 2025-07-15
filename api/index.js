import express from 'express'
import cors from 'cors'
import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

console.log('🔗 Initializing server...')
// Load environment variables
dotenv.config()

const app = express()

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

// Global connection variable for serverless
let cachedClient = null

async function connectToDatabase() {
  if (cachedClient) {
    return cachedClient
  }

  try {
    const client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    })
    
    await client.connect()
    cachedClient = client
    db = client.db(DB_NAME)
    console.log('✅ Connected to MongoDB Atlas')
    
    // Create indexes for better performance
    await db.collection(COLLECTION_NAME).createIndex({ email: 1 }, { unique: true })
    console.log('✅ Database indexes created')
    
    return client
  } catch (error) {
    console.error('❌ MongoDB connection error:', error)
    throw error
  }
}

// Validation helpers
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Middleware to ensure database connection
const ensureDBConnection = async (req, res, next) => {
  try {
    if (!db) {
      await connectToDatabase()
    }
    next()
  } catch (error) {
    console.error('Database connection failed:', error)
    res.status(500).json({
      success: false,
      message: 'Database connection failed'
    })
  }
}

// Routes

// Health check
app.get('/api/health', ensureDBConnection, (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: db ? 'Connected' : 'Disconnected'
  })
})

// Get waitlist statistics
app.get('/api/waitlist/stats', ensureDBConnection, async (req, res) => {
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

// Get all waitlist entries
app.get('/api/admin/waitlist', ensureDBConnection, async (req, res) => {
  try {
    const collection = db.collection(COLLECTION_NAME)
    
    // Get query parameters for pagination and sorting
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 50
    const sortBy = req.query.sortBy || 'createdAt'
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1
    
    // Validate limit (max 100 entries per request)
    const maxLimit = Math.min(limit, 100)
    const skip = (page - 1) * maxLimit
    
    // Build sort object
    const sort = {}
    sort[sortBy] = sortOrder
    
    // Get total count for pagination info
    const totalCount = await collection.countDocuments()
    const totalPages = Math.ceil(totalCount / maxLimit)
    
    // Get waitlist entries
    const entries = await collection
      .find({})
      .sort(sort)
      .skip(skip)
      .limit(maxLimit)
      .project({
        email: 1,
        createdAt: 1,
        source: 1,
        _id: 1
      })
      .toArray()
    
    res.json({
      success: true,
      data: {
        entries,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
          limit: maxLimit
        },
        sorting: {
          sortBy,
          sortOrder: sortOrder === 1 ? 'asc' : 'desc'
        }
      }
    })
    
  } catch (error) {
    console.error('Error getting waitlist entries:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get waitlist entries'
    })
  }
})

// Add to waitlist
app.post('/api/waitlist', ensureDBConnection, async (req, res) => {
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
app.post('/api/waitlist/check', ensureDBConnection, async (req, res) => {
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

// Export for Vercel
export default app
