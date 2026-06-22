import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import { Platform } from 'react-native';
import { getAppSetting, setAppSetting } from '../db/queries/appSettings';

export const PRO_ENTITLEMENT_ID = 'pro';
const DEV_STUB_SETTING_KEY = 'isProDevStub';

/**
 * RevenueCat API keys, set at build time. Until these are configured the
 * app falls back to a local dev stub (see setProDevStubEnabled) so the
 * paywall UI and entitlement gating can be built and tested without a
 * live App Store / Play Billing connection.
 */
const REVENUECAT_API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS ?? '';
const REVENUECAT_API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID ?? '';

let configured = false;

export function isRevenueCatConfigured(): boolean {
  const key = Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;
  return key.length > 0;
}

export function configureRevenueCat(): void {
  if (configured || !isRevenueCatConfigured()) return;
  const apiKey = Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;
  Purchases.configure({ apiKey });
  configured = true;
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!isRevenueCatConfigured()) return null;
  configureRevenueCat();
  return Purchases.getCustomerInfo();
}

export async function getAvailablePackages(): Promise<PurchasesPackage[]> {
  if (!isRevenueCatConfigured()) return [];
  configureRevenueCat();
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  configureRevenueCat();
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo> {
  configureRevenueCat();
  return Purchases.restorePurchases();
}

export async function isProDevStubEnabled(): Promise<boolean> {
  const value = await getAppSetting(DEV_STUB_SETTING_KEY);
  return value === 'true';
}

export async function setProDevStubEnabled(enabled: boolean): Promise<void> {
  await setAppSetting(DEV_STUB_SETTING_KEY, enabled ? 'true' : 'false');
}

/**
 * Single source of truth for entitlement gating throughout the app.
 * Real RevenueCat entitlement when configured, otherwise the local dev stub.
 */
export async function checkIsPro(): Promise<boolean> {
  if (isRevenueCatConfigured()) {
    const info = await getCustomerInfo();
    return Boolean(info?.entitlements.active[PRO_ENTITLEMENT_ID]);
  }
  return isProDevStubEnabled();
}
