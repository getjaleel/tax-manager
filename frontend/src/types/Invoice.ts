export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ParsedInvoice {
  supplier: string;
  totalAmount: number;
  gstAmount: number;
  netAmount: number;
  invoiceDate: string;
  invoiceNumber: string;
  rawText: string;
}

export interface InvoiceProcessingResult {
  success: boolean;
  invoice?: ParsedInvoice;
  error?: string;
}

export interface OCRServiceConfig {
  apiKey: string;
  endpoint?: string;
  region?: string;
}

export type OCRProvider = 'aws' | 'azure' | 'google';

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
  file_path: string;
  is_system_date: boolean;
} 