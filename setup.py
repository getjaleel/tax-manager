import subprocess
import sys

def install_dependencies():
    required_packages = [
        'flask',
        'pytesseract',
        'Pillow',
        'python-magic'
    ]
    
    for package in required_packages:
        try:
            __import__(package)
        except ImportError:
            print(f"Installing {package}...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", package])

if __name__ == "__main__":
    install_dependencies()
    print("All dependencies installed successfully!") 