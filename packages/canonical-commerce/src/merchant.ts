import { z } from "zod";
import { CurrencySchema } from "./money.js";

/**
 * Canonical merchant identity.
 *
 * This is the gateway's view of the merchant backing the catalog. The values
 * feed agents.md / llms.txt / UCP generation (in later MVPs) so they must not
 * depend on any adapter-specific shape.
 */

export const MerchantSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    url: z.string().url().optional(),
    logoUrl: z.string().url().optional(),
    defaultCurrency: CurrencySchema,
    supportedCurrencies: z.array(CurrencySchema).default([]),
    country: z.string().optional(),
    supportEmail: z.string().optional(),
    policies: z
      .object({
        shipping: z.string().url().optional(),
        returns: z.string().url().optional(),
        refunds: z.string().url().optional(),
        privacy: z.string().url().optional(),
        terms: z.string().url().optional(),
      })
      .optional(),
  })
  .strict();

export type Merchant = z.infer<typeof MerchantSchema>;

export interface MerchantConfig {
  id: string;
  name: string;
  description?: string;
  url?: string;
  logoUrl?: string;
  defaultCurrency: string;
  supportedCurrencies?: string[];
  country?: string;
  supportEmail?: string;
  policies?: {
    shipping?: string;
    returns?: string;
    refunds?: string;
    privacy?: string;
    terms?: string;
  };
}

export function buildMerchant(config: MerchantConfig): Merchant {
  const merchant: Merchant = {
    id: config.id,
    name: config.name,
    ...(config.description ? { description: config.description } : {}),
    ...(config.url ? { url: config.url } : {}),
    ...(config.logoUrl ? { logoUrl: config.logoUrl } : {}),
    defaultCurrency: config.defaultCurrency.toUpperCase(),
    supportedCurrencies: (config.supportedCurrencies ?? [config.defaultCurrency]).map((c) =>
      c.toUpperCase(),
    ),
    ...(config.country ? { country: config.country } : {}),
    ...(config.supportEmail ? { supportEmail: config.supportEmail } : {}),
    ...(config.policies ? { policies: config.policies } : {}),
  };
  return MerchantSchema.parse(merchant);
}
