// Determine the API URL based on environment
const getApiUrl = () => {
  if (process.env.NODE_ENV === 'development') {
    // In development, use localhost with HTTP
    return 'http://localhost:8000';
  } else {
    // In production, use the environment variable or default to relative path
    return process.env.REACT_APP_API_URL || '/api';
  }
};

// Export the API base URL
export const API_BASE_URL = getApiUrl();

// Other configuration constants
export const CATEGORIES = [
  'Office Supplies',
  'Equipment',
  'Software',
  'Travel',
  'Meals & Entertainment',
  'Professional Services',
  'Rent',
  'Utilities',
  'Insurance',
  'Other'
] as const;

export type Category = typeof CATEGORIES[number]; 