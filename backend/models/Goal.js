const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
  // ── Core ──────────────────────────────────────────────────────────────────
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is required'],
    index: true 
  },
  name: { 
    type: String, 
    required: [true, 'Goal name is required'], 
    maxlength: [255, 'Goal name cannot exceed 255 characters'], 
    trim: true 
  },
  target: { 
    type: mongoose.Schema.Types.Decimal128, 
    required: [true, 'Target amount is required'], 
    min: 0.01,
    validate: {
      validator: function(v) {
        return parseFloat(v) > 0;
      },
      message: 'Target amount must be greater than 0'
    }
  },
  saved: { 
    type: mongoose.Schema.Types.Decimal128, 
    default: 0, 
    min: 0,
    validate: {
      validator: function(v) {
        return parseFloat(v) <= parseFloat(this.target);
      },
      message: 'Saved amount cannot exceed target amount'
    }
  },
  color: { 
    type: String, 
    default: '#7c3aed', 
    maxlength: 20,
    match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Please provide a valid hex color code']
  },
  icon: { 
    type: String, 
    default: '🎯', 
    maxlength: 10 
  },

  // ── Goal Intelligence ──────────────────────────────────────────────────────
  deadline: { 
    type: Date, 
    default: null,
    validate: {
      validator: function(v) {
        return v === null || v > new Date();
      },
      message: 'Deadline must be in the future'
    }
  },
  priority: { 
    type: String, 
    enum: {
      values: ['low', 'medium', 'high', 'critical'],
      message: 'Priority must be low, medium, high, or critical'
    },
    default: 'medium',
    index: true
  },
  category: { 
    type: String, 
    enum: {
      values: ['savings', 'debt', 'purchase', 'investment', 'other'],
      message: 'Invalid category'
    },
    default: 'savings',
    index: true 
  },
  notes: { 
    type: String, 
    default: null, 
    maxlength: [1000, 'Notes cannot exceed 1000 characters'] 
  },
  auto_save_amount: { 
    type: mongoose.Schema.Types.Decimal128, 
    default: 0,
    min: 0
  },
  auto_save_interval: { 
    type: String, 
    enum: {
      values: ['daily', 'weekly', 'monthly', null],
      message: 'Interval must be daily, weekly, or monthly'
    },
    default: null 
  },
  auto_save_enabled: { 
    type: Boolean, 
    default: false 
  },
  last_auto_save: { 
    type: Date, 
    default: null 
  },

  // ── Completion Tracking ────────────────────────────────────────────────────
  is_completed: { 
    type: Boolean, 
    default: false,
    index: true
  },
  completed_at: { 
    type: Date, 
    default: null 
  },
  is_archived: { 
    type: Boolean, 
    default: false,
    index: true
  },

  // ── Audit Fields ──────────────────────────────────────────────────────────
  created_by: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  last_modified_by: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }

}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ── Indexes ───────────────────────────────────────────────────────────────────
// Basic indexes
goalSchema.index({ user_id: 1, is_completed: 1 });
goalSchema.index({ user_id: 1, priority: 1 });

// Performance indexes for common queries
goalSchema.index({ user_id: 1, is_archived: 1, is_completed: 1 });
goalSchema.index({ user_id: 1, deadline: 1 });
goalSchema.index({ user_id: 1, created_at: -1 });
goalSchema.index({ user_id: 1, category: 1 });
goalSchema.index({ user_id: 1, status: 1 }); // Virtual field - for querying

// Compound index for dashboard queries
goalSchema.index({ user_id: 1, is_completed: 1, priority: 1, deadline: 1 });

// TTL index for auto-archiving completed goals after 30 days
goalSchema.index({ completed_at: 1 }, { 
  expireAfterSeconds: 2592000, 
  partialFilterExpression: { is_completed: true } 
});

// ── Middleware ────────────────────────────────────────────────────────────────
// Pre-save validation and auto-completion
goalSchema.pre('save', function(next) {
  // Ensure saved doesn't exceed target
  const savedAmount = parseFloat(this.saved);
  const targetAmount = parseFloat(this.target);
  
  if (savedAmount >= targetAmount) {
    this.saved = this.target;
    if (!this.is_completed) {
      this.is_completed = true;
      this.completed_at = this.completed_at || new Date();
    }
  } else if (this.is_completed && savedAmount < targetAmount) {
    // Reopen goal if saved amount is reduced below target
    this.is_completed = false;
    this.completed_at = null;
  }
  
  // Auto-enable auto_save if amount and interval are set
  if (parseFloat(this.auto_save_amount) > 0 && this.auto_save_interval) {
    this.auto_save_enabled = true;
  } else {
    this.auto_save_enabled = false;
  }
  
  next();
});

// Pre-update middleware for findOneAndUpdate operations
goalSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  if (update.$set) {
    // If saved amount is being updated, check completion
    if (update.$set.saved) {
      const savedAmount = parseFloat(update.$set.saved);
      // We need to fetch current document to check target
      this.model.findOne(this.getQuery()).then(doc => {
        if (doc && savedAmount >= parseFloat(doc.target)) {
          update.$set.saved = doc.target;
          update.$set.is_completed = true;
          update.$set.completed_at = new Date();
        }
        next();
      }).catch(next);
    } else {
      next();
    }
  } else {
    next();
  }
});

// Sanitize inputs
goalSchema.pre('validate', function(next) {
  if (this.name) {
    this.name = this.name.trim().replace(/[<>]/g, '');
  }
  if (this.notes) {
    this.notes = this.notes.trim().substring(0, 1000);
  }
  next();
});

// ── Virtuals ──────────────────────────────────────────────────────────────────
goalSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

goalSchema.virtual('progress_percent').get(function() {
  const target = parseFloat(this.target);
  const saved = parseFloat(this.saved);
  if (!target || target === 0) return 0;
  return Math.min(100, Math.round((saved / target) * 100));
});

goalSchema.virtual('remaining').get(function() {
  const target = parseFloat(this.target);
  const saved = parseFloat(this.saved);
  return Math.max(0, target - saved);
});

goalSchema.virtual('days_remaining').get(function() {
  if (!this.deadline) return null;
  const diff = this.deadline - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

goalSchema.virtual('weekly_contribution_needed').get(function() {
  if (!this.deadline || this.is_completed) return null;
  const remainingDays = this.days_remaining;
  if (remainingDays <= 0) return parseFloat(this.remaining);
  const remainingWeeks = Math.ceil(remainingDays / 7);
  return parseFloat((parseFloat(this.remaining) / remainingWeeks).toFixed(2));
});

goalSchema.virtual('monthly_contribution_needed').get(function() {
  if (!this.deadline || this.is_completed) return null;
  const remainingDays = this.days_remaining;
  if (remainingDays <= 0) return parseFloat(this.remaining);
  const remainingMonths = Math.ceil(remainingDays / 30);
  return parseFloat((parseFloat(this.remaining) / remainingMonths).toFixed(2));
});

goalSchema.virtual('daily_contribution_needed').get(function() {
  if (!this.deadline || this.is_completed) return null;
  const remainingDays = this.days_remaining;
  if (remainingDays <= 0) return parseFloat(this.remaining);
  return parseFloat((parseFloat(this.remaining) / remainingDays).toFixed(2));
});

goalSchema.virtual('status').get(function() {
  if (this.is_completed) return 'completed';
  if (this.is_archived) return 'archived';
  if (this.deadline && new Date() > this.deadline && parseFloat(this.remaining) > 0) return 'overdue';
  if (this.progress_percent >= 100) return 'completed';
  if (this.progress_percent > 0) return 'in_progress';
  return 'not_started';
});

goalSchema.virtual('is_overdue').get(function() {
  return this.status === 'overdue';
});

goalSchema.virtual('target_formatted').get(function() {
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD' 
  }).format(parseFloat(this.target));
});

goalSchema.virtual('saved_formatted').get(function() {
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD' 
  }).format(parseFloat(this.saved));
});

goalSchema.virtual('remaining_formatted').get(function() {
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD' 
  }).format(parseFloat(this.remaining));
});

// ── Instance Methods ──────────────────────────────────────────────────────────
goalSchema.methods.addSavings = async function(amount) {
  const newAmount = parseFloat(this.saved) + amount;
  this.saved = Math.min(newAmount, parseFloat(this.target));
  
  if (parseFloat(this.saved) >= parseFloat(this.target)) {
    this.is_completed = true;
    this.completed_at = new Date();
  }
  
  return await this.save();
};

goalSchema.methods.removeSavings = async function(amount) {
  const newAmount = parseFloat(this.saved) - amount;
  this.saved = Math.max(0, newAmount);
  
  if (this.is_completed && parseFloat(this.saved) < parseFloat(this.target)) {
    this.is_completed = false;
    this.completed_at = null;
  }
  
  return await this.save();
};

goalSchema.methods.archive = async function() {
  this.is_archived = true;
  return await this.save();
};

goalSchema.methods.unarchive = async function() {
  this.is_archived = false;
  return await this.save();
};

goalSchema.methods.reopen = async function() {
  if (this.is_completed || this.is_archived) {
    this.is_completed = false;
    this.is_archived = false;
    this.completed_at = null;
    return await this.save();
  }
  return this;
};

// ── Static Methods ────────────────────────────────────────────────────────────
goalSchema.statics.getUserGoals = function(userId, filters = {}) {
  const query = { user_id: userId, is_archived: false };
  
  if (filters.status === 'completed') query.is_completed = true;
  if (filters.status === 'active') query.is_completed = false;
  if (filters.priority) query.priority = filters.priority;
  if (filters.category) query.category = filters.category;
  
  let findQuery = this.find(query);
  
  if (filters.sortBy === 'deadline') {
    findQuery = findQuery.sort({ deadline: 1 });
  } else if (filters.sortBy === 'priority') {
    findQuery = findQuery.sort({ priority: -1 });
  } else if (filters.sortBy === 'progress') {
    // This would need aggregation, simpler to sort in app
    findQuery = findQuery.sort({ created_at: -1 });
  } else {
    findQuery = findQuery.sort({ created_at: -1 });
  }
  
  if (filters.limit) findQuery = findQuery.limit(filters.limit);
  
  return findQuery;
};

goalSchema.statics.getDashboardStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { user_id: mongoose.Types.ObjectId(userId), is_archived: false } },
    { $group: {
      _id: null,
      total_goals: { $sum: 1 },
      completed_goals: { $sum: { $cond: ['$is_completed', 1, 0] } },
      active_goals: { $sum: { $cond: [{ $eq: ['$is_completed', false] }, 1, 0] } },
      total_saved: { $sum: { $toDouble: '$saved' } },
      total_target: { $sum: { $toDouble: '$target' } },
      overdue_goals: { 
        $sum: { 
          $cond: [
            { $and: [
              { $eq: ['$is_completed', false] },
              { $lt: ['$deadline', new Date()] },
              { $ne: ['$deadline', null] }
            ]}, 
            1, 
            0
          ]
        }
      }
    }}
  ]);
  
  return stats[0] || {
    total_goals: 0,
    completed_goals: 0,
    active_goals: 0,
    total_saved: 0,
    total_target: 0,
    overdue_goals: 0
  };
};

// ── Export Model ──────────────────────────────────────────────────────────────
module.exports = mongoose.model('Goal', goalSchema);
// const mongoose = require('mongoose');

// const goalSchema = new mongoose.Schema({
//   // ── Core ──────────────────────────────────────────────────────────────────
//   user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
//   name:    { type: String, required: true, maxlength: 255, trim: true },
//   target:  { type: Number, required: true, min: 0 },
//   saved:   { type: Number, default: 0.00, min: 0 },
//   color:   { type: String, default: '#7c3aed', maxlength: 20 },
//   icon:    { type: String, default: '🎯', maxlength: 10 },

//   // ── Goal Intelligence ──────────────────────────────────────────────────────
//   deadline:        { type: Date, default: null },
//   priority:        { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
//   notes:           { type: String, default: null, maxlength: 1000 },
//   auto_save_amount: { type: Number, default: 0 },  // Amount to auto-contribute per period
//   auto_save_interval: { type: String, enum: ['daily', 'weekly', 'monthly', null], default: null },

//   // ── Completion Tracking ────────────────────────────────────────────────────
//   is_completed:  { type: Boolean, default: false },
//   completed_at:  { type: Date, default: null },
//   is_archived:   { type: Boolean, default: false }

// }, {
//   timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
//   toJSON:   { virtuals: true },
//   toObject: { virtuals: true }
// });

// // ── Indexes ───────────────────────────────────────────────────────────────────
// goalSchema.index({ user_id: 1, is_completed: 1 });
// goalSchema.index({ user_id: 1, priority: 1 });

// // ── Virtuals ──────────────────────────────────────────────────────────────────
// goalSchema.virtual('id').get(function() {
//   return this._id.toHexString();
// });

// goalSchema.virtual('progress_percent').get(function() {
//   if (!this.target || this.target === 0) return 0;
//   return Math.min(100, Math.round((this.saved / this.target) * 100));
// });

// goalSchema.virtual('remaining').get(function() {
//   return Math.max(0, this.target - this.saved);
// });

// goalSchema.virtual('days_remaining').get(function() {
//   if (!this.deadline) return null;
//   const diff = this.deadline - new Date();
//   return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
// });

// module.exports = mongoose.model('Goal', goalSchema);


