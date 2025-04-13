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
  file_path: string;
  is_system_date: boolean;
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

        // Format supplier name by removing extra whitespace and newlines
        const formattedSupplier = result.invoice.supplier?.replace(/\s+/g, ' ').trim() || '';
        
        // Handle date - ensure it's properly formatted
        let invoiceDate = result.invoice.invoice_date || '';
        if (invoiceDate) {
          try {
            const date = new Date(invoiceDate);
            if (!isNaN(date.getTime())) {
              invoiceDate = date.toLocaleDateString('en-AU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
              });
            }
          } catch (e) {
            console.warn('Failed to parse date:', invoiceDate);
          }
        }

        // Convert the backend invoice data to ParsedInvoice format
        const parsedInvoice: ParsedInvoice = {
          supplier: formattedSupplier,
          totalAmount: Number(result.invoice.total_amount || 0),
          gstAmount: Number(result.invoice.gst_amount || 0),
          netAmount: Number(result.invoice.net_amount || 0),
          invoiceDate: invoiceDate || new Date().toLocaleDateString('en-AU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          }),
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
      const response = await fetch(`${this.apiUrl}/invoices`);
      if (!response.ok) {
        throw new Error('Failed to fetch invoices');
      }
      const data = await response.json();
      if (!Array.isArray(data.invoices)) {
        throw new Error('Invalid response format');
      }
      console.log('Received invoices data:', data.invoices); // Debug log
      return data.invoices.map((invoice: any) => {
        console.log('Processing invoice:', invoice); // Debug log
        
        // Enhanced supplier name formatting
        let formattedSupplier = invoice.supplier || '';
        
        // Remove newlines and extra spaces
        formattedSupplier = formattedSupplier.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
        
        // Check if the supplier name is actually an invoice number or header
        const isLikelyInvoiceNumber = /^(?:INV|REC|ORD|BILL|DOC|REF)?[-#\s]*\d+[-#\s]*\d*$/i.test(formattedSupplier);
        const isLikelyHeader = /^(?:Invoice|Receipt|Number|Order|Bill|Document|Reference|ID|No\.|No:)/i.test(formattedSupplier);
        
        // If the supplier name is clearly not a valid company name, set it to empty
        if (isLikelyInvoiceNumber || isLikelyHeader || formattedSupplier === 'Invoice Receipt Invoice Number') {
          formattedSupplier = '';
        }
        
        // Handle date - ensure it's properly formatted
        let invoiceDate = invoice.invoice_date || '';
        const isSystemDate = !invoice.invoice_date;
        
        // If we have a date in DD/MM/YYYY format, keep it as is
        if (invoiceDate && /^\d{2}\/\d{2}\/\d{4}$/.test(invoiceDate)) {
          // Date is already in correct format, do nothing
        } else if (invoiceDate) {
          // Try to parse and format the date
          try {
            const date = new Date(invoiceDate);
            if (!isNaN(date.getTime())) {
              invoiceDate = date.toLocaleDateString('en-AU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
              });
            }
          } catch (e) {
            console.warn('Failed to parse date:', invoiceDate);
          }
        }

        // Format invoice number - remove any extra whitespace and clean up
        let formattedInvoiceNumber = invoice.invoice_number || '';
        formattedInvoiceNumber = formattedInvoiceNumber
          .replace(/[\n\r]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        return {
          id: String(invoice.id),
          supplier: formattedSupplier || 'N/A', // Will be manually entered if needed
          total_amount: Number(invoice.total_amount) || 0,
          gst_amount: Number(invoice.gst_amount) || 0,
          net_amount: Number(invoice.net_amount) || 0,
          invoice_date: invoiceDate || 'N/A',
          invoice_number: formattedInvoiceNumber || 'N/A',
          category: invoice.category || '',
          gst_eligible: Boolean(invoice.gst_eligible),
          file_path: invoice.file_path || '',
          is_system_date: isSystemDate
        };
      });
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

  async storeInvoice(invoice: Omit<Invoice, 'id' | 'gst_eligible' | 'is_system_date'>): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.apiUrl}/invoices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invoice),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.detail || 'Failed to store invoice'
        };
      }

      return { success: true };
    } catch (error) {
      console.error('Error storing invoice:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to store invoice'
      };
    }
  }

  async updateInvoice(invoice: Invoice): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/invoices/${invoice.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invoice),
      });

      if (!response.ok) {
        throw new Error('Failed to update invoice');
      }

      return true;
    } catch (error) {
      console.error('Error updating invoice:', error);
      throw error;
    }
  }
} 