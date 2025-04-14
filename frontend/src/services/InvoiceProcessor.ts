import { InvoiceProcessingResult, ParsedInvoice } from '../types/Invoice';
import { API_BASE_URL } from '../config';

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

export class InvoiceProcessor {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  async checkServerHealth(): Promise<boolean> {
    try {
      console.log('Checking server health at:', this.baseUrl);
      const response = await fetch(`${this.baseUrl}/health`);
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

  async processDocument(file: File): Promise<ParsedInvoice> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${this.baseUrl}/process-invoice`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to process invoice');
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to process invoice');
      }

      return {
        id: data.invoice.id,
        supplier: data.invoice.supplier,
        totalAmount: data.invoice.total_amount,
        gstAmount: data.invoice.gst_amount,
        netAmount: data.invoice.net_amount,
        invoiceDate: data.invoice.invoice_date,
        invoiceNumber: data.invoice.invoice_number,
        category: data.invoice.category,
        gstEligible: data.invoice.gst_eligible,
        filePath: data.invoice.file_path,
        isSystemDate: data.invoice.is_system_date
      };
    } catch (error) {
      console.error('Error processing document:', error);
      throw error;
    }
  }

  async getInvoices(): Promise<Invoice[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/invoices`);
      if (!response.ok) {
        throw new Error('Failed to fetch invoices');
      }
      const data = await response.json();
      if (!data.invoices) {
        throw new Error('Invalid response format');
      }
      
      return data.invoices.map((invoice: any) => ({
        id: String(invoice.id),
        supplier: invoice.supplier || 'N/A',
        total_amount: Number(invoice.total_amount) || 0,
        gst_amount: Number(invoice.gst_amount) || 0,
        net_amount: Number(invoice.net_amount) || 0,
        invoice_date: invoice.invoice_date || 'N/A',
        invoice_number: invoice.invoice_number || 'N/A',
        category: invoice.category || '',
        gst_eligible: Boolean(invoice.gst_eligible),
        file_path: invoice.file_path || '',
        is_system_date: Boolean(invoice.is_system_date)
      }));
    } catch (error) {
      console.error('Error fetching invoices:', error);
      return [];
    }
  }

  async getExpenses(): Promise<{ total: number; gstEligible: number }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/expenses`);
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
      const response = await fetch(`${this.baseUrl}/invoices/${id}`, {
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
      const response = await fetch(`${this.baseUrl}/invoices`, {
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
      const response = await fetch(`${this.baseUrl}/invoices`, {
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
      const response = await fetch(`${this.baseUrl}/invoices/${invoice.id}`, {
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