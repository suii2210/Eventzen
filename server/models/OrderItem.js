import mongoose from "mongoose";

const { Schema } = mongoose;

const ticketSnapshotSchema = new Schema(
  {
    name: String,
    type: String,
    priceCents: Number,
    currency: String,
    feeAbsorb: Boolean,
    salesStart: Date,
    salesEnd: Date,
  },
  { _id: false }
);

const OrderItemSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    ticketId: { type: Schema.Types.ObjectId, ref: "Ticket", required: true, index: true },
    ticketSnapshot: ticketSnapshotSchema,
    quantity: { type: Number, required: true, min: 1 },
    unitPriceCents: { type: Number, required: true, min: 0 },
    totalPriceCents: { type: Number, required: true, min: 0 },
    feesCents: { type: Number, default: 0, min: 0 },
    checkedInAt: { type: Date },
    ticketCode: { type: String, index: true }, // to be filled in later phases
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.orderId = ret.orderId?.toString();
        ret.ticketId = ret.ticketId?.toString();
        delete ret._id;
      },
    },
  }
);

OrderItemSchema.index({ orderId: 1 });

export default mongoose.model("OrderItem", OrderItemSchema);
