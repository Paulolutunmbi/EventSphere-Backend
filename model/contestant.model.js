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
    createdByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    imageUrl: {
      type: String,
      default: '',
      trim: true,
    },
    category: {
      type: String,
      default: '',
      trim: true,
    },
    voteMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
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
