const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/MyCoinwise')
  .then(async () => {
    console.log("✅ Successfully connected to MongoDB.");
    
    // Check all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`Found ${collections.length} collections.`);
    
    for (const col of collections) {
      const count = await mongoose.connection.db.collection(col.name).countDocuments();
      console.log(`- ${col.name}: ${count} documents`);
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });
