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
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { API_BASE_URL, CATEGORIES, Category } from '../config';

interface Expense {
  id: number;
  date: string;
  amount: number;
  description: string;
  category: Category;
  gst_amount: number;
  is_gst_eligible?: boolean;
}

interface GstExpense {
  id: string;
  date: string;
  amount: number;
  gst_amount: number;
  description: string;
  category: string;
}

interface ExpenseSummary {
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

const ExpenseTracker: React.FC = () => {
  const [expense, setExpense] = useState<Omit<Expense, 'id'>>({
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    gst_amount: 0,
    description: '',
    category: CATEGORIES[0] as Category,
    is_gst_eligible: true
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
    
    // Add event listener for expense updates from GST Helper
    const handleExpenseUpdate = () => {
      fetchExpenseSummary();
    };
    
    window.addEventListener('expenseUpdated', handleExpenseUpdate);
    
    return () => {
      window.removeEventListener('expenseUpdated', handleExpenseUpdate);
    };
  }, [period]);

  const fetchExpenseSummary = async () => {
    setLoading(true);
    try {
      // Fetch regular expenses
      const response = await fetch(`${API_BASE_URL}/api/expenses/summary?period=${period}`);
      if (!response.ok) {
        throw new Error('Failed to fetch expense summary');
      }
      const data = await response.json();
      
      // Fetch GST Helper expenses
      const gstHelperResponse = await fetch(`${API_BASE_URL}/api/gst-summary?period=${period}`);
      if (!gstHelperResponse.ok) {
        throw new Error('Failed to fetch GST summary');
      }
      const gstData = await gstHelperResponse.json();
      
      // Process GST Helper expenses
      const gstExpenses: GstExpense[] = gstData.invoices
        ?.filter((inv: any) => inv.invoice_type === 'expense')
        .map((inv: any) => ({
          id: inv.id,
          date: inv.invoice_date,
          amount: inv.total_amount,
          gst_amount: inv.gst_amount,
          description: `Invoice: ${inv.supplier}`,
          category: 'GST Invoices'
        })) || [];

      console.log('GST Expenses:', gstExpenses); // Debug log

      // Calculate totals
      const totalExpenses = (data.total_expenses || 0) + gstExpenses.reduce((sum: number, exp: GstExpense) => sum + exp.amount, 0);
      const totalGstClaimable = (data.total_gst_claimable || 0) + gstExpenses.reduce((sum: number, exp: GstExpense) => sum + exp.gst_amount, 0);
      const gstEligibleExpenses = (data.gst_eligible_expenses || 0) + gstExpenses.reduce((sum: number, exp: GstExpense) => sum + exp.amount, 0);
      const nonGstExpenses = data.non_gst_expenses || 0;

      // Create category summary
      const categorySummary = {
        ...data.category_summary,
        'GST Invoices': {
          total: gstExpenses.reduce((sum: number, exp: GstExpense) => sum + exp.amount, 0),
          gst_amount: gstExpenses.reduce((sum: number, exp: GstExpense) => sum + exp.gst_amount, 0),
          count: gstExpenses.length
        }
      };

      // Merge expenses and ensure they have all required fields
      const mergedExpenses = [
        ...(data.expenses || []).map((exp: any) => ({
          id: exp.id,
          date: exp.date,
          amount: exp.amount,
          gst_amount: exp.gst_amount || 0,
          description: exp.description,
          category: exp.category
        })),
        ...gstExpenses
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      console.log('Merged Expenses:', mergedExpenses); // Debug log

      setSummary({
        total_expenses: totalExpenses,
        total_gst_claimable: totalGstClaimable,
        gst_eligible_expenses: gstEligibleExpenses,
        non_gst_expenses: nonGstExpenses,
        category_summary: categorySummary,
        expenses: mergedExpenses
      });
    } catch (error) {
      console.error('Error in fetchExpenseSummary:', error); // Debug log
      setError('Failed to fetch expense summary');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: expense.date,
          amount: parseFloat(expense.amount.toString()),
          description: expense.description,
          category: expense.category,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to add expense');
      }

      setSuccess('Expense added successfully');
      setError(null);
      fetchExpenseSummary();
    } catch (error) {
      setError('Failed to add expense');
      console.error('Error adding expense:', error);
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
      const response = await fetch(`${API_BASE_URL}/api/expenses/clear`, {
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
                    onChange={(e) => setExpense({ ...expense, category: e.target.value as Category })}
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