import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Grid,
  List,
  ListItem,
  ListItemText,
  Divider,
  Alert,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress
} from '@mui/material';
import { format } from 'date-fns';
import axios from 'axios';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import UploadIcon from '@mui/icons-material/Upload';
import { InvoiceProcessor } from '../services/InvoiceProcessor';
import { API_BASE_URL } from '../config';
import ErrorBoundary from './ErrorBoundary';

interface Transaction {
  date: string;
  amount: number;
  description: string;
  category: string;
}

interface GSTSummary {
  total_income: number;
  total_expenses: number;
  gst_collected: number;
  gst_paid: number;
  net_gst: number;
  gst_owing: number;
  gst_refund: number;
  invoices: Invoice[];
}

interface Deduction {
  id: string;
  name: string;
  description: string;
  max_amount: number;
}

interface ProcessedInvoice {
  id: string;
  fileName: string;
  supplier: string;
  date: string;
  amount: number;
  gstAmount: number;
  type: 'income' | 'expense';
}

interface Invoice {
  id: number;
  supplier: string;
  date: string;
  total_amount: number;
  gst_amount: number;
  invoice_type: 'income' | 'expense';
  status: 'pending' | 'processed';
}

const GSTHelper: React.FC = () => {
  const [income, setIncome] = useState<Transaction>({
    date: format(new Date(), 'yyyy-MM-dd'),
    amount: 0,
    description: '',
    category: 'Sales'
  });

  const [expense, setExpense] = useState<Transaction>({
    date: format(new Date(), 'yyyy-MM-dd'),
    amount: 0,
    description: '',
    category: 'General'
  });

  const [gstSummary, setGstSummary] = useState<GSTSummary>({
    total_income: 0,
    total_expenses: 0,
    gst_collected: 0,
    gst_paid: 0,
    net_gst: 0,
    gst_owing: 0,
    gst_refund: 0,
    invoices: []
  });

  const [processedInvoices, setProcessedInvoices] = useState<ProcessedInvoice[]>([]);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [invoiceType, setInvoiceType] = useState<'income' | 'expense'>('expense');
  const [invoiceTypes, setInvoiceTypes] = useState<Record<number, 'income' | 'expense'>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    fetchGSTSummary();
    loadProcessedInvoices();
    fetchInvoices();
  }, []);

  const loadProcessedInvoices = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/invoices`);
      const data = await response.json();
      setProcessedInvoices(
        data.invoices?.map((invoice: any) => ({
          id: invoice.id,
          fileName: invoice.invoice_number || 'Unknown',
          supplier: invoice.supplier || 'N/A',
          date: invoice.invoice_date || 'N/A',
          amount: invoice.total_amount || 0,
          gstAmount: invoice.gst_amount || 0,
          type: invoice.invoice_type || (invoice.total_amount > 0 ? 'income' : 'expense')
        })) || []
      );
    } catch {
      setError('Failed to load processed invoices');
    }
  };

  const fetchGSTSummary = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/gst-summary?period=quarter`);
      if (!response.ok) {
        throw new Error('Failed to fetch GST summary');
      }
      const data = await response.json();
      setGstSummary({
        total_income: data.total_income || 0,
        total_expenses: data.total_expenses || 0,
        gst_collected: data.gst_collected || 0,
        gst_paid: data.gst_paid || 0,
        net_gst: data.net_gst || 0,
        gst_owing: data.gst_owing || 0,
        gst_refund: data.gst_refund || 0,
        invoices: data.invoices || []
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setGstSummary({
        total_income: 0,
        total_expenses: 0,
        gst_collected: 0,
        gst_paid: 0,
        net_gst: 0,
        gst_owing: 0,
        gst_refund: 0,
        invoices: []
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/invoices?status=pending`);
      const data = await response.json();
      setInvoices(data.invoices ?? []);
    } catch {
      setError('Failed to fetch invoices');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setShowInvoiceDialog(true);
    }
  };

  const handleProcessUploadedFile = async () => {
    if (!selectedFile) return;
    
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('invoice_type', invoiceType);

      const response = await fetch(`${API_BASE_URL}/process-invoice`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to upload invoice');
      }

      const data = await response.json();
      setSuccess('Invoice uploaded successfully');
      setShowInvoiceDialog(false);
      fetchGSTSummary();
      fetchInvoices();
      
      if (invoiceType === 'expense') {
        window.dispatchEvent(new CustomEvent('expenseUpdated'));
      }
    } catch (error) {
      setError('Failed to upload invoice');
      console.error('Error uploading invoice:', error);
    } finally {
      setLoading(false);
      setSelectedFile(null);
    }
  };

  const handleProcessInvoice = async (file: File) => {
    try {
      setLoading(true);
      setError(null);

      // Create FormData object
      const formData = new FormData();
      formData.append('file', file);
      formData.append('invoice_type', 'expense');  // Add required invoice_type field

      const response = await fetch(`${API_BASE_URL}/process-invoice`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to process invoice');
      }

      const data = await response.json();
      if (data.success) {
        // Update the invoice in the pending invoices list
        setInvoices(prevInvoices => 
          prevInvoices.filter(inv => inv.id !== data.invoice.id)
        );
        
        // Add to processed invoices
        setProcessedInvoices(prevInvoices => [
          {
            id: data.invoice.id,
            fileName: data.invoice.invoice_number || 'Unknown',
            supplier: data.invoice.supplier || 'N/A',
            date: data.invoice.invoice_date || 'N/A',
            amount: data.invoice.total_amount || 0,
            gstAmount: data.invoice.gst_amount || 0,
            type: data.invoice.invoice_type || 'expense'
          },
          ...prevInvoices
        ]);
        
        // Refresh GST summary
        fetchGSTSummary();
        
        // Dispatch event to update ExpenseTracker
        window.dispatchEvent(new CustomEvent('expenseUpdated'));
        
        setSuccess('Invoice processed successfully');
      } else {
        throw new Error(data.error || 'Failed to process invoice');
      }
    } catch (err) {
      console.error('Error processing invoice:', err);
      setError(err instanceof Error ? err.message : 'Failed to process invoice');
    } finally {
      setLoading(false);
    }
  };

  const handleAddIncome = async () => {
    try {
      await axios.post(`${API_BASE_URL}/api/income`, income);
      setSuccess('Income added successfully');
      fetchGSTSummary();
      setIncome({ ...income, amount: 0, description: '' });
    } catch {
      setError('Failed to add income');
    }
  };

  const handleAddExpense = async () => {
    try {
      await axios.post(`${API_BASE_URL}/api/expenses`, {
        ...expense,
        is_deductible: true
      });
      setSuccess('Expense added successfully');
      fetchGSTSummary();
      setExpense({ ...expense, amount: 0, description: '' });
    } catch {
      setError('Failed to add expense');
    }
  };

  const formatCurrency = (val?: number | null): string => `$${(val ?? 0).toFixed(2)}`;

  return (
    <ErrorBoundary>
      <Box sx={{ p: 3, maxWidth: 1200, margin: '0 auto' }}>
        <Typography variant="h4" gutterBottom>GST Helper</Typography>

        {loading && <><CircularProgress /><Typography>Loading...</Typography></>}
        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
        {success && <Alert severity="success" onClose={() => setSuccess(null)}>{success}</Alert>}

        {/* Upload */}
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6">Upload Invoice</Typography>
          <input
            accept=".pdf,.jpg,.jpeg,.png"
            style={{ display: 'none' }}
            id="invoice-upload"
            type="file"
            onChange={handleFileUpload}
          />
          <label htmlFor="invoice-upload">
            <Button variant="contained" component="span" startIcon={<UploadIcon />}>Upload Invoice</Button>
          </label>
        </Paper>

        {/* Processed Invoices */}
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6">Processed Invoices</Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Supplier</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>GST</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {processedInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.date}</TableCell>
                    <TableCell>{inv.supplier}</TableCell>
                    <TableCell>{formatCurrency(inv.amount)}</TableCell>
                    <TableCell>{formatCurrency(inv.gstAmount)}</TableCell>
                    <TableCell>{inv.type}</TableCell>
                    <TableCell>
                      <IconButton onClick={() => {
                        const data = {
                          date: inv.date,
                          amount: Math.abs(inv.amount),
                          description: `${inv.supplier} - ${inv.fileName}`,
                          category: inv.type === 'income' ? 'Sales' : 'General'
                        };
                        inv.type === 'income' ? setIncome(data) : setExpense(data);
                      }}>
                        <CloudUploadIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* Pending Invoices */}
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Pending Invoices</Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Supplier</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>GST</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.supplier}</TableCell>
                    <TableCell>{inv.date}</TableCell>
                    <TableCell>{formatCurrency(inv.total_amount)}</TableCell>
                    <TableCell>{formatCurrency(inv.gst_amount)}</TableCell>
                    <TableCell>
                      <FormControl fullWidth>
                        <Select
                          value={invoiceTypes[inv.id] || 'expense'}
                          onChange={(e) => setInvoiceTypes((prev) => ({
                            ...prev,
                            [inv.id]: e.target.value as 'income' | 'expense'
                          }))}
                        >
                          <MenuItem value="income">Income</MenuItem>
                          <MenuItem value="expense">Expense</MenuItem>
                        </Select>
                      </FormControl>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="contained"
                        onClick={() => {
                          // Get the file input element
                          const fileInput = document.createElement('input');
                          fileInput.type = 'file';
                          fileInput.accept = 'image/*,.pdf';
                          
                          fileInput.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) {
                              handleProcessInvoice(file);
                            }
                          };
                          
                          fileInput.click();
                        }}
                        disabled={loading}
                      >
                        Process
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* File Invoice Dialog */}
        <Dialog open={showInvoiceDialog} onClose={() => setShowInvoiceDialog(false)}>
          <DialogTitle>Process Uploaded Invoice</DialogTitle>
          <DialogContent>
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>Invoice Type</InputLabel>
              <Select
                value={invoiceType}
                onChange={(e) => setInvoiceType(e.target.value as 'income' | 'expense')}
                label="Invoice Type"
              >
                <MenuItem value="expense">Expense</MenuItem>
                <MenuItem value="income">Income</MenuItem>
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowInvoiceDialog(false)}>Cancel</Button>
            <Button 
              variant="contained" 
              onClick={handleProcessUploadedFile}
              disabled={loading}
            >
              Process
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </ErrorBoundary>
  );
};

export default GSTHelper;
