import mongoose from 'mongoose'

const voteSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
      index: true,
    },
    awardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Award',
      required: true,
      index: true,
    },
    contestantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contestant',
      required: true,
      index: true,
    },
    nomineeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contestant',
      index: true,
    },
    voterName: {
      type: String,
      required: true,
      trim: true,
    },
    voterEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    amountPaid: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentReference: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    transactionReference: {
      type: String,
      default: '',
      trim: true,
    },
    paymentStatus: {
      type: String,
      default: 'successful',
    },
    paystackStatus: {
      type: String,
      default: 'success',
    },
    paystackPayload: {
      type: Object,
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

voteSchema.index({ eventId: 1, awardId: 1, contestantId: 1 })
voteSchema.index({ eventId: 1, createdAt: -1 })
voteSchema.index({ eventId: 1, awardId: 1, createdAt: -1 })
voteSchema.index({ nomineeId: 1 })
voteSchema.index({ voterEmail: 1 })
voteSchema.index({ createdAt: -1 })

export default mongoose.model('Vote', voteSchema)
