# Tax Manager

A full-stack application for managing business purchases and processing invoices using OCR technology. The application automatically extracts key information from invoices including supplier details, total amounts, and GST calculations.

## Features

- Upload and process invoices (PDF, JPEG, PNG, TIFF)
- Automatic extraction of:
  - Supplier information
  - Total amount
  - GST calculation
  - Invoice date
- Real-time OCR processing
- Modern React frontend
- FastAPI backend with Tesseract OCR

## Tech Stack

### Frontend
- React with TypeScript
- Modern UI components
- Form handling and file upload
- Error handling and validation

### Backend
- FastAPI (Python)
- Tesseract OCR for text extraction
- PDF2Image for PDF processing
- Comprehensive error handling and logging

## Setup

### Prerequisites
- Python 3.11 or higher
- Node.js 16 or higher
- Tesseract OCR
- Poppler Utils (for PDF processing)

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create and activate virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Start the server:
   ```bash
   ./start_server.sh
   ```

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

## Usage

1. Start both backend and frontend servers
2. Navigate to the application in your browser
3. Upload an invoice using the file upload button
4. The system will automatically process the invoice and display:
   - Extracted supplier information
   - Total amount
   - Calculated GST
   - Invoice date

## Development

### Project Structure
```
tax-manager/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── start_server.sh
└── frontend/
    ├── src/
    │   ├── components/
    │   ├── services/
    │   └── types/
    ├── package.json
    └── tsconfig.json
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details 