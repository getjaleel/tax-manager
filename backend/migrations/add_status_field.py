import sqlite3
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def add_status_field():
    """Add status field to invoices table"""
    try:
        conn = sqlite3.connect('gst-helper.db')
        c = conn.cursor()
        
        # Add status column if it doesn't exist
        c.execute('''
            ALTER TABLE invoices 
            ADD COLUMN status TEXT DEFAULT 'pending'
        ''')
        
        # Update existing records to have 'processed' status
        c.execute('''
            UPDATE invoices 
            SET status = 'processed' 
            WHERE status IS NULL
        ''')
        
        conn.commit()
        logger.info("Successfully added status field to invoices table")
        
    except Exception as e:
        logger.error(f"Error adding status field: {str(e)}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    add_status_field() 