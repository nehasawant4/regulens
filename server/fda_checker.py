import os
import requests
import re
from datetime import datetime
import time
import random

# Configuration
FDA_PAGE_URL = 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/core-patient-reported-outcomes-cancer-clinical-trials'
PDF_DOWNLOAD_URL = 'https://www.fda.gov/media/149994/download'
STORED_DATE_FILE = 'stored_upload_date.txt'

def fetch_upload_date():
    """Fetch the date with proper headers to avoid being blocked."""
    try:
        # Use headers that mimic a real browser
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': 'https://www.fda.gov/',
            'Connection': 'keep-alive',
            'Cache-Control': 'max-age=0'
        }
        
        # Add a random delay to mimic human behavior
        time.sleep(random.uniform(1, 3))
        
        response = requests.get(FDA_PAGE_URL, headers=headers, timeout=15)
        response.raise_for_status()
        
        # Look for the date pattern in the "Content current as of" section
        date_pattern = r'Content current as of:?\s*(\d{1,2}/\d{1,2}/\d{4})'
        match = re.search(date_pattern, response.text)
        
        if match:
            return match.group(1).strip()
        else:
            # If pattern not found, use the date from your JSON file
            print("⚠️ Date pattern not found in page content, using default date")
            return "10/17/2024"
            
    except Exception as e:
        print(f"🔥 Error fetching date: {str(e)}")
        # Return the known date from your JSON file as fallback
        return "10/17/2024"

def read_stored_date():
    if os.path.exists(STORED_DATE_FILE):
        with open(STORED_DATE_FILE, 'r') as file:
            return file.read().strip()
    return None

def write_stored_date(date):
    with open(STORED_DATE_FILE, 'w') as file:
        file.write(date)

def download_pdf(url, filename='fda_latest.pdf'):
    try:
        # Create the target directory if it doesn't exist
        target_dir = '/Users/vrushabhdeogirikar/Desktop/fda_doc_download'
        os.makedirs(target_dir, exist_ok=True)
        
        # Create the full path for the file
        full_path = os.path.join(target_dir, filename)
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        }
        print(f"\U0001F4E5 Attempting to download PDF from {url}...")
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        
        with open(full_path, 'wb') as file:
            file.write(response.content)
        
        print(f"✅ PDF downloaded successfully to {full_path}")
        # Upload to Pinecone via Node.js backend
        upload_success = upload_pdf_to_backend(full_path)
        if upload_success:
            print(f"✅ PDF uploaded to Pinecone via backend.")
            os.remove(full_path)
        else:
            print(f"❌ PDF upload to Pinecone failed.")
        return True
    except Exception as e:
        print(f"❌ PDF download failed: {str(e)}")
        return False

def print_stored_date():
    """Print the date currently stored in the database file."""
    stored_date = read_stored_date()
    if stored_date:
        print(f"📅 Date currently stored in database: {stored_date}")
    else:
        print("❌ No date currently stored in database")
    return stored_date

def main():
    try:
        # First check and print the stored date
        stored_date = print_stored_date()
        if not stored_date:
            stored_date = "10/17/2024"  # Use default date from JSON
            write_stored_date(stored_date)
            print(f"📅 Database initialized with date: {stored_date}")
        
        # Then fetch the current date from the website
        current_date = fetch_upload_date()
        print(f"🗓️ Extracted date from website: {current_date}")

        if current_date and current_date != stored_date:
            print(f'📢 Change detected: {stored_date} -> {current_date}')
            if download_pdf(PDF_DOWNLOAD_URL):
                write_stored_date(current_date)
                print('✅ Date updated in database.')
        else:
            print('✅ No change detected. Database is up to date.')

    except Exception as e:
        print(f'❌ Critical error: {e}')


def upload_pdf_to_backend(pdf_path):
    """
    Upload the given PDF file to the Node.js backend's /upload-fda endpoint.
    """
    import mimetypes
    backend_url = 'http://localhost:3001/upload-fda'
    try:
        with open(pdf_path, 'rb') as f:
            files = {
                'file': (os.path.basename(pdf_path), f, mimetypes.guess_type(pdf_path)[0] or 'application/pdf')
            }
            response = requests.post(backend_url, files=files)
            if response.status_code == 200:
                print(f"✅ Successfully uploaded PDF to backend: {response.json().get('message')}")
                return True
            else:
                print(f"❌ Backend upload failed: {response.text}")
                return False
    except Exception as e:
        print(f"❌ Exception during backend upload: {e}")
        return False

if __name__ == '__main__':
    main()
