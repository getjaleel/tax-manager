import React, { useState, useEffect, useMemo } from 'react';
import './App.css';
import { InvoiceProcessor } from './services/InvoiceProcessor';
import { ParsedInvoice } from './types/Invoice';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material';
import CssBaseline from '@mui/material/CssBaseline';
import GSTHelper from './components/GSTHelper';
import InvoiceManager from './components/InvoiceManager';
import TaxCalculator from './components/TaxCalculator';
import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@mui/material';

interface Invoice {
  id: string;
  date: string;
  amount: number;
  description: string;
  category: string;
  gstEligible: boolean;
  fileUrl?: string;
}

interface BusinessPurchase {
  id: string;
  amount: number;
  description: string;
  category: string;
  supplier: string;
  gstAmount: number;
  date: string;
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

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

const App: React.FC = () => {
  const [income, setIncome] = useState<string>('');
  const [expenses, setExpenses] = useState<string>('');
  const [gstEligibleExpenses, setGstEligibleExpenses] = useState<string>('');
  const [invoices, setInvoices] = useState<ParsedInvoice[]>([]);
  const [purchases, setPurchases] = useState<BusinessPurchase[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('Other');
  const [newPurchase, setNewPurchase] = useState({
    amount: '',
    description: '',
    category: 'Other',
    supplier: ''
  });
  const [editingPurchase, setEditingPurchase] = useState<BusinessPurchase | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedQuarter, setSelectedQuarter] = useState<string>('all');
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);

  const invoiceProcessor = useMemo(() => new InvoiceProcessor(), []);

  // Function to generate a unique ID
  const generateUniqueId = () => {
    // Generate a numeric ID using timestamp and random number
    return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  };

  // Function to ensure an invoice has a valid ID
  const ensureInvoiceHasId = (invoice: any) => {
    if (!invoice.id) {
      return {
        ...invoice,
        id: generateUniqueId()
      };
    }
    return invoice;
  };

  // Load data from backend on component mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load invoices
        const invoicesData = await invoiceProcessor.getInvoices();
        // Ensure all invoices have valid IDs
        const invoicesWithIds = invoicesData.map(ensureInvoiceHasId);
        setInvoices(invoicesWithIds);

        // Load expenses
        const expensesData = await invoiceProcessor.getExpenses();
        setExpenses(expensesData.total.toString());
        setGstEligibleExpenses(expensesData.gstEligible.toString());
      } catch (error) {
        console.error('Error loading data:', error);
        setError('Failed to load data from server');
      }
    };

    loadData();
  }, [invoiceProcessor]);

  const gstRate = 0.1; // 10% GST rate
  const incomeNum = parseFloat(income) || 0;
  const expensesNum = parseFloat(expenses) || 0;
  const gstEligibleExpensesNum = parseFloat(gstEligibleExpenses) || 0;
  
  // Calculate GST from total amount
  const calculateGST = (totalAmount: number) => {
    return totalAmount - (totalAmount / (1 + gstRate));
  };

  // Calculate net amount (excluding GST)
  const calculateNetAmount = (totalAmount: number) => {
    return totalAmount / (1 + gstRate);
  };

  const gstCollected = incomeNum * gstRate;
  const gstPaid = gstEligibleExpensesNum * gstRate;
  const totalGSTPaid = gstPaid + purchases.reduce((sum, purchase) => sum + purchase.gstAmount, 0);
  const netGst = gstCollected - totalGSTPaid;
  const taxableIncome = incomeNum - expensesNum;

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (selectedFile) {
      setIsProcessing(true);
      setError(null);
      
      try {
        const result = await invoiceProcessor.processDocument(selectedFile);
        
        if (result.success && result.invoice) {
          // Generate a unique ID for the new invoice
          const newInvoice = ensureInvoiceHasId({
            invoice_date: result.invoice.invoiceDate || new Date().toISOString().split('T')[0],
            supplier: result.invoice.supplier || selectedFile.name,
            invoice_number: result.invoice.invoiceNumber || '',
            total_amount: result.invoice.totalAmount || 0,
            gst_amount: result.invoice.gstAmount || 0,
            net_amount: result.invoice.netAmount || 0,
            category: selectedCategory,
            gst_eligible: true,
            file_path: '',
            is_system_date: !result.invoice.invoiceDate
          });
          
          setInvoices(prev => [...prev, newInvoice]);

          // Update expenses
          const expenses = await invoiceProcessor.getExpenses();
          setExpenses(expenses.total.toString());
          setGstEligibleExpenses(expenses.gstEligible.toString());
        } else {
          setError(result.error || 'Failed to process invoice');
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to process invoice');
      } finally {
        setIsProcessing(false);
        setSelectedFile(null);
      }
    }
  };

  const handleSelectInvoice = (invoiceId: string) => {
    setSelectedInvoices(prev => {
      if (prev.includes(invoiceId)) {
        return prev.filter(id => id !== invoiceId);
      } else {
        return [...prev, invoiceId];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedInvoices.length === invoices.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(invoices.map(invoice => invoice.id));
    }
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    try {
      const success = await invoiceProcessor.deleteInvoice(invoiceId);
      if (success) {
        setInvoices(prev => prev.filter(invoice => invoice.id !== invoiceId));
        setSelectedInvoices(prev => prev.filter(id => id !== invoiceId));
        setError(null);
      } else {
        setError('Failed to delete invoice');
      }
    } catch (error) {
      console.error('Error deleting invoice:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete invoice');
    }
  };

  const handleDeleteSelected = async () => {
    try {
      for (const invoiceId of selectedInvoices) {
        if (invoiceId) {
          await handleDeleteInvoice(invoiceId);
        }
      }
      setSelectedInvoices([]);
      setDeleteDialogOpen(false);
    } catch (error) {
      setError('Failed to delete selected invoices');
    }
  };

  const handleDeleteAll = async () => {
    try {
      for (const invoice of invoices) {
        if (invoice.id) {
          await handleDeleteInvoice(invoice.id);
        }
      }
      setSelectedInvoices([]);
      setDeleteAllDialogOpen(false);
    } catch (error) {
      setError('Failed to delete all invoices');
    }
  };

  const handleDeletePurchase = (id: string) => {
    setPurchases(purchases.filter(purchase => purchase.id !== id));
  };

  const handleInputChange = (value: string, setter: React.Dispatch<React.SetStateAction<string>>) => {
    // Remove any non-numeric characters except decimal point
    const numericValue = value.replace(/[^0-9.]/g, '');
    // Ensure only one decimal point
    const parts = numericValue.split('.');
    if (parts.length > 2) {
      setter(parts[0] + '.' + parts.slice(1).join(''));
    } else {
      setter(numericValue);
    }
  };

  const handlePurchaseInputChange = (field: keyof typeof newPurchase, value: string) => {
    setNewPurchase(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleReceiptUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setReceiptFile(file);
      setIsProcessing(true);
      setError(null);
      
      console.log('Starting receipt upload process...');
      const startTime = Date.now();
      
      try {
        console.log('Sending file to processor...');
        const result = await invoiceProcessor.processDocument(file);
        
        if (!result.success) {
          console.error('Processing failed:', result.error);
          setError(result.error || 'Failed to process receipt');
          return;
        }
        
        console.log('Processing successful, updating form...');
        const { invoice } = result;
        
        // Update the form with the extracted data
        setNewPurchase({
          ...newPurchase,
          amount: invoice.totalAmount.toString(),
          description: file.name,
          supplier: invoice.supplier
        });
        
        // Calculate GST and net amount
        const gstAmount = invoice.gstAmount;
        const netAmount = invoice.netAmount;
        
        // Update the purchase with calculated values
        setNewPurchase(prev => ({
          ...prev,
          gstAmount: gstAmount.toString(),
          netAmount: netAmount.toString()
        }));
        
        const endTime = Date.now();
        console.log(`Total processing time: ${endTime - startTime}ms`);
        
      } catch (error) {
        console.error('Error during receipt processing:', error);
        setError(error instanceof Error ? error.message : 'Failed to process receipt');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleAddPurchase = async () => {
    if (newPurchase.amount && newPurchase.description) {
      const amount = parseFloat(newPurchase.amount);
      const gstAmount = calculateGST(amount);
      const netAmount = calculateNetAmount(amount);

      const purchase: BusinessPurchase = {
        id: Date.now().toString(),
        date: new Date().toISOString().split('T')[0],
        amount,
        description: newPurchase.description,
        gstAmount,
        netAmount,
        category: newPurchase.category,
        supplier: newPurchase.supplier,
        receiptUrl: receiptFile ? URL.createObjectURL(receiptFile) : undefined
      };

      setPurchases([...purchases, purchase]);
      setNewPurchase({ amount: '', description: '', category: 'Other', supplier: '' });
      setReceiptFile(null);

      // Refresh the invoices list
      try {
        const invoicesData = await invoiceProcessor.getInvoices();
        const invoicesWithIds = invoicesData.map(ensureInvoiceHasId);
        setInvoices(invoicesWithIds);
      } catch (error) {
        console.error('Error refreshing invoices:', error);
        setError('Failed to refresh invoices list');
      }
    }
  };

  const handleEditPurchase = (purchase: BusinessPurchase) => {
    setEditingPurchase(purchase);
    setNewPurchase({
      amount: purchase.amount.toString(),
      description: purchase.description,
      category: purchase.category,
      supplier: purchase.supplier || ''
    });
  };

  const handleUpdatePurchase = () => {
    if (editingPurchase && newPurchase.amount && newPurchase.description) {
      const amount = parseFloat(newPurchase.amount);
      const gstAmount = calculateGST(amount);
      const netAmount = calculateNetAmount(amount);

      const updatedPurchase: BusinessPurchase = {
        ...editingPurchase,
        amount,
        description: newPurchase.description,
        category: newPurchase.category,
        supplier: newPurchase.supplier,
        gstAmount,
        netAmount,
        receiptUrl: receiptFile ? URL.createObjectURL(receiptFile) : editingPurchase.receiptUrl
      };

      setPurchases(purchases.map(p => p.id === editingPurchase.id ? updatedPurchase : p));
      setEditingPurchase(null);
      setNewPurchase({ amount: '', description: '', category: 'Other', supplier: '' });
      setReceiptFile(null);
    }
  };

  // Simple tax calculation (example rates)
  const calculateTax = (amount: number): number => {
    if (amount <= 18200) return 0;
    if (amount <= 45000) return (amount - 18200) * 0.19;
    if (amount <= 120000) return 5092 + (amount - 45000) * 0.325;
    if (amount <= 180000) return 29467 + (amount - 120000) * 0.37;
    return 51667 + (amount - 180000) * 0.45;
  };

  const taxPayable = calculateTax(taxableIncome);

  // Filter invoices based on search term and date filters
  const filteredInvoices = useMemo(() => {
    return invoices.filter(invoice => {
      const matchesSearch = 
        (invoice.supplier?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (invoice.invoice_number?.toLowerCase() || '').includes(searchTerm.toLowerCase());
      
      if (selectedYear === 'all' && selectedQuarter === 'all') {
        return matchesSearch;
      }

      const invoiceDate = new Date(invoice.invoice_date || new Date());
      const invoiceYear = invoiceDate.getFullYear().toString();
      const invoiceMonth = invoiceDate.getMonth();
      const invoiceQuarter = Math.floor(invoiceMonth / 3) + 1;

      const matchesYear = selectedYear === 'all' || invoiceYear === selectedYear;
      const matchesQuarter = selectedQuarter === 'all' || invoiceQuarter.toString() === selectedQuarter;

      return matchesSearch && matchesYear && matchesQuarter;
    });
  }, [invoices, searchTerm, selectedYear, selectedQuarter]);

  // Generate years and quarters for filters
  const years = useMemo(() => {
    const uniqueYears = new Set(invoices.map(invoice => 
      new Date(invoice.invoiceDate).getFullYear().toString()
    ));
    return ['all', ...Array.from(uniqueYears)].sort();
  }, [invoices]);

  const quarters = ['all', '1', '2', '3', '4'];

  const handleGenerateReport = async () => {
    try {
      const response = await fetch(`${invoiceProcessor.apiUrl}/generate-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          year: selectedYear === 'all' ? null : selectedYear,
          quarter: selectedQuarter === 'all' ? null : selectedQuarter
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate report');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GST-Report-${selectedYear}-Q${selectedQuarter}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError('Failed to generate report');
      console.error('Error generating report:', err);
    }
  };

  const handleUpdateInvoice = async (updatedInvoice: Invoice) => {
    try {
      const success = await invoiceProcessor.updateInvoice(updatedInvoice);
      if (success) {
        setInvoices(prev => 
          prev.map(invoice => 
            invoice.id === updatedInvoice.id ? updatedInvoice : invoice
          )
        );
        setError(null);
      } else {
        setError('Failed to update invoice');
      }
    } catch (error) {
      console.error('Error updating invoice:', error);
      setError(error instanceof Error ? error.message : 'Failed to update invoice');
      throw error;
    }
  };

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
                <Router>
                    <Routes>
          <Route path="/" element={
            <div className="app">
              <header className="app-header">
                <h1>IT Business Tax Assistant</h1>
                <p className="subtitle">Streamline your tax and GST management</p>
              </header>
              
              <div className="calculator">
                <section className="input-section">
                  <h2>Income & Expenses</h2>
                  <div className="input-group">
                    <label>
                      Total Income (including GST):
                      <input
                        type="text"
                        value={income}
                        onChange={(e) => handleInputChange(e.target.value, setIncome)}
                        placeholder="Enter amount"
                      />
                    </label>
                    <label>
                      Total Expenses:
                      <input
                        type="text"
                        value={expenses}
                        onChange={(e) => handleInputChange(e.target.value, setExpenses)}
                        placeholder="Enter amount"
                      />
                    </label>
                    <label>
                      GST-Eligible Expenses:
                      <input
                        type="text"
                        value={gstEligibleExpenses}
                        onChange={(e) => handleInputChange(e.target.value, setGstEligibleExpenses)}
                        placeholder="Enter amount"
                      />
                    </label>
                  </div>
                </section>

                <section className="purchases-section">
                  <h2>Business Purchases</h2>
                  <div className="purchase-input">
                    <input
                      type="text"
                      value={newPurchase.amount}
                      onChange={(e) => handlePurchaseInputChange('amount', e.target.value)}
                      placeholder="Enter purchase amount (including GST)"
                    />
                    <input
                      type="text"
                      value={newPurchase.description}
                      onChange={(e) => handlePurchaseInputChange('description', e.target.value)}
                      placeholder="Enter purchase description"
                    />
                    <input
                      type="text"
                      value={newPurchase.supplier}
                      onChange={(e) => handlePurchaseInputChange('supplier', e.target.value)}
                      placeholder="Enter supplier name"
                    />
                    <select
                      value={newPurchase.category}
                      onChange={(e) => handlePurchaseInputChange('category', e.target.value)}
                      className="category-select"
                    >
                      {PURCHASE_CATEGORIES.map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleReceiptUpload}
                      className="file-input"
                      title="Choose a file"
                      onClick={(e) => {
                        // Reset the value to allow selecting the same file again
                        (e.target as HTMLInputElement).value = '';
                      }}
                    />
                    {editingPurchase ? (
                      <button onClick={handleUpdatePurchase} className="update-button">
                        Update Purchase
                      </button>
                    ) : (
                      <button onClick={handleAddPurchase} className="add-button">
                        Add Purchase
                      </button>
                    )}
                  </div>
                  
                  <div className="purchases-list">
                    {purchases.map(purchase => (
                      <div key={purchase.id} className="purchase-item">
                        <div className="purchase-header">
                          <h3>{purchase.description}</h3>
                          <div className="purchase-actions">
                            <button 
                              onClick={() => handleEditPurchase(purchase)}
                              className="edit-button"
                            >
                              Edit
                            </button>
                            <button 
                              onClick={() => handleDeletePurchase(purchase.id)}
                              className="delete-button"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        <p className="purchase-date">Date: {purchase.date}</p>
                        <p className="purchase-category">Category: {purchase.category}</p>
                        {purchase.supplier && <p className="purchase-supplier">Supplier: {purchase.supplier}</p>}
                        <p className="purchase-amount">Total Amount: ${purchase.amount.toFixed(2)}</p>
                        <p className="purchase-gst">GST Amount: ${purchase.gstAmount.toFixed(2)}</p>
                        <p className="purchase-net">Net Amount: ${purchase.netAmount.toFixed(2)}</p>
                        {purchase.receiptUrl && (
                          <div className="receipt-preview">
                            <a href={purchase.receiptUrl} target="_blank" rel="noopener noreferrer">
                              View Receipt
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="invoice-section">
                  <h2>Invoice Management</h2>
                  <div className="invoice-list">
                    {invoices.length === 0 ? (
                      <p>No invoices found</p>
                    ) : (
                      <div className="invoice-table-container">
                        <div className="invoice-actions">
                          <button
                            className="delete-selected-button"
                            disabled={selectedInvoices.length === 0}
                            onClick={() => setDeleteDialogOpen(true)}
                          >
                            Delete Selected
                          </button>
                          <button
                            className="delete-all-button"
                            disabled={invoices.length === 0}
                            onClick={() => setDeleteAllDialogOpen(true)}
                          >
                            Delete All
                          </button>
                        </div>
                        <table className="invoices-table">
                          <thead>
                            <tr>
                              <th>
                                <input
                                  type="checkbox"
                                  checked={selectedInvoices.length === invoices.length && invoices.length > 0}
                                  onChange={handleSelectAll}
                                />
                              </th>
                              <th>Date</th>
                              <th>Supplier</th>
                              <th>Invoice Number</th>
                              <th>Total Amount</th>
                              <th>GST Amount</th>
                              <th>Net Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {invoices.map((invoice) => {
                              // Ensure the invoice has a valid ID before rendering
                              const invoiceWithId = ensureInvoiceHasId(invoice);
                              return (
                                <tr key={`invoice-row-${invoiceWithId.id}`}>
                                  <td>
                                    <input
                                      type="checkbox"
                                      checked={selectedInvoices.includes(invoiceWithId.id)}
                                      onChange={() => handleSelectInvoice(invoiceWithId.id)}
                                    />
                                  </td>
                                  <td>{invoiceWithId.invoice_date || 'N/A'}</td>
                                  <td>{invoiceWithId.supplier || 'N/A'}</td>
                                  <td>{invoiceWithId.invoice_number || 'N/A'}</td>
                                  <td>${(invoiceWithId.total_amount || 0).toFixed(2)}</td>
                                  <td>${(invoiceWithId.gst_amount || 0).toFixed(2)}</td>
                                  <td>${(invoiceWithId.net_amount || 0).toFixed(2)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </section>

                <section className="summary-section">
                  <div className="gst-summary">
                    <h2>GST Summary</h2>
                    <div className="result">
                      <p>Total Income (including GST): ${incomeNum.toFixed(2)}</p>
                      <p>GST Collected (10% of income): ${gstCollected.toFixed(2)}</p>
                      <p>GST-Eligible Expenses: ${gstEligibleExpensesNum.toFixed(2)}</p>
                      <p>GST Paid on Expenses: ${gstPaid.toFixed(2)}</p>
                      <p>GST Paid on Purchases: ${purchases.reduce((sum, purchase) => sum + purchase.gstAmount, 0).toFixed(2)}</p>
                      <p>Total GST Paid: ${totalGSTPaid.toFixed(2)}</p>
                      <p className={netGst >= 0 ? 'gst-payable' : 'gst-refund'}>
                        Net GST: ${Math.abs(netGst).toFixed(2)} {netGst >= 0 ? '(to pay to ATO)' : '(refund from ATO)'}
                      </p>
                    </div>
                  </div>

                  <div className="tax-summary">
                    <h2>Tax Summary</h2>
                    <div className="result">
                      <p>Taxable Income: ${taxableIncome.toFixed(2)}</p>
                      <p>Income Tax Payable: ${taxPayable.toFixed(2)}</p>
                    </div>
                  </div>
                </section>

                <section className="guidance-section">
                  <h2>IT Business Expense Guidance</h2>
                  <div className="guidance-content">
                    <div className="guidance-card">
                      <h3>Common IT Business Deductions</h3>
                      <ul>
                        <li>Cloud Service Subscriptions (AWS, Azure, GCP)</li>
                        <li>Software Licenses and Subscriptions</li>
                        <li>Hardware and Equipment (servers, laptops, networking gear)</li>
                        <li>Professional Development (certifications, courses)</li>
                        <li>Home Office Setup (dedicated workspace)</li>
                        <li>Internet and Phone Expenses</li>
                        <li>Professional Memberships and Subscriptions</li>
                        <li>Business Insurance</li>
                        <li>Travel for Client Meetings</li>
                        <li>Marketing and Website Costs</li>
                      </ul>
                    </div>

                    <div className="guidance-card">
                      <h3>GST-Specific Guidance for IT Services</h3>
                      <ul>
                        <li>Most IT services are GST-taxable (10%)</li>
                        <li>Export of IT services to overseas clients may be GST-free</li>
                        <li>Cloud services from overseas providers may not include GST</li>
                        <li>Keep detailed records of international transactions</li>
                      </ul>
                    </div>

                    <div className="guidance-card">
                      <h3>Tax-Saving Strategies</h3>
                      <ul>
                        <li>Consider timing of large equipment purchases</li>
                        <li>Prepay annual subscriptions before EOFY</li>
                        <li>Keep detailed logs of home office usage</li>
                        <li>Document all business-related travel</li>
                        <li>Maintain separate business bank accounts</li>
                        <li>Consider asset depreciation for major purchases</li>
                      </ul>
                    </div>
                  </div>
                </section>

                <section className="search-filters">
                  <input
                    type="text"
                    placeholder="Search by supplier or invoice number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                  />

                  <select 
                    value={selectedYear} 
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="filter-select"
                  >
                    {years.map(year => (
                      <option key={year} value={year}>
                        {year === 'all' ? 'All Years' : year}
                      </option>
                    ))}
                  </select>

                  <select 
                    value={selectedQuarter} 
                    onChange={(e) => setSelectedQuarter(e.target.value)}
                    className="filter-select"
                  >
                    {quarters.map(quarter => (
                      <option key={quarter} value={quarter}>
                        {quarter === 'all' ? 'All Quarters' : `Q${quarter}`}
                      </option>
                    ))}
                  </select>

                  <button onClick={handleGenerateReport} className="generate-report-btn">
                    Generate Report
                  </button>
                </section>
              </div>

              {/* Add loading and error states */}
              {isProcessing && (
                <div className="processing-overlay">
                  <div className="processing-spinner"></div>
                  <p>Processing invoice...</p>
                </div>
              )}
              
              {error && (
                <div className="error-message">
                  <p>{error}</p>
                  <button onClick={() => setError(null)}>Dismiss</button>
                </div>
              )}

              {/* Add delete confirmation dialogs */}
              <Dialog
                open={deleteDialogOpen}
                onClose={() => setDeleteDialogOpen(false)}
              >
                <DialogTitle>Delete Selected Invoices</DialogTitle>
                <DialogContent>
                  <DialogContentText>
                    Are you sure you want to delete {selectedInvoices.length} selected invoice(s)? This action cannot be undone.
                  </DialogContentText>
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleDeleteSelected} color="error">
                    Delete
                  </Button>
                </DialogActions>
              </Dialog>

              <Dialog
                open={deleteAllDialogOpen}
                onClose={() => setDeleteAllDialogOpen(false)}
              >
                <DialogTitle>Delete All Invoices</DialogTitle>
                <DialogContent>
                  <DialogContentText>
                    Are you sure you want to delete all {invoices.length} invoices? This action cannot be undone.
                  </DialogContentText>
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => setDeleteAllDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleDeleteAll} color="error">
                    Delete All
                  </Button>
                </DialogActions>
              </Dialog>
            </div>
          } />
          <Route path="/tax-calculator" element={<TaxCalculator />} />
          <Route path="/invoice-manager" element={
            <InvoiceManager 
              invoices={invoices} 
              onDelete={handleDeleteInvoice}
              onUpdate={handleUpdateInvoice}
            />
          } />
                    </Routes>
                </Router>
        </ThemeProvider>
    );
};

export default App;