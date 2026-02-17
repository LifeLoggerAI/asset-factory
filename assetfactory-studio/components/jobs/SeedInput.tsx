
'use client';

import React from 'react';

const SeedInput = ({ seed, setSeed }) => {

  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <label htmlFor="seed" className="block text-sm font-medium text-gray-300 mb-2">Seed</label>
      <input
        type="number"
        id="seed"
        name="seed"
        className="w-full bg-gray-900 text-white rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
        value={seed}
        onChange={(e) => setSeed(e.target.value)}
        placeholder="e.g. 12345"
      />
    </div>
  );
};

export default SeedInput;
