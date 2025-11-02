import type { Booking, CreateEventInput, Event, TicketSku } from './types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export interface AuthResponse {
  message: string;
  token: string;
  user: {
    id: string;
    email: string;
    name?: string;
  };
}

export interface EventsResponse {
  events: Event[];
}

export interface BookingResponse {
  message: string;
  booking: Booking;
  event: Event;
}

type RawTicket = {
  id?: string;
  _id?: string;
  eventId: string;
  name: string;
  type: string;
  priceCents?: number;
  price?: number;
  currency?: string;
  feeAbsorb?: boolean;
  qtyTotal: number;
  qtySold?: number;
  salesStart?: string;
  salesEnd?: string;
  perOrderLimit: number;
  status: string;
  createdAt?: string;
  updatedAt?: string;
};

const normalizeTicket = (raw: RawTicket): TicketSku => ({
  id: raw.id ?? raw._id,
  eventId: raw.eventId,
  name: raw.name,
  type: raw.type,
  priceCents: raw.priceCents,
  price: typeof raw.price === 'number' ? raw.price : (raw.priceCents ?? 0) / 100,
  currency: raw.currency,
  feeAbsorb: Boolean(raw.feeAbsorb),
  qtyTotal: raw.qtyTotal,
  qtySold: raw.qtySold ?? 0,
  salesStart: raw.salesStart ? String(raw.salesStart) : undefined,
  salesEnd: raw.salesEnd ? String(raw.salesEnd) : undefined,
  perOrderLimit: raw.perOrderLimit,
  status: raw.status,
  createdAt: raw.createdAt ? String(raw.createdAt) : new Date().toISOString(),
  updatedAt: raw.updatedAt ? String(raw.updatedAt) : new Date().toISOString(),
});

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = 'Request failed';
    try {
      const error = await response.json();
      errorMessage = error.error || error.message || errorMessage;
    } catch (error) {
      console.error('Failed to parse error response:', error);
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

export const authAPI = {
  async signUp(email: string, password: string, name?: string): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, name }),
    });

    return handleResponse<AuthResponse>(response);
  },

  async signIn(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    return handleResponse<AuthResponse>(response);
  },

  async signOut(token: string): Promise<void> {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
};

export const eventsAPI = {
  async getEvents(params?: { search?: string; location?: string; category?: string }): Promise<Event[]> {
    const url = new URL(`${API_URL}/events`);
    if (params?.search && params.search.trim()) {
      url.searchParams.set('search', params.search.trim());
    }
    if (params?.location && params.location.trim()) {
      url.searchParams.set('location', params.location.trim());
    }
    if (params?.category && params.category.trim()) {
      url.searchParams.set('category', params.category.trim());
    }

    const response = await fetch(url.toString());
    const data = await handleResponse<EventsResponse>(response);
    return data.events;
  },

  async createEvent(event: CreateEventInput, token: string): Promise<Event> {
    const response = await fetch(`${API_URL}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(event),
    });

    return handleResponse<Event>(response);
  },

  async bookEvent(
    eventId: string,
    quantity: number,
    token: string,
    opts?: { ticketId?: string }
  ): Promise<BookingResponse> {
    const response = await fetch(`${API_URL}/events/${eventId}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        quantity,
        ...(opts?.ticketId ? { ticketId: opts.ticketId } : {}),
      }),
    });

    return handleResponse<BookingResponse>(response);
  },
};

type TicketRequestPayload = {
  name: string;
  type: string;
  priceCents?: number;
  price?: number | string;
  currency: string;
  feeAbsorb: boolean;
  qtyTotal: number;
  perOrderLimit: number;
  salesStart?: string | null;
  salesEnd?: string | null;
  status: string;
};

const withAuthHeaders = (token: string, extra?: Record<string, string>) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
  ...extra,
});

export const ticketsAPI = {
  async list(eventId: string, token: string): Promise<TicketSku[]> {
    const response = await fetch(`${API_URL}/events/${eventId}/tickets`, {
      method: 'GET',
      headers: withAuthHeaders(token),
    });
    const data = await handleResponse<{ tickets: RawTicket[] }>(response);
    return (data.tickets || []).map(normalizeTicket);
  },

  async create(eventId: string, payload: TicketRequestPayload, token: string): Promise<TicketSku> {
    const response = await fetch(`${API_URL}/events/${eventId}/tickets`, {
      method: 'POST',
      headers: withAuthHeaders(token),
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<{ ticket: RawTicket }>(response);
    return normalizeTicket(data.ticket);
  },

  async update(ticketId: string, payload: TicketRequestPayload, token: string): Promise<TicketSku> {
    const response = await fetch(`${API_URL}/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: withAuthHeaders(token),
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<{ ticket: RawTicket }>(response);
    return normalizeTicket(data.ticket);
  },
};
