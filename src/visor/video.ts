// Reference video of an exercise: its own link, or a YouTube search for its technique
export function videoDe(ejercicio: { name: string; videoUrl?: string }): string {
  if (ejercicio.videoUrl) return ejercicio.videoUrl;
  const nombre = ejercicio.name.replace(/^[A-Z]\d?\.\s*|^\d+\.\s*/, '').replace(/\(.*?\)/g, '').trim();
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${nombre} técnica`)}`;
}
