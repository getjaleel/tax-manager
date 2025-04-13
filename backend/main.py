from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi import Query
import uvicorn
from typing import Dict, Any, List, Optional
import json
import logging
import traceback
import sys
import os
import pytesseract
from PIL import Image, UnidentifiedImageError
import io
import pdf2image
import tempfile
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
import sqlite3
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
import uuid
import re

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,  # Changed to DEBUG for more detailed logs
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('backend.log')
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI()

# Configure CORS with more permissive settings for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins during development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Database setup
def init_db():
    conn = None
    try:
        # Create database directory if it doesn't exist
        db_dir = os.path.dirname(os.path.abspath('gst-helper.db'))
        os.makedirs(db_dir, exist_ok=True)
        
        conn = sqlite3.connect('gst-helper.db')
        c = conn.cursor()
        
        # Create invoices table with all required fields
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
                gst_eligible INTEGER,
                file_path TEXT,
                created_at TEXT,
                updated_at TEXT,
                is_system_date INTEGER DEFAULT 0,
                invoice_type TEXT DEFAULT 'expense'
            )
        ''')
        
        # Add invoice_type column if it doesn't exist
        try:
            c.execute('ALTER TABLE invoices ADD COLUMN invoice_type TEXT DEFAULT "expense"')
        except sqlite3.OperationalError:
            # Column already exists
            pass
            
        # Clean up duplicates
        c.execute('''
            DELETE FROM invoices 
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM invoices
                GROUP BY supplier, total_amount, invoice_date, invoice_number
            )
        ''')
        
        conn.commit()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Error initializing database: {str(e)}")
        logger.error(traceback.format_exc())
        raise
    finally:
        if conn:
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
    is_system_date: bool
    invoice_type: str = None

class Expense(BaseModel):
    id: Optional[int] = None
    date: str
    amount: float
    gst_amount: float
    description: str
    category: str
    is_gst_eligible: bool
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())

class ReportRequest(BaseModel):
    year: Optional[str] = None
    quarter: Optional[str] = None

# Database operations
def normalize_supplier_name(supplier: str) -> str:
    """Normalize supplier name by removing extra whitespace and common variations"""
    if not supplier:
        return ""
    # Remove extra whitespace and newlines
    normalized = " ".join(supplier.split())
    # Remove common variations
    normalized = normalized.replace("PTY LTD", "").replace("PTY", "").replace("LTD", "")
    normalized = normalized.replace("PTY.", "").replace("LTD.", "")
    # Remove any remaining extra whitespace
    return " ".join(normalized.split())

def check_duplicate_invoice(invoice: Invoice, conn) -> bool:
    c = conn.cursor()
    # Normalize supplier name
    normalized_supplier = normalize_supplier_name(invoice.supplier)
    
    # Check for existing invoice with same supplier, amount and date
    # Only check essential fields and use normalized supplier name
    c.execute('''
        SELECT id FROM invoices 
        WHERE LOWER(TRIM(supplier)) = LOWER(TRIM(?))
        AND total_amount = ? 
        AND invoice_date = ?
    ''', (
        normalized_supplier,
        invoice.total_amount,
        invoice.invoice_date
    ))
    return c.fetchone() is not None

def save_invoice(invoice: Invoice):
    try:
        conn = sqlite3.connect('gst-helper.db')
        
        # Check for duplicates before saving
        if check_duplicate_invoice(invoice, conn):
            logger.warning(f"Duplicate invoice detected for supplier {invoice.supplier} with amount {invoice.total_amount}")
            return False
            
        c = conn.cursor()
        c.execute('''
            INSERT OR REPLACE INTO invoices 
            (id, supplier, total_amount, gst_amount, net_amount, invoice_date, 
             invoice_number, category, gst_eligible, file_path, created_at, updated_at, is_system_date, invoice_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            invoice.id,
            invoice.supplier,  # Store original supplier name
            invoice.total_amount,
            invoice.gst_amount,
            invoice.net_amount,
            invoice.invoice_date,
            invoice.invoice_number,
            invoice.category,
            invoice.gst_eligible,
            invoice.file_path,
            datetime.now().isoformat(),
            datetime.now().isoformat(),
            invoice.is_system_date,
            invoice.invoice_type or 'expense'  # Default to 'expense' if not specified
        ))
        
        conn.commit()
        return True
    except Exception as e:
        logger.error(f"Error saving invoice: {str(e)}")
        logger.error(traceback.format_exc())
        return False
    finally:
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
                    file_path=row[9],
                    is_system_date=bool(row[10]),
                    invoice_type=row[11] or 'expense'  # Default to 'expense' if not specified
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

@app.get("/api/gst-summary")
async def get_gst_summary():
    try:
        conn = sqlite3.connect('gst-helper.db')
        c = conn.cursor()
        
        # Get total GST collected (from invoices)
        c.execute('SELECT SUM(gst_amount) FROM invoices WHERE gst_eligible = 1')
        gst_collected = c.fetchone()[0] or 0.0
        
        # Get total GST paid (from expenses)
        c.execute('SELECT SUM(gst_amount) FROM expenses WHERE is_gst_eligible = 1')
        gst_paid = c.fetchone()[0] or 0.0
        
        # Calculate net GST
        net_gst = gst_collected - gst_paid
        
        conn.close()
        
        return {
            "gst_collected": gst_collected,
            "gst_paid": gst_paid,
            "net_gst": net_gst,
            "gst_owing": net_gst if net_gst > 0 else 0,
            "gst_refund": abs(net_gst) if net_gst < 0 else 0
        }
    except Exception as e:
        logger.error(f"Error fetching GST summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/common-deductions")
async def get_common_deductions():
    try:
        # Common tax deductions for Australian businesses
        deductions = [
            {
                "category": "Home Office Expenses",
                "description": "Expenses related to working from home",
                "notes": "Includes internet, phone, electricity, and office supplies"
            },
            {
                "category": "Vehicle Expenses",
                "description": "Business-related vehicle costs",
                "notes": "Logbook method or cents per kilometer"
            },
            {
                "category": "Professional Development",
                "description": "Training and education costs",
                "notes": "Must be directly related to current work"
            },
            {
                "category": "Equipment & Tools",
                "description": "Tools and equipment for work",
                "notes": "Depreciation may apply for items over $300"
            },
            {
                "category": "Travel Expenses",
                "description": "Business travel costs",
                "notes": "Includes accommodation, meals, and transport"
            }
        ]
        return deductions
    except Exception as e:
        logger.error(f"Error fetching common deductions: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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

def extract_text_from_pdf(pdf_data: bytes) -> str:
    """Extract text from PDF using pdf2image and pytesseract"""
    try:
        # Create a temporary file to save the PDF
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as pdf_file:
            pdf_file.write(pdf_data)
            pdf_path = pdf_file.name

        logger.debug(f"Converting PDF to images: {pdf_path}")
        # Convert PDF to images with higher DPI for better OCR
        images = pdf2image.convert_from_path(
            pdf_path,
            dpi=300,  # Higher DPI for better OCR
            thread_count=4,  # Use multiple threads for faster processing
            grayscale=True  # Convert to grayscale for better OCR
        )
        logger.debug(f"Converted PDF to {len(images)} images")

        # Extract text from each image
        text = ""
        for i, image in enumerate(images):
            logger.debug(f"Processing page {i+1}")
            # Preprocess image for better OCR
            image = image.convert('L')  # Convert to grayscale
            image = image.point(lambda x: 0 if x < 128 else 255, '1')  # Apply threshold
            page_text = pytesseract.image_to_string(image)
            text += page_text + "\n"
            logger.debug(f"Extracted {len(page_text)} characters from page {i+1}")

        # Clean up temporary file
        os.unlink(pdf_path)
        
        if not text.strip():
            raise Exception("No text was extracted from the PDF")
            
        logger.debug(f"Total extracted text length: {len(text)}")
        return text

    except Exception as e:
        logger.error(f"Error in PDF processing: {str(e)}")
        logger.error(traceback.format_exc())
        raise

def parse_invoice(text: str) -> dict:
    """Parse invoice details from extracted text."""
    try:
        # Extract supplier - look for common patterns
        supplier = "Unknown Supplier"
        if "Apple Store" in text:
            supplier = "Apple Store"
        elif "AMART" in text or "Amart" in text:
            supplier = "Amart Furniture"
        elif "BUNNINGS" in text or "Bunnings" in text:
            supplier = "Bunnings"
        elif "OFFICEWORKS" in text or "Officeworks" in text:
            supplier = "Officeworks"
        
        # Extract total amount - look for different patterns
        total_amount = 0.0
        # Pattern 1: Look for "Order Total" or "Total" followed by amount
        total_match = re.search(r'(?:Order Total|Total)\s*\$?\s*([\d,]+\.\d{2})', text, re.IGNORECASE)
        if total_match:
            total_amount = float(total_match.group(1).replace(',', ''))
        else:
            # Pattern 2: Look for amount at the end of line
            total_match = re.search(r'\$([\d,]+\.\d{2})\s*$', text, re.MULTILINE)
            if total_match:
                total_amount = float(total_match.group(1).replace(',', ''))
        
        # Calculate GST (10% of total)
        gst_amount = round(total_amount / 11, 2)
        net_amount = round(total_amount - gst_amount, 2)
        
        # Extract date - look for different date formats
        date_match = re.search(r'(\d{2}/\d{2}/\d{4})', text)
        if not date_match:
            date_match = re.search(r'(\d{2}-\d{2}-\d{4})', text)
        if not date_match:
            date_match = re.search(r'(\d{4}-\d{2}-\d{2})', text)
            
        if date_match:
            date_str = date_match.group(1)
            # Convert from DD/MM/YYYY to YYYY-MM-DD
            if '/' in date_str:
                day, month, year = date_str.split('/')
                invoice_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
            elif '-' in date_str:
                if len(date_str.split('-')[0]) == 4:  # YYYY-MM-DD
                    invoice_date = date_str
                else:  # DD-MM-YYYY
                    day, month, year = date_str.split('-')
                    invoice_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        else:
            invoice_date = datetime.now().strftime('%Y-%m-%d')
        
        # Extract invoice number - look for different patterns
        invoice_number = ""
        invoice_match = re.search(r'(?:Invoice|Order|Sales Order)\s*#?\s*([A-Z0-9-]+)', text, re.IGNORECASE)
        if invoice_match:
            invoice_number = invoice_match.group(1)
        else:
            # Look for reference numbers
            ref_match = re.search(r'Ref:\s*([A-Z0-9-]+)', text, re.IGNORECASE)
            if ref_match:
                invoice_number = ref_match.group(1)
        
        logger.debug(f"Parsed invoice details: supplier={supplier}, total={total_amount}, date={invoice_date}, number={invoice_number}")
        
        return {
            "supplier": supplier,
            "total_amount": total_amount,
            "gst_amount": gst_amount,
            "net_amount": net_amount,
            "invoice_date": invoice_date,
            "invoice_number": invoice_number,
            "raw_text": text
        }
    except Exception as e:
        logger.error(f"Error parsing invoice: {str(e)}")
        raise

@app.post("/process-invoice")
async def process_invoice(file: UploadFile = File(...), invoice_type: str = Form("expense")):
    try:
        # Log file details
        logger.debug(f"Processing invoice - Filename: {file.filename}, Content-Type: {file.content_type}, Type: {invoice_type}")
        
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
            
            # Create invoice object with the provided invoice_type
            invoice = Invoice(
                id=str(uuid.uuid4()),
                supplier=result["supplier"],
                total_amount=result["total_amount"],
                gst_amount=result["gst_amount"],
                net_amount=result["net_amount"],
                invoice_date=result["invoice_date"],
                invoice_number=result.get("invoice_number", ""),
                category="Other",
                gst_eligible=True,
                file_path=file.filename,
                is_system_date=False,
                invoice_type=invoice_type  # Use the provided invoice_type
            )
            
            # Save to database
            if save_invoice(invoice):
                # If this is an expense, also save it to the expenses table
                if invoice_type == "expense":
                    conn = sqlite3.connect('gst-helper.db')
                    c = conn.cursor()
                    
                    # Check if expense already exists
                    c.execute('''
                        SELECT id FROM expenses 
                        WHERE date = ? AND amount = ? AND description = ?
                    ''', (
                        invoice.invoice_date,
                        invoice.total_amount,
                        f"{invoice.supplier} - {invoice.invoice_number}"
                    ))
                    
                    if not c.fetchone():
                        # Insert new expense
                        c.execute('''
                            INSERT INTO expenses (
                                date, amount, gst_amount, description, 
                                category, is_gst_eligible, created_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        ''', (
                            invoice.invoice_date,
                            invoice.total_amount,
                            invoice.gst_amount,
                            f"{invoice.supplier} - {invoice.invoice_number}",
                            invoice.category,
                            invoice.gst_eligible,
                            datetime.now().isoformat()
                        ))
                        conn.commit()
                        logger.debug("Expense saved successfully")
                    else:
                        logger.debug("Expense already exists, skipping")
                    
                    conn.close()
                
                return JSONResponse(content={
                    "success": True,
                    "invoice": invoice.model_dump()
                })
            else:
                return JSONResponse(
                    status_code=400,
                    content={
                        "error": "Duplicate invoice detected",
                        "detail": f"Invoice for supplier {invoice.supplier} with amount {invoice.total_amount} already exists for date {invoice.invoice_date}"
                    }
                )
                
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
async def get_invoices():
    try:
        conn = sqlite3.connect('gst-helper.db')
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, invoice_date, supplier, invoice_number, total_amount, 
                   gst_amount, net_amount, category, gst_eligible, is_system_date, invoice_type
            FROM invoices
            ORDER BY invoice_date DESC
        """)
        rows = cursor.fetchall()
        invoices = []
        for row in rows:
            invoice = {
                "id": row[0],
                "invoice_date": row[1],
                "supplier": row[2],
                "invoice_number": row[3],
                "total_amount": row[4],
                "gst_amount": row[5],
                "net_amount": row[6],
                "category": row[7],
                "gst_eligible": bool(row[8]),
                "is_system_date": bool(row[9]),
                "invoice_type": row[10] or 'expense'  # Default to 'expense' if not specified
            }
            invoices.append(invoice)
        conn.close()
        return {"invoices": invoices}
    except Exception as e:
        logger.error(f"Error fetching invoices: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/invoices")
async def create_invoice(invoice: dict):
    try:
        conn = sqlite3.connect('gst-helper.db')
        cursor = conn.cursor()
        
        # Generate a unique ID if not provided
        invoice_id = invoice.get('id', str(uuid.uuid4()))
        
        # Insert the invoice into the database
        cursor.execute("""
            INSERT INTO invoices (
                id, invoice_date, supplier, invoice_number, total_amount,
                gst_amount, net_amount, category, gst_eligible, is_system_date, invoice_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            invoice_id,
            invoice.get('invoice_date'),
            invoice.get('supplier'),
            invoice.get('invoice_number'),
            invoice.get('total_amount'),
            invoice.get('gst_amount'),
            invoice.get('net_amount'),
            invoice.get('category'),
            invoice.get('gst_eligible', False),
            invoice.get('is_system_date', False),
            invoice.get('invoice_type', 'expense')
        ))
        
        conn.commit()
        conn.close()
        return {"success": True, "id": invoice_id}
    except Exception as e:
        logger.error(f"Error creating invoice: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/expenses")
async def get_expenses_endpoint():
    expenses = get_total_expenses()
    return {
        "total_expenses": expenses["total"],
        "gst_eligible_expenses": expenses["gst_eligible"]
    }

@app.post("/generate-report")
async def generate_report(request: ReportRequest):
    try:
        # Get filtered invoices based on year and quarter
        invoices = get_invoices()
        if request.year:
            invoices = [inv for inv in invoices if inv.invoice_date.startswith(request.year)]
        if request.quarter:
            quarter_start_month = (int(request.quarter) - 1) * 3 + 1
            quarter_end_month = quarter_start_month + 2
            invoices = [
                inv for inv in invoices 
                if quarter_start_month <= int(inv.invoice_date.split('-')[1]) <= quarter_end_month
            ]

        # Create PDF
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        elements = []

        # Add title
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=16,
            spaceAfter=30
        )
        title = f"GST Report - {request.year or 'All Years'} Q{request.quarter or 'All Quarters'}"
        elements.append(Paragraph(title, title_style))
        elements.append(Spacer(1, 12))

        # Add summary
        total_amount = sum(inv.total_amount for inv in invoices)
        gst_amount = sum(inv.gst_amount for inv in invoices)
        net_amount = sum(inv.net_amount for inv in invoices)

        summary_data = [
            ["Total Amount", f"${total_amount:.2f}"],
            ["Total GST", f"${gst_amount:.2f}"],
            ["Net Amount", f"${net_amount:.2f}"]
        ]
        summary_table = Table(summary_data, colWidths=[200, 100])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.lightgrey),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('TEXTCOLOR', (0, 1), (-1, -1), colors.black),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 10),
            ('ALIGN', (0, 1), (-1, -1), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        elements.append(summary_table)
        elements.append(Spacer(1, 20))

        # Add invoice details
        if invoices:
            invoice_data = [["Date", "Supplier", "Invoice #", "Total", "GST", "Net"]]
            for inv in invoices:
                invoice_data.append([
                    inv.invoice_date,
                    inv.supplier,
                    inv.invoice_number,
                    f"${inv.total_amount:.2f}",
                    f"${inv.gst_amount:.2f}",
                    f"${inv.net_amount:.2f}"
                ])

            invoice_table = Table(invoice_data, colWidths=[80, 150, 100, 80, 80, 80])
            invoice_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.white),
                ('TEXTCOLOR', (0, 1), (-1, -1), colors.black),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 1), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            elements.append(invoice_table)
        else:
            elements.append(Paragraph("No invoices found for the selected period.", styles["Normal"]))

        # Build PDF
        doc.build(elements)
        buffer.seek(0)

        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=GST-Report-{request.year or 'All'}-Q{request.quarter or 'All'}.pdf"
            }
        )
    except Exception as e:
        logger.error(f"Error generating report: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Failed to generate report")

@app.post("/cleanup-duplicates")
async def cleanup_duplicates():
    try:
        conn = sqlite3.connect('gst-helper.db')
        c = conn.cursor()
        
        # Find and remove duplicates based on supplier, total_amount, and invoice_date
        c.execute('''
            DELETE FROM invoices 
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM invoices
                GROUP BY supplier, total_amount, invoice_date, category
            )
        ''')
        
        deleted_count = c.rowcount
        conn.commit()
        conn.close()
        
        return JSONResponse(content={
            "success": True,
            "message": f"Removed {deleted_count} duplicate invoices"
        })
    except Exception as e:
        logger.error(f"Error cleaning up duplicates: {str(e)}")
        logger.error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "error": "Failed to clean up duplicates",
                "detail": str(e)
            }
        )

@app.delete("/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str):
    try:
        conn = sqlite3.connect('gst-helper.db')
        c = conn.cursor()
        
        # First check if the invoice exists
        c.execute('SELECT id FROM invoices WHERE id = ?', (str(invoice_id),))
        if not c.fetchone():
            return JSONResponse(
                status_code=404,
                content={"error": "Invoice not found", "detail": f"Invoice with ID {invoice_id} does not exist"}
            )
        
        # Delete the invoice
        c.execute('DELETE FROM invoices WHERE id = ?', (str(invoice_id),))
        conn.commit()
        
        return JSONResponse(content={
            "success": True,
            "message": f"Invoice {invoice_id} deleted successfully"
        })
    except Exception as e:
        logger.error(f"Error deleting invoice: {str(e)}")
        logger.error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "error": "Failed to delete invoice",
                "detail": str(e)
            }
        )
    finally:
        conn.close()

@app.delete("/invoices")
async def delete_all_invoices():
    try:
        conn = sqlite3.connect('gst-helper.db')
        c = conn.cursor()
        
        # Get count before deletion
        c.execute('SELECT COUNT(*) FROM invoices')
        count = c.fetchone()[0]
        
        # Delete all invoices
        c.execute('DELETE FROM invoices')
        conn.commit()
        
        return JSONResponse(content={
            "success": True,
            "message": f"Successfully deleted {count} invoices"
        })
    except Exception as e:
        logger.error(f"Error deleting all invoices: {str(e)}")
        logger.error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "error": "Failed to delete invoices",
                "detail": str(e)
            }
        )
    finally:
        conn.close()

@app.post("/api/expenses")
async def create_expense(expense: Expense):
    try:
        conn = sqlite3.connect('gst-helper.db')
        c = conn.cursor()
        
        # If no date provided, use current date
        if not expense.date:
            expense.date = datetime.now().strftime("%d/%m/%Y")
            
        # Calculate GST amount if not provided
        if expense.gst_amount == 0 and expense.is_gst_eligible:
            expense.gst_amount = round(expense.amount / 11, 2)  # GST is 1/11th of total amount
        
        c.execute('''
            INSERT INTO expenses (date, amount, gst_amount, description, category, is_gst_eligible, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            expense.date,
            expense.amount,
            expense.gst_amount,
            expense.description,
            expense.category,
            expense.is_gst_eligible,
            expense.created_at
        ))
        
        conn.commit()
        expense.id = c.lastrowid
        return {"expense": expense.dict()}
    except Exception as e:
        logger.error(f"Error creating expense: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@app.get("/api/expenses/summary")
async def get_expenses_summary(period: str = "quarter"):
    try:
        conn = sqlite3.connect('gst-helper.db')
        cursor = conn.cursor()
        
        # Calculate date range based on period
        end_date = datetime.now()
        if period == "month":
            start_date = end_date - timedelta(days=30)
        elif period == "quarter":
            start_date = end_date - timedelta(days=90)
        else:  # year
            start_date = end_date - timedelta(days=365)
            
        # Get expenses within the date range
        cursor.execute("""
            SELECT 
                category,
                SUM(amount) as total_amount,
                SUM(gst_amount) as total_gst,
                COUNT(*) as count
            FROM expenses
            WHERE date BETWEEN ? AND ?
            GROUP BY category
        """, (start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')))
        
        category_summary = {}
        total_expenses = 0
        total_gst_claimable = 0
        gst_eligible_expenses = 0
        non_gst_expenses = 0
        
        for row in cursor.fetchall():
            category, total, gst, count = row
            category_summary[category] = {
                "total": total,
                "gst_amount": gst,
                "count": count
            }
            total_expenses += total
            total_gst_claimable += gst
            if gst > 0:
                gst_eligible_expenses += total
            else:
                non_gst_expenses += total
        
        # Get recent expenses
        cursor.execute("""
            SELECT id, date, amount, gst_amount, description, category
            FROM expenses
            WHERE date BETWEEN ? AND ?
            ORDER BY date DESC
            LIMIT 10
        """, (start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')))
        
        recent_expenses = []
        for row in cursor.fetchall():
            recent_expenses.append({
                "id": row[0],
                "date": row[1],
                "amount": row[2],
                "gst_amount": row[3],
                "description": row[4],
                "category": row[5]
            })
        
        return {
            "period": period,
            "start_date": start_date.strftime('%Y-%m-%d'),
            "end_date": end_date.strftime('%Y-%m-%d'),
            "total_expenses": total_expenses,
            "total_gst_claimable": total_gst_claimable,
            "gst_eligible_expenses": gst_eligible_expenses,
            "non_gst_expenses": non_gst_expenses,
            "category_summary": category_summary,
            "expenses": recent_expenses
        }
        
    except Exception as e:
        logger.error(f"Error getting expenses summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
            conn.close()

@app.delete("/api/expenses/clear")
async def clear_expenses():
    try:
        conn = sqlite3.connect('gst-helper.db')
        cursor = conn.cursor()
        cursor.execute("DELETE FROM expenses")
        conn.commit()
        return {"message": "All expenses cleared successfully"}
    except Exception as e:
        logger.error(f"Error clearing expenses: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    # Initialize database
    init_db()
    
    # Start the server
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001) 