import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import StepSidebar from "../components/StepSidebar";
import { useEventDraft } from "../contexts/EventDraftContext";
import { Calendar, MapPin, Ticket, Eye } from "lucide-react";
import type { TicketStatus } from "../lib/types";

interface EventTicket {
  id: string;
  name: string;
  type: string;
  priceCents: number;
  price: number;
  currency: string;
  qtyTotal: number;
  qtySold: number;
  salesStart?: string;
  salesEnd?: string;
  perOrderLimit: number;
  status: TicketStatus;
}

interface EventData {
  _id: string;
  title: string;
  description: string;
  summary: string;
  category: string;
  date: string;
  time: string;
  startTime: string;
  endTime: string;
  location: string;
  status: string;
  ticket_price: number;
  total_tickets: number;
  available_tickets: number;
  tickets: EventTicket[];
}

export default function EventPublishPage() {
  const { setStatus, draft } = useEventDraft();
  const nav = useNavigate();
  const [eventData, setEventData] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (draft.eventId) {
      fetchEventData();
    } else {
      setLoading(false);
      setMessage("No event ID found. Please go back and save the event first.");
    }
  }, [draft.eventId]);

  const fetchEventData = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:5000/api"}/events/${draft.eventId}`
      );
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data?.error || "Failed to fetch event data");
      }
      
      setEventData(data.event);
    } catch (error) {
      setMessage(`❌ ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const publish = async () => {
    if (!draft.eventId) {
      setMessage("No event ID found");
      return;
    }

    setPublishing(true);
    setMessage("");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:5000/api"}/events/${draft.eventId}/publish`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to publish event");
      }

      setStatus("published");
      setMessage("🎉 Event published successfully! It's now live on the website.");
      
      setTimeout(() => {
        nav("/"); // go back to home
      }, 2000);
    } catch (error) {
      setMessage(`❌ ${(error as Error).message}`);
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]">
        <StepSidebar />
        <main className="px-4 py-6 lg:px-8 lg:py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Loading event data...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const activeTickets =
    eventData?.tickets?.filter((ticket) => ticket.status === "active") ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]">
      <StepSidebar />
      <main className="px-4 py-6 lg:px-8 lg:py-8">
        <div className="space-y-6">
          {/* Event Preview */}
          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-2">
              <Eye className="w-5 h-5 text-orange-600" />
              <h2 className="text-xl font-semibold">Event Preview</h2>
            </div>
            
            {eventData ? (
              <div className="space-y-6">
                {/* Event Header */}
                <div className="relative h-48 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Calendar className="w-16 h-16 text-white/30" />
                  </div>
                  <div className="absolute top-4 left-4 px-3 py-1 bg-orange-600 text-white text-sm font-semibold rounded-full">
                    {eventData.category || "General"}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-2xl font-bold text-gray-900">{eventData.title}</h3>
                  
                  {eventData.summary && (
                    <p className="text-gray-600">{eventData.summary}</p>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-gray-700">
                      <Calendar className="w-5 h-5 text-orange-600" />
                      <div>
                        <div className="font-medium">
                          {new Date(eventData.date).toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </div>
                        <div className="text-sm text-gray-600">
                          {eventData.startTime && eventData.endTime 
                            ? `${eventData.startTime} - ${eventData.endTime}`
                            : eventData.time || "Time TBD"
                          }
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-gray-700">
                      <MapPin className="w-5 h-5 text-orange-600" />
                      <span>{eventData.location}</span>
                    </div>
                  </div>

                  {/* Tickets Preview */}
                  {activeTickets.length > 0 && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <Ticket className="w-5 h-5" />
                        Tickets Available
                      </h4>
                      <div className="space-y-2">
                        {activeTickets.map((ticket) => (
                          <div
                            key={ticket.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 p-3"
                          >
                            <div>
                              <div className="font-medium">{ticket.name}</div>
                              <div className="text-sm text-gray-600">
                                {ticket.qtyTotal - ticket.qtySold} tickets
                                available • limit {ticket.perOrderLimit} per order
                              </div>
                              {(ticket.salesStart || ticket.salesEnd) && (
                                <div className="text-xs text-gray-500">
                                  {ticket.salesStart
                                    ? `Starts ${new Date(ticket.salesStart).toLocaleString()}`
                                    : "On sale immediately"}
                                  {" � "}
                                  {ticket.salesEnd
                                    ? `Ends ${new Date(ticket.salesEnd).toLocaleString()}`
                                    : "No end date"}
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-lg">
                                {ticket.currency}{" "}
                                {(ticket.price ?? ticket.priceCents / 100).toFixed(2)}
                              </div>
                              <div className="text-xs uppercase tracking-wide text-gray-500">
                                {ticket.type}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-gray-500">No event data available for preview.</p>
            )}
          </section>

          {/* Publish Section */}
          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="mb-4 text-xl font-semibold">Publish Event</div>
            <p className="mb-6 text-gray-600 text-sm">
              Review your event details above. Once published, your event will be live on the website and people can search for it and buy tickets.
            </p>

            {message && (
              <div className={`mb-4 text-sm p-3 rounded-lg ${
                message.startsWith("🎉") 
                  ? "bg-green-50 text-green-700 border border-green-200" 
                  : message.startsWith("❌")
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-gray-50 text-gray-700 border border-gray-200"
              }`}>
                {message}
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                onClick={() => nav(`/create/${draft.id}/tickets`)}
                className="rounded-lg border border-gray-300 px-6 py-3 font-medium text-gray-700 hover:bg-gray-50"
              >
                Back to Tickets
              </button>

              <div className="flex flex-col items-start gap-2 sm:items-end">
                {activeTickets.length === 0 && (
                  <p className="text-sm text-red-600">
                    Add at least one active ticket before publishing.
                  </p>
                )}
                <button
                  onClick={publish}
                  disabled={publishing || !eventData || activeTickets.length === 0}
                  className="rounded-lg bg-green-600 px-6 py-3 font-medium text-white hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {publishing ? "Publishing..." : "Publish Event"}
                </button>
              </div>
            </div>

            {activeTickets.length === 0 && (
              <p className="mt-3 text-sm text-red-600">
                Add at least one active ticket before publishing the event.
              </p>
            )}

          </section>
        </div>
      </main>
    </div>
  );
}



