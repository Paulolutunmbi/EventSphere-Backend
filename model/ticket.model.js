import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const ticketSchema = new mongoose.Schema(
  {
    ticketId: {
      type:     String,
      default:  uuidv4,   // unique human-readable ID encoded in the QR
      unique:   true,
      index:    true,
    },
    eventId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Event',
      required: true,
      index:    true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    // who holds the ticket
    attendeeName: {
      type:     String,
      required: true,
      trim:     true,
    },
    attendeeEmail: {
      type:     String,
      required: true,
      trim:     true,
      lowercase: true,
    },
    // 'free' | 'paid'
    ticketType: {
      type:    String,
      default: 'free',
    },
    price: {
      type:    Number,
      default: 0,
    },
    
    // 'pending' → waiting for payment verification
    // 'confirmed' → ready to use
    // 'checked-in' → scanned at the door
    status: {
      type:    String,
      enum:    ['pending', 'confirmed', 'checked-in'],
      default: 'pending',
    },
    paymentReference: {
      type:    String,
      default: '',
    },
    ticketReference: {
      type: String,
      default: '',
      index: true,
    },
    transactionReference: {
      type: String,
      default: '',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'successful', 'failed'],
      default: 'pending',
    },
    amountPaid: {
      type: Number,
      default: 0,
    },
    paystackStatus: {
      type: String,
      default: '',
    },
    paystackPayload: {
      type: Object,
      default: null,
    },
    qrCodeText: {
      type: String,
      default: '',
    },
    qrCodeData: {
      type: String,
      default: '',
    },
    checkedInAt: {
      type:    Date,
      default: null,
    },
  },
  { timestamps: true }
)

ticketSchema.pre('save', function syncTicketReference(next) {
  if (!this.ticketReference) {
    this.ticketReference = this.ticketId
  }
  next()
})

ticketSchema.index(
  { paymentReference: 1 },
  {
    unique: true,
    partialFilterExpression: { paymentReference: { $type: 'string', $gt: '' } },
  }
)

export default mongoose.model('Ticket', ticketSchema)
