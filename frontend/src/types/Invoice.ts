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