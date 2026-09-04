# Agentic Commerce Gateway
## Architecture, Incremental MVPs, Supported Formats, and Test Strategy

## 1. Product Goal

Build a **pluggable agent-commerce gateway** that upgrades an existing ecommerce store into an **agentically discoverable, queryable, and eventually transactable merchant** without requiring the merchant to rebuild their storefront.

The merchant keeps its current:
- storefront
- product database
- inventory system
- pricing engine
- discount logic
- cart/checkout backend
- order management
- payment provider

The gateway adds:
- a normalized commerce model
- catalog and availability access for AI agents
- UCP discovery
- MCP tools
- `agents.md`
- `llms.txt`
- optional `SKILL.md`
- semantic product discovery
- checkout and payment orchestration
- auditability and safety gates

The initial Buildathon goal is:

> Connect a non-Shopify ecommerce store and make it agent-ready through one integration layer.

The longer-term goal is:

> Become the infrastructure layer that turns any ecommerce backend into an agent-native merchant.

---

# 2. High-Level Architecture

```text
                       AI AGENTS
              ChatGPT / Claude / Gemini
                         │
                         │
              UCP discovery + MCP calls
                         │
                         ▼
             ┌────────────────────────┐
             │ AGENT COMMERCE GATEWAY │
             ├────────────────────────┤
             │ Discovery              │
             │ Catalog                │
             │ Semantic Search        │
             │ Pricing                │
             │ Discounts              │
             │ Inventory              │
             │ Cart                   │
             │ Checkout               │
             │ Orders                 │
             │ Audit                  │
             └────────────┬───────────┘
                          │
                  Canonical Commerce API
                          │
             ┌────────────┴────────────┐
             │     Merchant Adapter    │
             └────────────┬────────────┘
                          │
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
   Merchant REST     Merchant GraphQL    Merchant DB
        │                 │                  │
        └─────────────────┼──────────────────┘
                          ▼
                Existing Ecommerce Store
                          │
                     Payment Layer
                          │
                       Razorpay
```

The central design rule is:

> UCP and MCP must never depend directly on a specific merchant schema.

All merchant-specific complexity must be absorbed by the **Merchant Adapter**.

---

# 3. Core Architectural Layers

## 3.1 Integration Layer

Responsible for reading and writing data from the merchant's existing infrastructure.

Supported integration modes should eventually include:

1. REST APIs
2. OpenAPI-described REST APIs
3. GraphQL APIs
4. PostgreSQL
5. MySQL
6. MongoDB
7. CSV / JSON / XML product feeds
8. WooCommerce
9. Magento
10. custom SDK integration
11. webhook/event feeds
12. later: Shopify for compatibility testing, although the initial product thesis is non-Shopify merchants

The integration layer transforms merchant-specific data into the gateway's normalized schema.

---

## 3.2 Canonical Commerce Model

All downstream logic should operate on normalized entities.

Core entities:

```text
Merchant
Product
Variant
Price
Discount
Inventory
Offer
Cart
CartItem
BuyerContext
ShippingOption
Checkout
PaymentSession
Order
Refund
```

Example:

```typescript
interface Money {
  amount: number;          // minor units
  currency: string;        // ISO currency code
}

interface Product {
  id: string;
  title: string;
  description?: string;
  category?: string;
  brand?: string;
  images: string[];
  attributes: Record<string, string | string[]>;
  variants: Variant[];
  sourceUrl?: string;
}

interface Variant {
  id: string;
  productId: string;
  sku?: string;

  attributes: Record<string, string>;

  pricing: {
    listPrice: Money;
    salePrice?: Money;
  };

  availability: {
    status: "in_stock" | "out_of_stock" | "limited" | "unknown";
    quantity?: number;
  };
}

interface Discount {
  id: string;
  type: "percentage" | "fixed" | "coupon" | "automatic";
  value?: number;
  amount?: Money;
  code?: string;
  description?: string;
  validUntil?: string;
}

interface Offer {
  productId: string;
  variantId: string;
  price: Money;
  originalPrice?: Money;
  discounts: Discount[];
  availability: Availability;
  delivery?: DeliveryEstimate;
}
```

### Important normalization rules

- Money should use **minor currency units** wherever possible.
- Currency must always be explicit.
- Product IDs and variant IDs must remain stable.
- Inventory must distinguish:
  - in stock
  - out of stock
  - limited
  - unknown
- Pricing must distinguish:
  - list price
  - effective/sale price
  - tax-inclusive vs tax-exclusive where relevant
- Discounts must distinguish:
  - automatic discounts
  - coupon/code discounts
  - percentage discounts
  - fixed-value discounts
- The canonical model should preserve source-specific metadata in an `extensions` field when necessary.

---

# 4. Merchant Adapter Contract

Every integration should implement the same logical interface.

```typescript
interface CommerceProvider {
  merchant(): Promise<Merchant>;

  catalog: {
    search(input: SearchInput): Promise<SearchResult>;
    getProduct(id: string): Promise<Product>;
    getVariant(id: string): Promise<Variant>;
  };

  inventory: {
    check(input: InventoryInput): Promise<Availability>;
  };

  pricing: {
    getOffer(input: OfferInput): Promise<Offer>;
  };

  cart?: {
    create(input?: CreateCartInput): Promise<Cart>;
    get(cartId: string): Promise<Cart>;
    addItem(input: AddCartItemInput): Promise<Cart>;
    updateItem(input: UpdateCartItemInput): Promise<Cart>;
    removeItem(input: RemoveCartItemInput): Promise<Cart>;
  };

  checkout?: {
    create(input: CreateCheckoutInput): Promise<Checkout>;
    get(id: string): Promise<Checkout>;
    update(input: UpdateCheckoutInput): Promise<Checkout>;
    complete(input: CompleteCheckoutInput): Promise<Order>;
    cancel(id: string): Promise<Checkout>;
  };

  orders?: {
    get(id: string): Promise<Order>;
  };
}
```

Capabilities must be optional.

A catalog-only merchant should not need to implement checkout.

The gateway should derive advertised capabilities from implemented adapter methods.

---

# 5. Adapter Types

## 5.1 SDK Adapter

For merchants willing to add code.

Example:

```typescript
import { createAgentCommerce } from "@agentify/sdk";

const commerce = createAgentCommerce({
  catalog: {
    search: merchantSearch,
    getProduct: merchantGetProduct
  },
  inventory: {
    check: merchantInventory
  },
  pricing: {
    getOffer: merchantPricing
  }
});

commerce.mount(app);
```

Advantages:
- strongest correctness
- merchant keeps control
- easiest to support real-time operations

---

## 5.2 Config-Driven REST Adapter

Merchant supplies mappings instead of code.

```yaml
merchant:
  id: demo-store
  name: Demo Store
  default_currency: INR

catalog:
  search:
    method: GET
    url: https://merchant.example/api/products
    query:
      q: "{{query}}"

  product:
    method: GET
    url: https://merchant.example/api/products/{{id}}

mapping:
  product:
    id: "$.id"
    title: "$.name"
    description: "$.description"
    category: "$.category"
    images: "$.images[*]"

  variant:
    id: "$.variants[*].id"
    sku: "$.variants[*].sku"
    price: "$.variants[*].sale_price"
    list_price: "$.variants[*].mrp"
    stock: "$.variants[*].inventory"
```

Useful mapping formats:
- JSONPath
- JMESPath
- Handlebars-like templates
- static defaults
- transformations

---

## 5.3 OpenAPI Adapter

Input:
- OpenAPI 3.0 / 3.1 JSON
- OpenAPI 3.0 / 3.1 YAML

Flow:

```text
OpenAPI document
       ↓
Endpoint detection
       ↓
Merchant confirms mapping
       ↓
Schema mapping
       ↓
CommerceProvider
```

The first version should **not rely entirely on AI auto-mapping**.

Use:
1. heuristic suggestions
2. optional LLM-assisted mapping
3. explicit merchant confirmation
4. generated integration test

---

## 5.4 GraphQL Adapter

Support:
- GraphQL SDL schema
- introspection result
- explicit query templates

Example:

```graphql
query SearchProducts($query: String!) {
  products(search: $query) {
    id
    name
    price
    stock
  }
}
```

Map GraphQL response paths into canonical fields.

---

## 5.5 Database Adapter

Initial targets:
- PostgreSQL
- MySQL

Later:
- MongoDB

Read access can expose:
- catalog
- inventory
- pricing

Write access should be avoided initially unless merchant explicitly configures transactional operations.

Example mapping:

```yaml
products:
  table: products
  id: id
  title: name
  description: description
  category: category

variants:
  table: variants
  product_id: product_id
  id: id
  sku: sku
  price: price

inventory:
  table: inventory
  variant_id: variant_id
  quantity: available_quantity
```

---

## 5.6 Feed Adapter

Support product discovery from:
- JSON
- CSV
- XML

Potential future compatibility:
- Google Merchant-style feeds
- custom ERP exports
- scheduled S3/file uploads

Feeds are useful for catalog ingestion but should not be treated as authoritative for real-time inventory unless explicitly configured.

---

# 6. Agent-Facing Interfaces

## 6.1 `/.well-known/ucp`

Purpose:

> Machine-readable capability discovery.

The endpoint should advertise only capabilities the merchant actually supports.

Examples:
- catalog only
- catalog + cart
- catalog + cart + checkout
- full catalog + cart + checkout + orders

The generator should consume the adapter capability graph.

```text
Merchant Adapter
       ↓
Capability Detector
       ↓
UCP Profile Builder
       ↓
/.well-known/ucp
```

The gateway should be version-aware so protocol changes do not leak into merchant adapters.

---

# 6.2 MCP Endpoint

Example:

```text
POST /mcp
```

The tool registry should be dynamic.

Potential tools:

```text
search_catalog
get_product
get_variant
check_availability
get_offer
get_discounts

create_cart
get_cart
add_to_cart
update_cart_item
remove_from_cart

create_checkout
get_checkout
update_checkout
complete_checkout
cancel_checkout

get_order
```

If the merchant only exposes catalog functionality:

```text
tools/list
```

should not expose transactional tools.

---

# 6.3 `agents.md`

Purpose:

> Merchant-specific behavioral instructions for AI agents.

Generated from configuration.

Should contain:
- merchant identity
- discovery endpoints
- supported actions
- payment approval policy
- rate limits
- supported currencies/countries
- fulfillment constraints
- refund/shipping policy links
- preferred agent behavior
- failure-handling expectations

---

# 6.4 `llms.txt`

Purpose:

> Human/LLM-readable orientation and navigation.

Should contain:
- store identity
- product/catalog locations
- product browsing URLs
- category URLs
- UCP discovery URL
- MCP endpoint
- policy URLs
- contact/support URLs
- canonical `agents.md`

Avoid embedding a full catalog inside `llms.txt`.

---

# 6.5 Optional `SKILL.md`

Not part of the core protocol.

Use as an **agent behavior/playbook layer**.

Potential responsibilities:
- intent collection
- product ranking
- upsell strategy
- cross-sell strategy
- explicit approval behavior
- transaction failure handling
- order follow-up

For the first MVP, this may remain optional.

---

# 7. Catalog Ingestion and Search Architecture

The gateway should support two modes.

## 7.1 Live Search

```text
Agent query
    ↓
MCP search_catalog
    ↓
Merchant API
    ↓
Normalize response
    ↓
Return results
```

Advantages:
- fresh
- simple

Disadvantages:
- merchant search quality varies
- higher latency
- poor semantic search on old stores

---

## 7.2 Indexed Search

```text
Merchant Catalog
      ↓
Catalog Ingestion
      ↓
Normalization
      ↓
Search Index
      ↓
Semantic Enrichment
      ↓
Agent Product Index
```

Agent query:

```text
Agent
  ↓
semantic + structured search
  ↓
candidate products
  ↓
LIVE inventory / offer verification
  ↓
final result
```

Important principle:

> Search may be indexed; availability and final price should be verified live before purchase.

---

# 8. Search Capabilities

The search interface should support:

## Text

```text
"gold necklace"
```

## Structured filters

```json
{
  "category": "necklace",
  "max_price": 500000,
  "currency": "INR",
  "in_stock": true
}
```

## Contextual queries

```text
"minimalist anniversary gift for my wife under ₹5000"
```

Extractable context:

```json
{
  "occasion": "anniversary",
  "recipient": "wife",
  "style": "minimalist",
  "budget": 500000
}
```

## Variant filters

- size
- color
- material
- storage
- gender
- compatibility
- dimensions
- merchant-specific attributes

## Sorting

- relevance
- price ascending
- price descending
- discount
- availability
- merchant-defined popularity

---

# 9. Incremental MVP Plan

# MVP 0 — Canonical Model + Local Mock Merchant

## Goal

Prove the abstraction before building protocols.

Build:
- 20–50 sample products
- variants
- inventory
- list price
- sale price
- discounts
- categories

Implement:

```text
CommerceProvider
catalog.search()
catalog.getProduct()
inventory.check()
pricing.getOffer()
```

### Acceptance Tests

- search exact product name
- search partial product name
- search category
- filter by price
- filter in-stock products
- retrieve variant
- return sale price
- return no-discount product
- out-of-stock product
- unknown inventory
- malformed merchant record
- duplicate merchant SKU

---

# MVP 1 — Agent-Queryable Catalog

## Goal

Make a non-Shopify store queryable by an agent.

Build:
- MCP server
- `search_catalog`
- `get_product`
- `check_availability`
- `get_offer`
- dynamic `tools/list`

Generate:
- `agents.md`
- `llms.txt`

### Demo

User:

> Find an elegant necklace below ₹5,000 that is currently in stock.

Agent:
1. discovers tools
2. searches
3. checks availability
4. checks live offer
5. returns structured recommendation

### Acceptance Tests

MCP:
- initialize
- tools/list
- valid tool call
- invalid tool call
- invalid arguments
- unsupported merchant capability
- unknown product ID
- merchant backend timeout
- merchant backend 500
- rate limit behavior

Catalog:
- exact price
- sale price
- currency
- discount
- stock
- variant availability
- pagination
- empty result

---

# MVP 2 — UCP Discovery

## Goal

Make the merchant discoverable as an agentic commerce endpoint.

Build:

```text
/.well-known/ucp
```

Generate UCP capability metadata from the provider implementation.

### Tests

- valid discovery response
- correct merchant identity
- correct service URL
- correct MCP endpoint
- only supported capabilities advertised
- valid protocol version
- correct MIME type
- HTTPS deployment
- malformed configuration must fail startup
- capability mismatch should fail validation

### Contract Tests

Create fixtures for:
- catalog-only merchant
- catalog + cart merchant
- full merchant

Ensure profile changes correctly for each.

---

# MVP 3 — Pluggable REST Adapter

## Goal

Integrate a real custom ecommerce backend without rewriting it.

Support:
- JSON REST APIs
- config-driven mapping
- bearer API keys
- custom headers
- query parameters
- pagination

### Input Formats

- JSON
- nested JSON
- array responses
- `{ data: [...] }`
- paginated responses
- cursor responses

### Test Fixtures

Test merchant responses like:

#### Shape A

```json
{
  "id": "123",
  "name": "Gold Necklace",
  "price": 3999,
  "stock": 12
}
```

#### Shape B

```json
{
  "product_id": "123",
  "title": "Gold Necklace",
  "pricing": {
    "mrp": 4999,
    "selling_price": 3999
  },
  "inventory": {
    "available": true,
    "quantity": 12
  }
}
```

#### Shape C

```json
{
  "data": {
    "product": {
      "sku": "NECK-123",
      "variants": [...]
    }
  }
}
```

### Failure Tests

- missing field
- `null` price
- price as string
- price as float
- inventory as boolean
- inventory as number
- bad currency
- missing ID
- duplicate IDs
- slow endpoint
- HTTP 401
- HTTP 403
- HTTP 404
- HTTP 429
- HTTP 500
- invalid JSON

---

# MVP 4 — OpenAPI Assisted Integration

## Goal

Merchant uploads an OpenAPI document and receives a suggested adapter.

Support:
- OpenAPI 3.0 JSON
- OpenAPI 3.0 YAML
- OpenAPI 3.1 JSON
- OpenAPI 3.1 YAML

Flow:

```text
Upload spec
   ↓
Detect candidate endpoints
   ↓
Suggest commerce mappings
   ↓
Merchant confirms
   ↓
Generate adapter config
   ↓
Run integration tests
```

### Tests

OpenAPI:
- refs
- nested refs
- request body schemas
- query params
- path params
- API key auth
- bearer auth
- multiple servers
- nullable fields
- enums
- arrays
- polymorphic schemas where practical

Reject gracefully:
- invalid YAML
- invalid JSON
- unsupported OpenAPI version
- unresolved references

---

# MVP 5 — Catalog Index + Semantic Search

## Goal

Make weak ecommerce search engines agent-friendly.

Components:
- ingestion worker
- normalized catalog DB
- text search
- vector/semantic search
- structured filters
- ranking pipeline

Suggested stores:
- PostgreSQL for metadata
- pgvector or dedicated vector DB for embeddings

### Enrichment

Infer or normalize:
- category
- material
- color
- target audience
- occasion
- style
- compatibility
- common use cases

Preserve original merchant fields.

### Tests

Semantic:
- synonym match
- natural language description
- occasion query
- budget constraint
- conflicting filters
- no matching products

Freshness:
- product added
- product removed
- product updated
- price changed
- stock changed

Critical rule:

> Search index may be stale. Live offer verification must happen before transactional recommendation.

---

# MVP 6 — Cart + Checkout

## Goal

Move from queryable to transactable.

Add:

```text
create_cart
get_cart
add_to_cart
update_cart_item
remove_from_cart

create_checkout
get_checkout
update_checkout
cancel_checkout
```

### Required Concepts

- idempotency
- checkout state machine
- buyer context
- shipping address
- shipping options
- totals
- taxes
- discounts
- expiration

### State Model

```text
CREATED
   ↓
UPDATED
   ↓
READY_FOR_PAYMENT
   ↓
AWAITING_APPROVAL
   ↓
PAYMENT_PENDING
   ↓
COMPLETED

Alternative states:

CANCELLED
FAILED
EXPIRED
```

### Tests

- cart creation
- add one variant
- multiple variants
- quantity update
- stock becomes unavailable
- price changes between search and cart
- coupon applied
- invalid coupon
- shipping unavailable
- checkout expired
- repeated complete request
- duplicate network request
- cart total correctness

---

# MVP 7 — Razorpay Test-Mode Payment

## Goal

Complete one real agent-driven checkout in sandbox mode.

Flow:

```text
Agent
  ↓
create_checkout
  ↓
Gateway
  ↓
Razorpay Test Mode
  ↓
Buyer Approval
  ↓
Payment
  ↓
Order
```

### Safety Requirements

Every payment action must be:
- explainable
- bounded
- approval-gated
- auditable

Store:
- requested items
- final price
- discounts
- approval event
- checkout ID
- payment ID
- order ID
- timestamps

### Tests

- successful payment
- declined payment
- payment cancelled
- timeout
- retry
- duplicate callback
- invalid webhook signature
- payment captured but order creation fails
- order created but response is lost
- idempotent retry
- amount mismatch
- currency mismatch

---

# MVP 8 — Integration Dashboard

## Goal

Make the product usable by a merchant without editing gateway code.

Wizard:

```text
1. Store Identity
2. Integration Type
3. Connect API / DB
4. Map Product Fields
5. Map Inventory
6. Map Pricing
7. Map Cart / Checkout
8. Test Integration
9. Publish Agent Endpoints
```

Final screen:

```text
Agent readiness

✓ Catalog
✓ Pricing
✓ Inventory
✓ Discounts
✓ MCP
✓ UCP
✓ agents.md
✓ llms.txt

○ Cart
○ Checkout
○ Orders
```

This naturally supports partial adoption.

---

# MVP 9 — Agentic Revenue Intelligence

## Goal

Address the revenue-growth side of the Buildathon.

Add:
- contextual ranking
- upsell
- cross-sell
- discount reasoning
- bundle recommendations
- merchant-defined margin rules

Example:

```text
Buyer budget: ₹5,000

Chosen product:
₹3,999

Potential upsell:
₹4,799 premium variant

Potential cross-sell:
₹799 earrings
```

Rules:
- never violate explicit budget
- never hide price changes
- explain recommendation rationale
- merchant may configure margin and promotion preferences
- user approval before cart modification where appropriate

---

# 10. Supported Input Formats

The gateway should eventually accommodate the following.

## API Formats

### REST
- JSON
- nested JSON
- JSON arrays
- HAL-like structures where practical

### GraphQL
- schema introspection
- predefined query templates

### API Description
- OpenAPI 3.0 JSON
- OpenAPI 3.0 YAML
- OpenAPI 3.1 JSON
- OpenAPI 3.1 YAML

### Feeds
- JSON
- CSV
- XML

### Databases
- PostgreSQL
- MySQL
- MongoDB

---

# 11. Data Variations That Must Be Tested

## Money

Test:

```text
3999
3999.00
"3999"
399900 minor units
₹3,999 string
null
```

Canonical output must be unambiguous.

Example:

```json
{
  "amount": 399900,
  "currency": "INR"
}
```

---

## Currency

Test:
- INR
- USD
- EUR
- merchant default currency
- per-product currency
- unsupported currency
- lowercase currency values

---

## Inventory

Source shapes:

```json
12
```

```json
true
```

```json
"in_stock"
```

```json
{
  "available": true,
  "quantity": 12
}
```

All must map consistently.

---

## Products

Test:
- simple product
- product with variants
- product without description
- product without image
- digital product
- service product
- subscription product later
- product with 100+ variants

---

## Variants

Test:
- size only
- color only
- size + color
- SKU-based
- no SKU
- variant-specific pricing
- variant-specific inventory
- variant-specific images

---

## Discounts

Test:
- sale price
- percentage
- fixed amount
- coupon
- automatic discount
- expired promotion
- minimum cart value
- product-specific promotion
- variant-specific promotion
- stackable/non-stackable promotions

---

## Pagination

Support:
- page + limit
- offset + limit
- cursor
- next URL
- unpaginated array

---

# 12. Protocol and Contract Testing

Maintain protocol fixtures separately from business logic.

Suggested repository structure:

```text
/packages
  /canonical-commerce
  /adapter-sdk
  /adapter-rest
  /adapter-openapi
  /adapter-graphql
  /adapter-postgres
  /ucp
  /mcp
  /search
  /payments-razorpay

/apps
  /gateway
  /dashboard
  /demo-store

/tests
  /fixtures
  /contracts
  /integration
  /e2e
  /failure
```

---

# 13. Test Pyramid

## Unit Tests

Test:
- normalization
- currency conversion
- field mapping
- capability detection
- discount calculations
- validation
- state transitions

---

## Contract Tests

Every adapter must pass the same `CommerceProvider` contract suite.

Example:

```text
Adapter Contract Suite

✓ returns stable product ID
✓ returns valid Money object
✓ identifies stock state
✓ handles unknown product
✓ does not mutate response shape
✓ supports declared capabilities
✓ fails cleanly when backend fails
```

This is extremely important.

A new integration should be accepted only if it passes this suite.

---

## Integration Tests

Test:

```text
REST adapter → canonical model
GraphQL adapter → canonical model
Postgres adapter → canonical model

canonical model → MCP
canonical model → UCP
```

---

## Protocol Tests

### MCP

Test:
- initialize
- tools/list
- tools/call
- input schema validation
- unsupported tool
- malformed JSON-RPC
- unknown method
- timeout
- idempotency where relevant

### UCP

Test:
- valid discovery response
- supported version
- correct service definition
- capabilities match provider
- endpoint URLs resolve
- schema validation

---

## End-to-End Tests

Agent scenario:

```text
Discover store
   ↓
Search product
   ↓
Inspect product
   ↓
Check availability
   ↓
Check final offer
   ↓
Create cart
   ↓
Create checkout
   ↓
Approve
   ↓
Pay
   ↓
Create order
```

Must also test one graceful failure:

```text
Stock disappears after selection
```

Expected behavior:

```text
Agent re-checks inventory
        ↓
Gateway reports unavailable
        ↓
Agent does NOT attempt payment
        ↓
Alternative products returned
```

This is a strong Buildathon demo scenario.

---

# 14. Security Tests

Must include:

- merchant API credentials never exposed to agents
- SQL injection prevention
- SSRF protection for merchant-configured URLs
- webhook signature validation
- API key rotation
- secret encryption
- tenant isolation
- rate limiting
- tool input validation
- output sanitization
- authorization checks
- checkout ownership
- idempotency
- replay attack prevention

Never let arbitrary MCP parameters become raw SQL, shell commands, or unchecked internal URLs.

---

# 15. Multi-Tenant Architecture

Future production architecture:

```text
                    Gateway
                       │
              Tenant Resolver
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
    Merchant A     Merchant B     Merchant C
        │              │              │
     Adapter A      Adapter B      Adapter C
```

Each merchant should have:
- tenant ID
- encrypted integration secrets
- capability configuration
- canonical mappings
- rate limits
- protocol configuration
- audit logs

No tenant should be able to resolve another merchant's product IDs or credentials.

---

# 16. Observability

Track:

- MCP calls
- UCP discovery requests
- search latency
- merchant API latency
- mapping failures
- inventory mismatches
- price mismatches
- checkout failures
- payment failures
- retry count
- agent identity if supplied
- merchant ID
- order conversion

Each money-changing action should have an audit event.

Example:

```json
{
  "event": "checkout.complete.requested",
  "merchant_id": "merchant_123",
  "checkout_id": "chk_456",
  "agent": "agent_identifier",
  "amount": 479900,
  "currency": "INR",
  "approval": {
    "required": true,
    "received": true
  },
  "timestamp": "..."
}
```

---

# 17. Recommended Buildathon Scope

Do **not** try to build all adapter types.

Recommended scope:

## Implement

### One fake/custom merchant
- Node/Next/Fastify or Express backend
- PostgreSQL or SQLite
- 30–50 products

### One real adapter style
- config-driven REST adapter

### Canonical commerce model

### Agent interfaces
- MCP
- UCP discovery
- `agents.md`
- `llms.txt`

### Features
- catalog search
- variant lookup
- pricing
- discounts
- availability
- cart
- checkout

### Payments
- Razorpay Test Mode

### One intelligence feature
- semantic/contextual search

### One revenue feature
- explainable upsell or cross-sell

### One graceful failure
- stock disappears or price changes before checkout

---

# 18. Suggested Implementation Order

```text
STEP 1
Canonical schemas

STEP 2
Mock CommerceProvider

STEP 3
search_catalog + get_product

STEP 4
MCP server

STEP 5
agents.md + llms.txt

STEP 6
/.well-known/ucp

STEP 7
config-driven REST adapter

STEP 8
live price + inventory

STEP 9
semantic search/index

STEP 10
cart

STEP 11
checkout

STEP 12
Razorpay Test Mode

STEP 13
audit trail + failure handling

STEP 14
upsell/cross-sell intelligence

STEP 15
merchant integration dashboard
```

Do not start with the dashboard.

Prove the gateway abstraction and end-to-end agent flow first.

---

# 19. Definition of "Agent Ready"

A merchant is considered agent-ready when an independent compatible agent can:

```text
1. Discover the merchant
2. Understand its capabilities
3. Query its catalog
4. Retrieve structured product data
5. Check current availability
6. Retrieve current effective price and discounts
7. Select a valid variant
8. Create or prepare a cart if supported
9. Prepare checkout if supported
10. Complete only after required approval
11. Receive an order result
```

The key word is **independent**.

The demo should not depend on a hardcoded agent that already knows the merchant's private API.

---

# 20. North-Star Architecture

```text
 Merchant's Existing Ecommerce Stack
 Product DB / ERP / APIs / Inventory / Checkout
                    │
                    ▼
             Merchant Adapter
                    │
                    ▼
       Canonical Commerce Platform
                    │
      ┌─────────────┼─────────────┐
      ▼             ▼             ▼
 Catalog Index   Transaction    Intelligence
      │             Layer          Layer
      │              │              │
      │         Cart/Checkout    Ranking
      │              │           Upsell
      │              │          Cross-sell
      └──────────────┼──────────────┘
                     ▼
              Agent Interface
           UCP / MCP / metadata
                     │
                     ▼
                 AI Agents
                     │
                     ▼
                   Buyer
```

The product should therefore be designed around this principle:

> **Integrate once, normalize once, expose to every compatible agent protocol.**

UCP and MCP are outputs of the platform.

The **canonical commerce layer and adapter system are the actual product moat**.

---

# 21. Final MVP Success Criteria

The first complete release is successful if all of the following can be demonstrated:

- A custom, non-Shopify store is connected through the gateway.
- No agent-specific logic exists in the merchant storefront.
- The store exposes valid agent discovery metadata.
- An agent discovers the merchant dynamically.
- The agent searches the structured catalog.
- Availability is checked live.
- Pricing and discounts are returned accurately.
- Product variants are handled.
- The agent creates a cart.
- Checkout is prepared.
- User approval is required before payment.
- Razorpay Test Mode completes the payment.
- An order is created.
- An audit trail explains every money-changing step.
- One failure such as stock loss, price change, payment failure, or duplicate request is handled safely.
- The same gateway can connect to a second mock merchant using a different source data shape without changing UCP/MCP code.

That last test is particularly important:

> If a second merchant can be integrated by only changing the adapter/configuration, the architecture is working.
