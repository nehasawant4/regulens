// src/components/UploadFDADoc.jsx
import { useState } from 'react';
import axios from 'axios';

function UploadFDADoc() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');

  const handleUpload = async () => {
    if (!file) return alert('Please select a file');

    const formData = new FormData();
    formData.append('file', file);

    try {
      setStatus('Uploading...');
      const res = await axios.post('http://localhost:3001/upload-fda', formData);
      setStatus(res.data.message);
    } catch (error) {
      console.error(error);
      setStatus('Upload failed');
    }
  };

  return (
    <div style={{ marginTop: '40px' }}>
      <h2>Upload Guidance Document</h2>
      <input type="file" accept=".pdf" onChange={e => setFile(e.target.files[0])} />
      <button onClick={handleUpload} style={{ marginTop: '10px' }}>Upload</button>
      <div style={{ marginTop: '20px' }}>{status}</div>
    </div>
  );
}

export default UploadFDADoc;
