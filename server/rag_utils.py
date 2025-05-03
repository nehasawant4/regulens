# server/rag_utils.py
import os
import openai
from pinecone import Pinecone
from pdfminer.high_level import extract_text
from uuid import uuid4
from dotenv import load_dotenv

load_dotenv()

# Initialize OpenAI
openai.api_key = os.getenv("OPENAI_API_KEY")

# Initialize Pinecone client
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))

# Connect to your serverless index
index = pc.Index(os.getenv("PINECONE_INDEX"))

def search_chunks(query_text, top_k=1, namespace=None):
    query_vector = embed_text(query_text)
    results = index.query(
        vector=query_vector,
        top_k=top_k,
        include_metadata=True
    )
    return results['matches']

def fetch_chunks_by_label(label):
    results = index.describe_index_stats()
    all_vectors = []

    for namespace in results.get('namespaces', {}):
        # Note: only searches the stats — not actual metadata
        continue  # skip; SDK v3 doesn't support full metadata query yet

    # So instead, we’ll fetch all vectors by scanning
    # You can replace this later with a better metadata filter when SDK adds support
    return []  # temporary placeholder — will revisit in next iteration


def embed_text(text):
    response = openai.Embedding.create(
        input=[text],
        model="text-embedding-3-large"
    )
    return response['data'][0]['embedding']

def chunk_text(text, chunk_size=1000, overlap=200):
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size - overlap):
        chunk = ' '.join(words[i:i + chunk_size])
        chunks.append(chunk)
    return chunks

def upload_pdf_to_pinecone(file_path, source_label):
    text = extract_text(file_path)
    chunks = chunk_text(text)

    vectors = []
    for i, chunk in enumerate(chunks):
        vector = embed_text(chunk)
        vectors.append({
            "id": str(uuid4()),
            "values": vector,
            "metadata": {
                "source": source_label,
                "chunk_index": i,
                "text": chunk
            }
        })

    index.upsert(vectors=vectors)
    return len(vectors)
