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
import { Refresh as RefreshIcon } from '@mui/icons-material';
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
  onDataUpdate?: (data: { income?: number; expenses?: number; gstEligibleExpenses?: number }) => void;
  initialData?: {
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

const TaxDeductionCalculator: React.FC<TaxDeductionCalculatorProps> = ({ 
  onDataUpdate = () => {}, 
  initialData = { income: 0, expenses: 0, gstEligibleExpenses: 0 } 
}) => {
  const [income, setIncome] = useState(initialData?.income?.toString() || '0');
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
  const [totalExpenses, setTotalExpenses] = useState(initialData?.expenses || 0);
  const [gstEligibleExpenses, setGstEligibleExpenses] = useState(initialData?.gstEligibleExpenses || 0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [isTabActive, setIsTabActive] = useState(true);
  const fetchTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabActive(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const fetchAllData = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/expenses`);
      if (!response.ok) throw new Error('Failed to fetch expenses');
      const data = await response.json();
      
      // Safely handle potentially undefined data
      const totalExp = data?.total_expenses || 0;
      const gstEligible = data?.gst_eligible_expenses || 0;
      
      setTotalExpenses(totalExp);
      setGstEligibleExpenses(gstEligible);
      
      // Only update categories if they exist in the response
      if (data?.categories) {
        setCategories(prevCategories => 
          prevCategories.map(category => {
            const matchingCategory = data.categories.find((c: any) => c.id === category.id);
            return matchingCategory ? { ...category, amount: matchingCategory.amount } : category;
          })
        );
      }

      // Fetch saved calculations
      const calculationsResponse = await fetch(`${API_BASE_URL}/api/tax-calculations`);
      if (!calculationsResponse.ok) {
        throw new Error('Failed to fetch saved calculations');
      }
      const calculationsData = await calculationsResponse.json();
      setSavedCalculations(calculationsData);

      setLastRefreshTime(new Date());
      setError(null);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to fetch expense data');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchAllData();

    // Set up a single interval for periodic refresh (5 minutes)
    const interval = setInterval(() => {
      if (isTabActive) {
        fetchAllData();
      }
    }, 5 * 60 * 1000); // 5 minutes in milliseconds

    return () => clearInterval(interval);
  }, [fetchAllData, isTabActive]);

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
      fetchAllData();
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

  const handleManualRefresh = async () => {
    if (!isRefreshing) {
      setIsRefreshing(true);
      await fetchAllData();
    }
  };

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
            {lastRefreshTime && (
              <Typography variant="caption" color="text.secondary">
                Last updated: {lastRefreshTime.toLocaleTimeString()}
              </Typography>
            )}
          </Grid>
          <Grid item xs={12} md={6} sx={{ textAlign: 'right' }}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              sx={{ mt: 2 }}
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
            </Button>
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