import express from "express";
import { authenticate } from "../middleware/auth.js";
import {
  reserveTickets,
  getCart,
  releaseCartItem,
} from "../services/cartHoldService.js";

const router = express.Router();

router.post("/cart/add", authenticate, async (req, res) => {
  try {
    const { ticketId, quantity, cartId } = req.body || {};
    if (!ticketId) {
      return res.status(400).json({ error: "ticketId is required." });
    }

    const parsedQty = Number(quantity);
    if (!Number.isInteger(parsedQty) || parsedQty <= 0) {
      return res.status(400).json({ error: "Quantity must be a positive integer." });
    }

    const result = await reserveTickets({
      userId: req.user.userId,
      ticketId,
      quantity: parsedQty,
      cartId,
    });

    res.status(200).json({
      cartId: result.cartId,
      cart: result.cart,
    });
  } catch (error) {
    console.error("Error adding to cart:", error);
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message || "Failed to add tickets to cart." });
  }
});

router.get("/cart", authenticate, async (req, res) => {
  try {
    const { cartId } = req.query;
    if (!cartId || typeof cartId !== "string") {
      return res.status(400).json({ error: "cartId query parameter is required." });
    }
    const cart = await getCart(cartId);
    if (!cart || cart.userId !== req.user.userId) {
      return res.status(404).json({ error: "Cart not found." });
    }
    res.json({ cartId, cart });
  } catch (error) {
    console.error("Error fetching cart:", error);
    res.status(500).json({ error: "Failed to fetch cart." });
  }
});

router.delete("/cart/:cartId/items/:ticketId", authenticate, async (req, res) => {
  try {
    const { cartId, ticketId } = req.params;
    const { quantity } = req.query;

    if (!cartId || !ticketId) {
      return res.status(400).json({ error: "cartId and ticketId are required." });
    }

    const cart = await getCart(cartId);
    if (!cart || cart.userId !== req.user.userId) {
      return res.status(404).json({ error: "Cart not found." });
    }

    const parsedQty = quantity != null ? Number(quantity) : undefined;
    if (parsedQty != null && (!Number.isInteger(parsedQty) || parsedQty <= 0)) {
      return res.status(400).json({ error: "quantity must be a positive integer." });
    }

    const updatedCart = await releaseCartItem({
      cartId,
      ticketId,
      quantity: parsedQty,
    });

    res.json({
      cartId,
      cart: updatedCart,
    });
  } catch (error) {
    console.error("Error removing cart item:", error);
    res.status(500).json({ error: error.message || "Failed to update cart." });
  }
});

export default router;
