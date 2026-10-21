import { CITIES, COUNTRY_METHODS, countryMethod } from '../cities';

describe('countryMethod', () => {
  test.each([
    ['المغرب', 'Morocco'],
    ['السعودية', 'UmmAlQura'],
    ['مصر', 'Egyptian'],
    ['فرنسا', 'MuslimWorldLeague'],
  ] as const)('gives %s %s', (country, method) => {
    expect(countryMethod(country)).toBe(method);
  });

  // A misspelt country would quietly fall back to the Muslim World League.
  test('names only countries that the city list has', () => {
    const countries = new Set(CITIES.map((city) => city.country));
    for (const country of Object.keys(COUNTRY_METHODS)) expect(countries).toContain(country);
  });
});
