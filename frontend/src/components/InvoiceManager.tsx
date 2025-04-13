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
  Alert,
  Tooltip,
  TablePagination,
  IconButton,
  Link
} from '@mui/material';
import { Delete as DeleteIcon, DeleteForever as DeleteAllIcon, Edit as EditIcon, Visibility as ViewIcon } from '@mui/icons-material';
import { Invoice } from '../types/Invoice';
import EditInvoiceDialog from './EditInvoiceDialog';

interface InvoiceManagerProps {
  invoices: Invoice[];
  onDelete: (id: string) => Promise<void>;
  onUpdate: (invoice: Invoice) => Promise<void>;
}

const InvoiceManager: React.FC<InvoiceManagerProps> = ({ invoices, onDelete, onUpdate }) => {
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

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

  const handleEditClick = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async (updatedInvoice: Invoice) => {
    try {
      await onUpdate(updatedInvoice);
      setMessage({ type: 'success', text: 'Invoice updated successfully' });
      setSelectedInvoice(null);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update invoice' });
    }
    setEditDialogOpen(false);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ mb: 3, color: '#1976d2' }}>
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
          startIcon={<DeleteIcon />}
          disabled={selectedInvoices.length === 0}
          onClick={() => setDeleteDialogOpen(true)}
          sx={{ minWidth: '150px' }}
        >
          Delete Selected
        </Button>
        <Button
          variant="contained"
          color="error"
          startIcon={<DeleteAllIcon />}
          disabled={invoices.length === 0}
          onClick={() => setDeleteAllDialogOpen(true)}
          sx={{ minWidth: '150px' }}
        >
          Delete All
        </Button>
      </Box>

      <Paper sx={{ width: '100%', overflow: 'hidden', boxShadow: 3 }}>
        <TableContainer sx={{ 
          maxHeight: 440,
          overflowX: 'auto',
          '& .MuiTable-root': {
            minWidth: 1200  // Ensure table has minimum width to show all columns
          }
        }}>
          <Table stickyHeader aria-label="sticky table">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" sx={{ backgroundColor: '#f5f5f5' }}>
                  <Checkbox
                    checked={selectedInvoices.length === invoices.length && invoices.length > 0}
                    indeterminate={selectedInvoices.length > 0 && selectedInvoices.length < invoices.length}
                    onChange={handleSelectAll}
                  />
                </TableCell>
                <TableCell sx={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>Date</TableCell>
                <TableCell sx={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>Supplier</TableCell>
                <TableCell sx={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>Invoice Number</TableCell>
                <TableCell align="right" sx={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>Total Amount</TableCell>
                <TableCell align="right" sx={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>GST Amount</TableCell>
                <TableCell align="right" sx={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>Net Amount</TableCell>
                <TableCell sx={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>Category</TableCell>
                <TableCell sx={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>GST Eligible</TableCell>
                <TableCell sx={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {invoices
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((invoice) => (
                <TableRow 
                  key={invoice.id}
                  hover
                  selected={selectedInvoices.includes(invoice.id)}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedInvoices.includes(invoice.id)}
                      onChange={() => handleSelectInvoice(invoice.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Tooltip title={invoice.is_system_date ? "System added date (original date was missing)" : ""}>
                      <span>{invoice.invoice_date}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell>{invoice.supplier}</TableCell>
                  <TableCell>{invoice.invoice_number}</TableCell>
                  <TableCell align="right">${(invoice.total_amount || 0).toFixed(2)}</TableCell>
                  <TableCell align="right">${(invoice.gst_amount || 0).toFixed(2)}</TableCell>
                  <TableCell align="right">${(invoice.net_amount || 0).toFixed(2)}</TableCell>
                  <TableCell>{invoice.category || 'N/A'}</TableCell>
                  <TableCell>{invoice.gst_eligible ? 'Yes' : 'No'}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                      <Tooltip title="View invoice">
                        <IconButton
                          component={Link}
                          href={invoice.file_path}
                          target="_blank"
                          rel="noopener noreferrer"
                          size="small"
                          color="primary"
                          sx={{ 
                            '&:hover': { 
                              backgroundColor: 'rgba(25, 118, 210, 0.04)',
                              transform: 'scale(1.1)'
                            },
                            transition: 'transform 0.2s'
                          }}
                        >
                          <ViewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit invoice">
                        <IconButton
                          onClick={() => handleEditClick(invoice)}
                          size="small"
                          color="primary"
                          sx={{ 
                            '&:hover': { 
                              backgroundColor: 'rgba(25, 118, 210, 0.04)',
                              transform: 'scale(1.1)'
                            },
                            transition: 'transform 0.2s'
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25, 50]}
          component="div"
          count={invoices.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Paper>

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

      {selectedInvoice && (
        <EditInvoiceDialog
          open={editDialogOpen}
          onClose={() => setEditDialogOpen(false)}
          onSave={handleSaveEdit}
          invoice={selectedInvoice}
        />
      )}
    </Box>
  );
};

export default InvoiceManager; 