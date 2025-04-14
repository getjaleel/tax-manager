import axios from 'axios';
import { API_BASE_URL } from '../config';

export interface User {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
}

export interface SignupData {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

class AuthService {
  async signup(data: SignupData): Promise<User> {
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/signup`, data);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 400) {
          throw new Error(error.response.data.detail || 'Invalid signup data');
        }
        if (error.response?.status === 409) {
          throw new Error('Email already exists');
        }
        throw new Error(error.response?.data?.detail || 'Signup failed');
      }
      throw error;
    }
  }

  async login(data: LoginData): Promise<AuthResponse> {
    try {
      const formData = new FormData();
      formData.append('username', data.email);
      formData.append('password', data.password);

      const response = await axios.post(`${API_BASE_URL}/auth/login`, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      
      const { access_token, token_type } = response.data;
      
      // Store the token
      localStorage.setItem('token', access_token);
      
      return { access_token, token_type };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('Invalid email or password');
        }
        throw new Error(error.response?.data?.detail || 'Login failed');
      }
      throw error;
    }
  }

  logout(): void {
    localStorage.removeItem('token');
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }
}

export const authService = new AuthService(); 