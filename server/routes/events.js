import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Event from "../models/Event.js";
import Booking from "../models/Booking.js";
import User from "../models/User.js";
import Ticket from "../models/Ticket.js";
import OpenAI from "openai"; // optional if you plan to use real AI

const router = express.Router();
const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};


// 🧩 Optional: initialize OpenAI (only if you plan to enable real AI generation)
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/**
 * POST /api/events
 * Manual event creation (draft)
 */
router.post("/", async (req, res) => {
  try {
    const { title, description, date, time, location, summary, category, startTime, endTime } = req.body;

    if (!title || !date || !location)
      return res.status(400).json({ error: "Please fill all required fields." });

    const event = new Event({
      title,
      description: description || "",
      summary: summary || "",
      category: category || "General",
      date,
      time,
      startTime,
      endTime,
      location,
      status: "draft", // Events start as drafts
      createdBy: req.user?._id || null,
    });

    await event.save();

    res.status(201).json({
      message: "✅ Event created successfully!",
      event,
    });
  } catch (error) {
    console.error("Error creating manual event:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/events/ai
 * AI-assisted event creation
 */
router.post("/ai", async (req, res) => {
  try {
    const { title, date, time, location } = req.body;

    if (!title)
      return res.status(400).json({ error: "Event title is required for AI generation." });

    let description = `An exciting event titled "${title}" happening at ${location || "a wonderful venue"} on ${date || "an upcoming date"} at ${time || "a convenient time"}. Don’t miss it!`;

    // 🧠 If OpenAI key is set, generate richer text automatically
    if (openai) {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an expert event marketing writer. Write short, engaging, family-friendly event descriptions.",
          },
          {
            role: "user",
            content: `Write a 2–3 paragraph description for an event titled "${title}", at "${location}", happening on "${date}" at "${time}".`,
          },
        ],
      });
      description = completion.choices[0]?.message?.content?.trim() || description;
    }

    const event = new Event({
      title,
      description,
      date,
      time,
      location,
      createdBy: req.user?._id || null,
    });

    await event.save();

    res.status(201).json({
      message: openai ? "🤖 AI-generated event created!" : "AI event created with default text.",
      event,
    });
  } catch (error) {
    console.error("Error creating AI event:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/events
 * Fetch published events for public listing (only published events appear on website)
 */
router.get("/", async (req, res) => {
  try {
    const { search, location, category } = req.query;
    let query = { status: "published" }; // Only show published events on the public website
    
    // Build search conditions
    const searchConditions = [];
    
    // Add search functionality - maintain the published status requirement
    if (search && search.trim()) {
      searchConditions.push({
        $or: [
          { title: { $regex: search.trim(), $options: "i" } },
          { description: { $regex: search.trim(), $options: "i" } },
          { category: { $regex: search.trim(), $options: "i" } },
          { location: { $regex: search.trim(), $options: "i" } }
        ]
      });
    }
    
    // Add location filtering
    if (location && location.trim()) {
      searchConditions.push({
        location: { $regex: location.trim(), $options: "i" }
      });
    }
    
    // Add category filtering
    if (category && category.trim()) {
      searchConditions.push({
        category: { $regex: category.trim(), $options: "i" }
      });
    }
    
    // Combine all conditions
    if (searchConditions.length > 0) {
      query.$and = [
        { status: "published" },
        ...searchConditions
      ];
    }
    
    // Log the query for debugging
    console.log("Events query:", JSON.stringify(query, null, 2));

    // First, let's check if there are any events at all
    const totalEvents = await Event.countDocuments();
    console.log(`Total events in database: ${totalEvents}`);
    
    const publishedEvents = await Event.countDocuments({ status: "published" });
    console.log(`Published events in database: ${publishedEvents}`);

    const events = await Event.find(query)
      .populate("createdBy", "full_name email")
      .sort({ createdAt: -1 });

    const eventIds = events.map((event) => event._id);
    const ticketSummaryMap = new Map();

    if (eventIds.length > 0) {
      const ticketStats = await Ticket.aggregate([
        {
          $match: {
            eventId: { $in: eventIds },
            status: { $ne: "archived" },
          },
        },
        {
          $group: {
            _id: "$eventId",
            minPrice: { $min: "$priceCents" },
            totalQty: { $sum: "$qtyTotal" },
            soldQty: { $sum: "$qtySold" },
            currencies: { $addToSet: "$currency" },
          },
        },
      ]);

      for (const stat of ticketStats) {
        const key = stat._id.toString();
        ticketSummaryMap.set(key, {
          minPrice: stat.minPrice ?? 0,
          totalQty: stat.totalQty ?? 0,
          soldQty: stat.soldQty ?? 0,
          currency: Array.isArray(stat.currencies) && stat.currencies.length > 0 ? stat.currencies[0] : "USD",
        });
      }
    }

    const transformedEvents = events.map((event) => {
      const summary = ticketSummaryMap.get(event._id.toString()) || {
        minPrice: event.ticket_price ? Math.round(event.ticket_price * 100) : 0,
        totalQty: event.total_tickets || 0,
        soldQty: event.total_tickets ? (event.total_tickets - (event.available_tickets || 0)) : 0,
        currency: "USD",
      };

      const available = Math.max(summary.totalQty - summary.soldQty, 0);

      return {
        id: event._id.toString(),
        title: event.title,
        description: event.description,
        summary: event.summary,
        category: event.category || "General",
        location: event.location,
        image_url: event.image_url,
        start_date: event.date
          ? `${event.date}T${event.startTime || event.time || "00:00:00"}`
          : new Date().toISOString(),
        end_date: event.date
          ? `${event.date}T${event.endTime || event.time || "23:59:59"}`
          : new Date().toISOString(),
        ticket_price: (summary.minPrice || 0) / 100,
        ticket_currency: summary.currency,
        total_tickets: summary.totalQty,
        available_tickets: available,
        organized_by: event.createdBy?.full_name || "Unknown",
        created_at: event.createdAt,
        updated_at: event.updatedAt,
      };
    });

    res.json({ events: transformedEvents });
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Legacy endpoint retained for backward compatibility messaging.
 */
router.put("/:id/tickets", async (_req, res) => {
  res.status(410).json({
    error: "This endpoint has been replaced. Use POST /api/events/:id/tickets to create ticket SKUs.",
  });
});



/**
 * PUT /api/events/:id/publish
 * Publish an event (make it visible on the website)
 */
router.put("/:id/publish", async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }

    if (event.status === "published") {
      return res.status(400).json({ error: "Event is already published." });
    }

    const hasActiveTickets = await Ticket.exists({
      eventId: event._id,
      status: "active",
      $expr: { $gt: ["$qtyTotal", "$qtySold"] },
    });

    if (!hasActiveTickets) {
      return res.status(400).json({ error: "Cannot publish event without at least one active ticket with inventory." });
    }

    event.status = "published";
    await event.save();

    res.json({
      message: "🎉 Event published successfully!",
      event,
    });
  } catch (error) {
    console.error("Error publishing event:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/events/:id
 * Get a specific event (for preview)
 */
router.get("/:id", async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).populate("createdBy", "full_name email");

    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }

    const tickets = await Ticket.find({ eventId: event._id, status: { $ne: "archived" } })
      .sort({ createdAt: 1 })
      .lean();

    const mappedTickets = tickets.map((ticket) => ({
      id: ticket._id.toString(),
      eventId: ticket.eventId.toString(),
      name: ticket.name,
      type: ticket.type,
      priceCents: ticket.priceCents,
      price: ticket.priceCents / 100,
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
    }));

    const totals = mappedTickets.reduce(
      (acc, ticket) => {
        acc.totalQty += ticket.qtyTotal;
        acc.soldQty += ticket.qtySold;
        acc.minPrice = Math.min(acc.minPrice, ticket.priceCents);
        return acc;
      },
      { totalQty: 0, soldQty: 0, minPrice: Infinity }
    );

    const available = Math.max(totals.totalQty - totals.soldQty, 0);
    const minPrice = totals.minPrice === Infinity ? 0 : totals.minPrice;

    const serializedEvent = {
      id: event._id.toString(),
      title: event.title,
      description: event.description,
      summary: event.summary,
      category: event.category || "General",
      location: event.location,
      image_url: event.image_url,
      start_date: event.date
        ? `${event.date}T${event.startTime || event.time || "00:00:00"}`
        : new Date().toISOString(),
      end_date: event.date
        ? `${event.date}T${event.endTime || event.time || "23:59:59"}`
        : new Date().toISOString(),
      status: event.status,
      organized_by: event.createdBy?.full_name || "Unknown",
      created_at: event.createdAt,
      updated_at: event.updatedAt,
      ticket_price: minPrice / 100,
      total_tickets: totals.totalQty,
      available_tickets: available,
      tickets: mappedTickets,
    };

    res.json({ event: serializedEvent });
  } catch (error) {
    console.error("Error fetching event:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/events/:id/bookings
 * Book tickets for an event
 */
router.post("/:id/bookings", async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { quantity, ticketType, ticketId } = req.body;
    const eventId = req.params.id;
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({ error: "Valid ticket quantity is required." });
    }
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required." });
    }
    let userId;
    try {
      const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
      const token = auth.split(" ")[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.userId;
    } catch (err) {
      return res.status(401).json({ error: "Invalid authentication token." });
    }
    let bookingRecord;
    let event;
    await session.withTransaction(async () => {
      event = await Event.findById(eventId).session(session);
      if (!event) {
        throw createHttpError(404, "Event not found.");
      }
      if (event.status !== "published") {
        throw createHttpError(400, "Event is not available for booking.");
      }
      const ticketQuery = { eventId: event._id, status: "active" };
      if (ticketId) {
        ticketQuery._id = ticketId;
      }
      if (ticketType) {
        ticketQuery.name = ticketType;
      }
      const ticket = await Ticket.findOne(ticketQuery).sort({ priceCents: 1 }).session(session);
      if (!ticket) {
        throw createHttpError(400, "No tickets available for this event.");
      }
      const now = new Date();
      if (ticket.salesStart && now < ticket.salesStart) {
        throw createHttpError(400, "Ticket sales have not started yet.");
      }
      if (ticket.salesEnd && now > ticket.salesEnd) {
        throw createHttpError(400, "Ticket sales window has closed.");
      }
      if (ticket.perOrderLimit && qty > ticket.perOrderLimit) {
        throw createHttpError(400, `You can purchase up to ${ticket.perOrderLimit} tickets per order.`);
      }
      if (ticket.qtySold + qty > ticket.qtyTotal) {
        throw createHttpError(400, "Not enough tickets available.");
      }
      ticket.qtySold += qty;
      await ticket.save({ session });
      bookingRecord = new Booking({
        event_id: event._id,
        user_id: userId,
        quantity: qty,
        total_amount: (ticket.priceCents * qty) / 100,
        booking_status: "confirmed",
      });
      await bookingRecord.save({ session });
    });
    const summary = await Ticket.aggregate([
      { $match: { eventId: event._id, status: { $ne: "archived" } } },
      {
        $group: {
          _id: "$eventId",
          minPrice: { $min: "$priceCents" },
          totalQty: { $sum: "$qtyTotal" },
          soldQty: { $sum: "$qtySold" },
        },
      },
    ]);
    const stats = summary[0] || { minPrice: 0, totalQty: 0, soldQty: 0 };
    const available = Math.max((stats.totalQty || 0) - (stats.soldQty || 0), 0);
    const bookingPayload = typeof bookingRecord.toJSON === "function" ? bookingRecord.toJSON() : bookingRecord.toObject();
    res.status(201).json({
      message: "Tickets booked successfully!",
      booking: bookingPayload,
      event: {
        id: event._id.toString(),
        title: event.title,
        description: event.description,
        summary: event.summary,
        category: event.category || "General",
        location: event.location,
        image_url: event.image_url,
        start_date: event.date
          ? `${event.date}T${event.startTime || event.time || "00:00:00"}`
          : new Date().toISOString(),
        end_date: event.date
          ? `${event.date}T${event.endTime || event.time || "23:59:59"}`
          : new Date().toISOString(),
        ticket_price: (stats.minPrice || 0) / 100,
        total_tickets: stats.totalQty || 0,
        available_tickets: available,
      },
    });
  } catch (error) {
    console.error("Error booking tickets:", error);
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message || "Failed to book tickets." });
  } finally {
    session.endSession();
  }
});

export default router;

