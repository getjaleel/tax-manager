import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Box, 
  Typography, 
  TextField, 
  Button, 
  Paper, 
  Accordion, 
  AccordionSummary, 
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  Divider,
  Grid,
  IconButton,
  Tooltip,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Link,
  CircularProgress
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import CalculateIcon from '@mui/icons-material/Calculate';
import ReceiptIcon from '@mui/icons-material/Receipt';
import InfoIcon from '@mui/icons-material/Info';
import LoadIcon from '@mui/icons-material/Download';
import { API_BASE_URL } from '../config';

interface DeductionCategory {
  id: string;
  name: string;
  amount: number;
  description: string;
  maxLimit?: number;
  percentage?: number;
  gstEligible?: boolean;
}

interface SavedCalculation {
  id: string;
  name: string;
  date: string;
  income: number;
  categories: DeductionCategory[];
  totalDeductions: number;
}

interface TaxDeductionCalculatorProps {
  onDataUpdate: (data: { income?: number; expenses?: number; gstEligibleExpenses?: number }) => void;
  initialData: {
    income: number;
    expenses: number;
    gstEligibleExpenses: number;
  };
}

const TAX_BRACKETS = [
  { min: 0, max: 18200, rate: 0 },
  { min: 18201, max: 45000, rate: 0.19 },
  { min: 45001, max: 120000, rate: 0.325 },
  { min: 120001, max: 180000, rate: 0.37 },
  { min: 180001, max: Infinity, rate: 0.45 }
];

const INITIAL_CATEGORIES: DeductionCategory[] = [
  {
    id: 'home-office',
    name: 'Home Office Expenses',
    amount: 0,
    description: 'Electricity, internet, phone, and workspace furniture',
    maxLimit: 5000,
    gstEligible: true
  },
  {
    id: 'vehicle',
    name: 'Vehicle Expenses',
    amount: 0,
    description: 'Fuel, maintenance, and insurance for business use',
    percentage: 0.72, // cents per km
    gstEligible: true
  },
  {
    id: 'professional',
    name: 'Professional Development',
    amount: 0,
    description: 'Courses, workshops, and training materials',
    maxLimit: 1000,
    gstEligible: true
  },
  {
    id: 'equipment',
    name: 'Equipment & Tools',
    amount: 0,
    description: 'Computers, software, and other business equipment',
    maxLimit: 30000,
    gstEligible: true
  },
  {
    id: 'travel',
    name: 'Travel Expenses',
    amount: 0,
    description: 'Business-related travel and accommodation',
    gstEligible: true
  },
  {
    id: 'super',
    name: 'Superannuation',
    amount: 0,
    description: 'Personal super contributions',
    maxLimit: 27500,
    gstEligible: false
  },
  {
    id: 'insurance',
    name: 'Insurance Premiums',
    amount: 0,
    description: 'Professional indemnity and business insurance',
    gstEligible: true
  },
  {
    id: 'marketing',
    name: 'Marketing & Advertising',
    amount: 0,
    description: 'Website, social media, and promotional materials',
    gstEligible: true
  }
];

// Create a shared state for expense data
const sharedExpenseState = {
  totalExpenses: 0,
  gstEligibleExpenses: 0,
  setExpenseData: (data: { total_expenses: number; gst_eligible_expenses: number }) => {
    sharedExpenseState.totalExpenses = data.total_expenses;
    sharedExpenseState.gstEligibleExpenses = data.gst_eligible_expenses;
  }
};

const TaxDeductionCalculator: React.FC<TaxDeductionCalculatorProps> = ({ onDataUpdate, initialData }) => {
  const [income, setIncome] = useState<string>(initialData.income.toString());
  const [categories, setCategories] = useState<DeductionCategory[]>(INITIAL_CATEGORIES);
  const [totalDeductions, setTotalDeductions] = useState<number>(0);
  const [savedCalculations, setSavedCalculations] = useState<SavedCalculation[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [calculationName, setCalculationName] = useState('');
  const [selectedCalculation, setSelectedCalculation] = useState<string>('');
  const [showAlert, setShowAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [totalExpenses, setTotalExpenses] = useState<number>(0);
  const [gstEligibleExpenses, setGstEligibleExpenses] = useState<number>(0);
  const fetchTimeoutRef = useRef<NodeJS.Timeout>();

  // Update local state when shared state changes
  useEffect(() => {
    const interval = setInterval(() => {
      if (sharedExpenseState.totalExpenses !== totalExpenses) {
        setTotalExpenses(sharedExpenseState.totalExpenses);
      }
      if (sharedExpenseState.gstEligibleExpenses !== gstEligibleExpenses) {
        setGstEligibleExpenses(sharedExpenseState.gstEligibleExpenses);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [totalExpenses, gstEligibleExpenses]);

  const fetchExpenseData = useCallback(async () => {
    if (isInitialLoad) {
      setLoading(true);
    }
    
    try {
      // Fetch expense summary from Expense Tracker
      const expenseResponse = await fetch(`${API_BASE_URL}/expenses`);
      if (!expenseResponse.ok) throw new Error('Failed to fetch expense summary');
      const expenseData = await expenseResponse.json();
      
      console.log('Received expense data:', expenseData); // Debug log

      // Set total expenses and GST eligible expenses from the API response
      if (expenseData.total_expenses !== undefined) {
        setTotalExpenses(expenseData.total_expenses);
      }
      if (expenseData.gst_eligible_expenses !== undefined) {
        setGstEligibleExpenses(expenseData.gst_eligible_expenses);
      }

      // Map expenses to deduction categories
      const updatedDeductions = categories.map(category => {
        let amount = 0;
        
        // Map based on category
        switch (category.id) {
          case 'home-office':
            amount = expenseData.category_summary?.['Home Office']?.total || 0;
            break;
          case 'vehicle':
            amount = expenseData.category_summary?.['Vehicle']?.total || 0;
            break;
          case 'professional':
            amount = expenseData.category_summary?.['Training']?.total || 0;
            break;
          case 'equipment':
            amount = expenseData.category_summary?.['Equipment']?.total || 0;
            break;
          case 'travel':
            amount = expenseData.category_summary?.['Travel']?.total || 0;
            break;
          case 'insurance':
            amount = expenseData.category_summary?.['Insurance']?.total || 0;
            break;
          case 'marketing':
            amount = expenseData.category_summary?.['Marketing']?.total || 0;
            break;
        }

        // Apply GST if eligible
        if (category.gstEligible) {
          const gstAmount = amount / 11;
          amount = amount - gstAmount;
        }

        return { ...category, amount };
      });

      setCategories(updatedDeductions);
      setIsInitialLoad(false);
    } catch (error) {
      console.error('Error fetching expense data:', error);
      setError('Failed to load expense data');
    } finally {
      setLoading(false);
    }
  }, [categories, isInitialLoad]);

  const fetchSavedCalculations = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/tax-calculations`);
      if (!response.ok) throw new Error('Failed to fetch saved calculations');
      const data = await response.json();
      setSavedCalculations(data);
    } catch (error) {
      console.error('Error fetching saved calculations:', error);
      setError('Failed to load saved calculations');
    }
  }, []);

  useEffect(() => {
    // Clear any existing timeout
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    // Set a new timeout to debounce the API calls
    fetchTimeoutRef.current = setTimeout(() => {
      fetchSavedCalculations();
      fetchExpenseData();
    }, 500); // 500ms debounce

    // Cleanup function
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, [fetchSavedCalculations, fetchExpenseData]);

  useEffect(() => {
    // Update parent component with new data
    const gstEligibleExpenses = categories
      .filter(category => category.gstEligible)
      .reduce((sum, category) => sum + category.amount, 0);

    onDataUpdate({
      income: parseFloat(income) || 0,
      expenses: totalDeductions,
      gstEligibleExpenses
    });
  }, [income, totalDeductions, categories, onDataUpdate]);

  useEffect(() => {
    // Calculate total deductions whenever categories change
    const total = categories.reduce((sum, category) => {
      if (category.percentage) {
        return sum + (category.amount * category.percentage);
      }
      return sum + category.amount;
    }, 0);
    setTotalDeductions(total);
  }, [categories]);

  const updateCategoryAmount = (id: string, amount: number) => {
    setCategories(prevCategories => 
      prevCategories.map(category => {
        if (category.id === id) {
          const maxLimit = category.maxLimit;
          const newAmount = maxLimit ? Math.min(amount, maxLimit) : amount;
          return { ...category, amount: newAmount };
        }
        return category;
      })
    );
  };

  const calculateDeductions = () => {
    const total = categories.reduce((sum, category) => {
      if (category.percentage) {
        return sum + (category.amount * category.percentage);
      }
      return sum + category.amount;
    }, 0);
    setTotalDeductions(total);
  };

  const handleIncomeChange = (value: string) => {
    setIncome(value);
    calculateDeductions();
  };

  const calculateTax = (amount: number): number => {
    let tax = 0;
    for (const bracket of TAX_BRACKETS) {
      if (amount > bracket.min) {
        const taxableInBracket = Math.min(amount - bracket.min, bracket.max - bracket.min);
        tax += taxableInBracket * bracket.rate;
      }
    }
    return tax;
  };

  const saveCalculation = () => {
    if (!calculationName.trim()) {
      setAlertMessage('Please enter a name for your calculation');
      setShowAlert(true);
      return;
    }

    const newCalculation: SavedCalculation = {
      id: Date.now().toString(),
      name: calculationName,
      date: new Date().toISOString(),
      income: parseFloat(income) || 0,
      categories: [...categories],
      totalDeductions
    };

    const updatedSaved = [...savedCalculations, newCalculation];
    setSavedCalculations(updatedSaved);
    localStorage.setItem('savedCalculations', JSON.stringify(updatedSaved));
    setShowSaveDialog(false);
    setCalculationName('');
    setAlertMessage('Calculation saved successfully!');
    setShowAlert(true);
  };

  const loadCalculation = (id: string) => {
    const calculation = savedCalculations.find(c => c.id === id);
    if (calculation) {
      setIncome(calculation.income.toString());
      setCategories(calculation.categories);
      setTotalDeductions(calculation.totalDeductions);
    }
  };

  const deleteCalculation = (id: string) => {
    const updatedSaved = savedCalculations.filter(c => c.id !== id);
    setSavedCalculations(updatedSaved);
    localStorage.setItem('savedCalculations', JSON.stringify(updatedSaved));
    setAlertMessage('Calculation deleted successfully!');
    setShowAlert(true);
  };

  const handleSaveCalculation = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/tax-calculations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          annual_income: parseFloat(income) || 0,
          deductions: categories,
        }),
      });

      if (!response.ok) throw new Error('Failed to save calculation');
      
      setSuccess('Calculation saved successfully');
      fetchSavedCalculations();
    } catch (error) {
      setError('Failed to save calculation');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadCalculation = async (id: string) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/tax-calculations/${id}`);
      if (!response.ok) throw new Error('Failed to load calculation');
      const data = await response.json();
      
      setIncome(data.income.toString());
      setCategories(data.categories);
      setTotalDeductions(data.totalDeductions);
      setSuccess('Calculation loaded successfully');
    } catch (error) {
      setError('Failed to load calculation');
    } finally {
      setLoading(false);
    }
  };

  const calculateTaxableIncome = () => {
    const annualIncome = parseFloat(income) || 0;
    return annualIncome - totalExpenses;
  };

  // Add effect to fetch data on mount and periodically
  useEffect(() => {
    fetchExpenseData();
    
    // Set up periodic refresh
    const interval = setInterval(fetchExpenseData, 5000); // Refresh every 5 seconds
    
    return () => clearInterval(interval);
  }, [fetchExpenseData]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Tax Deduction Calculator
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Typography variant="h6" gutterBottom>
              Annual Income
            </Typography>
            <TextField
              label="Annual Income"
              type="number"
              value={income}
              onChange={(e) => handleIncomeChange(e.target.value)}
              fullWidth
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="h6" gutterBottom>
              Total Expenses from GST Helper
            </Typography>
            <Typography variant="h5" color="primary">
              ${totalExpenses.toFixed(2)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              GST Eligible: ${gstEligibleExpenses.toFixed(2)}
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Deduction Categories
        </Typography>
        <List>
          {categories.map((category) => (
            <React.Fragment key={category.id}>
              <ListItem>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} sm={4}>
                    <Typography variant="subtitle1">{category.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {category.description}
                      {category.maxLimit && ` (Max: $${category.maxLimit})`}
                      {category.percentage && ` (${category.percentage * 100}% per unit)`}
                      {category.gstEligible && ' (GST Eligible)'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Amount"
                      type="number"
                      value={category.amount}
                      onChange={(e) => updateCategoryAmount(category.id, Number(e.target.value))}
                      fullWidth
                      error={category.maxLimit ? category.amount > category.maxLimit : false}
                      helperText={category.maxLimit && category.amount > category.maxLimit ? 
                        `Exceeds maximum limit of $${category.maxLimit}` : ''}
                    />
                  </Grid>
                  <Grid item xs={12} sm={2}>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <Tooltip title="Add to total">
                        <IconButton onClick={() => updateCategoryAmount(category.id, category.amount + 1)}>
                          <AddIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove from total">
                        <IconButton onClick={() => updateCategoryAmount(category.id, Math.max(0, category.amount - 1))}>
                          <RemoveIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Grid>
                </Grid>
              </ListItem>
              <Divider />
            </React.Fragment>
          ))}
        </List>

        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <Button 
            variant="contained" 
            color="primary" 
            onClick={calculateDeductions}
            startIcon={<CalculateIcon />}
            fullWidth
          >
            Calculate Total Deductions
          </Button>
          <Button
            variant="outlined"
            startIcon={<SaveIcon />}
            onClick={() => setShowSaveDialog(true)}
          >
            Save Calculation
          </Button>
        </Box>
      </Paper>

      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Tax Calculation Summary</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <List>
            <ListItem>
              <ListItemText 
                primary="Total Expenses" 
                secondary={`$${totalExpenses.toFixed(2)}`}
              />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText 
                primary="GST Eligible Expenses" 
                secondary={`$${gstEligibleExpenses.toFixed(2)}`}
              />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText 
                primary="Total Deductions" 
                secondary={`$${totalDeductions.toFixed(2)}`}
              />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText 
                primary="Taxable Income" 
                secondary={`$${calculateTaxableIncome().toFixed(2)}`}
              />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText 
                primary="Tax Payable" 
                secondary={`$${calculateTax(calculateTaxableIncome()).toFixed(2)}`}
              />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText 
                primary="Tax Savings" 
                secondary={`$${(calculateTax(parseFloat(income)) - calculateTax(calculateTaxableIncome())).toFixed(2)}`}
              />
            </ListItem>
          </List>
        </AccordionDetails>
      </Accordion>

      <Dialog open={showSaveDialog} onClose={() => setShowSaveDialog(false)}>
        <DialogTitle>Save Calculation</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Calculation Name"
            fullWidth
            value={calculationName}
            onChange={(e) => setCalculationName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSaveDialog(false)}>Cancel</Button>
          <Button onClick={saveCalculation} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      <Snackbar 
        open={showAlert} 
        autoHideDuration={6000} 
        onClose={() => setShowAlert(false)}
      >
        <Alert onClose={() => setShowAlert(false)} severity="success">
          {alertMessage}
        </Alert>
      </Snackbar>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <CircularProgress />
        </Box>
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

export default TaxDeductionCalculator; 