
'use client';

import React from 'react';

const ModelVersionSelector = ({ selectedVersion, setSelectedVersion }) => {

  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <label htmlFor="model-version" className="block text-sm font-medium text-gray-300 mb-2">Model Version</label>
      <select
        id="model-version"
        name="model-version"
        className="w-full bg-gray-900 text-white rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
        value={selectedVersion}
        onChange={(e) => setSelectedVersion(e.target.value)}
      >
        <option value="v1.0">v1.0</option>
        <option value="v1.1">v1.1</option>
        <option value="v1.2-alpha">v1.2-alpha</option>
      </select>
    </div>
  );
};

export default ModelVersionSelector;
