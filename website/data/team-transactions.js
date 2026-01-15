// Internal team transactions between members
// These are transactions between david, kristof, pali, and zsombi
(function () {
  const teamTransactions = [
    { id: 'TT-001', from: 'david', to: 'kristof', date: '2025-10-01', amount: 15000, note: 'Ebéd', status: 'approved' },
    { id: 'TT-002', from: 'pali', to: 'david', date: '2025-10-02', amount: 8000, note: 'Kávé', status: 'approved' },
    { id: 'TT-003', from: 'kristof', to: 'zsombi', date: '2025-10-03', amount: 12000, note: 'Taxi megosztás', status: 'approved' },
    { id: 'TT-004', from: 'zsombi', to: 'pali', date: '2025-10-03', amount: 5000, note: 'Snack', status: 'approved' },
    { id: 'TT-005', from: 'david', to: 'pali', date: '2025-10-04', amount: 20000, note: 'Vacsora', status: 'pending' },
    { id: 'TT-006', from: 'kristof', to: 'david', date: '2025-10-04', amount: 6500, note: 'Kávé', status: 'approved' }
  ];

  // Expose a promise-based loader
  window.getTeamTransactions = function () {
    return Promise.resolve(teamTransactions.slice()); // return a shallow copy
  };

  // Get transactions for a specific person
  window.getPersonTransactions = function (person) {
    return Promise.resolve(
      teamTransactions.filter(tx => tx.from === person || tx.to === person)
    );
  };

  // Add a new team transaction (client-only, in-memory)
  window.addTeamTransaction = function (tx) {
    teamTransactions.push(tx);
    return tx;
  };
})();
