import { InvoiceProcessingResult, ParsedInvoice } from '../types/Invoice';

export interface Invoice {
  id: string;
  supplier: string;
  total_amount: number;
  gst_amount: number;
  net_amount: number;
  invoice_date: string;
  invoice_number: string;
  category: string;
  gst_eligible: boolean;
  file_url?: string;
  rawText?: string;
}

// Use environment variable for API URL with fallback for development
const API_BASE_URL = process.env.REACT_APP_API_URL || 
    (process.env.NODE_ENV === 'development' 
        ? 'http://192.168.1.122:8000'  // Use the IP address instead of localhost
        : 'http://backend:8000');

export class InvoiceProcessor {
  private apiUrl: string;

  constructor() {
    this.apiUrl = API_BASE_URL;
  }

  async checkServerHealth(): Promise<boolean> {
    try {
      console.log('Checking server health at:', this.apiUrl);
      const response = await fetch(`${this.apiUrl}/health`);
      if (!response.ok) {
        console.error('Health check failed:', response.status, response.statusText);
        return false;
      }
      const data = await response.json();
      console.log('Health check response:', data);
      return data.status === 'ok';
    } catch (error: unknown) {
      console.error('Server health check failed:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async processDocument(file: File): Promise<InvoiceProcessingResult> {
    try {
      // Check if server is running
      const isServerHealthy = await this.checkServerHealth();
      if (!isServerHealthy) {
        throw new Error('Server is not running. Please start the backend server first.');
      }

      console.log('Starting document processing for file:', file.name);
      console.log('File size:', file.size, 'bytes');
      console.log('File type:', file.type);
      
      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      
      console.log('Sending request to OCR service at:', this.apiUrl);
      const startTime = Date.now();
      
      // Add timeout to the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
        const response = await fetch(`${this.apiUrl}/process-invoice`, {
          method: 'POST',
          body: formData,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorData = await response.json();
          console.error('OCR service error:', errorData);
          throw new Error(errorData.detail || 'Failed to process document');
        }
        
        const result = await response.json();
        console.log('OCR processing completed in:', Date.now() - startTime, 'ms');
        console.log('Processing result:', result);
        
        // Ensure the response has the expected structure
        if (!result.success || !result.invoice) {
          throw new Error('Invalid response format: missing invoice data');
        }

        // Convert the backend invoice data to ParsedInvoice format
        const parsedInvoice: ParsedInvoice = {
          supplier: String(result.invoice.supplier || ''),
          totalAmount: Number(result.invoice.total_amount || 0),
          gstAmount: Number(result.invoice.gst_amount || 0),
          netAmount: Number(result.invoice.net_amount || 0),
          invoiceDate: String(result.invoice.invoice_date || new Date().toISOString().split('T')[0]),
          invoiceNumber: String(result.invoice.invoice_number || ''),
          rawText: String(result.invoice.raw_text || '')
        };
        
        return {
          success: true,
          invoice: parsedInvoice
        };
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error: unknown) {
      console.error('Document processing failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async getInvoices(): Promise<Invoice[]> {
    try {
      const response = await fetch('http://localhost:8000/invoices');
      if (!response.ok) {
        throw new Error('Failed to fetch invoices');
      }
      const data = await response.json();
      if (!Array.isArray(data.invoices)) {
        throw new Error('Invalid response format');
      }
      return data.invoices.map((invoice: any) => ({
        id: String(invoice.id),
        invoice_number: invoice.invoice_number || '',
        date: invoice.date || '',
        amount: Number(invoice.amount) || 0,
        gst_amount: Number(invoice.gst_amount) || 0,
        gst_percentage: Number(invoice.gst_percentage) || 0,
        description: invoice.description || '',
        category: invoice.category || '',
        is_gst_eligible: Boolean(invoice.is_gst_eligible),
        created_at: invoice.created_at || new Date().toISOString()
      }));
    } catch (error) {
      console.error('Error fetching invoices:', error);
      return [];
    }
  }

  async getExpenses(): Promise<{ total: number; gstEligible: number }> {
    try {
      const response = await fetch(`${this.apiUrl}/expenses`);
      if (!response.ok) {
        console.error('Failed to fetch expenses:', response.status, response.statusText);
        return { total: 0, gstEligible: 0 };
      }

      const data = await response.json();
      console.log('Received expenses data:', data);

      return {
        total: Number(data.total_expenses || 0),
        gstEligible: Number(data.gst_eligible_expenses || 0)
      };
    } catch (error) {
      console.error('Error fetching expenses:', error);
      return { total: 0, gstEligible: 0 };
    }
  }

  async deleteInvoice(id: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/invoices/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Invoice with ID ${id} not found`);
        }
        throw new Error('Failed to delete invoice');
      }
      
      const data = await response.json();
      return data.success === true;
    } catch (error) {
      console.error('Error deleting invoice:', error);
      throw error;
    }
  }

  async deleteAllInvoices(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/invoices`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to delete all invoices');
      }
      
      return true;
    } catch (error) {
      console.error('Error deleting all invoices:', error);
      throw error;
    }
  }
} 