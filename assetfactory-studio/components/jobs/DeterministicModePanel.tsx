
import React from 'react';
import ModelVersionSelector from '@/components/jobs/ModelVersionSelector';
import SeedInput from '@/components/jobs/SeedInput';
import AspectRatioSelector from '@/components/jobs/AspectRatioSelector';
import VoiceSelector from '@/components/jobs/VoiceSelector';
import DurationInput from '@/components/jobs/DurationInput';
import ExportFormatSelector from '@/components/jobs/ExportFormatSelector';

const DeterministicModePanel = ({ 
    selectedVersion, 
    setSelectedVersion, 
    seed, 
    setSeed, 
    aspectRatio, 
    setAspectRatio, 
    voice, 
    setVoice, 
    duration, 
    setDuration, 
    format, 
    setFormat 
}) => {
  return (
    <div className="bg-gray-700 p-4 rounded-lg mt-4">
        <h3 className="text-lg font-bold text-gray-300 mb-4">Advanced Options</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ModelVersionSelector selectedVersion={selectedVersion} setSelectedVersion={setSelectedVersion} />
            <SeedInput seed={seed} setSeed={setSeed} />
            <AspectRatioSelector aspectRatio={aspectRatio} setAspectRatio={setAspectRatio} />
            <VoiceSelector voice={voice} setVoice={setVoice} />
            <DurationInput duration={duration} setDuration={setDuration} />
            <ExportFormatSelector format={format} setFormat={setFormat} />
        </div>
    </div>
  );
};

export default DeterministicModePanel;
