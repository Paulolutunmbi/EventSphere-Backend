import mongoose from 'mongoose'

const contestantSchema = new mongoose.Schema(
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
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    voteCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    voterCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
)

contestantSchema.index({ eventId: 1, awardId: 1, slug: 1 }, { unique: true })

export default mongoose.model('Contestant', contestantSchema)
