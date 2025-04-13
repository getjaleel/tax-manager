import React, { useState, useEffect } from 'react';
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
  MenuItem
} from '@mui/material';
import { format } from 'date-fns';
import axios from 'axios';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import { InvoiceProcessor } from '../services/InvoiceProcessor';
import { API_BASE_URL } from '../config';

interface Transaction {
  date: string;
  amount: number;
  description: string;
  category: string;
}

interface GSTSummary {
  gst_collected: number;
  gst_paid: number;
  net_gst: number;
  gst_owing: number;
  gst_refund: number;
}

interface Deduction {
  category: string;
  description: string;
  notes: string;
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

  const [gstSummary, setGstSummary] = useState<GSTSummary | null>(null);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [processedInvoices, setProcessedInvoices] = useState<ProcessedInvoice[]>([]);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [invoiceType, setInvoiceType] = useState<'income' | 'expense'>('expense');
  const invoiceProcessor = new InvoiceProcessor();

  useEffect(() => {
    fetchGSTSummary();
    fetchDeductions();
    loadProcessedInvoices();
  }, []);

  const loadProcessedInvoices = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/invoices`);
      if (!response.ok) {
        throw new Error('Failed to fetch invoices');
      }
      const data = await response.json();
      if (!data.invoices) {
        throw new Error('Invalid response format');
      }
      
      setProcessedInvoices(data.invoices.map((invoice: any) => ({
        id: invoice.id,
        fileName: invoice.invoice_number || 'Unknown',
        supplier: invoice.supplier || 'N/A',
        date: invoice.invoice_date || 'N/A',
        amount: invoice.total_amount || 0,
        gstAmount: invoice.gst_amount || 0,
        type: invoice.total_amount > 0 ? 'income' : 'expense'
      })));
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load processed invoices' });
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setShowInvoiceDialog(true);
    }
  };

  const handleProcessInvoice = async () => {
    if (!selectedFile) return;

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('invoice_type', invoiceType);

      const response = await fetch(`${API_BASE_URL}/process-invoice`, {
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

      setMessage({ type: 'success', text: 'Invoice processed successfully' });
      await loadProcessedInvoices();
      
      // Update the appropriate field based on invoice type
      if (invoiceType === 'income') {
        setIncome({
          date: data.invoice.invoice_date,
          amount: data.invoice.total_amount,
          description: `${data.invoice.supplier} - ${data.invoice.invoice_number}`,
          category: 'Sales'
        });
      } else {
        setExpense({
          date: data.invoice.invoice_date,
          amount: data.invoice.total_amount,
          description: `${data.invoice.supplier} - ${data.invoice.invoice_number}`,
          category: 'General'
        });
      }

      // Refresh GST summary and expense summary after processing invoice
      await fetchGSTSummary();
      if (invoiceType === 'expense') {
        // Trigger a custom event to refresh the expense summary
        window.dispatchEvent(new CustomEvent('expenseUpdated'));
      }
    } catch (error) {
      console.error('Error processing invoice:', error);
      setMessage({ type: 'error', text: 'Failed to process invoice' });
    } finally {
      setShowInvoiceDialog(false);
      setSelectedFile(null);
    }
  };

  const fetchGSTSummary = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/gst-summary`);
      setGstSummary(response.data);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to fetch GST summary' });
    }
  };

  const fetchDeductions = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/common-deductions`);
      setDeductions(response.data);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to fetch deductions' });
    }
  };

  const handleAddIncome = async () => {
    try {
      await axios.post(`${API_BASE_URL}/api/income`, income);
      setMessage({ type: 'success', text: 'Income added successfully' });
      fetchGSTSummary();
      setIncome({
        date: format(new Date(), 'yyyy-MM-dd'),
        amount: 0,
        description: '',
        category: 'Sales'
      });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to add income' });
    }
  };

  const handleAddExpense = async () => {
    try {
      await axios.post(`${API_BASE_URL}/api/expenses`, {
        ...expense,
        is_deductible: true
      });
      setMessage({ type: 'success', text: 'Expense added successfully' });
      fetchGSTSummary();
      setExpense({
        date: format(new Date(), 'yyyy-MM-dd'),
        amount: 0,
        description: '',
        category: 'General'
      });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to add expense' });
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1200, margin: '0 auto' }}>
      <Typography variant="h4" gutterBottom>
        GST Helper
      </Typography>

      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }}>
          {message.text}
        </Alert>
      )}

      {/* Invoice Upload Section */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Upload Invoice
        </Typography>
        <input
          accept=".pdf,.jpg,.jpeg,.png"
          style={{ display: 'none' }}
          id="invoice-upload"
          type="file"
          onChange={handleFileUpload}
        />
        <label htmlFor="invoice-upload">
          <Button
            variant="contained"
            component="span"
            startIcon={<CloudUploadIcon />}
          >
            Upload Invoice
          </Button>
        </label>
      </Paper>

      {/* Processed Invoices Table */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Processed Invoices
        </Typography>
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
              {processedInvoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>{invoice.date}</TableCell>
                  <TableCell>{invoice.supplier}</TableCell>
                  <TableCell>${Math.abs(invoice.amount).toFixed(2)}</TableCell>
                  <TableCell>${invoice.gstAmount.toFixed(2)}</TableCell>
                  <TableCell>{invoice.type}</TableCell>
                  <TableCell>
                    <IconButton
                      onClick={() => {
                        if (invoice.type === 'income') {
                          setIncome({
                            date: invoice.date,
                            amount: invoice.amount,
                            description: `${invoice.supplier} - ${invoice.fileName}`,
                            category: 'Sales'
                          });
                        } else {
                          setExpense({
                            date: invoice.date,
                            amount: Math.abs(invoice.amount),
                            description: `${invoice.supplier} - ${invoice.fileName}`,
                            category: 'General'
                          });
                        }
                      }}
                    >
                      <CloudUploadIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Grid container spacing={3}>
        {/* Income Form */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Add Income
            </Typography>
            <TextField
              fullWidth
              type="date"
              label="Date"
              value={income.date}
              onChange={(e) => setIncome({ ...income, date: e.target.value })}
              InputLabelProps={{ shrink: true }}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              type="number"
              label="Amount"
              value={income.amount}
              onChange={(e) => setIncome({ ...income, amount: parseFloat(e.target.value) })}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Description"
              value={income.description}
              onChange={(e) => setIncome({ ...income, description: e.target.value })}
              sx={{ mb: 2 }}
            />
            <Button 
              variant="contained" 
              onClick={handleAddIncome}
              disabled={!income.amount || !income.description}
            >
              Add Income
            </Button>
          </Paper>
        </Grid>

        {/* Expense Form */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Add Expense
            </Typography>
            <TextField
              fullWidth
              type="date"
              label="Date"
              value={expense.date}
              onChange={(e) => setExpense({ ...expense, date: e.target.value })}
              InputLabelProps={{ shrink: true }}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              type="number"
              label="Amount"
              value={expense.amount}
              onChange={(e) => setExpense({ ...expense, amount: parseFloat(e.target.value) })}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Description"
              value={expense.description}
              onChange={(e) => setExpense({ ...expense, description: e.target.value })}
              sx={{ mb: 2 }}
            />
            <Button 
              variant="contained" 
              onClick={handleAddExpense}
              disabled={!expense.amount || !expense.description}
            >
              Add Expense
            </Button>
          </Paper>
        </Grid>

        {/* GST Summary */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              GST Summary
            </Typography>
            {gstSummary && (
              <Grid container spacing={2}>
                <Grid item xs={6} md={3}>
                  <Typography variant="subtitle2">GST Collected</Typography>
                  <Typography variant="h6">${gstSummary.gst_collected.toFixed(2)}</Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="subtitle2">GST Paid</Typography>
                  <Typography variant="h6">${gstSummary.gst_paid.toFixed(2)}</Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="subtitle2">Net GST</Typography>
                  <Typography variant="h6" color={gstSummary.net_gst >= 0 ? 'error' : 'success'}>
                    ${Math.abs(gstSummary.net_gst).toFixed(2)} {gstSummary.net_gst >= 0 ? 'Owing' : 'Refund'}
                  </Typography>
                </Grid>
              </Grid>
            )}
          </Paper>
        </Grid>

        {/* Common Deductions */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Common Deductions
            </Typography>
            <List>
              {deductions.map((deduction, index) => (
                <React.Fragment key={index}>
                  <ListItem>
                    <ListItemText
                      primary={deduction.category}
                      secondary={
                        <>
                          <Typography component="span" variant="body2">
                            {deduction.description}
                          </Typography>
                          <br />
                          <Typography component="span" variant="caption" color="text.secondary">
                            {deduction.notes}
                          </Typography>
                        </>
                      }
                    />
                  </ListItem>
                  {index < deductions.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          </Paper>
        </Grid>
      </Grid>

      {/* Invoice Processing Dialog */}
      <Dialog open={showInvoiceDialog} onClose={() => setShowInvoiceDialog(false)}>
        <DialogTitle>Process Invoice</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <FormControl fullWidth>
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
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowInvoiceDialog(false)}>Cancel</Button>
          <Button onClick={handleProcessInvoice} variant="contained" color="primary">
            Process
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default GSTHelper; 