import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Container, Paper, Tabs, Tab, Typography, AppBar, Toolbar, Button } from '@mui/material';
import { authService } from '../services/auth';
import TaxCalculator from './TaxCalculator';
import TaxDeductionCalculator from './TaxDeductionCalculator';
import GSTHelper from './GSTHelper';
import InvoiceManager from './InvoiceManager';
import ExpenseTracker from './ExpenseTracker';
import { Invoice } from '../types/Invoice';
import { API_BASE_URL } from '../config';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `simple-tab-${index}`,
    'aria-controls': `simple-tabpanel-${index}`,
  };
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/invoices`);
      if (!response.ok) {
        throw new Error('Failed to fetch invoices');
      }
      const data = await response.json();
      setInvoices(data.invoices || []);
    } catch (error) {
      console.error('Error fetching invoices:', error);
    }
  };

  const handleDeleteInvoice = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/invoices/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete invoice');
      }
      setInvoices(prev => prev.filter(invoice => invoice.id !== id));
    } catch (error) {
      console.error('Error deleting invoice:', error);
      throw error;
    }
  };

  const handleUpdateInvoice = async (updatedInvoice: Invoice) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/invoices/${updatedInvoice.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedInvoice),
      });
      if (!response.ok) {
        throw new Error('Failed to update invoice');
      }
      setInvoices(prev => prev.map(invoice => 
        invoice.id === updatedInvoice.id ? updatedInvoice : invoice
      ));
    } catch (error) {
      console.error('Error updating invoice:', error);
      throw error;
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleLogout = () => {
    authService.logout();
    navigate('/login');
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Tax Manager
          </Typography>
          <Button color="inherit" onClick={handleLogout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Paper sx={{ width: '100%', mb: 2 }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs
              value={tabValue}
              onChange={handleTabChange}
              aria-label="tax management tabs"
              variant="scrollable"
              scrollButtons="auto"
            >
              <Tab label="Tax Calculator" {...a11yProps(0)} />
              <Tab label="Tax Deductions" {...a11yProps(1)} />
              <Tab label="GST Helper" {...a11yProps(2)} />
              <Tab label="Invoice Manager" {...a11yProps(3)} />
              <Tab label="Expense Tracker" {...a11yProps(4)} />
            </Tabs>
          </Box>

          <TabPanel value={tabValue} index={0}>
            <TaxCalculator />
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <TaxDeductionCalculator />
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <GSTHelper />
          </TabPanel>

          <TabPanel value={tabValue} index={3}>
            <InvoiceManager 
              invoices={invoices}
              onDelete={handleDeleteInvoice}
              onUpdate={handleUpdateInvoice}
            />
          </TabPanel>

          <TabPanel value={tabValue} index={4}>
            <ExpenseTracker />
          </TabPanel>
        </Paper>
      </Container>
    </Box>
  );
};

export default Dashboard; 