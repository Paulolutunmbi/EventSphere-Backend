import mongoose from 'mongoose';

const connectDB = async () => {
    try {
        const mongoUri = process.env.DB_URI;

        if (!mongoUri) {
            throw new Error('MongoDB connection string is missing. Set DB_URI or MONGODB_URI in your .env file.');
        }

        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB successfully');
    } catch (error) {
        console.error('MongoDB connection failed:', error.message);
        process.exit(1);
    }
};
 

export default connectDB;
