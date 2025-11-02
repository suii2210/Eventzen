import mongoose from "mongoose";

const { Schema } = mongoose;

const paymentLogSchema = new Schema(
  {
    providerEventId: String,
    status: String,
    raw: Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const OrderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    currency: { type: String, required: true, uppercase: true, length: 3 },
    subtotalCents: { type: Number, required: true, min: 0 },
    feesCents: { type: Number, default: 0, min: 0 },
    totalCents: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["pending", "paid", "failed", "cancelled", "refunded"],
      default: "pending",
      index: true,
    },
    holdReference: { type: String }, // redis cart hold id
    cartId: { type: String, index: true },
    paymentProvider: { type: String, enum: ["razorpay"], default: "razorpay" },
    paymentIntentId: { type: String, index: true },
    paymentOrderId: { type: String },
    paymentCustomerId: { type: String },
    buyerEmail: { type: String },
    buyerName: { type: String },
    metadata: Schema.Types.Mixed,
    logs: [paymentLogSchema],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.userId = ret.userId?.toString();
        ret.eventId = ret.eventId?.toString();
        delete ret._id;
      },
    },
  }
);

OrderSchema.index({ eventId: 1, status: 1, createdAt: -1 });

export default mongoose.model("Order", OrderSchema);
