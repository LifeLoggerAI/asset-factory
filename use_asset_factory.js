
const https = require('https');

// --- CONFIGURATION ---
// The official, sealed API endpoint for the Asset Factory.
const API_BASE_URL = 'api.urai.com';

// Replace this with a valid API key obtained from the URAI platform.
const API_KEY = 'YOUR_API_KEY'; 

// --- JOB DEFINITION ---
// This is the structured data sent to the factory, as defined by the v1 schema.
const postData = JSON.stringify({
  "story_input": {
    "title": "The Little Star That Could",
    "scenes": [
      {
        "scene_number": 1,
        "prompt": "A small, timid star hiding behind a large, colorful nebula.",
        "narration": "In a quiet corner of the galaxy, there was a little star who was afraid of the dark."
      },
      {
        "scene_number": 2,
        "prompt": "The little star peeking out, its light faintly illuminating a nearby asteroid.",
        "narration": "But one night, a friendly old comet passed by and saw the star's gentle glow."
      }
    ]
  },
  "mood": "inspirational",
  "audience": "kids",
  "platform_targets": ["youtube_shorts"]
});

// --- API REQUEST OPTIONS ---
const options = {
  hostname: API_BASE_URL,
  path: '/v1/jobs',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Length': postData.length
  }
};

console.log(`Submitting job to https://${API_BASE_URL}/v1/jobs...`);

// --- SEND REQUEST ---
const req = https.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Response Body:');
    console.log(JSON.parse(data));
  });
});

req.on('error', (error) => {
  console.error('Request Failed:');
  console.error(error);
});

req.write(postData);
req.end();
