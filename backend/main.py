from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
from typing import Dict, Any, List
import json
import logging
import traceback
import sys
import pytesseract
from PIL import Image, UnidentifiedImageError
import io
import os
import pdf2image
import tempfile
from datetime import datetime
from pydantic import BaseModel
import sqlite3

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,  # Changed to DEBUG for more detailed logs
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI()

# Configure CORS with more specific settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://192.168.1.122:3000"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

@app.middleware("http")
async def add_cors_header(request, call_next):
    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "http://192.168.1.122:3000"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "*"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    return response

# Database setup
def init_db():
    try:
        logger.info("Initializing database...")
        conn = sqlite3.connect('gst-helper.db')
        c = conn.cursor()
        
        # Create tables
        c.execute('''
            CREATE TABLE IF NOT EXISTS invoices (
                id TEXT PRIMARY KEY,
                supplier TEXT,
                total_amount REAL,
                gst_amount REAL,
                net_amount REAL,
                invoice_date TEXT,
                invoice_number TEXT,
                category TEXT,
                gst_eligible BOOLEAN,
                file_path TEXT,
                created_at TEXT,
                updated_at TEXT
            )
        ''')
        
        c.execute('''
            CREATE TABLE IF NOT EXISTS expenses (
                id TEXT PRIMARY KEY,
                invoice_id TEXT,
                amount REAL,
                gst_amount REAL,
                category TEXT,
                description TEXT,
                date TEXT,
                FOREIGN KEY (invoice_id) REFERENCES invoices (id)
            )
        ''')
        
        conn.commit()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Error initializing database: {str(e)}")
        logger.error(traceback.format_exc())
        raise
    finally:
        conn.close()

# Initialize database at startup
init_db()

# Pydantic models
class Invoice(BaseModel):
    id: str
    supplier: str
    total_amount: float
    gst_amount: float
    net_amount: float
    invoice_date: str
    invoice_number: str = None
    category: str
    gst_eligible: bool
    file_path: str = None

class Expense(BaseModel):
    id: str
    invoice_id: str
    amount: float
    gst_amount: float
    category: str
    description: str
    date: str

# Database operations
def save_invoice(invoice: Invoice):
    conn = sqlite3.connect('gst-helper.db')
    c = conn.cursor()
    
    c.execute('''
        INSERT OR REPLACE INTO invoices 
        (id, supplier, total_amount, gst_amount, net_amount, invoice_date, 
         invoice_number, category, gst_eligible, file_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        invoice.id,
        invoice.supplier,
        invoice.total_amount,
        invoice.gst_amount,
        invoice.net_amount,
        invoice.invoice_date,
        invoice.invoice_number,
        invoice.category,
        invoice.gst_eligible,
        invoice.file_path,
        datetime.now().isoformat(),
        datetime.now().isoformat()
    ))
    
    conn.commit()
    conn.close()

def get_invoices() -> List[Invoice]:
    try:
        logger.info("Fetching invoices from database")
        conn = sqlite3.connect('gst-helper.db')
        c = conn.cursor()
        
        c.execute('SELECT * FROM invoices')
        rows = c.fetchall()
        
        invoices = []
        for row in rows:
            try:
                invoice = Invoice(
                    id=str(row[0]),
                    supplier=row[1],
                    total_amount=float(row[2]),
                    gst_amount=float(row[3]),
                    net_amount=float(row[4]),
                    invoice_date=row[5],
                    invoice_number=row[6],
                    category=row[7],
                    gst_eligible=bool(row[8]),
                    file_path=row[9]
                )
                invoices.append(invoice)
            except Exception as e:
                logger.error(f"Error processing invoice row: {str(e)}")
                logger.error(f"Row data: {row}")
                continue
        
        logger.info(f"Successfully fetched {len(invoices)} invoices")
        return invoices
    except Exception as e:
        logger.error(f"Error in get_invoices: {str(e)}")
        logger.error(traceback.format_exc())
        return []
    finally:
        conn.close()

def get_total_expenses() -> Dict[str, float]:
    conn = sqlite3.connect('gst-helper.db')
    c = conn.cursor()
    
    c.execute('SELECT SUM(total_amount) FROM invoices')
    total = c.fetchone()[0] or 0.0
    
    c.execute('SELECT SUM(gst_amount) FROM invoices WHERE gst_eligible = 1')
    gst_eligible = c.fetchone()[0] or 0.0
    
    conn.close()
    return {
        "total": total,
        "gst_eligible": gst_eligible
    }

@app.get("/")
async def root():
    return {"status": "ok", "message": "Tax Manager API is running"}

@app.get("/health")
async def health_check():
    return {"status": "ok", "message": "Server is running"}

def extract_text_from_pdf(pdf_data: bytes) -> str:
    """Extract text from PDF using pdf2image and pytesseract"""
    try:
        # Create a temporary file to save the PDF
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as pdf_file:
            pdf_file.write(pdf_data)
            pdf_path = pdf_file.name

        logger.debug(f"Converting PDF to images: {pdf_path}")
        # Convert PDF to images
        images = pdf2image.convert_from_path(pdf_path)
        logger.debug(f"Converted PDF to {len(images)} images")

        # Extract text from each image
        text = ""
        for i, image in enumerate(images):
            logger.debug(f"Processing page {i+1}")
            text += pytesseract.image_to_string(image) + "\n"

        # Clean up temporary file
        os.unlink(pdf_path)
        
        if not text.strip():
            raise Exception("No text was extracted from the PDF")
            
        return text

    except Exception as e:
        logger.error(f"Error in PDF processing: {str(e)}")
        logger.error(traceback.format_exc())
        raise

def extract_text_from_image(image_data: bytes, content_type: str) -> str:
    """Extract text from image using pytesseract"""
    try:
        # Handle PDF files
        if content_type == 'application/pdf':
            return extract_text_from_pdf(image_data)

        # Log the size of the received data
        logger.debug(f"Received image data size: {len(image_data)} bytes")
        
        # Try to open the image
        image = Image.open(io.BytesIO(image_data))
        logger.debug(f"Image format: {image.format}, Size: {image.size}, Mode: {image.mode}")
        
        # Convert image to RGB if it's not
        if image.mode != 'RGB':
            logger.debug(f"Converting image from {image.mode} to RGB")
            image = image.convert('RGB')
        
        # Check if tesseract is installed and accessible
        if not os.path.exists('/usr/bin/tesseract'):
            raise Exception("Tesseract is not installed or not accessible")
        
        # Extract text
        logger.debug("Starting OCR processing...")
        text = pytesseract.image_to_string(image)
        logger.debug(f"Extracted text length: {len(text)}")
        
        if not text.strip():
            raise Exception("No text was extracted from the image")
            
        return text
        
    except UnidentifiedImageError as e:
        logger.error("Failed to identify image format")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=400, detail="Invalid image format or corrupted file")
    except Exception as e:
        logger.error(f"Error in extract_text_from_image: {str(e)}")
        logger.error(traceback.format_exc())
        raise

def parse_invoice(text: str) -> Dict[str, Any]:
    """Parse invoice text to extract relevant information"""
    logger.info("Starting invoice parsing")
    # Initialize result dictionary
    result = {
        "supplier": "",
        "total_amount": 0.0,
        "gst_amount": 0.0,
        "net_amount": 0.0,
        "invoice_date": "",
        "line_items": [],
        "raw_text": text  # Add raw text for debugging
    }
    
    # Extract total amount (look for patterns like "Total: $123.45" or "Amount Due: $123.45")
    import re
    total_patterns = [
        r"total.*?(?:AUD|A)?\$?\s*(\d+(?:,\d{3})*\.\d{2})",
        r"amount due.*?(?:AUD|A)?\$?\s*(\d+(?:,\d{3})*\.\d{2})",
        r"grand total.*?(?:AUD|A)?\$?\s*(\d+(?:,\d{3})*\.\d{2})",
        r"(?:AUD|A)?\$\s*(\d+(?:,\d{3})*\.\d{2})\s*(?:total|due)",
        r"charged to.*?(?:AUD|A)?\$\s*(\d+(?:,\d{3})*\.\d{2})",
    ]
    
    for pattern in total_patterns:
        match = re.search(pattern, text.lower())
        if match:
            try:
                amount_str = match.group(1).replace(',', '')
                result["total_amount"] = float(amount_str)
                # Calculate GST (assuming 10%)
                result["gst_amount"] = result["total_amount"] / 11
                result["net_amount"] = result["total_amount"] - result["gst_amount"]
                logger.info(f"Found total amount: {result['total_amount']}")
                break
            except ValueError as e:
                logger.warning(f"Failed to parse amount: {e}")
                continue
    
    # Extract supplier name (look for company names at the top of the document)
    supplier_patterns = [
        r"(?:from|supplier|vendor|bill from|invoice from):\s*([^\n]+)",
        r"([A-Z][A-Za-z\s]+(?:Inc\.|LLC|Ltd\.|PTY|Limited|Corporation))",
        r"^([A-Z][A-Za-z\s]+)(?=\n)",
        r"SUPPLIER:\s*([^\n]+)",
        r"VENDOR:\s*([^\n]+)",
        r"BILLED BY:\s*([^\n]+)"
    ]
    
    for pattern in supplier_patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if match:
            result["supplier"] = match.group(1).strip()
            logger.info(f"Found supplier: {result['supplier']}")
            break
    
    # Extract invoice date
    date_patterns = [
        r"(?:date|invoice date):\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})",
        r"(\d{1,2}[-/]\d{1,2}[-/]\d{4})",
        r"(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})"
    ]
    
    for pattern in date_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            result["invoice_date"] = match.group(1)
            logger.info(f"Found invoice date: {result['invoice_date']}")
            break
    
    return result

@app.post("/process-invoice")
async def process_invoice(file: UploadFile = File(...)):
    try:
        # Log file details
        logger.debug(f"Processing invoice - Filename: {file.filename}, Content-Type: {file.content_type}")
        
        # Validate file type
        allowed_types = ['image/jpeg', 'image/png', 'image/tiff', 'application/pdf']
        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {file.content_type}. Supported types are: {', '.join(allowed_types)}"
            )
        
        # Read file content
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Empty file received")
        
        logger.debug(f"File size: {len(contents)} bytes")
        
        # Extract text
        try:
            text = extract_text_from_image(contents, file.content_type)
            logger.debug(f"Extracted text preview: {text[:200]}...")  # Log first 200 chars
        except Exception as e:
            logger.error(f"Text extraction failed: {str(e)}")
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Failed to extract text from image",
                    "detail": str(e),
                    "traceback": traceback.format_exc()
                }
            )
        
        # Parse invoice
        try:
            result = parse_invoice(text)
            logger.debug(f"Parsing result: {json.dumps(result, indent=2)}")
        except Exception as e:
            logger.error(f"Invoice parsing failed: {str(e)}")
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Failed to parse invoice",
                    "detail": str(e),
                    "traceback": traceback.format_exc()
                }
            )
        
        # Save to database
        invoice = Invoice(
            id=str(datetime.now().timestamp()),
            supplier=result["supplier"],
            total_amount=result["total_amount"],
            gst_amount=result["gst_amount"],
            net_amount=result["net_amount"],
            invoice_date=result["invoice_date"],
            invoice_number=result.get("invoice_number", ""),  # Default to empty string if None
            category="Other",  # Default category
            gst_eligible=True  # Default to true, can be updated later
        )
        
        save_invoice(invoice)
        
        return JSONResponse(content={
            "success": True,
            "invoice": invoice.dict()
        })
        
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        logger.error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "error": "Unexpected error occurred",
                "detail": str(e),
                "traceback": traceback.format_exc()
            }
        )

@app.get("/invoices")
async def get_invoices_endpoint():
    try:
        logger.info("Fetching invoices from database")
        invoices = get_invoices()
        logger.info(f"Found {len(invoices)} invoices")
        
        # Log each invoice for debugging
        for invoice in invoices:
            logger.debug(f"Invoice data: {invoice.dict()}")
        
        return {"invoices": [invoice.dict() for invoice in invoices]}
    except Exception as e:
        logger.error(f"Error in get_invoices_endpoint: {str(e)}")
        logger.error(traceback.format_exc())
        return {"invoices": []}

@app.get("/expenses")
async def get_expenses_endpoint():
    expenses = get_total_expenses()
    return {
        "total_expenses": expenses["total"],
        "gst_eligible_expenses": expenses["gst_eligible"]
    }

if __name__ == "__main__":
    try:
        logger.info("Starting server on 0.0.0.0:8000")
        uvicorn.run(app, host="0.0.0.0", port=8000, log_level="debug")
    except Exception as e:
        logger.error(f"Failed to start server: {str(e)}")
        logger.error(traceback.format_exc())
        sys.exit(1) 