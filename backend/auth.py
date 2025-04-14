from fastapi import FastAPI, HTTPException, Depends, Request, Body, APIRouter, status
from fastapi.security import OAuth2AuthorizationCodeBearer, OAuth2PasswordBearer, OAuth2PasswordRequestForm
from google.oauth2 import id_token
from google.auth.transport import requests
import os
from dotenv import load_dotenv
import jwt
from datetime import datetime, timedelta
import logging
import requests as http_requests
from database import get_user_by_email, create_user, verify_password
import traceback
from pydantic import BaseModel
from typing import Optional
from jose import JWTError

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# OAuth2 settings
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET')
JWT_SECRET = os.getenv('JWT_SECRET')
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REDIRECT_URI = "http://localhost:3000/auth/callback"

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

router = APIRouter()

class AuthCallbackRequest(BaseModel):
    code: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

class UserCreate(BaseModel):
    email: str
    password: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None

class User(BaseModel):
    id: int
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except JWTError:
        raise credentials_exception
    user = get_user_by_email(email=token_data.email)
    if user is None:
        raise credentials_exception
    return user

def get_google_auth_url():
    """Generate Google OAuth URL."""
    return f"https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id={GOOGLE_CLIENT_ID}&redirect_uri={REDIRECT_URI}&scope=openid%20profile%20email&access_type=offline"

async def handle_google_callback(request: AuthCallbackRequest):
    """Handle Google OAuth callback and create/update user."""
    try:
        # Exchange code for tokens
        token_url = "https://oauth2.googleapis.com/token"
        data = {
            "code": request.code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": REDIRECT_URI,
            "grant_type": "authorization_code",
        }
        
        headers = {
            "Content-Type": "application/x-www-form-urlencoded"
        }
        
        logger.info("Exchanging code for tokens...")
        
        response = http_requests.post(
            token_url,
            data=data,
            headers=headers
        )
        
        if not response.ok:
            error_detail = response.json().get('error_description', 'Unknown error')
            logger.error(f"Token exchange failed: {error_detail}")
            logger.error(f"Response status: {response.status_code}")
            logger.error(f"Response body: {response.text}")
            raise HTTPException(
                status_code=400,
                detail=f"Token exchange failed: {error_detail}"
            )
            
        tokens = response.json()
        logger.info("Successfully exchanged code for tokens")
        
        # Get user info from Google
        idinfo = id_token.verify_oauth2_token(
            tokens["id_token"], 
            requests.Request(), 
            GOOGLE_CLIENT_ID
        )
        logger.info(f"Successfully verified ID token for user: {idinfo['email']}")
        
        # Check if user exists
        user = get_user_by_email(idinfo["email"])
        if not user:
            logger.info(f"Creating new user: {idinfo['email']}")
            # Create new user
            user = create_user(
                email=idinfo["email"],
                name=idinfo.get("name", ""),
                google_id=idinfo["sub"]
            )
        else:
            logger.info(f"User already exists: {idinfo['email']}")
        
        # Create JWT token
        access_token = create_access_token({"sub": user["email"]})
        logger.info("Successfully created JWT token")
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user["id"],
                "email": user["email"],
                "name": user["name"]
            }
        }
    except Exception as e:
        logger.error(f"Error in Google callback: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=400, 
            detail=f"Authentication failed: {str(e)}"
        )

async def get_user_profile(email: str):
    """Get user profile by email."""
    try:
        user = get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"]
        }
    except Exception as e:
        logger.error(f"Error getting user profile: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get user profile")

@router.post("/signup", response_model=User)
async def signup(user_data: UserCreate):
    try:
        user = create_user(
            email=user_data.email,
            password=user_data.password,
            first_name=user_data.first_name,
            last_name=user_data.last_name
        )
        return user
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error during signup: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred during signup"
        )

@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    try:
        logger.info(f"Login attempt for user: {form_data.username}")
        user = get_user_by_email(form_data.username)
        if not user:
            logger.warning(f"Login failed: User not found - {form_data.username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        if not verify_password(form_data.password, user["password_hash"]):
            logger.warning(f"Login failed: Invalid password for user - {form_data.username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user["email"]}, expires_delta=access_token_expires
        )
        logger.info(f"Login successful for user: {form_data.username}")
        return {"access_token": access_token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred during login"
        ) 