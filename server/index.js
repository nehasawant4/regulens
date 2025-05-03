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

const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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



app.post('/query-gemini', upload.single('file'), async (req, res) => {
  const question = req.body.question;
  const file = req.file;

  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  try {
    let documentText = '';

    // 1. If PDF uploaded, extract text
    if (file) {
      const buffer = fs.readFileSync(file.path);
      const parsed = await pdfParse(buffer);
      documentText = parsed.text;
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
