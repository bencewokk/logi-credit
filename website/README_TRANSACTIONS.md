# Shared transactions (notes)

This short note documents the shared transactions module used by the static website.

Location
- `website/data/transactions.js` — client-side module that exposes `getSharedTransactions()` and `addSharedTransaction(tx)`.

Purpose
- Centralizes mock transaction data so multiple pages (dashboard, transactions pages) display the exact same dataset without duplicating the array or fetch logic.

How pages use it
- Include the script before page-specific JS:

```html
<script src="../data/transactions.js"></script>
<script src="dashboard.js"></script>
```

API
- `getSharedTransactions()` — returns a Promise resolving to an array copy of the transactions.
- `addSharedTransaction(tx)` — appends `tx` to the in-memory transactions array (client-only; not persisted to disk).

Notes
- This is client-side only — editing `transactions.js` changes the data used by pages, but persistence requires a server-side endpoint.
- If you prefer server-backed data, I can add a simple `/api/transactions` endpoint and update pages to fetch from it.
