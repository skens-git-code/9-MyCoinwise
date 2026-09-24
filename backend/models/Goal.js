/* —————————————————————————————————————
 * Goal Model
 * Stores user savings goals with targets, deadlines,
 * priority, categories, auto-save configuration, and
 * completion tracking.
 *
 * Key behaviors:
 *   - `saved` is capped at `target` in pre-save.
 *   - Goals auto-complete when saved >= target.
 *   - Goals re-open if saved drops below target.
 *   - Auto-save auto-enables when amount and interval are set.
 *   - Soft-archive via `is_archived`, no hard delete.
 *
 * Indexes:
 *   - Cover listing, filtering, dashboard, and deadline queries.
 *   - `completed_at` uses a partial index (no TTL — completed goals
 *     are part of the user's history and must be preserved).
 * ————————————————————————————————————— */

// ── Load mongoose ──
const mongoose = require('mongoose');

// ── Define schema ──
const goalSchema = new mongoose.Schema({
  /* —————————————————————————————————————
   * Core Fields
   * ————————————————————————————————————— */

  // ── Owning user reference ──
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is required'],
    index: true 
  },

  // ── Goal display name ──
  name: { 
    type: String, 
    required: [true, 'Goal name is required'], 
    maxlength: [255, 'Goal name cannot exceed 255 characters'], 
    trim: true 
  },

  // ── Target amount to save toward ──
  target: { 
    type: Number, 
    required: [true, 'Target amount is required'], 
    min: 0.01,
    validate: {
      validator: function(v) {
        return v > 0;
      },
      message: 'Target amount must be greater than 0'
    }
  },

  // ── Amount saved so far ──
  // saved <= target is enforced in pre-save (not here) because `this.target`
  // is not reliably set during schema validation on initial create().
  saved: { 
    type: Number, 
    default: 0, 
    min: 0
  },

  // ── UI color for the goal card ──
  color: { 
    type: String, 
    default: '#0ea5e9', 
    maxlength: 20,
    match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Please provide a valid hex color code']
  },

  // ── UI icon for the goal card ──
  icon: { 
    type: String, 
    default: '🎯', 
    maxlength: 10 
  },

  /* —————————————————————————————————————
   * Goal Intelligence
   * ————————————————————————————————————— */

  // ── Target deadline date ──
  // Future-date check applies only on create so existing goals with
  // past deadlines can still be updated (e.g. editing `saved`).
  deadline: {
    type: Date,
    default: null,
    validate: {
      validator: function(v) {
        if (v === null || v === undefined) return true;
        if (!this.isNew) return true;
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        const deadline = new Date(v);
        return !isNaN(deadline.getTime()) && deadline >= yesterday;
      },
      message: 'Deadline must be today or in the future'
    }
  },

  // ── Priority level ──
  priority: { 
    type: String, 
    enum: {
      values: ['low', 'medium', 'high', 'critical'],
      message: 'Priority must be low, medium, high, or critical'
    },
    default: 'medium',
    index: true
  },

  // ── Goal category ──
  category: { 
    type: String, 
    enum: {
      values: ['savings', 'emergency_fund', 'vacation', 'gadget', 'investment', 'vehicle', 'home', 'education', 'debt', 'purchase', 'other'],
      message: 'Invalid category'
    },
    default: 'savings',
    index: true 
  },

  // ── Optional user notes ──
  notes: { 
    type: String, 
    default: null, 
    maxlength: [1000, 'Notes cannot exceed 1000 characters'] 
  },

  // ── Auto-save amount ──
  auto_save_amount: { 
    type: Number, 
    default: 0,
    min: 0
  },

  // ── Auto-save interval ──
  auto_save_interval: { 
    type: String, 
    enum: {
      values: ['daily', 'weekly', 'monthly', null],
      message: 'Interval must be daily, weekly, or monthly'
    },
    default: null 
  },

  // ── Auto-save toggle (auto-enabled in pre-save when configured) ──
  auto_save_enabled: { 
    type: Boolean, 
    default: false 
  },

  // ── Timestamp of the last auto-save run ──
  last_auto_save: { 
    type: Date, 
    default: null 
  },

  /* —————————————————————————————————————
   * Completion Tracking
   * ————————————————————————————————————— */

  // ── Completion flag ──
  is_completed: { 
    type: Boolean, 
    default: false,
    index: true
  },

  // ── Completion timestamp ──
  completed_at: { 
    type: Date, 
    default: null 
  },

  // ── Archive flag (soft delete) ──
  is_archived: { 
    type: Boolean, 
    default: false,
    index: true
  },

  /* —————————————————————————————————————
   * Audit Fields
   * ————————————————————————————————————— */

  // ── User who created the goal ──
  created_by: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },

  // ── User who last modified the goal ──
  last_modified_by: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }

}, {
  // ── Auto-managed created_at / updated_at fields ──
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

/* —————————————————————————————————————
 * Indexes
 * ————————————————————————————————————— */

// ── Basic listing / filtering ──
goalSchema.index({ user_id: 1, is_completed: 1 });
goalSchema.index({ user_id: 1, priority: 1 });

// ── Common query paths ──
goalSchema.index({ user_id: 1, is_archived: 1, is_completed: 1 });
goalSchema.index({ user_id: 1, deadline: 1 });
goalSchema.index({ user_id: 1, created_at: -1 });
goalSchema.index({ user_id: 1, category: 1 });

// ── Supports queries on the `status` virtual field ──
goalSchema.index({ user_id: 1, status: 1 });

// ── Dashboard summary query ──
goalSchema.index({ user_id: 1, is_completed: 1, priority: 1, deadline: 1 });

// ── Completed goals listing ──
// Partial index only — no TTL. Completed goals are kept as history.
goalSchema.index({ completed_at: 1 }, {
  partialFilterExpression: { is_completed: true }
});

/* —————————————————————————————————————
 * Middleware
 * ————————————————————————————————————— */

// ── Pre-save: enforce invariants and auto-completion ──
goalSchema.pre('save', function(next) {
  // ── Normalize numbers ──
  const savedAmount = parseFloat(this.saved || 0);
  const targetAmount = parseFloat(this.target);

  // ── Reject invalid target ──
  if (isNaN(targetAmount) || targetAmount <= 0) {
    return next(new Error('Target amount must be a positive number.'));
  }

  // ── Cap saved at target ──
  if (savedAmount > targetAmount) {
    this.saved = targetAmount;
  }

  // ── Auto-complete when target is reached ──
  if (savedAmount >= targetAmount) {
    this.saved = targetAmount;
    if (!this.is_completed) {
      this.is_completed = true;
      this.completed_at = this.completed_at || new Date();
    }
  } else if (this.is_completed && savedAmount < targetAmount) {
    // ── Re-open when saved drops below target ──
    this.is_completed = false;
    this.completed_at = null;
  }

  // ── Sync auto-save toggle with configuration ──
  if (parseFloat(this.auto_save_amount) > 0 && this.auto_save_interval) {
    this.auto_save_enabled = true;
  } else {
    this.auto_save_enabled = false;
  }

  next();
});

// ── Pre-update: enforce completion rules on findOneAndUpdate ──
goalSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  if (update.$set) {
    // ── Check completion only when `saved` is being updated ──
    if (update.$set.saved) {
      const savedAmount = parseFloat(update.$set.saved);
      // Need the current doc to compare against target
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

// ── Pre-validate: sanitize string inputs ──
goalSchema.pre('validate', function(next) {
  if (this.name) {
    this.name = this.name.trim().replace(/[<>]/g, '');
  }
  if (this.notes) {
    this.notes = this.notes.trim().substring(0, 1000);
  }
  next();
});

/* —————————————————————————————————————
 * Virtuals
 * ————————————————————————————————————— */

// ── Expose string _id as `id` ──
goalSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

// ── Progress percentage (capped at 100) ──
goalSchema.virtual('progress_percent').get(function() {
  const target = parseFloat(this.target);
  const saved = parseFloat(this.saved);
  if (!target || target === 0) return 0;
  return Math.min(100, Math.round((saved / target) * 100));
});

// ── Remaining amount to save ──
goalSchema.virtual('remaining').get(function() {
  const target = parseFloat(this.target);
  const saved = parseFloat(this.saved);
  return Math.max(0, target - saved);
});

// ── Days left until deadline ──
goalSchema.virtual('days_remaining').get(function() {
  if (!this.deadline) return null;
  const diff = this.deadline - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

// ── Weekly contribution needed to hit the deadline ──
goalSchema.virtual('weekly_contribution_needed').get(function() {
  if (!this.deadline || this.is_completed) return null;
  const remainingDays = this.days_remaining;
  if (remainingDays <= 0) return parseFloat(this.remaining);
  const remainingWeeks = Math.ceil(remainingDays / 7);
  return parseFloat((parseFloat(this.remaining) / remainingWeeks).toFixed(2));
});

// ── Monthly contribution needed to hit the deadline ──
goalSchema.virtual('monthly_contribution_needed').get(function() {
  if (!this.deadline || this.is_completed) return null;
  const remainingDays = this.days_remaining;
  if (remainingDays <= 0) return parseFloat(this.remaining);
  const remainingMonths = Math.ceil(remainingDays / 30);
  return parseFloat((parseFloat(this.remaining) / remainingMonths).toFixed(2));
});

// ── Daily contribution needed to hit the deadline ──
goalSchema.virtual('daily_contribution_needed').get(function() {
  if (!this.deadline || this.is_completed) return null;
  const remainingDays = this.days_remaining;
  if (remainingDays <= 0) return parseFloat(this.remaining);
  return parseFloat((parseFloat(this.remaining) / remainingDays).toFixed(2));
});

// ── Derived status: completed / archived / overdue / in_progress / not_started ──
goalSchema.virtual('status').get(function() {
  if (this.is_completed) return 'completed';
  if (this.is_archived) return 'archived';
  if (this.deadline && new Date() > this.deadline && parseFloat(this.remaining) > 0) return 'overdue';
  if (this.progress_percent >= 100) return 'completed';
  if (this.progress_percent > 0) return 'in_progress';
  return 'not_started';
});

// ── Alias for is_completed (get + set) ──
goalSchema.virtual('achieved').get(function() {
  return this.is_completed;
}).set(function(value) {
  this.is_completed = Boolean(value);
});

// ── Convenience flag for overdue status ──
goalSchema.virtual('is_overdue').get(function() {
  return this.status === 'overdue';
});

// ── Currency-formatted target ──
goalSchema.virtual('target_formatted').get(function() {
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD' 
  }).format(parseFloat(this.target));
});

// ── Currency-formatted saved amount ──
goalSchema.virtual('saved_formatted').get(function() {
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD' 
  }).format(parseFloat(this.saved));
});

// ── Currency-formatted remaining amount ──
goalSchema.virtual('remaining_formatted').get(function() {
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD' 
  }).format(parseFloat(this.remaining));
});

/* —————————————————————————————————————
 * Instance Methods
 * ————————————————————————————————————— */

// ── Add to saved, cap at target, auto-complete if reached ──
goalSchema.methods.addSavings = async function(amount) {
  const newAmount = parseFloat(this.saved) + amount;
  this.saved = Math.min(newAmount, parseFloat(this.target));

  if (parseFloat(this.saved) >= parseFloat(this.target)) {
    this.is_completed = true;
    this.completed_at = new Date();
  }

  return await this.save();
};

// ── Remove from saved, floor at zero, re-open if below target ──
goalSchema.methods.removeSavings = async function(amount) {
  const newAmount = parseFloat(this.saved) - amount;
  this.saved = Math.max(0, newAmount);

  if (this.is_completed && parseFloat(this.saved) < parseFloat(this.target)) {
    this.is_completed = false;
    this.completed_at = null;
  }

  return await this.save();
};

// ── Mark the goal as archived (soft delete) ──
goalSchema.methods.archive = async function() {
  this.is_archived = true;
  return await this.save();
};

// ── Remove the archived flag ──
goalSchema.methods.unarchive = async function() {
  this.is_archived = false;
  return await this.save();
};

// ── Reset completion and archive flags ──
goalSchema.methods.reopen = async function() {
  if (this.is_completed || this.is_archived) {
    this.is_completed = false;
    this.is_archived = false;
    this.completed_at = null;
    return await this.save();
  }
  return this;
};

/* —————————————————————————————————————
 * Static Methods
 * ————————————————————————————————————— */

// ── Fetch a user's goals with filters and sorting ──
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
    // Progress sorting is done in-app; falls back to created_at here
    findQuery = findQuery.sort({ created_at: -1 });
  } else {
    findQuery = findQuery.sort({ created_at: -1 });
  }

  if (filters.limit) findQuery = findQuery.limit(filters.limit);

  return findQuery;
};

// ── Aggregate dashboard statistics for a user ──
goalSchema.statics.getDashboardStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { user_id: new mongoose.Types.ObjectId(userId), is_archived: false } },
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

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Register and export the model ──
module.exports = mongoose.model('Goal', goalSchema);