import mongoose from 'mongoose'

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // MongoDB will automatically delete documents when expiresAt is reached
    },
    attempts: {
      type: Number,
      default: 0,
      max: 5, // Max 5 verification attempts
    },
    name: {
      type: String,
      default: '',
    },
    purpose: {
      type: String,
      enum: ['signup'],
      default: 'signup',
    },
  },
  { timestamps: true }
)

// Ensure only one OTP per email at a time
otpSchema.index({ email: 1 }, { unique: true, sparse: true })

export default mongoose.model('OTP', otpSchema)
