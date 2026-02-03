/**
 * REPAIR DATABASE SAFETY VALIDATION
 * 
 * This module provides critical safety checks to ensure the repair database
 * is configured as READ-ONLY and cannot be accidentally modified.
 * 
 * All checks must pass before the API can start in production mode.
 */

export interface RepairDbSafetyCheck {
  urlPresent: boolean;
  hasReadOnlyOption: boolean;
  hasSslMode: boolean;
  hasPublicSchema: boolean;
  allChecksPassed: boolean;
  connectionString?: string; // Redacted version
  errors: string[];
}

/**
 * Parse and validate REPAIR_DATABASE_URL for read-only safety
 * 
 * @param connectionString - The REPAIR_DATABASE_URL to validate
 * @returns Safety check results
 */
export function validateRepairDbUrl(connectionString: string | undefined): RepairDbSafetyCheck {
  const result: RepairDbSafetyCheck = {
    urlPresent: false,
    hasReadOnlyOption: false,
    hasSslMode: false,
    hasPublicSchema: false,
    allChecksPassed: false,
    errors: [],
  };

  // Check 1: URL is present
  if (!connectionString || connectionString.trim() === '') {
    result.errors.push('REPAIR_DATABASE_URL is not set');
    return result;
  }

  result.urlPresent = true;
  
  // Redact password for logging
  result.connectionString = redactPassword(connectionString);

  try {
    // Parse URL to check query parameters
    const url = new URL(connectionString);
    const params = url.searchParams;

    // Check 2: Must have sslmode=require
    const sslMode = params.get('sslmode');
    if (sslMode === 'require') {
      result.hasSslMode = true;
    } else {
      result.errors.push(
        `SSL mode is not 'require'. Found: ${sslMode || '(none)'}. ` +
        `Expected: sslmode=require`
      );
    }

    // Check 3: Must specify schema=public
    const schema = params.get('schema');
    if (schema === 'public') {
      result.hasPublicSchema = true;
    } else {
      result.errors.push(
        `Schema is not 'public'. Found: ${schema || '(none)'}. ` +
        `Expected: schema=public`
      );
    }

    // Check 4: Must have default_transaction_read_only=on in options
    const options = params.get('options');
    if (options) {
      // Decode URL-encoded options (e.g., %20 -> space, -c -> -c)
      const decodedOptions = decodeURIComponent(options);
      
      // Check for the read-only flag
      // Accepts: -c default_transaction_read_only=on
      // or: --default_transaction_read_only=on
      const hasReadOnlyFlag = 
        decodedOptions.includes('default_transaction_read_only=on') ||
        decodedOptions.includes('default_transaction_read_only on');

      if (hasReadOnlyFlag) {
        result.hasReadOnlyOption = true;
      } else {
        result.errors.push(
          `Missing read-only option in 'options' parameter. ` +
          `Found options: "${decodedOptions}". ` +
          `Expected: options=-c default_transaction_read_only=on (URL-encoded: options=-c%20default_transaction_read_only=on)`
        );
      }
    } else {
      result.errors.push(
        `Missing 'options' query parameter. ` +
        `Expected: options=-c default_transaction_read_only=on (URL-encoded: options=-c%20default_transaction_read_only=on)`
      );
    }
  } catch (error) {
    result.errors.push(
      `Failed to parse REPAIR_DATABASE_URL as valid URL: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // All checks must pass
  result.allChecksPassed =
    result.urlPresent &&
    result.hasReadOnlyOption &&
    result.hasSslMode &&
    result.hasPublicSchema;

  return result;
}

/**
 * Redact password from connection string for safe logging
 */
function redactPassword(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    if (url.password) {
      url.password = '***REDACTED***';
    }
    return url.toString();
  } catch {
    return '[INVALID_URL]';
  }
}

/**
 * Assert that repair database is configured safely
 * 
 * This function MUST be called during API startup.
 * It will throw and exit the process if safety checks fail.
 * 
 * @param connectionString - REPAIR_DATABASE_URL to validate
 * @param options - Configuration options
 * @throws Error if validation fails and not in safe mode
 */
export function assertRepairDbSafety(
  connectionString: string | undefined,
  options: {
    allowUnsafe?: boolean;
    isTestMode?: boolean;
  } = {}
): void {
  const { allowUnsafe = false, isTestMode = false } = options;

  // Skip checks in test mode or if explicitly allowed (DANGEROUS)
  if (isTestMode || allowUnsafe) {
    console.warn('⚠️  REPAIR DATABASE SAFETY CHECKS DISABLED');
    if (allowUnsafe) {
      console.warn('   ALLOW_UNSAFE_REPAIR_DB=true detected');
      console.warn('   THIS IS DANGEROUS AND SHOULD NEVER BE USED IN PRODUCTION');
    }
    if (isTestMode) {
      console.warn('   Test mode detected (NODE_ENV=test)');
    }
    return;
  }

  // Run validation
  const result = validateRepairDbUrl(connectionString);

  // If all checks pass, we're good
  if (result.allChecksPassed) {
    console.log('✓ Repair database safety checks passed (READ-ONLY enforced)');
    console.log(`  Connection: ${result.connectionString}`);
    return;
  }

  // If checks fail, this is FATAL
  console.error('\n' + '='.repeat(80));
  console.error('❌ FATAL: REPAIR DATABASE SAFETY CHECKS FAILED');
  console.error('='.repeat(80));
  console.error('\nThe repair database MUST be configured as READ-ONLY.');
  console.error('This is a critical safety requirement to prevent data corruption.\n');
  
  if (result.errors.length > 0) {
    console.error('Errors found:');
    result.errors.forEach((error, index) => {
      console.error(`  ${index + 1}. ${error}`);
    });
    console.error('');
  }

  console.error('Required configuration:');
  console.error('  REPAIR_DATABASE_URL must include:');
  console.error('    - sslmode=require');
  console.error('    - schema=public');
  console.error('    - options=-c%20default_transaction_read_only=on');
  console.error('');
  console.error('Example:');
  console.error('  REPAIR_DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require&schema=public&options=-c%20default_transaction_read_only=on"');
  console.error('');
  console.error('To bypass this check (LOCAL TESTING ONLY):');
  console.error('  Set ALLOW_UNSAFE_REPAIR_DB=true in .env');
  console.error('  WARNING: NEVER USE THIS IN PRODUCTION!');
  console.error('\n' + '='.repeat(80) + '\n');

  // Exit the process - we cannot start with an unsafe configuration
  process.exit(1);
}

/**
 * Get detailed safety status for admin endpoint
 * This does NOT attempt any writes, only returns parsed status
 */
export function getRepairDbSafetyStatus(): RepairDbSafetyCheck {
  const connectionString = process.env.REPAIR_DATABASE_URL;
  return validateRepairDbUrl(connectionString);
}
