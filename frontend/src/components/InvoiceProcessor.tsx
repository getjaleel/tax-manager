import { sharedExpenseState } from './TaxDeductionCalculator';

const handleExpenseData = (data: { total_expenses: number; gst_eligible_expenses: number }) => {
  console.log('Received expenses data:', data);
  sharedExpenseState.setExpenseData(data);
}; 