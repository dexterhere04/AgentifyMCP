export { RestCommerceProvider, validateRestConfig } from "./adapter.js";
export type { RestAdapterConfig } from "./config.js";
export {
  mapProduct,
  mapVariant,
  mapOfferRow,
  moneyFromRaw,
  summaryFromProduct,
  offerFromCanonicalVariant,
  searchResultFilter,
  sortSummaries,
} from "./mapping.js";
export type { MappingContext } from "./mapping.js";
export { read, interpolate } from "./path.js";
export { HttpClient } from "./http.js";
export type {
  AuthConfig,
  SearchEndpointConfig,
  RestHttpConfig,
  RestCatalogEndpoints,
  ProductMapping,
  VariantMapping,
  OfferMapping,
  ProductVariantRows,
  ScalarRef,
  MoneyRef,
  AvailabilityRef,
} from "./config.js";
export {
  createFixtureStoreServer,
  FIXTURE_TOKEN,
  type FixtureStore,
} from "./fixture.js";
export { PRODUCTS } from "./fixture.js";
export {
  buildSecondStoreConfig,
  secondStoreVariantMapping,
} from "./second-store-config.js";

