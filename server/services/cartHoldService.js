import crypto from "node:crypto";
import { getRedisClient } from "../config/redis.js";
import Ticket from "../models/Ticket.js";

const HOLD_SECONDS = parseInt(process.env.CART_HOLD_SECONDS || "600", 10);

const cartKey = (cartId) => `cart:${cartId}`;
const ticketHoldKey = (ticketId) => `ticket_hold:${ticketId}`;

const parseCart = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to parse cart payload", err);
    return null;
  }
};

const serializeCart = (cart) => {
  const copy = { ...cart };
  delete copy.expiresInSeconds;
  return JSON.stringify(copy);
};

export const generateCartId = () => crypto.randomUUID();

export const getCart = async (cartId) => {
  if (!cartId) return null;
  const redis = getRedisClient();
  const raw = await redis.get(cartKey(cartId));
  const cart = parseCart(raw);
  if (!cart) return null;
  const ttl = await redis.ttl(cartKey(cartId));
  return {
    ...cart,
    expiresInSeconds: ttl > 0 ? ttl : HOLD_SECONDS,
  };
};

const withRetry = async (fn, attempts = 3) => {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err && err.retryable === false) break;
    }
  }
  throw lastError;
};

const validateQuantity = (quantity, perOrderLimit) => {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw Object.assign(new Error("Quantity must be a positive integer."), {
      statusCode: 400,
    });
  }
  if (perOrderLimit && quantity > perOrderLimit) {
    throw Object.assign(
      new Error(`You can purchase up to ${perOrderLimit} tickets for this SKU.`),
      { statusCode: 400 }
    );
  }
};

const buildCartItem = (ticket, quantity, expiresAtIso, ticketId) => ({
  ticketId,
  eventId: ticket.eventId.toString(),
  name: ticket.name,
  type: ticket.type,
  priceCents: ticket.priceCents,
  currency: ticket.currency,
  perOrderLimit: ticket.perOrderLimit,
  quantity,
  holdExpiresAt: expiresAtIso,
});

export const reserveTickets = async ({
  userId,
  ticketId,
  quantity,
  cartId,
}) => {
  const redis = getRedisClient();

  const ticket = await Ticket.findById(ticketId);
  if (!ticket) {
    throw Object.assign(new Error("Ticket not found."), { statusCode: 404 });
  }

  validateQuantity(quantity, ticket.perOrderLimit);

  const existingCart = cartId ? await getCart(cartId) : null;
  const workingCart = existingCart
    ? {
        cartId: existingCart.cartId,
        userId: existingCart.userId,
        eventId: existingCart.eventId,
        currency: existingCart.currency,
        items: { ...existingCart.items },
      }
    : null;

  if (workingCart && workingCart.userId !== userId) {
    throw Object.assign(new Error("Cart does not belong to this user."), {
      statusCode: 403,
    });
  }

  if (workingCart && workingCart.eventId !== ticket.eventId.toString()) {
    throw Object.assign(
      new Error("Cart already contains tickets from a different event."),
      { statusCode: 400 }
    );
  }

  return withRetry(async () => {
    const holdKey = ticketHoldKey(ticketId);
    await redis.watch(holdKey);

    const currentHoldRaw = await redis.get(holdKey);
    const currentHold = currentHoldRaw ? parseInt(currentHoldRaw, 10) : 0;
    const available =
      ticket.qtyTotal - ticket.qtySold - (Number.isNaN(currentHold) ? 0 : currentHold);

    if (quantity > available) {
      await redis.unwatch();
      throw Object.assign(new Error("Not enough tickets available for this SKU."), {
        statusCode: 400,
        retryable: false,
      });
    }

    const ticketIdString = ticket._id.toString();
    const effectiveCartId = workingCart?.cartId || generateCartId();
    const expiresAt = new Date(Date.now() + HOLD_SECONDS * 1000).toISOString();
    const updatedCart = workingCart || {
      cartId: effectiveCartId,
      userId,
      eventId: ticket.eventId.toString(),
      currency: ticket.currency,
      items: {},
    };

    const existingItem = updatedCart.items[ticketIdString];
    const nextQuantity = existingItem ? existingItem.quantity + quantity : quantity;
    validateQuantity(nextQuantity, ticket.perOrderLimit);

    updatedCart.items[ticketIdString] = buildCartItem(
      ticket,
      nextQuantity,
      expiresAt,
      ticketIdString
    );

    const multi = redis.multi();
    multi.incrby(holdKey, quantity);
    multi.expire(holdKey, HOLD_SECONDS);
    multi.set(cartKey(effectiveCartId), serializeCart(updatedCart), "EX", HOLD_SECONDS);

    const execResult = await multi.exec();
    if (!execResult) {
      await redis.unwatch();
      throw Object.assign(new Error("Cart hold conflict, please retry."), {
        retryable: true,
      });
    }

    return {
      cartId: effectiveCartId,
      cart: {
        ...updatedCart,
        expiresInSeconds: HOLD_SECONDS,
      },
    };
  });
};

export const releaseCartItem = async ({ cartId, ticketId, quantity }) => {
  const redis = getRedisClient();
  const currentCart = await getCart(cartId);
  if (!currentCart) return null;

  const workingCart = {
    cartId: currentCart.cartId,
    userId: currentCart.userId,
    eventId: currentCart.eventId,
    currency: currentCart.currency,
    items: { ...currentCart.items },
  };

  const existingItem = workingCart.items?.[ticketId];
  if (!existingItem) return currentCart;

  const newQuantity =
    typeof quantity === "number" ? existingItem.quantity - quantity : 0;
  const decrementBy =
    typeof quantity === "number"
      ? Math.min(quantity, existingItem.quantity)
      : existingItem.quantity;

  if (decrementBy > 0) {
    const holdKey = ticketHoldKey(ticketId);
    const newHold = await redis.decrby(holdKey, decrementBy);
    if (newHold <= 0) {
      await redis.del(holdKey);
    } else {
      await redis.expire(holdKey, HOLD_SECONDS);
    }
  }

  if (newQuantity > 0) {
    workingCart.items[ticketId].quantity = newQuantity;
    workingCart.items[ticketId].holdExpiresAt = new Date(
      Date.now() + HOLD_SECONDS * 1000
    ).toISOString();
  } else {
    delete workingCart.items[ticketId];
  }

  const hasItems = Object.keys(workingCart.items).length > 0;
  if (hasItems) {
    await redis.set(cartKey(cartId), serializeCart(workingCart), "EX", HOLD_SECONDS);
  } else {
    await redis.del(cartKey(cartId));
  }

  return hasItems
    ? { ...workingCart, expiresInSeconds: HOLD_SECONDS }
    : null;
};

export const clearCart = async (cartId) => {
  if (!cartId) return;
  const redis = getRedisClient();
  const cart = await getCart(cartId);
  if (!cart) return;

  for (const item of Object.values(cart.items || {})) {
    const holdKey = ticketHoldKey(item.ticketId);
    const remaining = await redis.decrby(holdKey, item.quantity);
    if (remaining <= 0) {
      await redis.del(holdKey);
    } else {
      await redis.expire(holdKey, HOLD_SECONDS);
    }
  }
  await redis.del(cartKey(cartId));
};
