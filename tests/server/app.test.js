'use strict';

const request = require('supertest');
const { isAllowedHost } = require('../../src/server/app');
const { startHarness } = require('../helpers/app-harness');

describe('isAllowedHost', () => {
  describe('Invalid inputs', () => {
    test('returns false for undefined host', () => {
      expect(isAllowedHost(undefined)).toBe(false);
    });

    test('returns false for empty string', () => {
      expect(isAllowedHost('')).toBe(false);
    });
  });

  describe('Localhost defaults', () => {
    test('allows localhost', () => {
      expect(isAllowedHost('localhost')).toBe(true);
      expect(isAllowedHost('localhost:8080')).toBe(true);
      expect(isAllowedHost('LOCALHOST:8080')).toBe(true);
    });

    test('allows 127.0.0.1', () => {
      expect(isAllowedHost('127.0.0.1')).toBe(true);
      expect(isAllowedHost('127.0.0.1:3000')).toBe(true);
    });

    test('allows IPv6 loopback with brackets', () => {
      expect(isAllowedHost('[::1]')).toBe(true);
      expect(isAllowedHost('[::1]:3000')).toBe(true);
    });
  });

  describe('Configuration defaults', () => {
    test('allows specific config.bind address', () => {
      const options = { config: { bind: '192.168.1.100' } };
      expect(isAllowedHost('192.168.1.100', options)).toBe(true);
      expect(isAllowedHost('192.168.1.100:8080', options)).toBe(true);

      // other non-localhost addresses are rejected by default
      expect(isAllowedHost('192.168.1.101', options)).toBe(false);
    });

    test('does not add 0.0.0.0 to allowed explicit names', () => {
      const options = { config: { bind: '0.0.0.0' } };
      // 0.0.0.0 enables allowRemote, so actual IPs are allowed, but string "0.0.0.0" isn't explicitly matched
      // wait, "0.0.0.0" is an IP, so it matches allowRemote's isIpOrLocal regex.
      // So '0.0.0.0' actually IS allowed when allowRemote is enabled.
      expect(isAllowedHost('0.0.0.0', options)).toBe(true);
      // but an external domain is rejected
      expect(isAllowedHost('example.com', options)).toBe(false);
    });

    test('does not add :: to allowed explicit names', () => {
      const options = { config: { bind: '::' } };
      // config.bind='::' does NOT set allowRemote (only 0.0.0.0 does via config)
      // so it should not allow random domains or random IPs
      expect(isAllowedHost('192.168.1.101', options)).toBe(false);
      expect(isAllowedHost('example.com', options)).toBe(false);
    });
  });

  describe('Environment overrides (GVE_NOW_ALLOWED_HOSTS)', () => {
    test('allows custom domains provided in env', () => {
      const options = { env: { GVE_NOW_ALLOWED_HOSTS: 'my-comics.com,  ANOTHER.ORG ' } };
      expect(isAllowedHost('my-comics.com', options)).toBe(true);
      expect(isAllowedHost('another.org', options)).toBe(true);
      expect(isAllowedHost('another.org:8080', options)).toBe(true);

      expect(isAllowedHost('not-allowed.com', options)).toBe(false);
    });

    test('allows all hosts when wildcard * is provided', () => {
      const options = { env: { GVE_NOW_ALLOWED_HOSTS: 'my-comics.com,*' } };
      expect(isAllowedHost('random-domain.com', options)).toBe(true);
      expect(isAllowedHost('12.34.56.78', options)).toBe(true);
    });
  });

  describe('Remote allowance (allowRemote)', () => {
    const testRemoteAllowed = (options) => {
      // IPv4
      expect(isAllowedHost('192.168.1.5', options)).toBe(true);
      expect(isAllowedHost('10.0.0.1', options)).toBe(true);
      expect(isAllowedHost('10.0.0.1:8080', options)).toBe(true);

      // IPv6
      expect(isAllowedHost('[fe80::1ff:fe23:4567:890a]', options)).toBe(true);
      expect(isAllowedHost('[fe80::1ff:fe23:4567:890a]:8080', options)).toBe(true);

      // .local domains
      expect(isAllowedHost('raspberrypi.local', options)).toBe(true);
      expect(isAllowedHost('raspberrypi.local:8080', options)).toBe(true);
      expect(isAllowedHost('JULES-MACBOOK.LOCAL', options)).toBe(true);

      // standard external domains remain rejected
      expect(isAllowedHost('example.com', options)).toBe(false);
      expect(isAllowedHost('malicious.org', options)).toBe(false);
    };

    test('enabled via env.GVE_NOW_ALLOW_REMOTE = 1', () => {
      testRemoteAllowed({ env: { GVE_NOW_ALLOW_REMOTE: '1' } });
    });

    test('enabled via config.bind = 0.0.0.0', () => {
      testRemoteAllowed({ config: { bind: '0.0.0.0' } });
    });

    test('NOT enabled by default', () => {
      const options = { env: {} };
      expect(isAllowedHost('192.168.1.5', options)).toBe(false);
      expect(isAllowedHost('[fe80::1ff:fe23:4567:890a]', options)).toBe(false);
      expect(isAllowedHost('raspberrypi.local', options)).toBe(false);
    });
  });
});

describe('createApp', () => {
  let harness;

  beforeAll(async () => {
    harness = await startHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  test('adds security headers', async () => {
    const res = await request(harness.server).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('rejects disallowed hosts', async () => {
    const res = await request(harness.server)
      .get('/api/health')
      .set('Host', 'malicious.com');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: 'untrusted or forbidden host header: malicious.com'
    });
  });

  test('handles invalid JSON body', async () => {
    const res = await request(harness.server)
      .post('/api/import/score')
      .set('Content-Type', 'application/json')
      .send('{ invalid json');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid JSON body' });
  });

  test('handles internal errors securely', async () => {
    // Force an error inside a route by mocking a db call
    const prepareSpy = jest.spyOn(harness.db, 'prepare').mockImplementationOnce(() => {
      throw new Error('Database exploded');
    });

    // We need to restore console.error temporarily or suppress it so we don't pollute test output.
    // The app handles errors by logging them to console.error and returning a 500.
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const res = await request(harness.server).get('/api/health');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'internal error' });
    } finally {
      prepareSpy.mockRestore();
      consoleSpy.mockRestore();
    }
  });
});
