from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class TaxCalculation(BaseModel):
    income: float
    expenses: float
    gstCollected: float
    gstPaid: float
    netGst: float
    taxableIncome: float
    taxPayable: float

class TaxCalculationResponse(TaxCalculation):
    id: str
    createdAt: str

class Expense(BaseModel):
    amount: float
    category: str
    description: Optional[str] = None
    date: str

class ExpenseResponse(Expense):
    id: str
    createdAt: str 