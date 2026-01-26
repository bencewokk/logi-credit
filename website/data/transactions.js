// Shared transactions data for the static website
// This file centralizes the mock transactions so pages can use the same source.
(function () {
  const transactions = [
    { id: 'LC-2401', customer: 'Kovács Anna', date: '2025-09-30', amount: 1200000, status: 'approved' },
    { id: 'LC-2402', customer: 'Szabó Péter', date: '2025-09-30', amount: 480000, status: 'approved' },
    { id: 'LC-2403', customer: 'Nagy Éva', date: '2025-10-01', amount: 950000, status: 'pending' },
    { id: 'LC-2404', customer: 'Tóth Gábor', date: '2025-10-02', amount: 1750000, status: 'approved' },
    { id: 'LC-2405', customer: 'Kiss Dóra', date: '2025-10-02', amount: 380000, status: 'rejected' },
    { id: 'LC-2406', customer: 'Farkas Bence', date: '2025-10-03', amount: 1420000, status: 'approved' },
    { id: 'LC-2407', customer: 'Horváth Lilla', date: '2025-10-03', amount: 610000, status: 'approved' },
    { id: 'LC-2408', customer: 'Varga Levente', date: '2025-10-04', amount: 820000, status: 'pending' }
  ];

  // Expose a promise-based loader to keep callers consistent with fetch usage
  window.getSharedTransactions = function () {
    return Promise.resolve(transactions.slice()); // return a shallow copy
  };

  // Expose a helper to append a transaction (client-only, in-memory)
  window.addSharedTransaction = function (tx) {
    transactions.push(tx);
    return tx;
  };
})();
