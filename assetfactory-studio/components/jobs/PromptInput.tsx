
'use client';

import React from 'react';

const PromptInput = ({ prompt, setPrompt }) => {

  return (
    <div className="bg-gray-700 p-4 rounded-lg">
      <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-2">Prompt</label>
      <textarea
        id="prompt"
        name="prompt"
        rows={6}
        className="w-full bg-gray-900 text-white rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Enter your creative prompt here..."
      />
      <div className="flex justify-between items-center mt-2 text-sm text-gray-400">
        <span>Character Count: {prompt.length}</span>
        <span>Token Estimate: [... a lot]</span>
      </div>
    </div>
  );
};

export default PromptInput;
