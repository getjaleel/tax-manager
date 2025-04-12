import React, { useState, useEffect, useMemo } from 'react';
import './App.css';
import { InvoiceProcessor } from './services/InvoiceProcessor';

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

const App: React.FC = () => {
  const [income, setIncome] = useState<string>('');
  const [expenses, setExpenses] = useState<string>('');
  const [gstEligibleExpenses, setGstEligibleExpenses] = useState<string>('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
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

  const invoiceProcessor = useMemo(() => new InvoiceProcessor(), []);

  // Load data from backend on component mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load invoices
        const invoices = await invoiceProcessor.getInvoices();
        setInvoices(invoices.map(invoice => ({
          id: invoice.id || Date.now().toString(),
          date: invoice.invoice_date || new Date().toISOString().split('T')[0],
          amount: invoice.total_amount || 0,
          description: invoice.supplier || '',
          category: invoice.category || 'Other',
          gstEligible: invoice.gst_eligible || true
        })));

        // Load expenses
        const expenses = await invoiceProcessor.getExpenses();
        setExpenses(expenses.total.toString());
        setGstEligibleExpenses(expenses.gstEligible.toString());
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
          // Update local state with proper null checks
          const newInvoice = {
            id: result.invoice.id || Date.now().toString(),
            date: result.invoice.invoice_date || new Date().toISOString().split('T')[0],
            amount: result.invoice.total_amount || 0,
            description: result.invoice.supplier || selectedFile.name,
            category: selectedCategory,
            gstEligible: result.invoice.gst_eligible || true
          };
          
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

  const handleDeleteInvoice = (id: string) => {
    setInvoices(invoices.filter(invoice => invoice.id !== id));
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

  const handleAddPurchase = () => {
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

    return (
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
          <div className="upload-section">
            <div className="upload-controls">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileUpload}
                className="file-input"
              />
              <select 
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="category-select"
              >
                <option value="Cloud Services">Cloud Services</option>
                <option value="Software">Software</option>
                <option value="Hardware">Hardware</option>
                <option value="Professional Development">Professional Development</option>
                <option value="Office Expenses">Office Expenses</option>
                <option value="Other">Other</option>
              </select>
              <button 
                onClick={handleUpload} 
                disabled={!selectedFile}
                className="upload-button"
              >
                Upload Invoice
              </button>
            </div>
          </div>
          
          <div className="invoice-list">
            {invoices.map(invoice => (
              <div key={invoice.id} className="invoice-item">
                <div className="invoice-header">
                  <h3>{invoice.category}</h3>
                  <button 
                    onClick={() => handleDeleteInvoice(invoice.id)}
                    className="delete-button"
                  >
                    ×
                  </button>
                </div>
                <p className="invoice-date">Date: {invoice.date}</p>
                <p className="invoice-description">{invoice.description}</p>
                <p className="invoice-amount">Amount: ${invoice.amount.toFixed(2)}</p>
                <p className="invoice-gst">GST Eligible: {invoice.gstEligible ? 'Yes' : 'No'}</p>
              </div>
            ))}
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
    </div>
    );
};

export default App;