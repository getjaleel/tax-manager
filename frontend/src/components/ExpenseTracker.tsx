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
  Tooltip,
  Skeleton,
  Divider,
} from '@mui/material';
import { API_BASE_URL, CATEGORIES, Category } from '../config';
import RefreshIcon from '@mui/icons-material/Refresh';

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
  }, []);

  const fetchExpenseSummary = async () => {
    setLoading(true);
    try {
      // Fetch regular expenses
      const response = await fetch(`${API_BASE_URL}/api/expenses/summary`);
      if (!response.ok) {
        throw new Error('Failed to fetch expense summary');
      }
      const data = await response.json();
      console.log('Regular expenses data:', data); // Debug log
      
      // Fetch GST Helper expenses
      const gstHelperResponse = await fetch(`${API_BASE_URL}/api/gst-summary`);
      if (!gstHelperResponse.ok) {
        throw new Error('Failed to fetch GST summary');
      }
      const gstData = await gstHelperResponse.json();
      console.log('GST Helper data:', gstData); // Debug log
      
      // Process GST Helper expenses
      const gstExpenses: GstExpense[] = [];
      
      // Add GST collected as income
      if (gstData.gst_collected > 0) {
        gstExpenses.push({
          id: 'gst-collected',
          date: new Date().toISOString().split('T')[0],
          amount: gstData.gst_collected * 11, // Convert GST to total amount
          gst_amount: gstData.gst_collected,
          description: `GST Collected (${gstData.gst_collected.toFixed(2)} GST on ${(gstData.gst_collected * 10).toFixed(2)} sales)`,
          category: 'GST Income'
        });
      }
      
      // Add GST paid as expense
      if (gstData.gst_paid > 0) {
        gstExpenses.push({
          id: 'gst-paid',
          date: new Date().toISOString().split('T')[0],
          amount: gstData.gst_paid * 11, // Convert GST to total amount
          gst_amount: gstData.gst_paid,
          description: `GST Paid (${gstData.gst_paid.toFixed(2)} GST on ${(gstData.gst_paid * 10).toFixed(2)} purchases)`,
          category: 'GST Expenses'
        });
      }

      // Add GST owing/refund
      if (gstData.gst_owing > 0) {
        gstExpenses.push({
          id: 'gst-owing',
          date: new Date().toISOString().split('T')[0],
          amount: gstData.gst_owing,
          gst_amount: gstData.gst_owing,
          description: `GST Owing to ATO (${gstData.gst_owing.toFixed(2)})`,
          category: 'GST Owing'
        });
      } else if (gstData.gst_refund > 0) {
        gstExpenses.push({
          id: 'gst-refund',
          date: new Date().toISOString().split('T')[0],
          amount: gstData.gst_refund,
          gst_amount: gstData.gst_refund,
          description: `GST Refund from ATO (${gstData.gst_refund.toFixed(2)})`,
          category: 'GST Refund'
        });
      }

      console.log('Processed GST Expenses:', gstExpenses); // Debug log

      // Calculate totals
      const totalExpenses = (data.total_expenses || 0) + gstExpenses.reduce((sum, exp) => sum + exp.amount, 0);
      const totalGstClaimable = (data.total_gst_claimable || 0) + gstExpenses.reduce((sum, exp) => sum + exp.gst_amount, 0);
      const gstEligibleExpenses = (data.gst_eligible_expenses || 0) + gstExpenses.reduce((sum, exp) => sum + exp.amount, 0);
      const nonGstExpenses = data.non_gst_expenses || 0;

      // Create category summary
      const categorySummary = {
        ...(data.category_summary || {}),
        'GST Income': {
          total: gstData.gst_collected * 11,
          gst_amount: gstData.gst_collected,
          count: gstData.gst_collected > 0 ? 1 : 0
        },
        'GST Expenses': {
          total: gstData.gst_paid * 11,
          gst_amount: gstData.gst_paid,
          count: gstData.gst_paid > 0 ? 1 : 0
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
      const response = await fetch(`${API_BASE_URL}/api/expenses`, {
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
              <Tooltip title="Refresh the expense data to show the latest information">
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={fetchExpenseSummary}
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={20} /> : <RefreshIcon />}
                  sx={{ mr: 2 }}
                >
                  Refresh
                </Button>
              </Tooltip>
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
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
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
                  <Tooltip title="Total GST amount that can be claimed from purchases">
                    <Paper sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="h6">GST Claimable</Typography>
                      <Typography variant="h4" sx={{ color: summary.total_gst_claimable > 0 ? 'success.main' : 'text.primary' }}>
                        ${summary.total_gst_claimable.toFixed(2)}
                      </Typography>
                    </Paper>
                  </Tooltip>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Tooltip title="Total expenses that include GST">
                    <Paper sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="h6">GST Eligible</Typography>
                      <Typography variant="h4">${summary.gst_eligible_expenses.toFixed(2)}</Typography>
                    </Paper>
                  </Tooltip>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Tooltip title="Expenses that do not include GST">
                    <Paper sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="h6">Non-GST Expenses</Typography>
                      <Typography variant="h4">${summary.non_gst_expenses.toFixed(2)}</Typography>
                    </Paper>
                  </Tooltip>
                </Grid>
              </Grid>

              {/* GST Calculation Summary */}
              <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" gutterBottom>GST Calculation Summary</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography>GST Collected from Sales:</Typography>
                      <Typography sx={{ color: 'success.main' }}>
                        ${summary.category_summary['GST Income']?.gst_amount.toFixed(2) || '0.00'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography>GST Paid on Purchases:</Typography>
                      <Typography sx={{ color: 'error.main' }}>
                        ${summary.category_summary['GST Expenses']?.gst_amount.toFixed(2) || '0.00'}
                      </Typography>
                    </Box>
                    <Divider sx={{ my: 1 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="subtitle1">Net GST:</Typography>
                      <Typography 
                        variant="subtitle1" 
                        sx={{ 
                          color: summary.total_gst_claimable > 0 ? 'success.main' : summary.total_gst_claimable < 0 ? 'error.main' : 'text.primary',
                          fontWeight: 'bold'
                        }}
                      >
                        ${summary.total_gst_claimable.toFixed(2)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="subtitle1">Status:</Typography>
                      <Typography 
                        variant="subtitle1"
                        sx={{ 
                          color: summary.total_gst_claimable > 0 ? 'success.main' : summary.total_gst_claimable < 0 ? 'error.main' : 'text.primary',
                          fontWeight: 'bold'
                        }}
                      >
                        {summary.total_gst_claimable > 0 ? 'Refund from ATO' : summary.total_gst_claimable < 0 ? 'Owing to ATO' : 'Balanced'}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Calculation:
                      </Typography>
                      <Typography variant="body2">
                        GST Collected (${summary.category_summary['GST Income']?.gst_amount.toFixed(2) || '0.00'}) - 
                        GST Paid (${summary.category_summary['GST Expenses']?.gst_amount.toFixed(2) || '0.00'}) = 
                        Net GST (${summary.total_gst_claimable.toFixed(2)})
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        {summary.total_gst_claimable > 0 
                          ? `You will receive a refund of $${summary.total_gst_claimable.toFixed(2)} from the ATO`
                          : summary.total_gst_claimable < 0
                            ? `You need to pay $${Math.abs(summary.total_gst_claimable).toFixed(2)} to the ATO`
                            : 'Your GST is balanced for this period'}
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </Paper>

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
                    {loading ? (
                      // Loading skeleton for category summary
                      Array(3).fill(0).map((_, index) => (
                        <TableRow key={`skeleton-${index}`}>
                          <TableCell><Skeleton animation="wave" /></TableCell>
                          <TableCell align="right"><Skeleton animation="wave" /></TableCell>
                          <TableCell align="right"><Skeleton animation="wave" /></TableCell>
                          <TableCell align="right"><Skeleton animation="wave" /></TableCell>
                        </TableRow>
                      ))
                    ) : (
                      Object.entries(summary.category_summary).map(([category, data]) => (
                        <TableRow key={category}>
                          <TableCell>
                            <Tooltip title={
                              category === 'GST Income' ? 'GST collected from sales (1/11 of total amount)' :
                              category === 'GST Expenses' ? 'GST paid on purchases (1/11 of total amount)' :
                              category === 'GST Owing' ? 'Net GST amount owed to ATO' :
                              category === 'GST Refund' ? 'Net GST amount refundable from ATO' :
                              'Regular business expenses'
                            }>
                              <span>{category}</span>
                            </Tooltip>
                          </TableCell>
                          <TableCell align="right">${data.total.toFixed(2)}</TableCell>
                          <TableCell align="right" sx={{ 
                            color: data.gst_amount > 0 ? 'success.main' : data.gst_amount < 0 ? 'error.main' : 'text.primary'
                          }}>
                            ${data.gst_amount.toFixed(2)}
                          </TableCell>
                          <TableCell align="right">{data.count}</TableCell>
                        </TableRow>
                      ))
                    )}
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
                    {loading ? (
                      // Loading skeleton for recent expenses
                      Array(5).fill(0).map((_, index) => (
                        <TableRow key={`skeleton-expense-${index}`}>
                          <TableCell><Skeleton animation="wave" /></TableCell>
                          <TableCell><Skeleton animation="wave" /></TableCell>
                          <TableCell><Skeleton animation="wave" /></TableCell>
                          <TableCell align="right"><Skeleton animation="wave" /></TableCell>
                          <TableCell align="right"><Skeleton animation="wave" /></TableCell>
                        </TableRow>
                      ))
                    ) : (
                      summary.expenses.map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell>{expense.date}</TableCell>
                          <TableCell>{expense.description}</TableCell>
                          <TableCell>{expense.category}</TableCell>
                          <TableCell align="right">${expense.amount.toFixed(2)}</TableCell>
                          <TableCell align="right" sx={{ 
                            color: expense.gst_amount > 0 ? 'success.main' : expense.gst_amount < 0 ? 'error.main' : 'text.primary'
                          }}>
                            ${expense.gst_amount.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
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