// Import required dependencies
import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import voice from "elevenlabs-node";
import express from "express";
import { promises as fs } from "fs";
import OpenAI from "openai";
import multer from "multer";
import axios from "axios";
import { Pinecone } from '@pinecone-database/pinecone';
import config from './config/config.js';

// Load environment variables
dotenv.config();

// Initialize Express app and middleware
const app = express();
app.use(express.json());
app.use(cors());

// Initialize file upload middleware
const upload = multer({ storage: multer.memoryStorage() });

// Initialize API clients with environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Extract environment variables
const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const voiceID = process.env.ELEVEN_LABS_VOICE_ID;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

// Microsoft Graph API credentials
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const tenantId = process.env.TENANT_ID;
const userEmail = process.env.USER_EMAIL;

// Server configuration
const port = process.env.PORT || 3000;

// Initialize external services
const pinecone = new Pinecone();
const ffmpegPath = config.paths.ffmpeg;
const rhubarbPath = config.paths.rhubarb;


app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/voices", async (req, res) => {
  res.send(await voice.getVoices(elevenLabsApiKey));
});

/**
 * Execute shell command and return promise
 * @param {string} command - Command to execute
 * @returns {Promise} Promise that resolves with stdout or rejects with error
 */
const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve(stdout);
    });
  });
};

/**
 * Authenticate with Microsoft Graph API and get access token
 * @returns {Promise<string>} Access token for Microsoft Graph API
 */
const getToken = async () => {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const tokenData = {
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
  };
  const response = await axios.post(tokenUrl, new URLSearchParams(tokenData));
  return response.data.access_token;
};

/**
 * Create calendar event in Microsoft Outlook
 * POST /createEvent
 * Body: { subject, start, end, timeZone }
 */
app.post("/createEvent", async (req, res) => {
  const { subject, start, end, timeZone } = req.body;

  try {
    const token = await getToken();
    const eventUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/events`;

    const event = {
      subject,
      body: {
        contentType: "Text",
        content: "Scheduled by Virtual Assistant",
      },
      start: {
        dateTime: start,
        timeZone,
      },
      end: {
        dateTime: end,
        timeZone,
      },
    };
    const response = await axios.post(eventUrl, event, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    res.json({ message: "Event created successfully!", eventId: response.data.id });
  } catch (error) {
    console.error("Error creating event:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to create event" });
  }
});

/**
 * Send email using Microsoft Graph API
 * POST /sendEmail
 * Body: { subject, body, recipient }
 */
app.post("/sendEmail", async (req, res) => {
  const { subject, body, recipient } = req.body;

  try {
    const token = await getToken();
    const sendMailUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/sendMail`;

    const emailData = {
      message: {
        subject: "Email sent by Donna",
        body: {
          contentType: "Text",
          content: body,
        },
        toRecipients: [
          {
            emailAddress: {
              address: recipient,
            },
          },
        ],
      },
    };
    const response = await axios.post(sendMailUrl, emailData, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 202) {
      res.status(200).json({ message: "Email sent successfully!" });
    } else {
      res.status(response.status).json({ error: response.data });
    }
  } catch (error) {
    console.error("Error sending email:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to send email" });
  }
});

/**
 * Generate lip sync data for audio message
 * @param {number} message - Message index
 * @returns {Promise<void>} Promise that resolves when lip sync is complete
 */
const lipSyncMessage = async (message) => {
  const time = new Date().getTime();
  console.log(`Starting conversion for message ${message}`);
  
  // Define file paths
  const inputAudio = `${config.paths.audioFiles}/message_${message}.${config.fileFormats.audio.input}`;
  const outputAudio = `${config.paths.audioFiles}/message_${message}.${config.fileFormats.audio.output}`;
  const lipSyncOutput = `${config.paths.audioFiles}/message_${message}.${config.fileFormats.audio.lipSync}`;
  
  // Convert audio format using FFmpeg
  await execCommand(
    `${ffmpegPath} -y -i ${inputAudio} ${outputAudio}`
  );
  console.log(`Conversion done in ${new Date().getTime() - time}ms`);
  
  // Generate lip sync data using Rhubarb
  const rhubarbCommand = process.platform === 'win32' 
    ? `"${rhubarbPath}" -f json -o "${lipSyncOutput}" "${outputAudio}" -r phonetic`
    : `"${rhubarbPath}" -f json -o "${lipSyncOutput}" "${outputAudio}" -r phonetic`;
    
  await execCommand(rhubarbCommand);
  console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
};

/**
 * Process chat message and generate AI response with audio and lip sync
 * POST /chat
 * Body: { message }
 */
app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo-1106',
    max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 1000,
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.6,
    response_format: {
      type: "json_object",
    },
    messages: [
      {
        role: "system",
        content: `
        Your name is ${process.env.ASSISTANT_NAME || 'Virtual Assistant'}.
        ${process.env.ASSISTANT_CONTEXT || 'You are a personal assistant for Purdue Fort Wayne University students.'}
        You will always reply with a JSON array of messages. With a maximum of 3 messages.
        Each message has a text, facialExpression, and animation property.
        The different facial expressions are: ${process.env.ASSISTANT_FACIAL_EXPRESSIONS || 'smile, sad, angry, surprised, funnyFace, default'}.
        The different animations are: ${process.env.ASSISTANT_ANIMATIONS || 'Talking_0, Talking_1, Talking_2, Crying, Laughing, Rumba, Idle, Terrified, Angry'}.
        `,
      },
      {
        role: "user",
        content: userMessage || "Hello",
      },
    ],
  });
  let messages = JSON.parse(completion.choices[0].message.content);
  if (messages.messages) {
    messages = messages.messages; // ChatGPT is not 100% reliable, sometimes it directly returns an array and sometimes a JSON object with a messages property
  }
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    // generate audio file
    const fileName = `${config.paths.audioFiles}/message_${i}.${config.fileFormats.audio.input}`;
    const textInput = message.text; // The text you wish to convert to speech
    await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, textInput);
    // generate lipsync
    await lipSyncMessage(i);
    message.audio = await audioFileToBase64(fileName);
    message.lipsync = await readJsonTranscript(`${config.paths.audioFiles}/message_${i}.${config.fileFormats.audio.lipSync}`);
  }

  res.send({ messages });
});

/**
 * Transcribe audio file using Deepgram API
 * POST /transcript
 * Body: multipart/form-data with file field
 */
app.post("/transcript", upload.single("file"), async (req, res) => {

  try {
    // Ensure a file was uploaded
    if (!req.file) {
      return res.status(400).send({ error: "No file uploaded" });
    }

    // Send the uploaded file to Deepgram for transcription
    const deepgramResponse = await fetch(process.env.DEEPGRAM_API_URL || 'https://api.deepgram.com/v1/listen', {
      method: "POST",
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        "Content-Type": "audio/mp3", // Adjust this based on file type
      },
      body: req.file.buffer, // Use file buffer from multer
    });

    if (!deepgramResponse.ok) {
      const error = await deepgramResponse.json();
      return res.status(deepgramResponse.status).send({ error });
    }

    const deepgramData = await deepgramResponse.json();
    const texttranscript = deepgramData.results.channels[0].alternatives[0].transcript;

    // Create a message object with transcription text
    const messages = [
      {
        text: texttranscript,
        facialExpression: "smile",
        animation: "Talking_0",
      },
    ];

    // Generate audio and lipsync data
    for (let i = 0; i < messages.length; i++) {
      const message1 = messages[i];
      const fileName = `${config.paths.audioFiles}/message_${i}.${config.fileFormats.audio.input}`;
      const fileInput1 = message1.text
      // Convert text to speech
      await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, fileInput1);

      // Generate lipsync data
      await lipSyncMessage(i);

      // Add audio and lipsync data to the message object
      message1.audio = await audioFileToBase64(fileName);
      message1.lipsync = await readJsonTranscript(`${config.paths.audioFiles}/message_${i}.${config.fileFormats.audio.lipSync}`);
    }

    res.send({ messages });
  } catch (error) {
    console.error("Error in /transcript:", error);
    res.status(500).send({ error: "Internal server error" });
  }
});


/**
 * Query Pinecone vector database for relevant documents
 * @param {string} query - Search query
 * @param {number} topK - Number of results to return
 * @returns {Promise<Array>} Array of matching documents
 */
async function queryPinecone(query, topK = 3) {
  const index = pinecone.index("donna-cloud-kb");
  console.log(query);
  try {
    // Generate embedding for the query
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    // Search for similar vectors
    const queryResult = await index.query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
    });

    return queryResult.matches;
  } catch (error) {
    console.error('Error querying Pinecone:', error);
    return [];
  }
}

/**
 * Summarize search results using OpenAI
 * @param {Array} results - Array of search results from Pinecone
 * @param {string} userQuery - Original user query
 * @returns {Promise<string>} Summarized response
 */
async function summarizeResults(results, userQuery) {
  const contentToSummarize = results.map(r => r.metadata.text).join('\n\n');
  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_SUMMARIZE_MODEL || 'gpt-4',
      messages: [
        { role: "system", content: "You are a helpful assistant that summarizes information." },
        { role: "user", content: `Summarize the following information in response to the query: "${userQuery}"\n\n${contentToSummarize}` }
      ],
      max_tokens: 100
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error summarizing results:', error);
    return 'Error generating summary';
  }
}


/**
 * RAG (Retrieval-Augmented Generation) endpoint
 * POST /rag
 * Body: { message }
 */
app.post("/rag", async (req, res) => {
  const userMessage = req.body.message;
  console.log("message from user", userMessage);
  if (!userMessage) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    const results = await queryPinecone(userMessage, 3);
    console.log("Results**********", results);
    if (results.length > 0) {
      const summary = await summarizeResults(results, userMessage);
      console.log("Generated summary::::", summary);
      res.send(summary);
    }
  } catch (error) {
    console.error("Error in /rag:", error);
    res.status(500).send({ error: "Internal server error" });
  }
});


/**
 * Read JSON transcript file
 * @param {string} file - Path to JSON file
 * @returns {Promise<Object>} Parsed JSON data
 */
const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

/**
 * Convert audio file to base64 string
 * @param {string} file - Path to audio file
 * @returns {Promise<string>} Base64 encoded audio data
 */
const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

// Start the server
app.listen(port, () => {
  console.log(`Donna listening on port ${port}`);
});