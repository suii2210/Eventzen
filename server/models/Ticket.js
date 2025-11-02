import mongoose from "mongoose";

const { Schema } = mongoose;

const ticketSchema = new Schema(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["free", "paid", "seat"],
      default: "paid",
    },
    priceCents: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "USD",
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },
    feeAbsorb: {
      type: Boolean,
      default: false,
    },
    qtyTotal: {
      type: Number,
      required: true,
      min: 0,
    },
    qtySold: {
      type: Number,
      default: 0,
      min: 0,
    },
    salesStart: {
      type: Date,
    },
    salesEnd: {
      type: Date,
    },
    perOrderLimit: {
      type: Number,
      default: 10,
      min: 1,
    },
    status: {
      type: String,
      enum: ["draft", "active", "archived"],
      default: "draft",
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.eventId = ret.eventId?.toString();
        delete ret._id;
      },
    },
  }
);

ticketSchema.index({ eventId: 1, status: 1 });

export default mongoose.model("Ticket", ticketSchema);
