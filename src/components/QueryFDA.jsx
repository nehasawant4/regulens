import { useState } from 'react';
import axios from 'axios';
import { DownloadChecklistButton } from './makeActionable';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer';


function BeautifiedResponse({ answer }) {
  return (
    <div style={{ marginTop: '20px' }}>
      <h3>Non-Compliance Summary</h3>
      {answer.map((item, index) => (
        <div
          key={index}
          style={{
            backgroundColor: '#f9f9f9',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '16px',
            borderLeft: '0px',
          }}
        >
          <h4 style={{ marginBottom: '8px' }}>{item.title}</h4>
          <p><strong>Regulation:</strong> {item.fda_requirement_summary}</p>
          <p><strong>User Summary:</strong> {item.user_summary}</p>
          <p><strong>Issues in SOP:</strong></p>
          <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
            {Array.isArray(item.potential_issues) && item.potential_issues.length > 0 ? (
              item.potential_issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))
            ) : (
              <li>{item.issue || (typeof item.potential_issues === 'string' ? item.potential_issues : 'No specific issues found - review SOP against regulation')}</li>
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}

const SuggestionReview = ({ suggestions, onSave }) => {
  const [accepted, setAccepted] = useState({});

  const handleAccept = (index) => {
    setAccepted(prev => ({ ...prev, [index]: suggestions[index].suggestion }));
  };

  const handleReject = (index) => {
    setAccepted(prev => ({ ...prev, [index]: suggestions[index].original }));
  };

  const handleSave = () => {
    const final = suggestions.map((s, i) => {
      const item = accepted[i] || s.original;
      if (typeof item === 'object' && item.code && item.description) {
        return `${item.code} ${item.description}`;
      }
      return item;
    });
    onSave(final);
  
    // Join final SOP content
    const content = final.join('\n\n');
  
    // Trigger file download
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Updated_SOP.txt';
    a.click();
    URL.revokeObjectURL(url);
  };


  return (
    <div style={{ padding: '20px' }}>
      {suggestions.map((s, i) => (
        <div
          key={i}
          style={{ marginBottom: '40px', border: '1px solid #ddd', padding: '10px' }}
        >
          <h4>Difference #{i + 1}</h4>
          <div style={{ fontFamily: 'monospace', fontSize: '14px' }}>
          <ReactDiffViewer
              oldValue={s.original}
              newValue={s.suggestion}
              splitView={true}
              showDiffOnly={true}
              compareMethod={DiffMethod.WORDS}
              disableWordDiff={false}
            />
          </div>
          {s.suggestion !== 'NO CHANGE' ? (
            <>
              <p><em>Reason: {s.reason}</em></p>
              <button onClick={() => handleAccept(i)} style={{ marginRight: '10px' }}>
                ✅ Accept
              </button>
              <button onClick={() => handleReject(i)}>❌ Reject</button>
            </>
          ) : (
            <p><em>No change needed</em></p>
          )}
        </div>
      ))}

      {suggestions.length > 0 && (
        <button onClick={handleSave} style={{ marginTop: '20px' }}>
          Save Final SOP
        </button>
      )}
    </div>
  );
};


function QueryFDA() {
  const [question, setQuestion] = useState('');
  const [file, setFile] = useState(null);
  const [answer, setAnswer] = useState('');
  const [sopText, setSopText] = useState('');
  const [finalSOP, setFinalSOP] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSave = (final) => {
    setFinalSOP(final);
  };

  const handleQuery = async () => {
    if (!file || !question) {
      alert("Please provide both a Query and PDF file.");
      return;
    }

    setLoading(true);
    setAnswer([]);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("question", question);

    try {
      const res = await axios.post("http://localhost:5050/query_compare", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      // Parse the JSON responses if needed
      const parsedAnswers = res.data.answer.map(entry => {
        try {
          // Some models return JSON as a code block or string. Strip wrapping.
          const cleaned = entry.trim().replace(/^```json\n/, '').replace(/\n```$/, '');
          return JSON.parse(cleaned);
        } catch (e) {
          console.error("❌ JSON parse error:", e);
          return {
            title: "Parsing Error",
            fda_requirement_summary: "Could not parse response.",
            user_summary: question,
            potential_issues: [entry],
          };
        }
      });
      
      console.log('Parsed Response:', parsedAnswers);
      setAnswer(parsedAnswers);

      const fileData = new FormData();
      fileData.append('file', file);

        const textRes = await axios.post('http://localhost:3001/extract-pdf-text', fileData);
        const extractedText = textRes.data.text;
        setSopText(extractedText);

        const suggestionRes = await axios.post('http://localhost:3001/generate-suggestions', {
          paragraphs: extractedText.split('\n\n').filter(p => p.trim().length > 0),
          complianceNotes: parsedAnswers.map((item) => item.fda_requirement_summary || ''),
        });
        
        setSuggestions(suggestionRes.data.suggestions);
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

      <button onClick={handleQuery} disabled={loading}>
        {loading ? "Checking..." : "Ask"}
      </button>

      {answer && (
        <div className="response-box" style={{ marginTop: '20px' }}>
          <strong>Answer:</strong>
          {Array.isArray(answer) ? (
            <>
              <BeautifiedResponse answer={answer} />
              <DownloadChecklistButton nonCompliantRules={answer} />
            </>
          ) : (
            <p>{answer}</p>
          )}
        </div>
      )}

      {suggestions.length > 0 && (
        <SuggestionReview suggestions={suggestions} onSave={handleSave} />
      )}
    </div>
  );
}

export default QueryFDA;
