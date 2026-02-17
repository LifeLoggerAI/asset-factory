
'use client';

import React from 'react';

const ExportFormatSelector = ({ format, setFormat }) => {

  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <label htmlFor="format" className="block text-sm font-medium text-gray-300 mb-2">Export Format</label>
      <select
        id="format"
        name="format"
        className="w-full bg-gray-900 text-white rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
        value={format}
        onChange={(e) => setFormat(e.target.value)}
      >
        <option value="mp4">MP4</option>
        <option value="gif">GIF</option>
        <option value="webm">WebM</option>
      </select>
    </div>
  );
};

export default ExportFormatSelector;
