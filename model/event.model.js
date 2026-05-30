import mongoose from 'mongoose'

const eventSchema = new mongoose.Schema(
  {
    organizerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    createdByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    startDate: {
      type: String,
      required: true,
    },
    startTime: {
      type: String,
      required: true,
    },
    endDate: {
      type: String,
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },
    location: {
      type: String,
      default: '',
      trim: true,
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    ticketPrice: {
      type: String,
      default: 'Free',
      trim: true,
    },
    ticketPrices: {
      type: {
        regular: { type: Number, default: 0 },
        vip: { type: Number, default: 0 },
        table: { type: Number, default: 0 },
      },
      default: null,
    },
    requireApproval: {
      type: Boolean,
      default: false,
    },
    votingRules: {
      type: String,
      default: '',
      trim: true,
    },
    capacity: {
      type: String,
      default: 'Unlimited',
      trim: true,
    },
    theme: {
      type: String,
      default: 'minimal',
      trim: true,
    },
    coverImage: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    invitedGuests: {
      type: [
        {
          email: {
            type: String,
            required: true,
            trim: true,
          },
          sentAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      default: [],
    },
    coHosts: {
      type: [
        {
          name: { type: String, required: true, trim: true },
          email: { type: String, required: true, trim: true },
          role: { type: String, default: 'Co-host', trim: true },
          addedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    rsvps: {
      type: [
        {
          name: { type: String, required: true, trim: true },
          email: { type: String, required: true, trim: true },
          note: { type: String, default: '', trim: true },
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

eventSchema.index({ organizerId: 1 })
eventSchema.index({ slug: 1 })
eventSchema.index({ createdAt: -1 })

export default mongoose.model('Event', eventSchema)