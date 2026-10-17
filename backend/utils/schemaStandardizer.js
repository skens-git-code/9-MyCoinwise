/**
 * schemaStandardizer.js
 * 
 * Provides unified schema hardening, consistent ObjectId validation,
 * virtual 'id' mapping, and standardized serialization across all Mongoose models.
 */

const mongoose = require('mongoose');

const HEX_OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/**
 * Strict validator for MongoDB 24-character hex ObjectIds.
 * Explicitly rejects IDs starting with special characters like '!', '@', etc.
 *
 * @param {any} val
 * @returns {boolean}
 */
const isValidObjectId = (val) => {
  if (!val) return false;
  const str = String(val).trim();
  return HEX_OBJECT_ID_REGEX.test(str);
};

/**
 * Safely parses any input into an ObjectId instance, returning null if invalid.
 *
 * @param {any} val
 * @returns {mongoose.Types.ObjectId|null}
 */
const safeObjectId = (val) => {
  if (!isValidObjectId(val)) return null;
  return new mongoose.Types.ObjectId(String(val).trim());
};

/**
 * Mongoose schema plugin that:
 * 1. Sanitizes inputs so unexpected character prefixes (such as '!') never create invalid _id documents.
 * 2. Adds virtual 'id' getter returning the 24-character hexadecimal string.
 * 3. Enforces consistent toJSON and toObject transforms (exposes `id`, strips `__v`).
 *
 * @param {mongoose.Schema} schema
 */
const standardizeSchema = (schema) => {
  // ── Pre-validate hook: strip non-hex client-supplied _id ──
  schema.pre('validate', function(next) {
    if (this.isNew && this._id !== undefined && this._id !== null) {
      const idStr = String(this._id);
      if (!HEX_OBJECT_ID_REGEX.test(idStr)) {
        // Replace invalid _id (e.g. starting with '!' or malformed string) with a fresh native ObjectId
        this._id = new mongoose.Types.ObjectId();
      }
    }
    next();
  });

  // ── Virtual 'id' getter ──
  if (!schema.virtuals.id) {
    schema.virtual('id').get(function() {
      return this._id ? this._id.toHexString() : '';
    });
  }

  // ── Standardize toJSON options ──
  const existingToJSONTransform = schema.options.toJSON?.transform;
  schema.set('toJSON', {
    ...schema.options.toJSON,
    virtuals: true,
    transform: (doc, ret, options) => {
      if (ret._id) {
        ret.id = ret._id.toString();
      }
      delete ret.__v;
      delete ret.password;
      delete ret.reset_password_token;
      delete ret.email_verify_token;
      if (typeof existingToJSONTransform === 'function') {
        return existingToJSONTransform(doc, ret, options);
      }
      return ret;
    },
  });

  // ── Standardize toObject options ──
  const existingToObjectTransform = schema.options.toObject?.transform;
  schema.set('toObject', {
    ...schema.options.toObject,
    virtuals: true,
    transform: (doc, ret, options) => {
      if (ret._id) {
        ret.id = ret._id.toString();
      }
      delete ret.__v;
      if (typeof existingToObjectTransform === 'function') {
        return existingToObjectTransform(doc, ret, options);
      }
      return ret;
    },
  });
};

module.exports = {
  isValidObjectId,
  safeObjectId,
  HEX_OBJECT_ID_REGEX,
  standardizeSchema,
};
