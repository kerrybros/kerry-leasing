import { describe, it, expect } from 'vitest';
import { validateRepairDbUrl, assertRepairDbSafety } from '../../src/safety/repairDbSafety.js';

describe('Repair Database Safety Validation', () => {
  describe('validateRepairDbUrl', () => {
    it('should fail when URL is not provided', () => {
      const result = validateRepairDbUrl(undefined);
      
      expect(result.allChecksPassed).toBe(false);
      expect(result.urlPresent).toBe(false);
      expect(result.errors).toContain('REPAIR_DATABASE_URL is not set');
    });

    it('should fail when URL is empty string', () => {
      const result = validateRepairDbUrl('');
      
      expect(result.allChecksPassed).toBe(false);
      expect(result.urlPresent).toBe(false);
    });

    it('should fail when missing default_transaction_read_only option', () => {
      const url = 'postgresql://user:pass@host:5432/db?sslmode=require&schema=public';
      const result = validateRepairDbUrl(url);
      
      expect(result.allChecksPassed).toBe(false);
      expect(result.hasReadOnlyOption).toBe(false);
      expect(result.errors.some(e => e.includes('options'))).toBe(true);
    });

    it('should fail when missing sslmode=require', () => {
      const url = 'postgresql://user:pass@host:5432/db?schema=public&options=-c%20default_transaction_read_only=on';
      const result = validateRepairDbUrl(url);
      
      expect(result.allChecksPassed).toBe(false);
      expect(result.hasSslMode).toBe(false);
      expect(result.errors.some(e => e.includes('SSL mode'))).toBe(true);
    });

    it('should fail when missing schema=public', () => {
      const url = 'postgresql://user:pass@host:5432/db?sslmode=require&options=-c%20default_transaction_read_only=on';
      const result = validateRepairDbUrl(url);
      
      expect(result.allChecksPassed).toBe(false);
      expect(result.hasPublicSchema).toBe(false);
      expect(result.errors.some(e => e.includes('Schema'))).toBe(true);
    });

    it('should pass when all requirements are met (URL-encoded options)', () => {
      const url = 'postgresql://user:pass@host:5432/db?sslmode=require&schema=public&options=-c%20default_transaction_read_only=on';
      const result = validateRepairDbUrl(url);
      
      expect(result.allChecksPassed).toBe(true);
      expect(result.urlPresent).toBe(true);
      expect(result.hasReadOnlyOption).toBe(true);
      expect(result.hasSslMode).toBe(true);
      expect(result.hasPublicSchema).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass when all requirements are met (decoded options)', () => {
      const url = 'postgresql://user:pass@host:5432/db?sslmode=require&schema=public&options=-c default_transaction_read_only=on';
      const result = validateRepairDbUrl(url);
      
      expect(result.allChecksPassed).toBe(true);
      expect(result.hasReadOnlyOption).toBe(true);
    });

    it('should redact password in connection string', () => {
      const url = 'postgresql://user:secret123@host:5432/db?sslmode=require&schema=public&options=-c%20default_transaction_read_only=on';
      const result = validateRepairDbUrl(url);
      
      expect(result.connectionString).toBeDefined();
      expect(result.connectionString).not.toContain('secret123');
      expect(result.connectionString).toContain('***REDACTED***');
    });

    it('should handle invalid URLs gracefully', () => {
      const url = 'not-a-valid-url';
      const result = validateRepairDbUrl(url);
      
      expect(result.allChecksPassed).toBe(false);
      expect(result.errors.some(e => e.includes('parse'))).toBe(true);
    });
  });

  describe('assertRepairDbSafety', () => {
    it('should not throw in test mode', () => {
      const unsafeUrl = 'postgresql://user:pass@host:5432/db';
      
      expect(() => {
        assertRepairDbSafety(unsafeUrl, { isTestMode: true });
      }).not.toThrow();
    });

    it('should not throw when allowUnsafe is true', () => {
      const unsafeUrl = 'postgresql://user:pass@host:5432/db';
      
      expect(() => {
        assertRepairDbSafety(unsafeUrl, { allowUnsafe: true });
      }).not.toThrow();
    });

    it('should not throw when URL is safe', () => {
      const safeUrl = 'postgresql://user:pass@host:5432/db?sslmode=require&schema=public&options=-c%20default_transaction_read_only=on';
      
      expect(() => {
        assertRepairDbSafety(safeUrl);
      }).not.toThrow();
    });

    // Note: We cannot test the exit(1) behavior easily in unit tests
    // as it would terminate the test process. In real usage, it will
    // exit the process when validation fails.
  });

  describe('Safety requirements documentation', () => {
    it('should document all required URL parameters', () => {
      // This test documents the exact requirements
      const requiredParams = {
        sslmode: 'require',
        schema: 'public',
        options: '-c default_transaction_read_only=on',
      };

      const validUrl = `postgresql://user:pass@host:5432/db?sslmode=${requiredParams.sslmode}&schema=${requiredParams.schema}&options=${encodeURIComponent(requiredParams.options)}`;
      const result = validateRepairDbUrl(validUrl);

      expect(result.allChecksPassed).toBe(true);
    });
  });
});
