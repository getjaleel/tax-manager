#!/bin/bash

# Set environment variables for HTTPS
export HTTPS=true
export SSL_CRT_FILE=../backend/certs/cert.pem
export SSL_KEY_FILE=../backend/certs/key.pem

# Start the development server
npm start 