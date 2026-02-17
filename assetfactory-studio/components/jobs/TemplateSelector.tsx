
'use client';

import React from 'react';

const TemplateSelector = ({ selectedTemplate, setSelectedTemplate }) => {

  return (
    <div className="bg-gray-700 p-4 rounded-lg mt-4">
      <label htmlFor="template" className="block text-sm font-medium text-gray-300 mb-2">Template</label>
      <select
        id="template"
        name="template"
        className="w-full bg-gray-900 text-white rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
        value={selectedTemplate}
        onChange={(e) => setSelectedTemplate(e.target.value)}
      >
        <option value="video">Video</option>
        <option value="image">Image</option>
        <option value="voiceover">Voiceover</option>
        <option value="capcut">CapCut Pack</option>
        <option value="storyboard">Storyboard</option>
      </select>
    </div>
  );
};

export default TemplateSelector;
