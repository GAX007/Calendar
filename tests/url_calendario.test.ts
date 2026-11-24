import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarUrlCalendario } from '../src/utils/urlCalendario';

test('Enlaces de calendario: webcal y http pasan a https', () => {
  assert.equal(
    normalizarUrlCalendario('webcal://p42-caldav.icloud.com/published/2/abc'),
    'https://p42-caldav.icloud.com/published/2/abc'
  );
  assert.equal(normalizarUrlCalendario('http://example.com/cal.ics'), 'https://example.com/cal.ics');
  assert.equal(
    normalizarUrlCalendario('  "https://calendar.google.com/calendar/ical/x%40group.calendar.google.com/public/basic.ics"  '),
    'https://calendar.google.com/calendar/ical/x%40group.calendar.google.com/public/basic.ics'
  );
  assert.equal(normalizarUrlCalendario('https://ex.com/a.ics?x=1&amp;y=2'), 'https://ex.com/a.ics?x=1&y=2');
});

test('Enlaces de calendario: direcciones locales, privadas o raras se rechazan', () => {
  for (const malo of [
    '', 'calendario', 'ftp://ex.com/a.ics', 'file:///etc/passwd', 'javascript:alert(1)',
    'https://localhost/a.ics', 'https://127.0.0.1/a.ics', 'https://10.0.0.5/a.ics', 'https://192.168.1.1/a.ics',
    'https://172.20.0.1/a.ics', 'https://169.254.169.254/latest/meta-data', 'https://[::1]/a.ics',
    'https://intranet/a.ics', 'https://nas.local/a.ics', 'https://user:pass@ex.com/a.ics', 'https://ex.com:8443/a.ics',
  ]) {
    assert.equal(normalizarUrlCalendario(malo), null, malo);
  }
});
