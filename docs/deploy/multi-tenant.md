# Multi-tenant SaaS (planned)

Future production architecture (doc §15):

```
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

Each tenant holds:

- tenant id + encrypted integration secrets
- capability configuration
- canonical field mappings (REST adapter config)
- rate limits and protocol configuration
- an isolated audit log

No tenant can resolve another tenant's product IDs or credentials. The current
repo implements the single-tenant core (one `CommerceProvider` per gateway);
the tenant resolver + encrypted-secret store + per-tenant dashboard is MVP 8.
