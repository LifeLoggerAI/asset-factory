// Only implemented modality lanes can be reported as externally ready.
// Credential presence alone cannot establish a provider's rendering capability.
const providerModalities = {
  openai: ['image', 'audio'],
  replicate: ['image', 'model3d', 'audio', 'sfx', 'music', 'video'],
  fal: ['image', 'model3d', 'audio', 'sfx', 'music', 'video'],
  elevenlabs: ['audio', 'sfx', 'music', 'stt'],
  stability: ['image'],
  runway: ['video'],
  meshy: ['model3d'],
};

export function providerSupportsModality(provider, modality) {
  return Object.hasOwn(providerModalities, provider)
    && providerModalities[provider].includes(modality);
}
