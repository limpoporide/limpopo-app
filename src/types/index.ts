export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
}

export interface Vehicle {
  id: string;
  name: string;
  type: 'car' | 'bike' | 'van' | 'suv';
  brand: string;
  model: string;
  year: number;
  pricePerDay: number;
  pricePerHour: number;
  image: string;
  rating: number;
  reviews: number;
  available: boolean;
  features: string[];
  seats?: number;
  transmission?: 'automatic' | 'manual';
}

export interface Booking {
  id: string;
  vehicleId: string;
  vehicle: Vehicle;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  status: 'active' | 'completed' | 'cancelled' | 'pending';
  pickupLocation: string;
  dropoffLocation: string;
}

export interface Transaction {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  date: string;
  status: 'completed' | 'pending' | 'failed';
}

export interface WalletInfo {
  balance: number;
  transactions: Transaction[];
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface Theme {
  mode: ThemeMode;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    card: string;
    text: string;
    textSecondary: string;
    border: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    bg: string;
  };
}
