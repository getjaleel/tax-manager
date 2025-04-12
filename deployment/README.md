# Tax Manager Deployment Guide

## Prerequisites
- Docker installed
- Docker Compose installed

## Deployment Steps

1. Copy all files from this directory to your target machine:
   ```
   deployment/
   ├── docker-compose.yml
   ├── backend/
   │   ├── Dockerfile
   │   └── requirements.txt
   └── frontend/
       ├── Dockerfile
       ├── nginx.conf
       ├── package.json
       ├── package-lock.json
       ├── tsconfig.json
       ├── public/
       │   ├── index.html
       │   ├── favicon.ico
       │   └── manifest.json
       └── src/
           ├── App.tsx
           ├── App.css
           ├── index.tsx
           ├── components/
           ├── services/
           └── types/
   ```

2. Navigate to the deployment directory:
   ```bash
   cd deployment
   ```

3. Pull the Docker images:
   ```bash
   docker-compose pull
   ```

4. Start the services:
   ```bash
   docker-compose up -d
   ```

## Accessing the Application
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000

## Available Docker Images
- Backend: `getjaleel/tax-manager-backend:latest`
- Frontend: `getjaleel/tax-manager-frontend:latest`

## Port Configuration
- Frontend: Host port 3000 → Container port 80
- Backend: Host port 8000 → Container port 8000

## Environment Variables
- `REACT_APP_API_URL`: Backend API URL (default: http://localhost:8000)
- `NODE_ENV`: Environment (production/development)

## Required Files
- `backend/requirements.txt`: Python dependencies for the backend
- `frontend/package.json`: Node.js dependencies for the frontend
- `frontend/package-lock.json`: Lock file for Node.js dependencies
- `frontend/tsconfig.json`: TypeScript configuration
- `frontend/public/`: Static files for the frontend
- `frontend/src/`: React source code
  - `App.tsx`: Main application component
  - `App.css`: Main stylesheet
  - `index.tsx`: Application entry point
  - `components/`: React components
  - `services/`: API services
  - `types/`: TypeScript type definitions
- `backend/main.py`: Python script for the backend
- `backend/start_server.sh`: Shell script to start the backend server

## Troubleshooting
1. Check container status:
   ```