import os
import requests
import re
from datetime import datetime
import time
import random
from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename
from rag_utils import upload_pdf_to_pinecone, search_chunks
from dotenv import load_dotenv
import openai
from flask_cors import CORS



load_dotenv()

app = Flask(__name__)
CORS(app)

openai.api_key = os.getenv("OPENAI_API_KEY")


@app.route('/make_actionable', methods=['POST'])
def make_actionable():
    data = request.get_json()
    issue = data.get('issue', '')

    if not issue or not isinstance(issue, str):
        return jsonify({"error": "No issue provided"}), 400

    try:
        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[
                {"role": "user", "content": f"""
You are an expert in FDA compliance.

Given the following issue in a hospital SOP:
"{issue}"

Convert it into a short, clear, actionable checklist item. 
Respond with just the action sentence.
"""}
            ]
        )
        return jsonify({"action": response.choices[0].message['content'].strip()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.route('/upload_pdf', methods=['POST'])
def upload_pdf():
    try:
        file = request.files['file']
        doc_type = request.form.get('type')  # "user" or "fda"
        label = request.form.get('label') or secure_filename(file.filename)

        print(f"Received file: {file.filename}")
        print(f"Type: {doc_type}, Label: {label}")

        file_path = os.path.join(UPLOAD_FOLDER, secure_filename(file.filename))
        file.save(file_path)

        print(f"Saved to: {file_path}")

        count = upload_pdf_to_pinecone(file_path, f"{doc_type}_{label}")

        print(f"Uploaded {count} chunks to Pinecone")
        os.remove(file_path)

        return jsonify({"message": f"Uploaded {count} chunks from '{label}' to Pinecone."})
    
    except Exception as e:
        print("❌ ERROR:", e)
        return jsonify({"error": str(e)}), 500


@app.route('/query_compare', methods=['POST'])
def query_compare():
    try:
        file = request.files['file']
        question = request.form.get('question')
        label = secure_filename(file.filename).replace(".pdf", "")

        file_path = os.path.join(UPLOAD_FOLDER, secure_filename(file.filename))
        file.save(file_path)

        # Upload to Pinecone under a unique user label
        upload_pdf_to_pinecone(file_path, f"user_{label}")
        os.remove(file_path)

        test_chunks = [question]  # simulate as one user chunk

        comparisons = []
        for i, user_chunk in enumerate(test_chunks):
            fda_matches = search_chunks(user_chunk, top_k=1)
            if not fda_matches:
                continue

            fda_text = fda_matches[0]['metadata']['text']
            prompt = f"""
You are comparing a hospital's SOP against FDA regulations. 

Return a JSON object with the following fields:
- title: A short title
- fda_requirement_summary: Summary of FDA's expectation
- user_summary: What the SOP says
- potential_issues: A list of 3–5 short bullet points describing gaps in the SOP compared to FDA guidelines. Each should be a single actionable sentence.

Example Format:
{{
  "title": "...",
  "fda_requirement_summary": "...",
  "user_summary": "...",
  "potential_issue": "The SOP does not include baseline assessment frequency and uses non-validated instruments."
}}

Now compare the following SOP chunk:
"{user_chunk}"
with the following FDA guideline chunk:
"{fda_text}"
"""



            response = openai.ChatCompletion.create(
                model="gpt-4o-2024-08-06",
                messages=[{"role": "user", "content": prompt}]
            )

            comparisons.append(response.choices[0].message.content)

        return jsonify({"answer": comparisons})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/compare_docs', methods=['POST'])
def compare_docs():
    try:
        user_label = request.json.get("user_label")      # e.g. "user_form23"
        fda_label_prefix = request.json.get("fda_label") # e.g. "core_outcomes_doc"

        # For now, get top-N matching chunks using a placeholder query strategy
        # You would ideally store user chunks locally for real comparison

        test_texts = [
            "The patient-reported outcomes should follow standardized collection.",
            "Clinical endpoints must meet FDA criteria for consistency and reliability.",
            "Trials must define baseline quality-of-life metrics early in the study."
        ]

        comparisons = []

        for idx, user_chunk in enumerate(test_texts):
            fda_matches = search_chunks(user_chunk, top_k=1)

            if not fda_matches:
                continue

            fda_text = fda_matches[0]['metadata']['text']

            prompt = f"""
You are comparing a user document with FDA regulations.

FDA Requirement:
{fda_text}

User Submission:
{user_chunk}

Give a JSON response with:
- title
- fda_requirement_summary
- user_summary
- potential_issue (highlight if there's any deviation from FDA)
"""

            response = openai.ChatCompletion.create(
                model="gpt-4",
                messages=[{"role": "user", "content": prompt}]
            )

            result = response.choices[0].message.content
            comparisons.append({
                "user_chunk_id": idx,
                "report": result
            })

        return jsonify({"comparisons": comparisons})

    except Exception as e:
        print("❌ ERROR:", e)
        return jsonify({"error": str(e)}), 500



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
    #main()
    app.run(port=5050, debug=True)
