const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Pinecone } = require('@pinecone-database/pinecone');
require('dotenv').config();

const app = express();
const port = 3001;
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// Pinecone Assistant setup
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const assistant = pc.Assistant('regulens'); // replace with your assistant name

const pdfParse = require('pdf-parse');

const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const axios = require('axios');
const FormData = require('form-data');


// helper: strip context too long
function trim(text, maxTokens = 12000) {
  return text.split(' ').slice(0, maxTokens).join(' ');
}

app.post('/api/upload_pdf', upload.single('file'), async (req, res) => {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(req.file.path));
  formData.append('type', req.body.type);
  formData.append('label', req.body.label);

  try {
    const response = await axios.post('http://localhost:5000/upload_pdf', formData, {
      headers: formData.getHeaders()
    });
    res.json(response.data);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Upload failed' });
  }
});



app.post('/query-gpt4o', upload.single('file'), async (req, res) => {
  const question = req.body.question;
  const file = req.file;

  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  try {
    let documentText = '';

    // 1. If file uploaded, extract text (PDF or TXT)
    if (file) {
      const ext = path.extname(file.originalname).toLowerCase();
      const buffer = fs.readFileSync(file.path);
      if (ext === '.txt') {
        documentText = buffer.toString('utf-8');
      } else {
        const parsed = await pdfParse(buffer);
        documentText = parsed.text;
      }
      fs.unlinkSync(file.path); // cleanup
    }

    // 2. Combine PDF text + question into one prompt
    const userPrompt = documentText
      ? `Here is a document:\n\n${documentText.slice(0, 8000)}\n\nMy question:\n${question}`
      : question;

    // 3. Send to Pinecone Assistant (auto embeds + queries)
    const result = await assistant.chat({
      messages: [
        {
          role: 'user',
          content: `You're an FDA compliance assistant. Return ONLY a JSON array of objects, each with:
    
    - title: Regulation or topic name
    - description: What the FDA requires
    - issue: How the user document violates or misses the requirement
    
    Do not add commentary or wrap the JSON in markdown.`,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    const raw = result?.message?.content ?? '';
    try {
      const parsed = JSON.parse(raw);
      res.json({ answer: parsed }); // ✅ parsed array
    } catch (err) {
      res.json({ answer: raw }); // fallback
    }
    
  } catch (err) {
    console.error('❌ Assistant query failed:', err.response?.data || err.message);
    res.status(500).json({ error: 'Query to Pinecone Assistant failed' });
  }
});


app.post('/generate-suggestions', async (req, res) => {
  const { paragraphs, complianceNotes } = req.body;

  if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
    return res.status(400).json({ error: 'Paragraphs array is required.' });
  }

  try {
    // Using GPT-4o model

    const results = await Promise.all(paragraphs.map(async (para) => {
  // Updated prompt: instruct AI to return a single JSON object for each paragraph
  const prompt = `You are an FDA compliance assistant. Given the following SOP paragraph and compliance notes, suggest minimal edits to make the paragraph compliant. 

  Follow these rules strictly:
  - DO NOT rephrase or restructure existing sentences.
  - Only change specific values or terms directly related to the compliance issue (e.g., update "50mg" to "100mg").
  - If new information must be added, append it as a new sentence at the end of the paragraph.
  - DO NOT add extra commentary, explanations, or unnecessary wording.
  
  Return ONLY a single JSON object with these keys:
  - original: the original paragraph
  - suggestion: the minimally modified version (or 'NO CHANGE' if already compliant)
  - reason: explain exactly what was changed and why
  
  Paragraph: "${para}"
  Compliance Notes: "${complianceNotes}"
  
  Return only the JSON object.`;

  const result = await openai.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });
  const raw = result.choices[0].message.content.trim();
  // Try to parse the AI output as JSON
  try {
    let json = null;
    // Try parsing as object
    try {
      json = JSON.parse(raw);
    } catch (e) {
      // Try to extract JSON object from text if AI returns extra commentary
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        json = JSON.parse(match[0]);
      } else {
        throw e;
      }
    }
    // If the AI returns an array, use the first item
    if (Array.isArray(json)) {
      json = json[0];
    }
    return {
      original: para,
      suggestion: json.suggestion || 'NO CHANGE',
      reason: json.reason || '',
    };
  } catch (err) {
    // Log the raw output for debugging
    console.error('AI returned unparseable output:', raw);
    return {
      original: para,
      suggestion: 'NO CHANGE',
      reason: 'AI did not return structured output.'
    };
  }
}));

    res.json({ suggestions: results });
  } catch (err) {
    console.error('❌ Suggestion generation failed:', err);
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
});

app.post('/extract-pdf-text', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const pdfPath = path.resolve(req.file.path);
    const dataBuffer = fs.readFileSync(pdfPath);

    const pdfData = await pdfParse(dataBuffer);
    const text = pdfData.text;

    fs.unlinkSync(pdfPath); // cleanup

    res.json({ text });
  } catch (err) {
    console.error('❌ Failed to extract PDF text:', err);
    res.status(500).json({ error: 'Failed to extract PDF text' });
  }
});

app.post('/upload-fda', upload.single('file'), async (req, res) => {
  try {
    const pdfPath = path.resolve(req.file.path);
    const dataBuffer = fs.readFileSync(pdfPath);

    // 1. Extract text from PDF
    const pdfData = await pdfParse(dataBuffer);
    const text = pdfData.text;

    // 2. Save to temp .txt file
    const baseName = path.parse(req.file.originalname).name; // Get filename without extension
    const title = baseName.replace(/_/g, ' ').replace(/-/g, ' '); // Clean up the title
    const txtPath = pdfPath.replace('.pdf', '') + '.txt';
    fs.writeFileSync(txtPath, text);

    // 3. Upload with custom title
    await assistant.uploadFile({
      path: txtPath,
      title, // Use cleaned title
    });

    // 4. Cleanup
    fs.unlinkSync(pdfPath);
    fs.unlinkSync(txtPath);

    res.status(200).json({ message: `Document '${title}' uploaded to Pinecone Assistant.` });
  } catch (err) {
    console.error('❌ Upload failed:', err.response?.data || err.message || err);
    res.status(500).json({ error: 'Upload to Pinecone Assistant failed.' });
  }
});

app.post('/query-fda', async (req, res) => {
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  try {
    const result = await assistant.chat({
      messages: [
        {
          role: 'user',
          content: question,
        },
      ],
    });

    const answer = result?.message?.content ?? 'No answer found.';
    res.json({ answer });
  } catch (err) {
    console.error('❌ Query failed:', err.response?.data || err.message || err);
    res.status(500).json({ error: 'Query to Pinecone Assistant failed' });
  }
});



app.listen(port, () => {
  console.log(`✅ Backend running at http://localhost:${port}`);
});
