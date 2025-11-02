export type UserType = 'organizer' | 'attendee';

export interface User {
  id: string;
  email: string;
  full_name?: string;
  user_type?: UserType;
  created_at?: string;
}

export type TicketType = 'free' | 'paid' | 'seat';
export type TicketStatus = 'draft' | 'active' | 'archived';

export interface TicketSku {
  id: string;
  eventId: string;
  name: string;
  type: TicketType;
  priceCents: number;
  price: number;
  currency: string;
  feeAbsorb: boolean;
  qtyTotal: number;
  qtySold: number;
  salesStart?: string;
  salesEnd?: string;
  perOrderLimit: number;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  summary?: string;
  category: string;
  location: string;
  image_url?: string;
  start_date: string;
  end_date: string;
  ticket_price: number;
  ticket_currency?: string;
  total_tickets: number;
  available_tickets: number;
  organized_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Booking {
  id: string;
  event_id: string;
  user_id: string;
  quantity: number;
  total_amount: number;
  booking_status: 'confirmed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface CreateEventInput {
  title: string;
  description: string;
  category: string;
  location: string;
  image_url?: string;
  start_date: string;
  end_date: string;
  ticket_price: number;
  total_tickets: number;
}

export interface BookingRequest {
  quantity: number;
}
