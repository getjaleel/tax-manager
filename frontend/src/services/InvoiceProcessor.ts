import { InvoiceProcessingResult } from '../types/Invoice';

// Use the server's IP address instead of localhost
const API_BASE_URL = 'http://192.168.1.122:8000';

export class InvoiceProcessor {
  async checkServerHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      const data = await response.json();
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
      
      console.log('Sending request to OCR service at:', API_BASE_URL);
      const startTime = Date.now();
      
      // Add timeout to the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
        // Send to our local OCR service
        const response = await fetch(`${API_BASE_URL}/process-invoice`, {
          method: 'POST',
          body: formData,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const endTime = Date.now();
        console.log(`Request completed in ${endTime - startTime}ms`);
        
        if (!response.ok) {
          const errorData = await response.json();
          console.error('Server responded with error:', response.status, errorData);
          throw new Error(errorData.detail || `Server error: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Received response from server:', result);
        
        // The backend sends the invoice data directly in the response
        return {
          success: true,
          invoice: {
            supplier: result.supplier,
            totalAmount: result.total_amount,
            gstAmount: result.gst_amount,
            netAmount: result.net_amount,
            invoiceDate: result.invoice_date,
            rawText: result.raw_text
          }
        };
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Request timed out. Please check if the backend server is running.');
        }
        throw error;
      }
    } catch (error: unknown) {
      console.error('Error processing document:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
} 