
'use client';

import React from 'react';

const VoiceSelector = ({ voice, setVoice }) => {

  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <label htmlFor="voice" className="block text-sm font-medium text-gray-300 mb-2">Voice</label>
      <select
        id="voice"
        name="voice"
        className="w-full bg-gray-900 text-white rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
        value={voice}
        onChange={(e) => setVoice(e.target.value)}
      >
        <option value="alloy">Alloy</option>
        <option value="echo">Echo</option>
        <option value="fable">Fable</option>
        <option value="onyx">Onyx</option>
        <option value="nova">Nova</option>
        <option value="shimmer">Shimmer</option>
      </select>
    </div>
  );
};

export default VoiceSelector;
