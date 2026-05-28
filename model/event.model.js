import mongoose from 'mongoose'

const eventSchema = new mongoose.Schema(
  {
    organizerId: {
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

export default mongoose.model('Event', eventSchema)