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
          <p><strong>Regulation:</strong> {item.fda_requirement_summary}</p>
          <p><strong>User Summary:</strong> {item.user_summary}</p>
          <p><strong>Issues in SOP:</strong></p>
          <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
            {item.potential_issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function QueryFDA() {
  const [query, setQuery] = useState('');
  const [pdfFile, setPdfFile] = useState(null);
  const [answer, setAnswer] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleQuery = async () => {
    if (!pdfFile || !query) {
      alert("Please provide both a query and PDF file.");
      return;
    }

    setLoading(true);
    setAnswer([]);

    const formData = new FormData();
    formData.append("file", pdfFile);
    formData.append("question", query);

    try {
      const res = await axios.post("http://localhost:5050/query_compare", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const parsed = res.data.answer.map((entry) => {
        try {
          // Some models return JSON as a code block or string. Strip wrapping.
          const cleaned = entry.trim().replace(/^```json/, '').replace(/```$/, '');
          return JSON.parse(cleaned);
        } catch (e) {
          console.error("❌ JSON parse error:", e);
          return {
            title: "Parsing Error",
            fda_requirement_summary: "Could not parse GPT response.",
            user_summary: query,
            potential_issue: entry,
          };
        }
      });
      
      

      setAnswer(parsed);
    } catch (err) {
      console.error(err);
      alert("Something went wrong while querying.");
    }

    setLoading(false);
  };

  return (
    <div style={{ marginTop: '40px' }}>
      <h2>Ask Compliance Questions</h2>

      <textarea
        placeholder="Type your question..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        rows={4}
        style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
      />

      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => setPdfFile(e.target.files[0])}
        style={{ marginBottom: '10px' }}
      />

      <button onClick={handleQuery} disabled={loading}>
        {loading ? "Checking..." : "Ask"}
      </button>

      {answer.length > 0 && (
        <div className="response-box">
          <strong>Answer:</strong>
          <BeautifiedResponse answer={answer} />
          <DownloadChecklistButton nonCompliantRules={answer} />
        </div>
      )}
    </div>
  );
}

export default QueryFDA;
