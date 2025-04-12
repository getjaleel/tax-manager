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
  Alert
} from '@mui/material';
import { format } from 'date-fns';
import axios from 'axios';

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

  useEffect(() => {
    fetchGSTSummary();
    fetchDeductions();
  }, []);

  const fetchGSTSummary = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/gst-summary');
      setGstSummary(response.data);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to fetch GST summary' });
    }
  };

  const fetchDeductions = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/common-deductions');
      setDeductions(response.data);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to fetch deductions' });
    }
  };

  const handleAddIncome = async () => {
    try {
      await axios.post('http://localhost:3001/api/income', income);
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
      await axios.post('http://localhost:3001/api/expenses', {
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
    </Box>
  );
};

export default GSTHelper; 