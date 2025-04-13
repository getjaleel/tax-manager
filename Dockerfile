# Build stage for frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm install

# Copy frontend source
COPY frontend/ .

# Build frontend
RUN npm run build

# Backend stage
FROM python:3.9-slim

WORKDIR /app

# Install system dependencies including Node.js
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    poppler-utils \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app

# Copy backend requirements
COPY backend/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ .

# Copy built frontend from frontend-builder
COPY --from=frontend-builder /app/frontend/build /app/frontend/build

# Create necessary directories and set permissions
RUN mkdir -p /app/uploads /app/logs /app/db && \
    chown -R appuser:appuser /app/uploads /app/logs /app/db && \
    chmod 755 /app/db && \
    touch /app/db/gst-helper.db && \
    chown appuser:appuser /app/db/gst-helper.db && \
    chmod 644 /app/db/gst-helper.db

# Install serve globally
RUN npm install -g serve

# Create startup script
RUN echo '#!/bin/bash\n\
cd /app\n\
python main.py --host 0.0.0.0 --port 8001 &\n\
cd /app/frontend\n\
serve -s build -l tcp://0.0.0.0:3000\n\
' > /app/start.sh && chmod +x /app/start.sh

# Switch to non-root user
USER appuser

# Expose ports
EXPOSE 8001 3000

# Start both services
CMD ["/app/start.sh"] 