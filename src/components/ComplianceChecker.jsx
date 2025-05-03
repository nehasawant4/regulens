import { useState } from 'react';
import axios from 'axios';
import './ComplianceChecker.css'; // add this line

function ComplianceChecker() {
  const [file, setFile] = useState(null);
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');

  const handleUpload = async () => {
    if (!file || !query) return alert('Please upload a file and type a question');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('query', query);

    try {
      const res = await axios.post('http://localhost:3001/check', formData);
      setResponse(res.data.answer);
    } catch (error) {
      console.error(error);
      alert('Something went wrong');
    }
  };

  return (
    <div className="checker-container">
      <h2>FDA Compliance Checker</h2>
      <input type="file" accept=".pdf" onChange={e => setFile(e.target.files[0])} />

      <textarea
        placeholder="Enter your question..."
        value={query}
        onChange={e => setQuery(e.target.value)}
      />

      <button onClick={handleUpload}>Check Compliance</button>

      {response && (
        <div className="response-box">
          <strong>Response:</strong>
          <p>{response}</p>
        </div>
      )}
    </div>
  );
}

export default ComplianceChecker;
