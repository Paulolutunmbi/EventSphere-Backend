import mongoose from 'mongoose'
 
const userSchema = new mongoose.Schema(
  {
    email: {
      type:     String,
      required: true,
      unique:   true,
      lowercase: true,
    passwordHash: {
      type:    String,
      default: '',
    },
    isEmailVerified: {
      type:    Boolean,
      default: false,
    },
    verifiedAt: {
      type:    Date,
      default: null,
    },
    timestamps: true, // adds createdAt + updatedAt automatically
  }
)
 
export default mongoose.model('User', userSchema)