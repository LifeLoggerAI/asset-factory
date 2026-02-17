'use client';

import React, { useState, useEffect } from 'react';
import PromptInput from '@/components/jobs/PromptInput';
import TemplateSelector from '@/components/jobs/TemplateSelector';
import AdvancedOptionsToggle from '@/components/jobs/AdvancedOptionsToggle';
import DeterministicModePanel from '@/components/jobs/DeterministicModePanel';
import SubmitJobButton from '@/components/jobs/SubmitJobButton';

const JobConsole = () => {
  const [isAdvanced, setIsAdvanced] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('video');
  const [jobStatus, setJobStatus] = useState<'queued' | 'running' | 'completed' | 'failed' | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<{ assets: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Advanced options state
  const [selectedVersion, setSelectedVersion] = useState('v1.0');
  const [seed, setSeed] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [voice, setVoice] = useState('alloy');
  const [duration, setDuration] = useState('');
  const [format, setFormat] = useState('mp4');

  // Poll for job status
  useEffect(() => {
    if (jobId && (jobStatus === 'queued' || jobStatus === 'running')) {
      const interval = setInterval(() => {
        fetchJobStatus(jobId);
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [jobId, jobStatus]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setJobStatus(null);
    setJobId(null);
    setJobResult(null);

    const payload = {
      prompt,
      template: selectedTemplate,
      ...(isAdvanced && {
        version: selectedVersion,
        seed,
        aspectRatio,
        voice,
        duration,
        outputFormat: format,
      }),
    };

    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // TODO: Replace with a real API key solution
          'x-api-key': 'test-key-123',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to submit job');
      }

      const data = await response.json();
      setJobId(data.jobId);
      setJobStatus(data.status);

    } catch (err: any) {
      console.error('Submit failed:', err);
      setError(err.message);
    }
  };

  const fetchJobStatus = async (jobId: string) => {
    try {
      const statusResponse = await fetch(`/api/jobs?id=${jobId}`);
      if (!statusResponse.ok) {
        const err = await statusResponse.json();
        throw new Error(err.message || 'Failed to fetch job status');
      }
      
      const statusData = await statusResponse.json();
      setJobStatus(statusData.status);

      if (statusData.status === 'completed') {
        setJobResult(statusData);
      } else if (statusData.status === 'failed') {
        setError(statusData.error || 'Job failed for an unknown reason.');
      }

    } catch (err: any) {
      console.error('Failed to fetch job status:', err);
      setError(err.message);
      setJobStatus('failed');
    }
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg mb-8">
      <h2 className="text-2xl font-bold mb-6">Create New Job</h2>
      <form onSubmit={handleSubmit}>
        <PromptInput prompt={prompt} setPrompt={setPrompt} />
        <TemplateSelector selectedTemplate={selectedTemplate} setSelectedTemplate={setSelectedTemplate} />
        <AdvancedOptionsToggle isAdvanced={isAdvanced} setIsAdvanced={setIsAdvanced} />
        
        {isAdvanced && <DeterministicModePanel 
          selectedVersion={selectedVersion} 
          setSelectedVersion={setSelectedVersion} 
          seed={seed} 
          setSeed={setSeed} 
          aspectRatio={aspectRatio} 
          setAspectRatio={setAspectRatio} 
          voice={voice} 
          setVoice={setVoice} 
          duration={duration} 
          setDuration={setDuration} 
          format={format} 
          setFormat={setFormat} 
        />}

        <div className="flex justify-end mt-6">
          <SubmitJobButton />
        </div>
      </form>

      {jobId && (
        <div className="mt-4 p-4 bg-gray-700 rounded-lg">
          <p className="text-lg font-semibold">Job ID: <span className="font-mono text-sm text-gray-300">{jobId}</span></p>
          <p className="text-lg font-semibold">Status: <span className={`font-bold ${jobStatus === 'completed' ? 'text-green-400' : jobStatus === 'failed' ? 'text-red-400' : 'text-yellow-400'}`}>{jobStatus}</span></p>

          {jobStatus === 'completed' && jobResult && (
            <div className="mt-4">
                <h3 className="text-xl font-bold">Job Completed</h3>
                <p>Assets are ready for download:</p>
                <ul className="list-disc list-inside mt-2">
                    {jobResult.assets.map((asset: any, index: number) => (
                        <li key={index}>
                            <a href={asset.path} download className="text-blue-400 hover:underline">
                                {asset.path.split('/').pop()}
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
          )}

          {jobStatus === 'failed' && error && (
            <div className="mt-4">
                <h3 className="text-xl font-bold text-red-500">Job Failed</h3>
                <p className="text-red-300">{error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default JobConsole;