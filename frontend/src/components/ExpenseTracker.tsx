import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';

interface Expense {
  id?: number;
  date: string;
  amount: number;
  gst_amount: number;
  description: string;
  category: string;
  is_gst_eligible: boolean;
}

interface ExpenseSummary {
  period: string;
  start_date: string;
  end_date: string;
  total_expenses: number;
  total_gst_claimable: number;
  gst_eligible_expenses: number;
  non_gst_expenses: number;
  category_summary: {
    [key: string]: {
      total: number;
      gst_amount: number;
      count: number;
    };
  };
  expenses: Expense[];
}

const CATEGORIES = [
  'Office Supplies',
  'Equipment',
  'Travel',
  'Meals & Entertainment',
  'Professional Services',
  'Rent',
  'Utilities',
  'Marketing',
  'Other'
];

const ExpenseTracker: React.FC = () => {
  const [expense, setExpense] = useState<Expense>({
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    gst_amount: 0,
    description: '',
    category: '',
    is_gst_eligible: true,
  });
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('quarter');
  const [activeTab, setActiveTab] = useState(0);
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);

  useEffect(() => {
    fetchExpenseSummary();
    
    // Add event listener for expense updates
    const handleExpenseUpdate = () => {
      fetchExpenseSummary();
    };
    
    window.addEventListener('expenseUpdated', handleExpenseUpdate);
    
    return () => {
      window.removeEventListener('expenseUpdated', handleExpenseUpdate);
    };
  }, []);

  const fetchExpenseSummary = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:8001/api/expenses/summary?period=${period}`);
      if (!response.ok) {
        throw new Error('Failed to fetch expense summary');
      }
      const data = await response.json();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch expense summary');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8001/api/expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...expense,
          gst_amount: expense.is_gst_eligible ? round(expense.amount / 11, 2) : 0
        }),
      });

      if (!response.ok) throw new Error('Failed to save expense');

      setSuccess('Expense saved successfully');
      setExpense({
        date: new Date().toISOString().split('T')[0],
        amount: 0,
        gst_amount: 0,
        description: '',
        category: '',
        is_gst_eligible: true,
      });
      await fetchExpenseSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expense');
    } finally {
      setLoading(false);
    }
  };

  const handleAmountChange = (value: string) => {
    const amount = parseFloat(value) || 0;
    const gst_amount = expense.is_gst_eligible ? round(amount / 11, 2) : 0;
    setExpense({ ...expense, amount, gst_amount });
  };

  const round = (num: number, decimals: number) => {
    return Number(Math.round(Number(num + 'e' + decimals)) + 'e-' + decimals);
  };

  const handleClearSummary = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8001/api/expenses/clear', {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to clear expenses');
      }

      setSuccess('All expenses cleared successfully');
      setSummary(null);
      setShowClearConfirmation(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear expenses');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Expense Tracker
      </Typography>

      <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
        <Tab label="Add Expense" />
        <Tab label="Expense Summary" />
      </Tabs>

      {activeTab === 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <form onSubmit={handleSubmit}>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Date"
                  type="date"
                  value={expense.date}
                  onChange={(e) => setExpense({ ...expense, date: e.target.value })}
                  InputLabelProps={{
                    shrink: true,
                  }}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Amount"
                  type="number"
                  value={expense.amount || ''}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Description"
                  value={expense.description}
                  onChange={(e) => setExpense({ ...expense, description: e.target.value })}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Category</InputLabel>
                  <Select
                    value={expense.category}
                    onChange={(e) => setExpense({ ...expense, category: e.target.value })}
                    required
                  >
                    {CATEGORIES.map((category) => (
                      <MenuItem key={category} value={category}>
                        {category}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  disabled={loading}
                >
                  {loading ? <CircularProgress size={24} /> : 'Save Expense'}
                </Button>
              </Grid>
            </Grid>
          </form>
        </Paper>
      )}

      {activeTab === 1 && (
        <Paper sx={{ p: 3 }}>
          <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Expense Summary</Typography>
            <Box>
              <FormControl sx={{ minWidth: 120, mr: 2 }}>
                <Select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as 'month' | 'quarter' | 'year')}
                >
                  <MenuItem value="month">Monthly</MenuItem>
                  <MenuItem value="quarter">Quarterly</MenuItem>
                  <MenuItem value="year">Yearly</MenuItem>
                </Select>
              </FormControl>
              <Button
                variant="outlined"
                color="error"
                onClick={() => setShowClearConfirmation(true)}
                disabled={loading}
              >
                Clear Summary
              </Button>
            </Box>
          </Box>

          {showClearConfirmation && (
            <Alert
              severity="warning"
              sx={{ mb: 2 }}
              action={
                <Box>
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => setShowClearConfirmation(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    color="inherit"
                    size="small"
                    onClick={handleClearSummary}
                    disabled={loading}
                  >
                    Confirm
                  </Button>
                </Box>
              }
            >
              Are you sure you want to clear all expenses? This action cannot be undone.
            </Alert>
          )}

          {loading ? (
            <CircularProgress />
          ) : summary ? (
            <>
              <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h6">Total Expenses</Typography>
                    <Typography variant="h4">${summary.total_expenses.toFixed(2)}</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h6">GST Claimable</Typography>
                    <Typography variant="h4">${summary.total_gst_claimable.toFixed(2)}</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h6">GST Eligible</Typography>
                    <Typography variant="h4">${summary.gst_eligible_expenses.toFixed(2)}</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h6">Non-GST Expenses</Typography>
                    <Typography variant="h4">${summary.non_gst_expenses.toFixed(2)}</Typography>
                  </Paper>
                </Grid>
              </Grid>

              <Typography variant="h6" gutterBottom>Category Summary</Typography>
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Category</TableCell>
                      <TableCell align="right">Total Amount</TableCell>
                      <TableCell align="right">GST Amount</TableCell>
                      <TableCell align="right">Count</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(summary.category_summary).map(([category, data]) => (
                      <TableRow key={category}>
                        <TableCell>{category}</TableCell>
                        <TableCell align="right">${data.total.toFixed(2)}</TableCell>
                        <TableCell align="right">${data.gst_amount.toFixed(2)}</TableCell>
                        <TableCell align="right">{data.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>Recent Expenses</Typography>
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell>Category</TableCell>
                      <TableCell align="right">Amount</TableCell>
                      <TableCell align="right">GST</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {summary.expenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>{expense.date}</TableCell>
                        <TableCell>{expense.description}</TableCell>
                        <TableCell>{expense.category}</TableCell>
                        <TableCell align="right">${expense.amount.toFixed(2)}</TableCell>
                        <TableCell align="right">${expense.gst_amount.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          ) : (
            <Typography>No expense data available</Typography>
          )}
        </Paper>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mt: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}
    </Box>
  );
};

export default ExpenseTracker; 