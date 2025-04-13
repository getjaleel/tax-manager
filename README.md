# Tax Manager

A comprehensive tax management application that helps users track expenses, manage invoices, and calculate GST claims. Built with React, FastAPI, and SQLite.

## Features

### 1. GST Helper
- **Invoice Processing**: Upload and process invoices in PDF format
- **Smart Extraction**: Automatically extracts key information from invoices:
  - Supplier details
  - Invoice date
  - Total amount
  - GST amount
  - Invoice type (expense/income)
- **Duplicate Detection**: Prevents duplicate invoice entries
- **GST Calculation**: Automatically calculates GST amounts
- **Real-time Updates**: Updates expense tracker automatically

### 2. Expense Tracker
- **Manual Entry**: Add expenses with detailed categorization
- **GST Integration**: Automatically includes GST Helper expenses
- **Periodic Summary**: View expenses by month, quarter, or year
- **Category Breakdown**: Detailed breakdown of expenses by category
- **GST Claims**: Track GST claimable amounts
- **Real-time Updates**: Updates when new expenses are added

### 3. Invoice Manager
- **Invoice Storage**: Store and manage processed invoices
- **Quick Access**: View and search through all invoices
- **Status Tracking**: Track processing status of invoices
- **Bulk Actions**: Process multiple invoices at once

## Technical Architecture

### Frontend
- **React**: Modern UI framework
- **Material-UI**: Component library for consistent design
- **TypeScript**: Type-safe development
- **State Management**: React hooks for state management
- **Event System**: Custom events for cross-component communication

### Backend
- **FastAPI**: High-performance Python web framework
- **SQLite**: Lightweight database for data storage
- **PDF Processing**: Text extraction from PDF invoices
- **RESTful API**: Clean API design for frontend communication
- **Error Handling**: Comprehensive error handling and logging

### Data Models
1. **Invoice**
   - ID
   - Supplier
   - Invoice date
   - Total amount
   - GST amount
   - Invoice type
   - Processing status
   - Created/Updated timestamps

2. **Expense**
   - ID
   - Date
   - Amount
   - GST amount
   - Description
   - Category
   - GST eligibility

## Getting Started

### Prerequisites
- Docker
- Docker Compose
- Node.js (for development)
- Python 3.8+ (for development)

### Installation
1. Clone the repository
2. Create `.env` file with required environment variables
3. Run `docker-compose up --build`

### Development Setup
1. Frontend:
   ```bash
   cd frontend
   npm install
   npm start
   ```

2. Backend:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   uvicorn main:app --reload
   ```

## API Endpoints

### GST Helper
- `POST /api/process-invoice`: Process uploaded invoice
- `GET /api/gst-summary`: Get GST summary for period
- `GET /api/invoices`: List all invoices

### Expense Tracker
- `POST /api/expenses`: Add new expense
- `GET /api/expenses/summary`: Get expense summary
- `DELETE /api/expenses/clear`: Clear all expenses

## Environment Variables

### Frontend
- `REACT_APP_API_BASE_URL`: Backend API URL
- `REACT_APP_DEBUG`: Enable debug mode

### Backend
- `DATABASE_URL`: SQLite database path
- `DEBUG`: Enable debug mode
- `UPLOAD_FOLDER`: Path for storing uploaded files

## Contributing
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License
This project is licensed under the MIT License - see the LICENSE file for details. 