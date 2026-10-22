import { describe, expect, it } from 'vitest';
import { Activity } from '../src/domain/activity/Activity';
import { Graphemes } from '../src/domain/format/Graphemes';
import { PosterDefaults } from '../src/domain/poster/PosterDesign';
import { ThemeCode } from '../src/domain/poster/ThemeCode';

describe('ThemeCode', () => {
  const theme = { background: '#0E0F12', accent: '#d4ff3a' };

  it('round-trips through the short link form', () => {
    expect(ThemeCode.encode(theme)).toBe('v1-0e0f12-d4ff3a');
    expect(ThemeCode.decode('v1-0e0f12-d4ff3a')).toEqual({
      background: '#0e0f12',
      accent: '#d4ff3a',
    });
  });

  it('rejects anything that is not a valid code', () => {
    for (const bad of ['', 'v2-0e0f12-d4ff3a', 'v1-0e0f12', 'v1-zzzzzz-d4ff3a', 'v1-<script>-x']) {
      expect(ThemeCode.decode(bad)).toBeUndefined();
    }
  });
});

describe('Graphemes', () => {
  it('counts an emoji as one character and never splits it', () => {
    const title = 'Futás 🏃‍♂️🔥';
    expect(Graphemes.count(title)).toBe(8);
    expect(Graphemes.truncate(title, 7)).toBe('Futás 🏃‍♂️');
  });
});

describe('poster title', () => {
  const activity = (name?: string) =>
    new Activity({ sport: 'run', sourceFormat: 'gpx', name }, [{ lat: 47, lon: 19 }]);

  it("starts as the activity's own name, limited in length", () => {
    expect(PosterDefaults.create(activity('Esti kör 🌙'), []).title).toBe('Esti kör 🌙');
    const long = 'x'.repeat(80);
    expect(Graphemes.count(PosterDefaults.create(activity(long), []).title!)).toBe(
      PosterDefaults.MAX_TITLE,
    );
  });

  it('falls back to the automatic title when the file has no name', () => {
    expect(PosterDefaults.create(activity(), []).title).toBeUndefined();
  });
});
