import { useState } from 'react';
import axios from 'axios';
import { DownloadChecklistButton } from './makeActionable';

function BeautifiedResponse({ answer }) {
  return (
    <div style={{ marginTop: '20px' }}>
      <h3>Non-Compliance Summary</h3>
      {answer.map((item, index) => (
        <div key={index} style={{
          backgroundColor: '#f9f9f9',
          padding: '16px',
          borderRadius: '8px',
          marginBottom: '16px',
          borderLeft: '0px'
        }}>
          <h4 style={{ marginBottom: '8px' }}>{index + 1}. {item.title}</h4>
          <p><strong>Regulation:</strong> {item.description}</p>
          <p><strong>Issue in SOP:</strong> {item.issue}</p>
        </div>
      ))}
    </div>
  );
}

function QueryFDA() {
  const [question, setQuestion] = useState('');
  const [file, setFile] = useState(null);
  const [answer, setAnswer] = useState('');

  const handleQuery = async () => {
    if (!question) return alert('Please enter a question');

    const formData = new FormData();
    formData.append('question', question);
    if (file) {
      formData.append('file', file);
    }

    try {
      const res = await axios.post('http://localhost:3001/query-gemini', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setAnswer(res.data.answer);
    } catch (err) {
      console.error(err);
      alert('Query failed');
    }
  };

  return (
    <div style={{ marginTop: '40px' }}>
      <h2>Ask Compliance Questions</h2>
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

      <button onClick={handleQuery}>Ask</button>

      {answer && (
        <div className="response-box">
          <strong>Answer:</strong>
          {Array.isArray(answer)
            ? <>
                <BeautifiedResponse answer={answer} />
                <DownloadChecklistButton nonCompliantRules={answer} />
              </>
            : <p>{answer}</p>}
        </div>
      )}
    </div>
  );
}

export default QueryFDA;
