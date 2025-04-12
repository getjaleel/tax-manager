from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
from typing import Dict, Any
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

# Enable CORS for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint
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
            return JSONResponse(content=result)
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

if __name__ == "__main__":
    try:
        logger.info("Starting server on 0.0.0.0:8000")
        uvicorn.run(app, host="0.0.0.0", port=8000, log_level="debug")
    except Exception as e:
        logger.error(f"Failed to start server: {str(e)}")
        logger.error(traceback.format_exc())
        sys.exit(1) 