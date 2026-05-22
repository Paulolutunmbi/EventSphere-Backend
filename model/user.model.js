import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },
    name: {
      type: String,
      default: '',
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    // DEPRECATED: passwordHash - no longer used in OTP-only auth
    passwordHash: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
)

export default mongoose.model('User', userSchema)