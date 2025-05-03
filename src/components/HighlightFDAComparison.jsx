import { useState } from 'react';
import axios from 'axios';

function HighlightFDAComparison() {
  const [question, setQuestion] = useState('');
  const [file, setFile] = useState(null);
  const [answer, setAnswer] = useState('');
  const [highlightedText, setHighlightedText] = useState('');

  const handleQuery = async () => {
    if (!question) return alert('Please enter a question');

    const formData = new FormData();
    formData.append('question', question);
    if (file) {
      formData.append('file', file);
    }

    try {
      // Step 1: Get answer from Pinecone Assistant
      const res = await axios.post('http://localhost:3001/query-gemini', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const pineconeAnswer = res.data.answer;
      setAnswer(pineconeAnswer);

      // Step 2: Get full FDA text (assumed preloaded or from a static source)
      const fdaTextRes = await axios.get('http://localhost:3001/fda-text');
      const fdaText = fdaTextRes.data.fdaText;

      // Step 3: Send fdaText + nonCompliantItems to Gemini for highlighting
      const nonCompliantItems = extractNonCompliance(pineconeAnswer);
      const highlightRes = await axios.post('http://localhost:3001/highlight-from-noncompliance', {
        fdaText,
        nonCompliantItems,
      });

      const { highlights } = highlightRes.data;

      let html = fdaText;
      highlights.forEach(({ text, match_type }) => {
        const safeText = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const color = match_type === 'compliant' ? '#d4edda' : '#f8d7da';
        const regex = new RegExp(safeText, 'g');
        html = html.replace(regex, `<span style="background-color: ${color}">${text}</span>`);
      });

      setHighlightedText(html);
    } catch (err) {
      console.error(err);
      alert('Query or highlight failed');
    }
  };

  const extractNonCompliance = (text) => {
    const matches = text.match(/Issue in SOP:([^\n]+)/g);
    return matches ? matches.map(item => item.replace('Issue in SOP:', '').trim()) : [];
  };

  return (
    <div style={{ marginTop: '40px' }}>
      <h2>FDA Compliance Highlighter</h2>
      <textarea
        placeholder="Type your question..."
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={4}
        style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
      />
      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => setFile(e.target.files[0])}
        style={{ marginBottom: '10px' }}
      />
      <button onClick={handleQuery}>Ask & Highlight</button>

      {answer && (
        <div className="response-box" style={{ marginTop: '20px' }}>
          <strong>Answer:</strong>
          <pre style={{ backgroundColor: '#f4f4f4', padding: '12px' }}>{answer}</pre>
        </div>
      )}

      {highlightedText && (
        <div
          style={{
            marginTop: '20px',
            backgroundColor: '#f4f4f4',
            padding: '16px',
            borderRadius: '8px',
            whiteSpace: 'pre-wrap',
          }}
          dangerouslySetInnerHTML={{ __html: highlightedText }}
        />
      )}
    </div>
  );
}

export default HighlightFDAComparison;
