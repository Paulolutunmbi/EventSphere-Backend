import mongoose from 'mongoose'
 
const userSchema = new mongoose.Schema(
  {
    email: {
      type:     String,
      required: true,
      unique:   true,
      lowercase: true,
      trim:     true,
    },
    name: {
      type:    String,
      default: '',
      trim:    true,
    },
    // Add more fields as your app grows:
    // avatar: String,
    // bio:    String,
  },
  {
    timestamps: true, // adds createdAt + updatedAt automatically
  }
)
 
export default mongoose.model('User', userSchema)