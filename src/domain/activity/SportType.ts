/** Sports the app is built for; everything else is shown as a generic workout. */
export type SportType = 'run' | 'ride' | 'other';

/** Maps free-text sport names from any file format (e.g. "Running", "cycling", Strava's "9"). */
export function sportFromText(text: string | undefined): SportType {
  const value = text?.trim().toLowerCase() ?? '';
  if (value.includes('run') || value === '9') return 'run';
  if (value.includes('cycl') || value.includes('bik') || value.includes('ride') || value === '1') {
    return 'ride';
  }
  return 'other';
}
