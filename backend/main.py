from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Depends, Request, Body
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
import shutil
from pathlib import Path
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from database import init_db, get_db, create_user, get_user_by_email, verify_password, migrate_db
from auth import router as auth_router
from ssl_config import get_uvicorn_ssl_config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('gst_helper')

# Initialize FastAPI app
app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://localhost:3000",
        "http://localhost:3000",
        "https://192.168.1.122:3000",
        "http://192.168.1.122:3000"
    ],  # Allow both HTTP and HTTPS from localhost and IP
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Include auth routes
app.include_router(auth_router, prefix="/auth", tags=["auth"])

# Get configuration from environment variables
UPLOAD_DIR = os.getenv('UPLOAD_DIR', 'uploads')
DB_DIR = os.getenv('DB_DIR', 'db')
HOST = os.getenv('HOST', '0.0.0.0')
PORT = int(os.getenv('PORT', '8000'))

@app.on_event("startup")
async def startup_event():
    """Initialize database on startup."""
    try:
        from database import init_db, migrate_db
        init_db()
        migrate_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Error initializing database: {str(e)}")
        logger.error(traceback.format_exc())
        raise

# Pydantic models
class Invoice(BaseModel):
    id: str
    supplier: str
    total_amount: float
    gst_amount: float
    net_amount: float
    invoice_date: str
    invoice_number: str = ""
    category: str = "Other"
    gst_eligible: bool = True
    file_path: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    is_system_date: bool = False
    invoice_type: str = "expense"
    status: str = "pending"

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

class TaxCalculation(BaseModel):
    id: Optional[int] = None
    name: str
    annual_income: float
    deductions: List[Dict[str, Any]]
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

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
    conn = None
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
             invoice_number, category, gst_eligible, file_path, created_at, updated_at, is_system_date, invoice_type, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            invoice.created_at,
            invoice.updated_at,
            invoice.is_system_date,
            invoice.invoice_type,
            invoice.status
        ))
        
        conn.commit()
        return True
    except Exception as e:
        logger.error(f"Error saving invoice: {str(e)}")
        logger.error(traceback.format_exc())
        return False
    finally:
        if conn:
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
                    created_at=row[10],
                    updated_at=row[11],
                    is_system_date=bool(row[12]),
                    invoice_type=row[13] or 'expense',  # Default to 'expense' if not specified
                    status=row[14] or 'pending'  # Default to 'pending' if not specified
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
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=400, detail=f"Failed to parse invoice: {str(e)}")

@app.post("/process-invoice")
@app.post("/process-invoice/{invoice_id}")
async def process_invoice(
    invoice_id: Optional[str] = None,
    file: UploadFile = File(...),
    invoice_type: str = Form("expense")
):
    try:
        # Generate invoice_id if not provided
        if not invoice_id:
            invoice_id = str(uuid.uuid4())
            
        # Log file details
        logger.debug(f"Processing invoice {invoice_id} - Filename: {file.filename}, Content-Type: {file.content_type}, Type: {invoice_type}")
        
        # Validate file type
        allowed_types = ['image/jpeg', 'image/png', 'image/tiff', 'application/pdf']
        if file.content_type not in allowed_types:
            logger.error(f"Invalid file type: {file.content_type}")
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {file.content_type}. Supported types are: {', '.join(allowed_types)}"
            )
        
        # Read file content
        contents = await file.read()
        if not contents:
            logger.error("Empty file received")
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
                    "detail": str(e)
                }
            )
        
        # Parse invoice
        try:
            result = parse_invoice(text)
            logger.debug(f"Parsing result: {json.dumps(result, indent=2)}")
            
            # Create invoice object with the provided invoice_type
            invoice = Invoice(
                id=invoice_id,
                supplier=result["supplier"],
                total_amount=result["total_amount"],
                gst_amount=result["gst_amount"],
                net_amount=result["net_amount"],
                invoice_date=result["invoice_date"],
                invoice_number=result.get("invoice_number", ""),
                category="Other",
                gst_eligible=True,
                file_path=file.filename,
                created_at=datetime.now().isoformat(),
                updated_at=datetime.now().isoformat(),
                is_system_date=False,
                invoice_type=invoice_type,
                status='pending'
            )
            
            # Save to database
            if save_invoice(invoice):
                return JSONResponse(content={
                    "success": True,
                    "invoice": invoice.dict()
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
            logger.error(traceback.format_exc())
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Failed to parse invoice",
                    "detail": str(e)
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
                "detail": str(e)
            }
        )

@app.get("/api/invoices")
async def get_invoices_endpoint(status: str = None):
    try:
        logger.info("Fetching invoices from database")
        conn = sqlite3.connect('gst-helper.db')
        c = conn.cursor()
        
        if status:
            c.execute('SELECT * FROM invoices WHERE status = ?', (status,))
        else:
            c.execute('SELECT * FROM invoices')
            
        invoices = []
        for row in c.fetchall():
            invoice = {
                'id': row[0],
                'supplier': row[1],
                'invoice_date': row[2],
                'total_amount': row[3],
                'gst_amount': row[4],
                'invoice_number': row[5],
                'category': row[6],
                'gst_eligible': bool(row[7]),
                'file_path': row[8],
                'created_at': row[9],
                'updated_at': row[10],
                'is_system_date': bool(row[11]),
                'invoice_type': row[12]
            }
            if status:
                invoice['status'] = status
            else:
                invoice['status'] = 'pending'
            invoices.append(invoice)
            
        return {"invoices": invoices}
        
    except Exception as e:
        logger.error(f"Error getting invoices: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@app.post("/api/invoices")
async def create_invoice(invoice: dict):
    try:
        # Convert the dict to an Invoice object
        invoice_obj = Invoice(**invoice)
        
        # Save the invoice to the database
        if save_invoice(invoice_obj):
            return {"success": True, "message": "Invoice saved successfully"}
        else:
            raise HTTPException(status_code=400, detail="Failed to save invoice")
    except Exception as e:
        logger.error(f"Error creating invoice: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/expenses")
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

@app.delete("/api/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str):
    try:
        conn = sqlite3.connect('gst-helper.db')
        c = conn.cursor()
        
        # Check if invoice exists
        c.execute('SELECT file_path FROM invoices WHERE id = ?', (invoice_id,))
        result = c.fetchone()
        
        if not result:
            raise HTTPException(status_code=404, detail="Invoice not found")
            
        file_path = result[0]
        
        # Delete the invoice from database
        c.execute('DELETE FROM invoices WHERE id = ?', (invoice_id,))
        conn.commit()
        
        # Delete the associated file if it exists
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
            
        return {"success": True, "message": "Invoice deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting invoice: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@app.delete("/api/invoices")
async def delete_all_invoices():
    try:
        conn = sqlite3.connect('gst-helper.db')
        c = conn.cursor()
        
        # Get all file paths before deleting
        c.execute('SELECT file_path FROM invoices')
        file_paths = [row[0] for row in c.fetchall() if row[0]]
        
        # Delete all records from the database
        c.execute('DELETE FROM invoices')
        conn.commit()
        
        # Delete all associated files
        for file_path in file_paths:
            if os.path.exists(file_path):
                os.remove(file_path)
                
        return {"success": True, "message": "All invoices deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting all invoices: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
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
        c = conn.cursor()
        
        # Calculate date range based on period
        end_date = datetime.now()
        if period == "month":
            start_date = end_date - timedelta(days=30)
        elif period == "quarter":
            start_date = end_date - timedelta(days=90)
        else:  # year
            start_date = end_date - timedelta(days=365)
            
        # Get expenses within date range
        c.execute('''
            SELECT id, date, amount, gst_amount, description, category, is_gst_eligible
            FROM expenses
            WHERE date BETWEEN ? AND ?
        ''', (start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')))
        
        expenses = c.fetchall()
        
        # Calculate totals
        total_expenses = sum(exp[2] for exp in expenses)  # amount
        total_gst_claimable = sum(exp[3] for exp in expenses)  # gst_amount
        gst_eligible_expenses = sum(exp[2] for exp in expenses if exp[6])  # amount where is_gst_eligible
        non_gst_expenses = sum(exp[2] for exp in expenses if not exp[6])  # amount where not is_gst_eligible
        
        # Calculate category summary
        category_summary = {}
        for exp in expenses:
            category = exp[5]  # category
            amount = exp[2]  # amount
            gst_amount = exp[3]  # gst_amount
            
            if category not in category_summary:
                category_summary[category] = {
                    "total": 0,
                    "gst_amount": 0,
                    "count": 0
                }
                
            category_summary[category]["total"] += amount
            category_summary[category]["gst_amount"] += gst_amount
            category_summary[category]["count"] += 1
        
        # Format expenses for response
        formatted_expenses = [
            {
                "id": exp[0],
                "date": exp[1],
                "amount": exp[2],
                "gst_amount": exp[3],
                "description": exp[4],
                "category": exp[5]
            }
            for exp in expenses
        ]
        
        return {
            "total_expenses": total_expenses,
            "total_gst_claimable": total_gst_claimable,
            "gst_eligible_expenses": gst_eligible_expenses,
            "non_gst_expenses": non_gst_expenses,
            "category_summary": category_summary,
            "expenses": formatted_expenses
        }
        
    except Exception as e:
        logger.error(f"Error getting expenses summary: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
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

@app.get("/api/tax-calculations")
async def get_tax_calculations():
    try:
        conn = sqlite3.connect('gst-helper.db')
        c = conn.cursor()
        
        c.execute('''
            SELECT id, name, annual_income, deductions, created_at, updated_at
            FROM tax_calculations
            ORDER BY created_at DESC
        ''')
        
        calculations = []
        for row in c.fetchall():
            calculations.append({
                'id': row[0],
                'name': row[1],
                'annual_income': row[2],
                'deductions': json.loads(row[3]),
                'created_at': row[4],
                'updated_at': row[5]
            })
        
        return calculations
    except Exception as e:
        logger.error(f"Error fetching tax calculations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@app.get("/api/tax-calculations/{calculation_id}")
async def get_tax_calculation(calculation_id: int):
    try:
        conn = sqlite3.connect('gst-helper.db')
        c = conn.cursor()
        
        c.execute('''
            SELECT id, name, annual_income, deductions, created_at, updated_at
            FROM tax_calculations
            WHERE id = ?
        ''', (calculation_id,))
        
        row = c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Calculation not found")
        
        return {
            'id': row[0],
            'name': row[1],
            'annual_income': row[2],
            'deductions': json.loads(row[3]),
            'created_at': row[4],
            'updated_at': row[5]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching tax calculation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@app.post("/api/tax-calculations")
async def create_tax_calculation(calculation: TaxCalculation):
    try:
        conn = sqlite3.connect('gst-helper.db')
        c = conn.cursor()
        
        c.execute('''
            INSERT INTO tax_calculations (name, annual_income, deductions)
            VALUES (?, ?, ?)
        ''', (
            calculation.name,
            calculation.annual_income,
            json.dumps(calculation.deductions)
        ))
        
        conn.commit()
        calculation_id = c.lastrowid
        
        return {
            'id': calculation_id,
            'name': calculation.name,
            'annual_income': calculation.annual_income,
            'deductions': calculation.deductions,
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error creating tax calculation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@app.put("/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, invoice: dict):
    try:
        conn = sqlite3.connect('gst-helper.db')
        c = conn.cursor()
        
        # First check if the invoice exists
        c.execute('SELECT id FROM invoices WHERE id = ?', (str(invoice_id),))
        if not c.fetchone():
            return JSONResponse(
                status_code=404,
                content={
                    "error": "Invoice not found",
                    "detail": f"Invoice with ID {invoice_id} does not exist",
                    "code": "INVOICE_NOT_FOUND"
                }
            )
        
        # Validate required fields
        required_fields = ['supplier', 'total_amount', 'gst_amount', 'net_amount', 'invoice_date']
        missing_fields = [field for field in required_fields if field not in invoice]
        if missing_fields:
            return JSONResponse(
                status_code=400,
                content={
                    "error": "Missing required fields",
                    "detail": f"The following fields are required: {', '.join(missing_fields)}",
                    "code": "MISSING_FIELDS"
                }
            )
        
        # Validate data types
        try:
            total_amount = float(invoice['total_amount'])
            gst_amount = float(invoice['gst_amount'])
            net_amount = float(invoice['net_amount'])
            
            # Basic validation
            if total_amount < 0 or gst_amount < 0 or net_amount < 0:
                return JSONResponse(
                    status_code=400,
                    content={
                        "error": "Invalid amount",
                        "detail": "Amounts cannot be negative",
                        "code": "INVALID_AMOUNT"
                    }
                )
            
            # Validate date format
            try:
                datetime.strptime(invoice['invoice_date'], '%Y-%m-%d')
            except ValueError:
                return JSONResponse(
                    status_code=400,
                    content={
                        "error": "Invalid date format",
                        "detail": "Date must be in YYYY-MM-DD format",
                        "code": "INVALID_DATE_FORMAT"
                    }
                )
            
        except ValueError:
            return JSONResponse(
                status_code=400,
                content={
                    "error": "Invalid data type",
                    "detail": "Amount fields must be valid numbers",
                    "code": "INVALID_DATA_TYPE"
                }
            )
        
        # Update the invoice
        c.execute('''
            UPDATE invoices 
            SET supplier = ?,
                total_amount = ?,
                gst_amount = ?,
                net_amount = ?,
                invoice_date = ?,
                invoice_number = ?,
                category = ?,
                gst_eligible = ?,
                updated_at = ?
            WHERE id = ?
        ''', (
            invoice.get('supplier'),
            total_amount,
            gst_amount,
            net_amount,
            invoice.get('invoice_date'),
            invoice.get('invoice_number', ''),
            invoice.get('category', 'Other'),
            invoice.get('gst_eligible', True),
            datetime.now().isoformat(),
            str(invoice_id)
        ))
        
        conn.commit()
        
        # Fetch the updated invoice
        c.execute('''
            SELECT id, supplier, total_amount, gst_amount, net_amount, 
                   invoice_date, invoice_number, category, gst_eligible, 
                   created_at, updated_at, is_system_date, invoice_type, status
            FROM invoices 
            WHERE id = ?
        ''', (str(invoice_id),))
        
        updated_invoice = c.fetchone()
        
        return JSONResponse(content={
            "success": True,
            "message": f"Invoice {invoice_id} updated successfully",
            "invoice": {
                "id": updated_invoice[0],
                "supplier": updated_invoice[1],
                "total_amount": updated_invoice[2],
                "gst_amount": updated_invoice[3],
                "net_amount": updated_invoice[4],
                "invoice_date": updated_invoice[5],
                "invoice_number": updated_invoice[6],
                "category": updated_invoice[7],
                "gst_eligible": bool(updated_invoice[8]),
                "created_at": updated_invoice[9],
                "updated_at": updated_invoice[10],
                "is_system_date": bool(updated_invoice[11]),
                "invoice_type": updated_invoice[12],
                "status": updated_invoice[13]
            }
        })
    except Exception as e:
        logger.error(f"Error updating invoice: {str(e)}")
        logger.error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "error": "Failed to update invoice",
                "detail": str(e),
                "code": "INTERNAL_SERVER_ERROR"
            }
        )
    finally:
        conn.close()

if __name__ == "__main__":
    # Initialize database
    init_db()
    migrate_db()
    
    # Get SSL configuration
    ssl_config = get_uvicorn_ssl_config()
    
    # Start the server with HTTPS
    uvicorn.run(
        "main:app",
        host=HOST,
        port=PORT,
        **ssl_config,
        reload=True
    ) 