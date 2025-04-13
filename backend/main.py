from fastapi import FastAPI, UploadFile, File, HTTPException
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
from datetime import datetime
from pydantic import BaseModel
import sqlite3
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
import uuid

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
        # Check if database exists and drop it
        if os.path.exists('gst-helper.db'):
            os.remove('gst-helper.db')
            logger.info("Removed existing database file")
        
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
                is_system_date INTEGER DEFAULT 0
            )
        ''')
        
        # Create expenses table
        c.execute('''
            CREATE TABLE IF NOT EXISTS expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT,
                amount REAL,
                description TEXT,
                category TEXT,
                is_gst_eligible INTEGER,
                created_at TEXT
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
    is_system_date: bool

class Expense(BaseModel):
    id: str
    invoice_id: str
    amount: float
    gst_amount: float
    category: str
    description: str
    date: str

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
             invoice_number, category, gst_eligible, file_path, created_at, updated_at, is_system_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            invoice.is_system_date
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
                    is_system_date=bool(row[10])
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
            gst_eligible=True,  # Default to true, can be updated later
            is_system_date=False  # Default to false
        )
        
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
                   gst_amount, net_amount, category, gst_eligible, is_system_date
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
                "is_system_date": bool(row[9])
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
                gst_amount, net_amount, category, gst_eligible, is_system_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            invoice.get('is_system_date', False)
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

if __name__ == "__main__":
    try:
        logger.info("Starting server on 0.0.0.0:8000")
        uvicorn.run(app, host="0.0.0.0", port=8000, log_level="debug")
    except Exception as e:
        logger.error(f"Failed to start server: {str(e)}")
        logger.error(traceback.format_exc())
        sys.exit(1) 