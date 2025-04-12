import React, { useState } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Typography,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert
} from '@mui/material';
import { Invoice } from '../types/Invoice';

interface InvoiceManagerProps {
  invoices: Invoice[];
  onDelete: (id: string) => Promise<void>;
}

const InvoiceManager: React.FC<InvoiceManagerProps> = ({ invoices, onDelete }) => {
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleSelectInvoice = (invoiceId: string) => {
    setSelectedInvoices(prev => 
      prev.includes(invoiceId)
        ? prev.filter(id => id !== invoiceId)
        : [...prev, invoiceId]
    );
  };

  const handleSelectAll = () => {
    setSelectedInvoices(prev =>
      prev.length === invoices.length
        ? []
        : invoices.map(invoice => invoice.id)
    );
  };

  const handleDeleteSelected = async () => {
    try {
      for (const invoiceId of selectedInvoices) {
        await onDelete(invoiceId);
      }
      setMessage({ type: 'success', text: 'Selected invoices deleted successfully' });
      setSelectedInvoices([]);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete selected invoices' });
    }
    setDeleteDialogOpen(false);
  };

  const handleDeleteAll = async () => {
    try {
      for (const invoice of invoices) {
        await onDelete(invoice.id);
      }
      setMessage({ type: 'success', text: 'All invoices deleted successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete all invoices' });
    }
    setDeleteAllDialogOpen(false);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Invoice Management
      </Typography>

      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }}>
          {message.text}
        </Alert>
      )}

      <Box sx={{ mb: 2, display: 'flex', gap: 2 }}>
        <Button
          variant="contained"
          color="error"
          disabled={selectedInvoices.length === 0}
          onClick={() => setDeleteDialogOpen(true)}
        >
          Delete Selected
        </Button>
        <Button
          variant="contained"
          color="error"
          disabled={invoices.length === 0}
          onClick={() => setDeleteAllDialogOpen(true)}
        >
          Delete All
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  checked={selectedInvoices.length === invoices.length && invoices.length > 0}
                  indeterminate={selectedInvoices.length > 0 && selectedInvoices.length < invoices.length}
                  onChange={handleSelectAll}
                />
              </TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Supplier</TableCell>
              <TableCell>Invoice Number</TableCell>
              <TableCell>Total Amount</TableCell>
              <TableCell>GST Amount</TableCell>
              <TableCell>Net Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selectedInvoices.includes(invoice.id)}
                    onChange={() => handleSelectInvoice(invoice.id)}
                  />
                </TableCell>
                <TableCell>{invoice.date || 'N/A'}</TableCell>
                <TableCell>{invoice.supplier || 'N/A'}</TableCell>
                <TableCell>{invoice.invoice_number || 'N/A'}</TableCell>
                <TableCell>${(invoice.total_amount || 0).toFixed(2)}</TableCell>
                <TableCell>${(invoice.gst_amount || 0).toFixed(2)}</TableCell>
                <TableCell>${(invoice.net_amount || 0).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Selected Invoices</DialogTitle>
        <DialogContent>
          Are you sure you want to delete {selectedInvoices.length} selected invoice(s)?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteSelected} color="error">Delete</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteAllDialogOpen} onClose={() => setDeleteAllDialogOpen(false)}>
        <DialogTitle>Delete All Invoices</DialogTitle>
        <DialogContent>
          Are you sure you want to delete all {invoices.length} invoices? This action cannot be undone.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteAllDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteAll} color="error">Delete All</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default InvoiceManager; 