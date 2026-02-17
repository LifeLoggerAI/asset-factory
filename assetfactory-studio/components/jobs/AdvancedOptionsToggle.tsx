
'use client';

import React from 'react';

const AdvancedOptionsToggle = ({ isAdvanced, setIsAdvanced }) => {

  return (
    <div className="bg-gray-700 p-4 rounded-lg mt-4">
      <label className="flex items-center cursor-pointer">
        <input
          type="checkbox"
          className="form-checkbox h-5 w-5 bg-gray-900 border-gray-600 text-blue-500 focus:ring-blue-500"
          checked={isAdvanced}
          onChange={() => setIsAdvanced(!isAdvanced)}
        />
        <span className="ml-2 text-gray-300">Show Advanced Options</span>
      </label>
    </div>
  );
};

export default AdvancedOptionsToggle;
