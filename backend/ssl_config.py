import os
import ssl

# SSL Configuration
SSL_CERT = os.getenv('SSL_CERT', 'certs/cert.pem')
SSL_KEY = os.getenv('SSL_KEY', 'certs/key.pem')

def get_ssl_context():
    """Create and return SSL context with self-signed certificate"""
    ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_context.load_cert_chain(SSL_CERT, SSL_KEY)
    return ssl_context

def get_uvicorn_ssl_config():
    """Return SSL configuration for uvicorn"""
    return {
        "ssl_keyfile": SSL_KEY,
        "ssl_certfile": SSL_CERT
    } 