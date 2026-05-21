import mongoose from 'mongoose'

const awardSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    nominees: {
      type: [
        {
          type: String,
          trim: true,
        },
      ],
      default: [],
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length <= 6
        },
        message: 'An award can have at most 6 nominees',
      },
    },
    votes: {
      type: [
        {
          name: { type: String, required: true, trim: true },
          email: { type: String, required: true, trim: true, lowercase: true },
          nominee: { type: String, required: true, trim: true },
          quantity: { type: Number, default: 1, min: 1 },
          amount: { type: Number, default: 0, min: 0 },
          paymentReference: { type: String, default: '', trim: true },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
)

awardSchema.index({ eventId: 1, title: 1 }, { unique: true })

export default mongoose.model('Award', awardSchema)