/** Downloaded assets; provenance and processing are recorded beside the files. */
export const AUDIO_ASSETS={
  light1:new URL('./audio/metal-light-1.wav',import.meta.url).href,
  light2:new URL('./audio/metal-light-2.wav',import.meta.url).href,
  heavy1:new URL('./audio/metal-heavy-1.wav',import.meta.url).href,
  heavy2:new URL('./audio/metal-heavy-2.wav',import.meta.url).href,
  sling:new URL('./audio/sling-release.wav',import.meta.url).href,
  place:new URL('./audio/metal-place.wav',import.meta.url).href,
  zap:new URL('./audio/electric-zap.wav',import.meta.url).href,
  electricOn:new URL('./audio/electric-on.wav',import.meta.url).href,
  boost:new URL('./audio/boost-pass.wav',import.meta.url).href,
  off:new URL('./audio/power-off.wav',import.meta.url).href,
  reactor:new URL('./audio/reactor-loop.wav',import.meta.url).href,
  electric:new URL('./audio/electric-loop.wav',import.meta.url).href,
  ambience:new URL('./audio/factory-ambience.mp3',import.meta.url).href,
  music:new URL('./audio/glutton-music.mp3',import.meta.url).href,
};
export type AudioAsset=keyof typeof AUDIO_ASSETS;
