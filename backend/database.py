import sqlite3
import os
from typing import Optional
from log import logger
from datetime import datetime
import logging
from typing import List, Dict, Any
from passlib.context import CryptContext

DATABASE_PATH = "tax_manager.db"

# Initialize password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate_db():
    """Migrate the database to the latest schema."""
    try:
        conn = sqlite3.connect(DATABASE_PATH)
        c = conn.cursor()
        
        # First, ensure all tables exist
        init_db()
        
        # Now perform migrations
        
        # Check if users table needs migration
        c.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in c.fetchall()]
        
        # Add name column if it doesn't exist
        if 'name' not in columns:
            c.execute('ALTER TABLE users ADD COLUMN name TEXT')
            logger.info("Added name column to users table")
        
        # Check if invoices table needs migration
        c.execute("PRAGMA table_info(invoices)")
        columns = [col[1] for col in c.fetchall()]
        
        # Add missing columns to invoices table
        if 'supplier' not in columns:
            c.execute('ALTER TABLE invoices ADD COLUMN supplier TEXT')
        if 'total_amount' not in columns:
            c.execute('ALTER TABLE invoices ADD COLUMN total_amount REAL')
        if 'gst_amount' not in columns:
            c.execute('ALTER TABLE invoices ADD COLUMN gst_amount REAL')
        if 'net_amount' not in columns:
            c.execute('ALTER TABLE invoices ADD COLUMN net_amount REAL')
        if 'invoice_date' not in columns:
            c.execute('ALTER TABLE invoices ADD COLUMN invoice_date TEXT')
        if 'invoice_number' not in columns:
            c.execute('ALTER TABLE invoices ADD COLUMN invoice_number TEXT')
        if 'category' not in columns:
            c.execute('ALTER TABLE invoices ADD COLUMN category TEXT DEFAULT "Other"')
        if 'gst_eligible' not in columns:
            c.execute('ALTER TABLE invoices ADD COLUMN gst_eligible BOOLEAN DEFAULT TRUE')
        if 'file_path' not in columns:
            c.execute('ALTER TABLE invoices ADD COLUMN file_path TEXT')
        if 'is_system_date' not in columns:
            c.execute('ALTER TABLE invoices ADD COLUMN is_system_date BOOLEAN DEFAULT FALSE')
        if 'invoice_type' not in columns:
            c.execute('ALTER TABLE invoices ADD COLUMN invoice_type TEXT DEFAULT "expense"')
        if 'status' not in columns:
            c.execute('ALTER TABLE invoices ADD COLUMN status TEXT DEFAULT "pending"')
        
        logger.info("Updated invoices table schema")
        
        # Check if tax_calculations table needs migration
        c.execute("PRAGMA table_info(tax_calculations)")
        columns = [col[1] for col in c.fetchall()]
        
        # Add missing columns to tax_calculations table
        if 'income' not in columns:
            c.execute('ALTER TABLE tax_calculations ADD COLUMN income REAL')
        if 'expenses' not in columns:
            c.execute('ALTER TABLE tax_calculations ADD COLUMN expenses REAL')
        if 'gst_collected' not in columns:
            c.execute('ALTER TABLE tax_calculations ADD COLUMN gst_collected REAL')
        if 'gst_paid' not in columns:
            c.execute('ALTER TABLE tax_calculations ADD COLUMN gst_paid REAL')
        if 'net_gst' not in columns:
            c.execute('ALTER TABLE tax_calculations ADD COLUMN net_gst REAL')
        if 'taxable_income' not in columns:
            c.execute('ALTER TABLE tax_calculations ADD COLUMN taxable_income REAL')
        if 'tax_payable' not in columns:
            c.execute('ALTER TABLE tax_calculations ADD COLUMN tax_payable REAL')
        if 'user_id' not in columns:
            c.execute('ALTER TABLE tax_calculations ADD COLUMN user_id INTEGER')
        
        conn.commit()
        logger.info("Database migration completed successfully")
    except Exception as e:
        logger.error(f"Error migrating database: {str(e)}")
        raise
    finally:
        conn.close()

def init_db():
    """Initialize the database with required tables."""
    try:
        conn = sqlite3.connect(DATABASE_PATH)
        cursor = conn.cursor()

        # Create users table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                first_name TEXT,
                last_name TEXT,
                name TEXT,
                google_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Create invoices table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS invoices (
                id TEXT PRIMARY KEY,
                supplier TEXT NOT NULL,
                total_amount REAL NOT NULL,
                gst_amount REAL NOT NULL,
                net_amount REAL NOT NULL,
                invoice_date TEXT NOT NULL,
                invoice_number TEXT,
                category TEXT DEFAULT 'Other',
                gst_eligible BOOLEAN DEFAULT TRUE,
                file_path TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_system_date BOOLEAN DEFAULT FALSE,
                invoice_type TEXT DEFAULT 'expense',
                status TEXT DEFAULT 'pending',
                user_id INTEGER,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')

        # Create tax_calculations table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS tax_calculations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                income REAL NOT NULL,
                total_deductions REAL NOT NULL,
                taxable_income REAL NOT NULL,
                tax_payable REAL NOT NULL,
                tax_savings REAL NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')

        conn.commit()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Error initializing database: {str(e)}")
        raise
    finally:
        conn.close()

def get_db():
    """Get a database connection."""
    try:
        conn = sqlite3.connect(DATABASE_PATH)
        conn.row_factory = sqlite3.Row
        return conn
    except Exception as e:
        logger.error(f"Error connecting to database: {str(e)}")
        raise

def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Get a user by email."""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM users WHERE email = ?', (email,))
        user = cursor.fetchone()
        
        if user:
            return dict(user)
        return None
    except Exception as e:
        logger.error(f"Error getting user: {str(e)}")
        raise
    finally:
        conn.close()

def create_user(email: str, password: str, first_name: str = None, last_name: str = None) -> Dict[str, Any]:
    """Create a new user."""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Hash the password
        password_hash = pwd_context.hash(password)
        
        # Combine first_name and last_name into name if they exist
        name = None
        if first_name or last_name:
            name = f"{first_name or ''} {last_name or ''}".strip()
        
        cursor.execute('''
            INSERT INTO users (email, password_hash, first_name, last_name, name)
            VALUES (?, ?, ?, ?, ?)
        ''', (email, password_hash, first_name, last_name, name))
        
        conn.commit()
        
        # Get the created user
        cursor.execute('SELECT * FROM users WHERE id = ?', (cursor.lastrowid,))
        user = dict(cursor.fetchone())
        
        # Remove sensitive data
        del user['password_hash']
        
        return user
    except sqlite3.IntegrityError:
        raise ValueError("Email already exists")
    except Exception as e:
        logger.error(f"Error creating user: {str(e)}")
        raise
    finally:
        conn.close()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)

def get_user_tax_calculations(email: str) -> list:
    """Get all tax calculations for a user by email."""
    conn = get_db()
    cursor = conn.cursor()
    
    # First get the user ID from email
    cursor.execute('SELECT id FROM users WHERE email = ?', (email,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return []
    
    user_id = user[0]
    
    # Then get the calculations
    cursor.execute('SELECT * FROM tax_calculations WHERE user_id = ? ORDER BY created_at DESC', (user_id,))
    calculations = cursor.fetchall()
    conn.close()
    
    return [{
        'id': calc[0],
        'user_id': calc[1],
        'name': calc[2],
        'annual_income': calc[3],
        'deductions': calc[4],
        'income': calc[5],
        'expenses': calc[6],
        'gst_collected': calc[7],
        'gst_paid': calc[8],
        'net_gst': calc[9],
        'taxable_income': calc[10],
        'tax_payable': calc[11],
        'created_at': calc[12],
        'updated_at': calc[13]
    } for calc in calculations]

def save_tax_calculation(
    email: str,
    name: str,
    annual_income: float,
    deductions: str,
    income: float,
    expenses: float,
    gst_collected: float,
    gst_paid: float,
    net_gst: float,
    taxable_income: float,
    tax_payable: float
) -> dict:
    """Save a tax calculation for a user by email."""
    conn = get_db()
    cursor = conn.cursor()
    
    # First get the user ID from email
    cursor.execute('SELECT id FROM users WHERE email = ?', (email,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        raise ValueError("User not found")
    
    user_id = user[0]
    
    # Save the calculation
    cursor.execute('''
        INSERT INTO tax_calculations 
        (user_id, name, annual_income, deductions, income, expenses, gst_collected, 
         gst_paid, net_gst, taxable_income, tax_payable)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        user_id, name, annual_income, deductions, income, expenses, 
        gst_collected, gst_paid, net_gst, taxable_income, tax_payable
    ))
    
    calculation_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return {
        'id': calculation_id,
        'user_id': user_id,
        'name': name,
        'annual_income': annual_income,
        'deductions': deductions,
        'income': income,
        'expenses': expenses,
        'gst_collected': gst_collected,
        'gst_paid': gst_paid,
        'net_gst': net_gst,
        'taxable_income': taxable_income,
        'tax_payable': tax_payable
    } 