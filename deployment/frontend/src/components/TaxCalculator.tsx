import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Paper,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';

const TaxCalculator: React.FC = () => {
  const [income, setIncome] = useState<number>(0);
  const [expenses, setExpenses] = useState<number>(0);

  const gstRate = 0.1; // 10% GST rate
  const gstCollected = income * gstRate;
  const gstPaid = expenses * gstRate;
  const netGst = gstCollected - gstPaid;
  const taxableIncome = income - expenses;

  // Simple tax calculation (example rates)
  const calculateTax = (amount: number): number => {
    if (amount <= 18200) return 0;
    if (amount <= 45000) return (amount - 18200) * 0.19;
    if (amount <= 120000) return 5092 + (amount - 45000) * 0.325;
    if (amount <= 180000) return 29467 + (amount - 120000) * 0.37;
    return 51667 + (amount - 180000) * 0.45;
  };

  const taxPayable = calculateTax(taxableIncome);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Tax Calculator
      </Typography>
      
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Income & Expenses
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <TextField
            label="Total Income"
            type="number"
            value={income}
            onChange={(e) => setIncome(Math.max(0, Number(e.target.value)))}
            fullWidth
          />
          <TextField
            label="Total Expenses"
            type="number"
            value={expenses}
            onChange={(e) => setExpenses(Math.max(0, Number(e.target.value)))}
            fullWidth
          />
        </Box>

        <Typography variant="h6" gutterBottom>
          Summary
        </Typography>
        <List>
          <ListItem>
            <ListItemText primary="Taxable Income" secondary={`$${taxableIncome.toFixed(2)}`} />
          </ListItem>
          <ListItem>
            <ListItemText primary="Income Tax Payable" secondary={`$${taxPayable.toFixed(2)}`} />
          </ListItem>
          <ListItem>
            <ListItemText primary="GST Collected" secondary={`$${gstCollected.toFixed(2)}`} />
          </ListItem>
          <ListItem>
            <ListItemText primary="GST Paid" secondary={`$${gstPaid.toFixed(2)}`} />
          </ListItem>
          <ListItem>
            <ListItemText 
              primary="Net GST" 
              secondary={`$${netGst.toFixed(2)} ${netGst >= 0 ? '(to pay)' : '(refund)' }`}
            />
          </ListItem>
        </List>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Common Deductions
        </Typography>
        <List>
          <ListItem>
            <ListItemText 
              primary="Home Office Expenses" 
              secondary="Electricity, internet, phone, and workspace furniture"
            />
          </ListItem>
          <ListItem>
            <ListItemText 
              primary="Vehicle Expenses" 
              secondary="Fuel, maintenance, and insurance for business use"
            />
          </ListItem>
          <ListItem>
            <ListItemText 
              primary="Professional Development" 
              secondary="Courses, workshops, and training materials"
            />
          </ListItem>
        </List>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Tax-Saving Tips
        </Typography>
        <List>
          <ListItem>
            <ListItemText 
              primary="Keep Good Records" 
              secondary="Maintain receipts and invoices for all business expenses"
            />
          </ListItem>
          <ListItem>
            <ListItemText 
              primary="Prepay Expenses" 
              secondary="Consider paying deductible expenses before the end of the financial year"
            />
          </ListItem>
          <ListItem>
            <ListItemText 
              primary="Super Contributions" 
              secondary="Make personal super contributions to reduce taxable income"
            />
          </ListItem>
        </List>
      </Paper>
    </Box>
  );
};

export default TaxCalculator; 