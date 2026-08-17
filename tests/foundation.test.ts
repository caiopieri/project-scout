import { describe, it, expect } from 'vitest';
import { SCOUT_SYSTEM_NAME, SCOUT_MVP_TARGET_MARKETPLACE } from '@scout/config';
import { DOMAIN_PACKAGE_STATUS } from '@scout/domain';
import { SCHEMAS_PACKAGE_MARKER } from '@scout/schemas';
import { DATABASE_PACKAGE_MARKER } from '@scout/database';
import { EBAY_CONNECTOR_MARKER } from '@scout/ebay-connector';
import { COLLECTION_PACKAGE_MARKER } from '@scout/collection';
import { AI_PACKAGE_MARKER } from '@scout/ai';

describe('Milestone 1 Foundation Verification Tests', () => {
  it('should import workspace config constants correctly', () => {
    expect(SCOUT_SYSTEM_NAME).toBe('Project Scout');
    expect(SCOUT_MVP_TARGET_MARKETPLACE).toBe('eBay');
  });

  it('should verify all package boundaries export valid markers', () => {
    expect(DOMAIN_PACKAGE_STATUS.package).toBe('@scout/domain');
    expect(DOMAIN_PACKAGE_STATUS.initialized).toBe(true);
    expect(SCHEMAS_PACKAGE_MARKER).toBe('@scout/schemas');
    expect(DATABASE_PACKAGE_MARKER).toBe('@scout/database');
    expect(EBAY_CONNECTOR_MARKER).toBe('@scout/ebay-connector');
    expect(COLLECTION_PACKAGE_MARKER).toBe('@scout/collection');
    expect(AI_PACKAGE_MARKER).toBe('@scout/ai');
  });
});
