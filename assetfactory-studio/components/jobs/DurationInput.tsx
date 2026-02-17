
'use client';

import React from 'react';

const DurationInput = ({ duration, setDuration }) => {

  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <label htmlFor="duration" className="block text-sm font-medium text-gray-300 mb-2">Duration (seconds)</label>
      <input
        type="number"
        id="duration"
        name="duration"
        className="w-full bg-gray-900 text-white rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
        placeholder="e.g. 15"
      />
    </div>
  );
};

export default DurationInput;
