import express from "express";
import mongoose from "mongoose";
import Event from "../models/Event.js";
import Ticket from "../models/Ticket.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

const VALID_TYPES = new Set(["free", "paid", "seat"]);
const VALID_STATUS = new Set(["draft", "active", "archived"]);

const normalizePriceToCents = (body) => {
  if (body.priceCents != null) {
    const parsed = Number(body.priceCents);
    if (!Number.isFinite(parsed)) {
      throw new Error("priceCents must be a number");
    }
    return Math.round(parsed);
  }

  if (body.price != null) {
    const priceNumber = Number(body.price);
    if (!Number.isFinite(priceNumber)) {
      throw new Error("price must be a number");
    }
    return Math.round(priceNumber * 100);
  }

  throw new Error("priceCents is required");
};

const serializeTicket = (ticket) => ({
  id: ticket.id,
  eventId: ticket.eventId,
  name: ticket.name,
  type: ticket.type,
  priceCents: ticket.priceCents,
  currency: ticket.currency,
  feeAbsorb: ticket.feeAbsorb,
  qtyTotal: ticket.qtyTotal,
  qtySold: ticket.qtySold,
  salesStart: ticket.salesStart,
  salesEnd: ticket.salesEnd,
  perOrderLimit: ticket.perOrderLimit,
  status: ticket.status,
  createdAt: ticket.createdAt,
  updatedAt: ticket.updatedAt,
});

const assertOwnership = (event, userId) => {
  if (event.createdBy && userId && event.createdBy.toString() !== userId) {
    const err = new Error("You do not have permission to modify tickets for this event.");
    err.statusCode = 403;
    throw err;
  }
};

router.post(
  "/events/:eventId/tickets",
  authenticate,
  async (req, res) => {
    const session = await mongoose.startSession();
    let createdTicket;

    try {
      await session.withTransaction(async () => {
        const event = await Event.findById(req.params.eventId).session(session);
        if (!event) {
          const err = new Error("Event not found.");
          err.statusCode = 404;
          throw err;
        }

        assertOwnership(event, req.user?.userId);

        const {
          name,
          type = "paid",
          currency = "USD",
          feeAbsorb = false,
          qtyTotal,
          salesStart,
          salesEnd,
          perOrderLimit,
          status = "draft",
        } = req.body;

        if (!name || !name.trim()) throw new Error("name is required");
        if (!VALID_TYPES.has(type)) throw new Error("type must be one of free, paid, seat");
        const priceCents = normalizePriceToCents(req.body);

        if (type === "free" && priceCents !== 0) {
          throw new Error("Free tickets must have a price of 0.");
        }
        if (type !== "free" && priceCents < 0) {
          throw new Error("Price cannot be negative.");
        }

        const total = Number(qtyTotal);
        if (!Number.isInteger(total) || total < 0) {
          throw new Error("qtyTotal must be a non-negative integer.");
        }

        const limit = perOrderLimit != null ? Number(perOrderLimit) : Math.min(total, 10);
        if (!Number.isInteger(limit) || limit <= 0) {
          throw new Error("perOrderLimit must be a positive integer.");
        }
        if (limit > total && total !== 0) {
          throw new Error("perOrderLimit cannot exceed qtyTotal.");
        }

        let startDate = salesStart ? new Date(salesStart) : undefined;
        let endDate = salesEnd ? new Date(salesEnd) : undefined;

        if (startDate && Number.isNaN(startDate.getTime())) {
          throw new Error("salesStart must be a valid date.");
        }
        if (endDate && Number.isNaN(endDate.getTime())) {
          throw new Error("salesEnd must be a valid date.");
        }
        if (startDate && endDate && startDate > endDate) {
          throw new Error("salesStart must be before salesEnd.");
        }

        if (!VALID_STATUS.has(status)) {
          throw new Error("status must be one of draft, active, archived.");
        }

        const ticket = new Ticket({
          eventId: event._id,
          name: name.trim(),
          type,
          priceCents,
          currency: currency ? String(currency).trim().toUpperCase() : "USD",
          feeAbsorb: Boolean(feeAbsorb),
          qtyTotal: total,
          perOrderLimit: limit,
          salesStart: startDate,
          salesEnd: endDate,
          status,
        });

        createdTicket = await ticket.save({ session });
      });

      res.status(201).json({ ticket: serializeTicket(createdTicket) });
    } catch (error) {
      console.error("Error creating ticket:", error);
      const status = error.statusCode || 400;
      res.status(status).json({ error: error.message || "Failed to create ticket." });
    } finally {
      session.endSession();
    }
  }
);

router.get(
  "/events/:eventId/tickets",
  authenticate,
  async (req, res) => {
    try {
      const event = await Event.findById(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found." });
      }
      assertOwnership(event, req.user?.userId);

      const tickets = await Ticket.find({ eventId: event._id })
        .sort({ createdAt: 1 })
        .lean();

      res.json({
        tickets: tickets.map((t) => ({
          id: t._id.toString(),
          eventId: t.eventId.toString(),
          name: t.name,
          type: t.type,
          priceCents: t.priceCents,
          currency: t.currency,
          feeAbsorb: t.feeAbsorb,
          qtyTotal: t.qtyTotal,
          qtySold: t.qtySold,
          salesStart: t.salesStart,
          salesEnd: t.salesEnd,
          perOrderLimit: t.perOrderLimit,
          status: t.status,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })),
      });
    } catch (error) {
      console.error("Error fetching tickets:", error);
      res.status(500).json({ error: error.message || "Failed to fetch tickets." });
    }
  }
);

router.patch(
  "/tickets/:ticketId",
  authenticate,
  async (req, res) => {
    const session = await mongoose.startSession();
    let updatedTicket;

    try {
      await session.withTransaction(async () => {
        const ticket = await Ticket.findById(req.params.ticketId).session(session);
        if (!ticket) {
          const err = new Error("Ticket not found.");
          err.statusCode = 404;
          throw err;
        }

        const event = await Event.findById(ticket.eventId).session(session);
        if (!event) {
          const err = new Error("Event not found for ticket.");
          err.statusCode = 404;
          throw err;
        }

        assertOwnership(event, req.user?.userId);

        if (req.body.name != null) {
          if (!req.body.name.trim()) throw new Error("name cannot be empty.");
          ticket.name = req.body.name.trim();
        }

        if (req.body.type != null) {
          if (!VALID_TYPES.has(req.body.type)) {
            throw new Error("type must be one of free, paid, seat");
          }
          ticket.type = req.body.type;
        }

        if (req.body.priceCents != null || req.body.price != null) {
          const priceCents = normalizePriceToCents(req.body);
          if (ticket.type === "free" && priceCents !== 0) {
            throw new Error("Free tickets must have a price of 0.");
          }
          if (priceCents < 0) {
            throw new Error("Price cannot be negative.");
          }
          ticket.priceCents = priceCents;
        }

        if (req.body.currency != null) {
          const currency = String(req.body.currency).trim().toUpperCase();
          if (currency.length !== 3) {
            throw new Error("currency must be a 3-letter code.");
          }
          ticket.currency = currency;
        }

        if (req.body.feeAbsorb != null) {
          ticket.feeAbsorb = Boolean(req.body.feeAbsorb);
        }

        if (req.body.qtyTotal != null) {
          const total = Number(req.body.qtyTotal);
          if (!Number.isInteger(total) || total < ticket.qtySold) {
            throw new Error("qtyTotal must be an integer greater than or equal to qtySold.");
          }
          ticket.qtyTotal = total;
          if (ticket.perOrderLimit > total && total !== 0) {
            ticket.perOrderLimit = total;
          }
        }

        if (req.body.salesStart !== undefined) {
          if (req.body.salesStart === null || req.body.salesStart === "") {
            ticket.salesStart = undefined;
          } else {
            const start = new Date(req.body.salesStart);
            if (Number.isNaN(start.getTime())) throw new Error("salesStart must be a valid date.");
            ticket.salesStart = start;
          }
        }

        if (req.body.salesEnd !== undefined) {
          if (req.body.salesEnd === null || req.body.salesEnd === "") {
            ticket.salesEnd = undefined;
          } else {
            const end = new Date(req.body.salesEnd);
            if (Number.isNaN(end.getTime())) throw new Error("salesEnd must be a valid date.");
            ticket.salesEnd = end;
          }
        }

        if (ticket.salesStart && ticket.salesEnd && ticket.salesStart > ticket.salesEnd) {
          throw new Error("salesStart must be before salesEnd.");
        }

        if (req.body.perOrderLimit != null) {
          const limit = Number(req.body.perOrderLimit);
          if (!Number.isInteger(limit) || limit <= 0) {
            throw new Error("perOrderLimit must be a positive integer.");
          }
          if (limit > ticket.qtyTotal && ticket.qtyTotal !== 0) {
            throw new Error("perOrderLimit cannot exceed qtyTotal.");
          }
          ticket.perOrderLimit = limit;
        }

        if (req.body.status != null) {
          if (!VALID_STATUS.has(req.body.status)) {
            throw new Error("status must be one of draft, active, archived.");
          }
          ticket.status = req.body.status;
        }

        updatedTicket = await ticket.save({ session });
      });

      res.json({ ticket: serializeTicket(updatedTicket) });
    } catch (error) {
      console.error("Error updating ticket:", error);
      const status = error.statusCode || 400;
      res.status(status).json({ error: error.message || "Failed to update ticket." });
    } finally {
      session.endSession();
    }
  }
);

export default router;
