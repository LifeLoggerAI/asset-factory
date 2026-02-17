
'use client';

import React from 'react';

const AspectRatioSelector = ({ aspectRatio, setAspectRatio }) => {

  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <label htmlFor="aspect-ratio" className="block text-sm font-medium text-gray-300 mb-2">Aspect Ratio</label>
      <select
        id="aspect-ratio"
        name="aspect-ratio"
        className="w-full bg-gray-900 text-white rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
        value={aspectRatio}
        onChange={(e) => setAspectRatio(e.target.value)}
      >
        <option value="16:9">16:9 (Widescreen)</option>
        <option value="1:1">1:1 (Square)</option>
        <option value="9:16">9:16 (Vertical)</option>
        <option value="4:3">4:3 (Standard)</option>
        <option value="3:2">3:2 (Photography)</option>
      </select>
    </div>
  );
};

export default AspectRatioSelector;
