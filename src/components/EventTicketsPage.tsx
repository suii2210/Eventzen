import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check, Loader2, Pencil, Plus, X } from "lucide-react";
import StepSidebar from "../components/StepSidebar";
import { useEventDraft } from "../contexts/EventDraftContext";
import { ticketsAPI } from "../lib/api";
import type { TicketSku, TicketStatus, TicketType } from "../lib/types";

type FlashMessage = { type: "success" | "error"; text: string } | null;

interface TicketForm {
  name: string;
  type: TicketType;
  price: string;
  currency: string;
  feeAbsorb: boolean;
  qtyTotal: number;
  perOrderLimit: number;
  salesStart: string;
  salesEnd: string;
  status: TicketStatus;
}

const sortTickets = (items: TicketSku[]) =>
  [...items].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

const toDateTimeLocal = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const defaultTicketForm = (): TicketForm => ({
  name: "",
  type: "paid",
  price: "25.00",
  currency: "USD",
  feeAbsorb: false,
  qtyTotal: 100,
  perOrderLimit: 4,
  salesStart: "",
  salesEnd: "",
  status: "draft",
});

const ticketToForm = (ticket: TicketSku): TicketForm => ({
  name: ticket.name,
  type: ticket.type,
  price:
    ticket.type === "free"
      ? "0.00"
      : (ticket.price ?? ticket.priceCents / 100).toFixed(2),
  currency: ticket.currency,
  feeAbsorb: ticket.feeAbsorb,
  qtyTotal: ticket.qtyTotal,
  perOrderLimit: ticket.perOrderLimit,
  salesStart: toDateTimeLocal(ticket.salesStart),
  salesEnd: toDateTimeLocal(ticket.salesEnd),
  status: ticket.status,
});

type FormChangeHandler = (field: keyof TicketForm, value: unknown) => void;

interface TicketFormFieldsProps {
  form: TicketForm;
  onChange: FormChangeHandler;
  disabled?: boolean;
  soldCount?: number;
  showStatus?: boolean;
}

const TicketFormFields = ({
  form,
  onChange,
  disabled,
  soldCount,
  showStatus = true,
}: TicketFormFieldsProps) => (
  <div className="space-y-4">
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Ticket Name
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => onChange("name", e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
          placeholder="e.g., General Admission"
          disabled={disabled}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Ticket Type
        </label>
        <select
          value={form.type}
          onChange={(e) => onChange("type", e.target.value as TicketType)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
          disabled={disabled}
        >
          <option value="paid">Paid</option>
          <option value="free">Free</option>
          <option value="seat">Seat-based</option>
        </select>
      </div>
    </div>

    <div className="grid gap-4 md:grid-cols-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Price
        </label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={form.price}
          onChange={(e) => onChange("price", e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
          placeholder="0.00"
          disabled={disabled || form.type === "free"}
        />
        {form.type === "free" && (
          <p className="mt-1 text-xs text-gray-500">
            Free tickets automatically use a price of $0.00.
          </p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Currency
        </label>
        <input
          type="text"
          maxLength={3}
          value={form.currency}
          onChange={(e) => onChange("currency", e.target.value)}
          className="w-full uppercase rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
          placeholder="USD"
          disabled={disabled}
        />
      </div>
      <div className="flex items-center gap-2 pt-6">
        <input
          id="feeAbsorb"
          type="checkbox"
          checked={form.feeAbsorb}
          onChange={(e) => onChange("feeAbsorb", e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
          disabled={disabled}
        />
        <label htmlFor="feeAbsorb" className="text-sm text-gray-700">
          Organizer absorbs processing fees
        </label>
      </div>
    </div>

    <div className="grid gap-4 md:grid-cols-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Total Quantity
        </label>
        <input
          type="number"
          min="1"
          value={form.qtyTotal}
          onChange={(e) => onChange("qtyTotal", e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
          disabled={disabled}
        />
        {typeof soldCount === "number" && soldCount > 0 && (
          <p className="mt-1 text-xs text-gray-500">
            {soldCount} sold so far. Quantity cannot go below this number.
          </p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Per-order Limit
        </label>
        <input
          type="number"
          min="1"
          value={form.perOrderLimit}
          onChange={(e) => onChange("perOrderLimit", e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
          disabled={disabled}
        />
      </div>
      {showStatus && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Status
          </label>
          <select
            value={form.status}
            onChange={(e) => onChange("status", e.target.value as TicketStatus)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
            disabled={disabled}
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      )}
    </div>

    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Sales start (optional)
        </label>
        <input
          type="datetime-local"
          value={form.salesStart}
          onChange={(e) => onChange("salesStart", e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
          disabled={disabled}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Sales end (optional)
        </label>
        <input
          type="datetime-local"
          value={form.salesEnd}
          onChange={(e) => onChange("salesEnd", e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
          disabled={disabled}
        />
      </div>
    </div>
  </div>
);

const normalizeChange = (
  form: TicketForm,
  field: keyof TicketForm,
  value: unknown
): TicketForm => {
  const next = { ...form };
  switch (field) {
    case "name":
      next.name = String(value);
      break;
    case "type":
      next.type = value as TicketType;
      if (next.type === "free") {
        next.price = "0.00";
      } else if (form.type === "free" && next.price === "0.00") {
        next.price = "25.00";
      }
      break;
    case "price":
      next.price = String(value);
      break;
    case "currency":
      next.currency = String(value).toUpperCase().slice(0, 3);
      break;
    case "feeAbsorb":
      next.feeAbsorb = Boolean(value);
      break;
    case "qtyTotal": {
      const parsed = Math.max(0, Math.floor(Number(value) || 0));
      next.qtyTotal = parsed;
      if (next.perOrderLimit > parsed && parsed > 0) {
        next.perOrderLimit = parsed;
      }
      break;
    }
    case "perOrderLimit": {
      const parsed = Math.max(0, Math.floor(Number(value) || 0));
      next.perOrderLimit = parsed;
      break;
    }
    case "salesStart":
      next.salesStart = String(value);
      break;
    case "salesEnd":
      next.salesEnd = String(value);
      break;
    case "status":
      next.status = value as TicketStatus;
      break;
    default:
      break;
  }
  return next;
};

const validateTicketForm = (
  form: TicketForm,
  existing?: TicketSku
): string | null => {
  if (!form.name.trim()) return "Ticket name is required.";
  if (!["free", "paid", "seat"].includes(form.type))
    return "Ticket type is invalid.";

  const currency = form.currency.trim().toUpperCase();
  if (currency.length !== 3) return "Currency must be a 3-letter ISO code.";

  if (form.type !== "free") {
    const priceValue = Number(form.price);
    if (Number.isNaN(priceValue) || priceValue < 0) {
      return "Price must be a non-negative number.";
    }
  }

  const qty = form.qtyTotal;
  if (!Number.isInteger(qty) || qty <= 0) {
    return "Total quantity must be a positive integer.";
  }

  const perOrder = form.perOrderLimit;
  if (!Number.isInteger(perOrder) || perOrder <= 0) {
    return "Per-order limit must be a positive integer.";
  }
  if (perOrder > qty) {
    return "Per-order limit cannot exceed total quantity.";
  }

  if (existing && qty < existing.qtySold) {
    return `Quantity cannot be less than tickets already sold (${existing.qtySold}).`;
  }

  if (form.salesStart) {
    const start = new Date(form.salesStart);
    if (Number.isNaN(start.getTime())) {
      return "Sales start must be a valid date.";
    }
  }

  if (form.salesEnd) {
    const end = new Date(form.salesEnd);
    if (Number.isNaN(end.getTime())) {
      return "Sales end must be a valid date.";
    }
  }

  if (form.salesStart && form.salesEnd) {
    const start = new Date(form.salesStart);
    const end = new Date(form.salesEnd);
    if (start > end) {
      return "Sales start must be before sales end.";
    }
  }

  return null;
};

const buildPayloadFromForm = (form: TicketForm) => ({
  name: form.name.trim(),
  type: form.type,
  priceCents:
    form.type === "free"
      ? 0
      : Math.round(Number(form.price || 0) * 100),
  currency: form.currency.trim().toUpperCase(),
  feeAbsorb: form.feeAbsorb,
  qtyTotal: form.qtyTotal,
  perOrderLimit: form.perOrderLimit,
  salesStart: form.salesStart ? new Date(form.salesStart).toISOString() : null,
  salesEnd: form.salesEnd ? new Date(form.salesEnd).toISOString() : null,
  status: form.status,
});

export default function EventTicketsPage() {
  const { draftId } = useParams();
  const nav = useNavigate();
  const { draft } = useEventDraft();

  const [tickets, setTickets] = useState<TicketSku[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<FlashMessage>(null);
  const [newTicket, setNewTicket] = useState<TicketForm>(defaultTicketForm);
  const [savingNew, setSavingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TicketForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const hasActiveTicket = useMemo(
    () =>
      tickets.some(
        (ticket) => ticket.status === "active" && ticket.qtyTotal > ticket.qtySold
      ),
    [tickets]
  );

  const loadTickets = useCallback(async () => {
    if (!draft.eventId) {
      setLoading(false);
      setTickets([]);
      setMessage({
        type: "error",
        text: "No event ID found. Please save the event details first.",
      });
      return;
    }

    const token = localStorage.getItem("authToken");
    if (!token) {
      setLoading(false);
      setTickets([]);
      setMessage({
        type: "error",
        text: "Please sign in to manage tickets.",
      });
      return;
    }

    setLoading(true);
    try {
      const list = await ticketsAPI.list(draft.eventId, token);
      setTickets(sortTickets(list));
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to load tickets for this event.",
      });
    } finally {
      setLoading(false);
    }
  }, [draft.eventId]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const updateNewTicket = (field: keyof TicketForm, value: unknown) => {
    setNewTicket((prev) => normalizeChange(prev, field, value));
  };

  const updateEditTicket = (field: keyof TicketForm, value: unknown) => {
    setEditForm((prev) => (prev ? normalizeChange(prev, field, value) : prev));
  };

  const handleCreateTicket = async () => {
    setMessage(null);
    const error = validateTicketForm(newTicket);
    if (error) {
      setMessage({ type: "error", text: error });
      return;
    }

    if (!draft.eventId) {
      setMessage({
        type: "error",
        text: "No event ID available. Save event details first.",
      });
      return;
    }

    const token = localStorage.getItem("authToken");
    if (!token) {
      setMessage({ type: "error", text: "Please sign in to continue." });
      return;
    }

    setSavingNew(true);
    try {
      const payload = buildPayloadFromForm(newTicket);
      const created = await ticketsAPI.create(draft.eventId, payload, token);
      setTickets((prev) => sortTickets([...prev, created]));
      setNewTicket(defaultTicketForm());
      setMessage({ type: "success", text: "Ticket created successfully." });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to create the ticket.",
      });
    } finally {
      setSavingNew(false);
    }
  };

  const startEditing = (ticket: TicketSku) => {
    setMessage(null);
    setEditingId(ticket.id);
    setEditForm(ticketToForm(ticket));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm(null);
    setSavingEdit(false);
  };

  const handleUpdateTicket = async () => {
    if (!editingId || !editForm) return;

    const current = tickets.find((ticket) => ticket.id === editingId);
    const error = validateTicketForm(editForm, current);
    if (error) {
      setMessage({ type: "error", text: error });
      return;
    }

    const token = localStorage.getItem("authToken");
    if (!token) {
      setMessage({ type: "error", text: "Please sign in to continue." });
      return;
    }

    setSavingEdit(true);
    try {
      const payload = buildPayloadFromForm(editForm);
      const updated = await ticketsAPI.update(editingId, payload, token);
      setTickets((prev) =>
        sortTickets(
          prev.map((ticket) => (ticket.id === updated.id ? updated : ticket))
        )
      );
      setMessage({ type: "success", text: "Ticket updated successfully." });
      cancelEditing();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to update the ticket.",
      });
      setSavingEdit(false);
    }
  };

  const goToPublish = () => {
    if (!hasActiveTicket) {
      setMessage({
        type: "error",
        text: "Add at least one active ticket before continuing.",
      });
      return;
    }
    nav(`/create/${draftId}/publish`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]">
      <StepSidebar />
      <main className="px-4 py-6 lg:px-8 lg:py-8">
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="mb-4 text-xl font-semibold">Tickets & Pricing</div>
          <p className="mb-6 text-gray-600 text-sm">
            Configure the ticket SKUs available for this event. Use status{" "}
            <span className="font-semibold text-gray-800">Active</span> for any
            SKU you want to publish immediately; keep tickets in{" "}
            <span className="font-semibold text-gray-800">Draft</span> while
            you refine the details.
          </p>

          {message && (
            <div
              className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
                message.type === "success"
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Existing tickets
              </h3>
              {loading ? (
                <div className="flex items-center gap-2 text-gray-600 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading tickets...
                </div>
              ) : tickets.length === 0 ? (
                <p className="text-sm text-gray-600">
                  No tickets yet. Create your first ticket below.
                </p>
              ) : (
                <div className="space-y-4">
                  {tickets.map((ticket) =>
                    editingId === ticket.id && editForm ? (
                      <div
                        key={ticket.id}
                        className="rounded-lg border border-orange-200 bg-orange-50/40 p-4"
                      >
                        <div className="mb-4 flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-gray-700">
                              Editing {ticket.name}
                            </div>
                            <div className="text-xs text-gray-500">
                              {ticket.qtySold} sold / {ticket.qtyTotal} total
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={cancelEditing}
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
                              disabled={savingEdit}
                            >
                              <X className="h-4 w-4" />
                              Cancel
                            </button>
                            <button
                              onClick={handleUpdateTicket}
                              disabled={savingEdit}
                              className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                            >
                              {savingEdit ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                              Save changes
                            </button>
                          </div>
                        </div>
                        <TicketFormFields
                          form={editForm}
                          onChange={updateEditTicket}
                          soldCount={ticket.qtySold}
                        />
                      </div>
                    ) : (
                      <div
                        key={ticket.id}
                        className="rounded-lg border border-gray-200 p-4"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-base font-semibold text-gray-900">
                                {ticket.name}
                              </h4>
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                  ticket.status === "active"
                                    ? "bg-green-100 text-green-700"
                                    : ticket.status === "draft"
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-gray-200 text-gray-700"
                                }`}
                              >
                                {ticket.status.toUpperCase()}
                              </span>
                            </div>
                            <div className="mt-1 text-sm text-gray-600">
                              {ticket.type === "free"
                                ? "Free ticket"
                                : `${ticket.currency} ${(ticket.price ?? ticket.priceCents / 100).toFixed(2)}`}
                              {" • "}
                              {ticket.qtySold} sold / {ticket.qtyTotal} total
                              {" • "}
                              Limit {ticket.perOrderLimit} per order
                            </div>
                            {(ticket.salesStart || ticket.salesEnd) && (
                              <div className="mt-1 text-xs text-gray-500">
                                Sales{" "}
                                {ticket.salesStart
                                  ? `start ${new Date(
                                      ticket.salesStart
                                    ).toLocaleString()}`
                                  : "start immediately"}
                                {" • "}
                                {ticket.salesEnd
                                  ? `end ${new Date(
                                      ticket.salesEnd
                                    ).toLocaleString()}`
                                  : "no end date"}
                              </div>
                            )}
                            {ticket.feeAbsorb && (
                              <div className="mt-1 text-xs text-gray-500">
                                Organizer absorbs fees
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => startEditing(ticket)}
                            className="inline-flex items-center gap-2 self-start rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
                          >
                            <Pencil className="h-4 w-4" />
                            Edit
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-dashed border-orange-300 bg-orange-50/60 p-5">
              <div className="mb-4 flex items-center gap-2">
                <Plus className="h-4 w-4 text-orange-600" />
                <h3 className="text-lg font-semibold text-gray-900">
                  Create a new ticket
                </h3>
              </div>
              <TicketFormFields
                form={newTicket}
                onChange={updateNewTicket}
                showStatus
              />
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Need multiple price points? Create separate SKUs for each tier.
                </span>
                <button
                  onClick={handleCreateTicket}
                  disabled={savingNew}
                  className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
                >
                  {savingNew ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Add ticket
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              onClick={() => nav(`/create/${draftId}/build`)}
              className="rounded-lg border border-gray-300 px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Back to event details
            </button>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              {!hasActiveTicket && (
                <p className="text-xs text-red-600">
                  Activate at least one ticket before publishing.
                </p>
              )}
              <button
                onClick={goToPublish}
                className="rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                disabled={!hasActiveTicket}
              >
                Continue to publish
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
