import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  FormControlLabel,
  Switch
} from '@mui/material';
import { Invoice } from '../types/Invoice';

interface EditInvoiceDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (updatedInvoice: Invoice) => Promise<void>;
  invoice: Invoice;
}

const PURCHASE_CATEGORIES = [
  'Hardware',
  'Software',
  'Cloud Services',
  'Office Supplies',
  'Professional Development',
  'Travel',
  'Marketing',
  'Other'
];

const EditInvoiceDialog: React.FC<EditInvoiceDialogProps> = ({
  open,
  onClose,
  onSave,
  invoice
}) => {
  const [editedInvoice, setEditedInvoice] = useState<Invoice>({ ...invoice });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEditedInvoice({ ...invoice });
  }, [invoice]);

  const handleChange = (field: keyof Invoice, value: string | number | boolean) => {
    setEditedInvoice(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      await onSave(editedInvoice);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save invoice');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Invoice</DialogTitle>
      <DialogContent>
        {error && (
          <div style={{ color: 'red', marginBottom: '16px' }}>
            {error}
          </div>
        )}
        <TextField
          label="Supplier"
          value={editedInvoice.supplier}
          onChange={(e) => handleChange('supplier', e.target.value)}
          fullWidth
          margin="normal"
        />
        <TextField
          label="Invoice Number"
          value={editedInvoice.invoice_number}
          onChange={(e) => handleChange('invoice_number', e.target.value)}
          fullWidth
          margin="normal"
        />
        <TextField
          label="Date"
          type="date"
          value={editedInvoice.invoice_date}
          onChange={(e) => handleChange('invoice_date', e.target.value)}
          fullWidth
          margin="normal"
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="Total Amount"
          type="number"
          value={editedInvoice.total_amount}
          onChange={(e) => handleChange('total_amount', parseFloat(e.target.value))}
          fullWidth
          margin="normal"
        />
        <TextField
          label="GST Amount"
          type="number"
          value={editedInvoice.gst_amount}
          onChange={(e) => handleChange('gst_amount', parseFloat(e.target.value))}
          fullWidth
          margin="normal"
        />
        <TextField
          label="Net Amount"
          type="number"
          value={editedInvoice.net_amount}
          onChange={(e) => handleChange('net_amount', parseFloat(e.target.value))}
          fullWidth
          margin="normal"
        />
        <TextField
          select
          label="Category"
          value={editedInvoice.category}
          onChange={(e) => handleChange('category', e.target.value)}
          fullWidth
          margin="normal"
        >
          {PURCHASE_CATEGORIES.map((category) => (
            <MenuItem key={category} value={category}>
              {category}
            </MenuItem>
          ))}
        </TextField>
        <FormControlLabel
          control={
            <Switch
              checked={editedInvoice.gst_eligible}
              onChange={(e) => handleChange('gst_eligible', e.target.checked)}
            />
          }
          label="GST Eligible"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSave} 
          color="primary" 
          variant="contained"
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditInvoiceDialog; 