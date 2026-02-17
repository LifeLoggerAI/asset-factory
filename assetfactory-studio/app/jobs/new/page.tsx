'use client';

import React, { useState, useEffect } from 'react';
import { PresetV1 } from '../../../schemas/preset';
import { Button, Select, TextField, Heading, Grid, Flex, Text, Checkbox, Card } from '@radix-ui/themes';

const NewJobPage = () => {
  const [presets, setPresets] = useState<PresetV1[]>([]);
  const [job, setJob] = useState({
    storyStructure: 'hero_journey',
    audienceType: '',
    tone: '',
    durationSeconds: 90,
    platformTargets: ['tiktok', 'youtube_shorts'],
    visualStyle: '',
    voiceProfile: 'deep_male_narrator',
    pacing: 'fast',
    callToAction: '',
    brandGuidelines: {
      colors: [],
      fonts: [],
      logoUrl: ''
    }
  });
  const [durationError, setDurationError] = useState<string | null>(null);
  const [audienceError, setAudienceError] = useState<string | null>('Audience type is required.');
  const [toneError, setToneError] = useState<string | null>('Tone is required.');
  const [visualStyleError, setVisualStyleError] = useState<string | null>('Visual style is required.');
  const [ctaError, setCtaError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPresets = async () => {
      try {
        const response = await fetch('/api/presets');
        if (response.ok) {
          const data = await response.json();
          setPresets(data);
        }
      } catch (error) {
        console.error('Failed to fetch presets:', error);
      }
    };
    fetchPresets();
  }, []);

  const handlePresetChange = (presetName: string) => {
    const selectedPreset = presets.find(p => p.name === presetName);
    if (selectedPreset) {
      setJob(prevJob => ({ ...prevJob, ...selectedPreset.input }));
      setAudienceError(null);
      setToneError(null);
      setVisualStyleError(null);
    }
  };

  const handleSubmit = async () => {
    if (durationError || audienceError || toneError || visualStyleError || ctaError) {
      alert('Please fix the errors before submitting.');
      return;
    }
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'your-placeholder-api-key'
        },
        body: JSON.stringify(job)
      });

      if (response.ok) {
        window.location.href = '/jobs';
      } else {
        const errorData = await response.json();
        console.error('Failed to submit job:', errorData.message);
        alert(`Error: ${errorData.message}`);
      }
    } catch (error) {
      console.error('An unexpected error occurred:', error);
      alert('An unexpected error occurred. See the console for more details.');
    }
  };

  const handlePlatformChange = (platform: string, checked: boolean) => {
    setJob(prevJob => {
      const newPlatformTargets = checked
        ? [...prevJob.platformTargets, platform]
        : prevJob.platformTargets.filter(p => p !== platform);
      return { ...prevJob, platformTargets: newPlatformTargets };
    });
  };

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const numValue = parseInt(value);
    if (value && numValue <= 0) {
      setDurationError('Duration must be a positive number.');
    } else {
      setDurationError(null);
    }
    setJob({ ...job, durationSeconds: numValue });
  };

  const handleAudienceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (!value) {
      setAudienceError('Audience type is required.');
    } else {
      setAudienceError(null);
    }
    setJob({ ...job, audienceType: value });
  };

  const handleToneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (!value) {
      setToneError('Tone is required.');
    } else {
      setToneError(null);
    }
    setJob({ ...job, tone: value });
  };

  const handleVisualStyleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (!value) {
      setVisualStyleError('Visual style is required.');
    } else {
      setVisualStyleError(null);
    }
    setJob({ ...job, visualStyle: value });
  };
  
  const handleCtaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.length > 150) {
      setCtaError('Call to action cannot exceed 150 characters.');
    } else {
      setCtaError(null);
    }
    setJob({ ...job, callToAction: value });
  };

  return (
    <Flex direction="column" gap="4" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <Heading size="8">Create New Job</Heading>

      <Card>
        <Flex direction="column" gap="2">
          <Text as="label" size="2" weight="bold">Load a Preset</Text>
          <Select.Root onValueChange={handlePresetChange}>
            <Select.Trigger placeholder="-- Select a Preset --" />
            <Select.Content>
              {presets.map(preset => (
                <Select.Item key={preset.name} value={preset.name}>{preset.name} - <Text size="1" color="gray">{preset.description}</Text></Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Flex>
      </Card>

      <Grid columns="2" gap="4">
        <Flex direction="column" gap="2">
          <Text as="label" size="2" weight="bold">Story Structure</Text>
          <Select.Root value={job.storyStructure} onValueChange={(value) => setJob({ ...job, storyStructure: value })}>
            <Select.Trigger />
            <Select.Content>
              <Select.Item value="hero_journey">Hero's Journey</Select.Item>
              <Select.Item value="problem_solution">Problem/Solution</Select.Item>
              <Select.Item value="listicle">Listicle</Select.Item>
              <Select.Item value="cinematic">Cinematic</Select.Item>
            </Select.Content>
          </Select.Root>
        </Flex>

        <Flex direction="column" gap="2">
          <Text as="label" size="2" weight="bold">Pacing</Text>
          <Select.Root value={job.pacing} onValueChange={(value) => setJob({ ...job, pacing: value })}>
            <Select.Trigger />
            <Select.Content>
              <Select.Item value="slow">Slow</Select.Item>
              <Select.Item value="medium">Medium</Select.Item>
              <Select.Item value="fast">Fast</Select.Item>
            </Select.Content>
          </Select.Root>
        </Flex>

        <Flex direction="column" gap="2">
          <Text as="label" size="2" weight="bold">Audience Type</Text>
          <TextField.Root value={job.audienceType} onChange={handleAudienceChange} />
          {audienceError && <Text size="1" color="red">{audienceError}</Text>}
        </Flex>

        <Flex direction="column" gap="2">
          <Text as="label" size="2" weight="bold">Tone</Text>
          <TextField.Root value={job.tone} onChange={handleToneChange} />
          {toneError && <Text size="1" color="red">{toneError}</Text>}
        </Flex>

        <Flex direction="column" gap="2">
          <Text as="label" size="2" weight="bold">Duration (seconds)</Text>
          <TextField.Root type="number" value={job.durationSeconds.toString()} onChange={handleDurationChange} />
          {durationError && <Text size="1" color="red">{durationError}</Text>}
        </Flex>

        <Flex direction="column" gap="2">
          <Text as="label" size="2" weight="bold">Visual Style</Text>
          <TextField.Root value={job.visualStyle} onChange={handleVisualStyleChange} />
          {visualStyleError && <Text size="1" color="red">{visualStyleError}</Text>}
        </Flex>

        <Flex direction="column" gap="2">
          <Text as="label" size="2" weight="bold">Voice Profile</Text>
          <TextField.Root value={job.voiceProfile} onChange={(e) => setJob({ ...job, voiceProfile: e.target.value })} />
        </Flex>

        <Flex direction="column" gap="2">
          <Text as="label" size="2" weight="bold">Call to Action</Text>
          <TextField.Root value={job.callToAction} onChange={handleCtaChange} />
          <Text size="1" color={ctaError ? 'red' : 'gray'}>{job.callToAction.length}/150</Text>
        </Flex>
      </Grid>

      <Card>
        <Flex direction="column" gap="2">
          <Text as="label" size="2" weight="bold">Platform Targets</Text>
          <Grid columns="2" gap="2">
            <Text as="label" size="2">
              <Flex gap="2">
                <Checkbox checked={job.platformTargets.includes('tiktok')} onCheckedChange={(checked) => handlePlatformChange('tiktok', checked as boolean)} />
                TikTok
              </Flex>
            </Text>
            <Text as="label" size="2">
              <Flex gap="2">
                <Checkbox checked={job.platformTargets.includes('youtube_shorts')} onCheckedChange={(checked) => handlePlatformChange('youtube_shorts', checked as boolean)} />
                YouTube Shorts
              </Flex>
            </Text>
            <Text as="label" size="2">
              <Flex gap="2">
                <Checkbox checked={job.platformTargets.includes('instagram_reels')} onCheckedChange={(checked) => handlePlatformChange('instagram_reels', checked as boolean)} />
                Instagram Reels
              </Flex>
            </Text>
            <Text as="label" size="2">
              <Flex gap="2">
                <Checkbox checked={job.platformTargets.includes('urai_storytime')} onCheckedChange={(checked) => handlePlatformChange('urai_storytime', checked as boolean)} />
                URAI Storytime
              </Flex>
            </Text>
          </Grid>
        </Flex>
      </Card>

      <Card>
        <Flex direction="column" gap="3">
          <Heading size="4">Brand Guidelines (Optional)</Heading>
          <Flex direction="column" gap="2">
            <Text as="label" size="2" weight="bold">Colors (comma-separated)</Text>
            <TextField.Root onChange={(e) => setJob({ ...job, brandGuidelines: { ...job.brandGuidelines, colors: e.target.value.split(',').map(s => s.trim()) } })} />
          </Flex>
          <Flex direction="column" gap="2">
            <Text as="label" size="2" weight="bold">Fonts (comma-separated)</Text>
            <TextField.Root onChange={(e) => setJob({ ...job, brandGuidelines: { ...job.brandGuidelines, fonts: e.target.value.split(',').map(s => s.trim()) } })} />
          </Flex>
          <Flex direction="column" gap="2">
            <Text as="label" size="2" weight="bold">Logo URL</Text>
            <TextField.Root onChange={(e) => setJob({ ...job, brandGuidelines: { ...job.brandGuidelines, logoUrl: e.target.value } })} />
          </Flex>
        </Flex>
      </Card>

      <Flex justify="end">
        <Button size="3" onClick={handleSubmit} disabled={!!durationError || !!audienceError || !!toneError || !!visualStyleError || !!ctaError}>Submit Job</Button>
      </Flex>
    </Flex>
  );
};

export default NewJobPage;
